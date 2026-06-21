#![allow(dead_code)]

use std::collections::BTreeMap;
use std::net::{IpAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::policy::{Gate, PolicyError};
use crate::sidecar::GateState;

const PROVIDER_SECRET_SERVICE: &str = "com.codename.harness.provider";
const PROVIDER_STORE_VERSION: u32 = 1;
const PROVIDER_STORE_FILE: &str = "provider-runtime.json";
const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";
const CHECK_TIMEOUT_SECS: u64 = 10;
const REFRESH_TIMEOUT_SECS: u64 = 20;
const STREAM_TIMEOUT_SECS: u64 = 120;
const MAX_JSON_BODY_BYTES: usize = 1024 * 1024;
const MAX_ERROR_BODY_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ProviderId {
    Ollama,
    LmStudio,
    CustomOpenAi,
    Gemini,
}

impl ProviderId {
    fn as_str(self) -> &'static str {
        match self {
            ProviderId::Ollama => "ollama",
            ProviderId::LmStudio => "lmstudio",
            ProviderId::CustomOpenAi => "custom-openai",
            ProviderId::Gemini => "gemini",
        }
    }

    fn display_name(self) -> &'static str {
        match self {
            ProviderId::Ollama => "Ollama",
            ProviderId::LmStudio => "LM Studio",
            ProviderId::CustomOpenAi => "Custom OpenAI-compatible",
            ProviderId::Gemini => "Gemini",
        }
    }

    fn default_local_port(self) -> Option<u16> {
        match self {
            ProviderId::Ollama => Some(11434),
            ProviderId::LmStudio => Some(1234),
            ProviderId::CustomOpenAi | ProviderId::Gemini => None,
        }
    }
}

impl FromStr for ProviderId {
    type Err = ProviderErrorDto;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim() {
            "ollama" => Ok(ProviderId::Ollama),
            "lmstudio" => Ok(ProviderId::LmStudio),
            "custom-openai" => Ok(ProviderId::CustomOpenAi),
            "gemini" => Ok(ProviderId::Gemini),
            _ => Err(ProviderErrorDto::new(
                "unknown_provider",
                "Unknown provider.",
                "Provider is not part of the approved runtime provider registry.",
            )),
        }
    }
}

impl Serialize for ProviderId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for ProviderId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        ProviderId::from_str(&value).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct ConnectionId(String);

impl ConnectionId {
    fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionApprovalState {
    Approved,
    PendingApproval,
    Disabled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportClass {
    LoopbackHttp,
    RemoteHttps,
    FixedProviderApi,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalityClassification {
    LocalLoopback,
    RemotePublic,
    FixedRemote,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum CredentialBindingRef {
    GeminiApiKey,
    CustomOpenAi(ConnectionId),
}

impl CredentialBindingRef {
    fn account_name(&self) -> String {
        match self {
            CredentialBindingRef::GeminiApiKey => "PROVIDER_GEMINI_API_KEY".to_string(),
            CredentialBindingRef::CustomOpenAi(connection_id) => {
                format!("PROVIDER_CUSTOM_OPENAI_{}", connection_id.as_str())
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialRequirement {
    None,
    Required,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReadinessState {
    Unknown,
    Checking,
    Ready,
    Stale,
    RequiresApiKey,
    RequiresSignIn,
    EndpointUnavailable,
    AuthenticationFailed,
    PermissionDenied,
    QuotaExhausted,
    ModelUnavailable,
    ConnectionCheckFailed,
    RefreshFailed,
    ConfigurationDisabled,
    PolicyDenied,
    NetworkDenied,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInventoryState {
    pub state: InventoryKind,
    pub count: usize,
    pub last_refresh_at: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InventoryKind {
    Unknown,
    Stale,
    CurrentSession,
    Refreshing,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatEligibility {
    pub eligible: bool,
    pub state: ReadinessState,
    pub category: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderOperationResult {
    pub ok: bool,
    pub state: ReadinessState,
    pub category: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EndpointOrigin {
    normalized_origin: String,
    base_path: Option<String>,
    transport_class: TransportClass,
    locality: LocalityClassification,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ConnectionRecord {
    provider_id: ProviderId,
    connection_id: ConnectionId,
    label: String,
    endpoint: Option<EndpointOrigin>,
    approval_state: ConnectionApprovalState,
    credential_requirement: CredentialRequirement,
    credential_binding: Option<CredentialBindingRef>,
    credential_configured: bool,
    disabled_reason: Option<String>,
    stale_inventory_count: Option<usize>,
    created_at: u64,
    updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SessionConnectionState {
    readiness: ReadinessState,
    checked_this_session: bool,
    last_explicit_check_at: Option<u64>,
    check_in_progress: bool,
    refresh_in_progress: bool,
    inventory: ModelInventoryState,
    current_session_models: Vec<String>,
    failure_category: Option<String>,
    safe_detail: Option<String>,
}

impl Default for SessionConnectionState {
    fn default() -> Self {
        Self {
            readiness: ReadinessState::Unknown,
            checked_this_session: false,
            last_explicit_check_at: None,
            check_in_progress: false,
            refresh_in_progress: false,
            inventory: ModelInventoryState {
                state: InventoryKind::Unknown,
                count: 0,
                last_refresh_at: None,
            },
            current_session_models: Vec::new(),
            failure_category: None,
            safe_detail: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRuntimeSnapshot {
    pub providers: Vec<ProviderDto>,
    pub connections: Vec<ConnectionDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDto {
    pub provider_id: ProviderId,
    pub label: String,
    pub connection_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDto {
    pub provider_id: ProviderId,
    pub connection_id: String,
    pub label: String,
    pub approval_state: ConnectionApprovalState,
    pub transport_class: Option<TransportClass>,
    pub locality: Option<LocalityClassification>,
    pub credential_required: bool,
    pub credential_configured: bool,
    pub readiness: ReadinessState,
    pub checked_this_session: bool,
    pub last_explicit_check_at: Option<u64>,
    pub check_in_progress: bool,
    pub refresh_in_progress: bool,
    pub inventory: ModelInventoryState,
    pub safe_failure_category: Option<String>,
    pub safe_detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderErrorDto {
    pub code: String,
    pub message: String,
    pub detail: String,
}

impl ProviderErrorDto {
    fn new(code: &str, message: &str, detail: &str) -> Self {
        Self {
            code: code.to_string(),
            message: message.to_string(),
            detail: sanitize_detail(detail),
        }
    }
}

impl std::fmt::Display for ProviderErrorDto {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.detail)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderCreateConnectionRequest {
    pub provider_id: ProviderId,
    pub label: String,
    pub endpoint: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderEditConnectionRequest {
    pub provider_id: ProviderId,
    pub connection_id: String,
    pub label: Option<String>,
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderConnectionSelector {
    pub provider_id: ProviderId,
    pub connection_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderModelOperationRequest {
    pub provider_id: ProviderId,
    pub connection_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderTuningValues {
    pub temperature: f64,
    pub num_ctx: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderStreamChatRequest {
    pub provider_id: ProviderId,
    pub connection_id: String,
    pub model_id: String,
    pub messages: Vec<ProviderChatMessage>,
    pub tuning: ProviderTuningValues,
    pub operation_intent: String,
    #[serde(default)]
    pub operation_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderCancelStreamRequest {
    pub operation_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderMigrationRequest {
    #[serde(default)]
    pub provider_connections: Vec<LegacyProviderConnection>,
    #[serde(default)]
    pub active_provider_id: Option<String>,
    #[serde(default)]
    pub active_model_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyProviderConnection {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub provider_kind: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key_env: Option<String>,
    #[serde(default)]
    pub models: Vec<LegacyModelInventoryEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyModelInventoryEntry {
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMigrationResult {
    pub migrated_connections: usize,
    pub disabled_connections: usize,
    pub skipped_sidecar_entries: usize,
    pub backup_created: bool,
    pub recovery_detail: Option<String>,
    pub snapshot: ProviderRuntimeSnapshot,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderCredentialStoreRequest {
    pub provider_id: ProviderId,
    pub connection_id: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCredentialStatus {
    pub provider_id: ProviderId,
    pub connection_id: String,
    pub required: bool,
    pub configured: bool,
}

pub struct ProviderRuntimeState {
    inner: Mutex<ProviderRuntime>,
}

impl Default for ProviderRuntimeState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(ProviderRuntime::new()),
        }
    }
}

impl ProviderRuntimeState {
    fn lock(&self) -> Result<MutexGuard<'_, ProviderRuntime>, ProviderErrorDto> {
        self.inner.lock().map_err(|_| {
            ProviderErrorDto::new(
                "runtime_lock_failed",
                "Provider runtime is unavailable.",
                "Provider runtime state lock was poisoned.",
            )
        })
    }
}

#[derive(Debug)]
struct ProviderRuntime {
    records: BTreeMap<ConnectionId, ConnectionRecord>,
    session: BTreeMap<ConnectionId, SessionConnectionState>,
    active_streams: BTreeMap<String, bool>,
    next_connection: u64,
}

#[derive(Debug, Clone)]
struct ResolvedConnection {
    record: ConnectionRecord,
}

impl ResolvedConnection {
    fn endpoint(&self) -> Result<&EndpointOrigin, ProviderErrorDto> {
        self.record.endpoint.as_ref().ok_or_else(|| {
            ProviderErrorDto::new(
                "configuration_disabled",
                "Connection endpoint is unavailable.",
                "Rust-owned connection record does not contain a usable endpoint.",
            )
        })
    }

    fn connection_id(&self) -> &ConnectionId {
        &self.record.connection_id
    }
}

#[derive(Default, Debug, Clone, Copy, PartialEq, Eq)]
struct MigrationCounters {
    migrated_connections: usize,
    disabled_connections: usize,
    skipped_sidecar_entries: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderStoreFile {
    version: u32,
    next_connection: u64,
    connections: Vec<StoredConnectionRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredConnectionRecord {
    provider_id: ProviderId,
    connection_id: String,
    label: String,
    endpoint: Option<StoredEndpointOrigin>,
    approval_state: ConnectionApprovalState,
    credential_requirement: CredentialRequirement,
    credential_configured: bool,
    disabled_reason: Option<String>,
    stale_inventory_count: Option<usize>,
    created_at: u64,
    updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredEndpointOrigin {
    normalized_origin: String,
    base_path: Option<String>,
    transport_class: TransportClass,
    locality: LocalityClassification,
}

impl ProviderStoreFile {
    fn from_runtime(runtime: &ProviderRuntime) -> Self {
        Self {
            version: PROVIDER_STORE_VERSION,
            next_connection: runtime.next_connection,
            connections: runtime
                .records
                .values()
                .map(StoredConnectionRecord::from_record)
                .collect(),
        }
    }
}

impl StoredConnectionRecord {
    fn from_record(record: &ConnectionRecord) -> Self {
        Self {
            provider_id: record.provider_id,
            connection_id: record.connection_id.as_str().to_string(),
            label: record.label.clone(),
            endpoint: record
                .endpoint
                .as_ref()
                .map(StoredEndpointOrigin::from_endpoint),
            approval_state: record.approval_state,
            credential_requirement: record.credential_requirement,
            credential_configured: record.credential_configured,
            disabled_reason: record.disabled_reason.clone(),
            stale_inventory_count: record.stale_inventory_count,
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }

    fn try_into_record(self) -> ConnectionRecord {
        let connection_id = ConnectionId::new(self.connection_id);
        let credential_binding = match self.provider_id {
            ProviderId::Gemini => Some(CredentialBindingRef::GeminiApiKey),
            ProviderId::CustomOpenAi => {
                Some(CredentialBindingRef::CustomOpenAi(connection_id.clone()))
            }
            ProviderId::Ollama | ProviderId::LmStudio => None,
        };
        ConnectionRecord {
            provider_id: self.provider_id,
            connection_id,
            label: safe_label(&self.label, self.provider_id.display_name()),
            endpoint: self.endpoint.map(StoredEndpointOrigin::into_endpoint),
            approval_state: self.approval_state,
            credential_requirement: self.credential_requirement,
            credential_binding,
            credential_configured: self.credential_configured,
            disabled_reason: self.disabled_reason.map(|detail| sanitize_detail(&detail)),
            stale_inventory_count: self.stale_inventory_count,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

impl StoredEndpointOrigin {
    fn from_endpoint(endpoint: &EndpointOrigin) -> Self {
        Self {
            normalized_origin: endpoint.normalized_origin.clone(),
            base_path: endpoint.base_path.clone(),
            transport_class: endpoint.transport_class,
            locality: endpoint.locality,
        }
    }

    fn into_endpoint(self) -> EndpointOrigin {
        EndpointOrigin {
            normalized_origin: self.normalized_origin,
            base_path: self.base_path,
            transport_class: self.transport_class,
            locality: self.locality,
        }
    }
}

impl ProviderRuntime {
    fn new() -> Self {
        let mut runtime = Self {
            records: BTreeMap::new(),
            session: BTreeMap::new(),
            active_streams: BTreeMap::new(),
            next_connection: 1,
        };
        runtime.insert_default_records();
        runtime
    }

    fn insert_default_records(&mut self) {
        let now = now_millis();
        let ollama = ConnectionRecord {
            provider_id: ProviderId::Ollama,
            connection_id: ConnectionId::new("ollama:local-default"),
            label: "Ollama".to_string(),
            endpoint: Some(
                validate_endpoint(ProviderId::Ollama, "http://127.0.0.1:11434")
                    .expect("default Ollama endpoint must validate"),
            ),
            approval_state: ConnectionApprovalState::Approved,
            credential_requirement: CredentialRequirement::None,
            credential_binding: None,
            credential_configured: false,
            disabled_reason: None,
            stale_inventory_count: None,
            created_at: now,
            updated_at: now,
        };
        let lmstudio = ConnectionRecord {
            provider_id: ProviderId::LmStudio,
            connection_id: ConnectionId::new("lmstudio:local-default"),
            label: "LM Studio".to_string(),
            endpoint: Some(
                validate_endpoint(ProviderId::LmStudio, "http://localhost:1234")
                    .expect("default LM Studio endpoint must validate"),
            ),
            approval_state: ConnectionApprovalState::Approved,
            credential_requirement: CredentialRequirement::None,
            credential_binding: None,
            credential_configured: false,
            disabled_reason: None,
            stale_inventory_count: None,
            created_at: now,
            updated_at: now,
        };
        let gemini = ConnectionRecord {
            provider_id: ProviderId::Gemini,
            connection_id: ConnectionId::new("gemini:fixed"),
            label: "Gemini".to_string(),
            endpoint: Some(EndpointOrigin {
                normalized_origin: "https://generativelanguage.googleapis.com".to_string(),
                base_path: None,
                transport_class: TransportClass::FixedProviderApi,
                locality: LocalityClassification::FixedRemote,
            }),
            approval_state: ConnectionApprovalState::Approved,
            credential_requirement: CredentialRequirement::Required,
            credential_binding: Some(CredentialBindingRef::GeminiApiKey),
            credential_configured: false,
            disabled_reason: None,
            stale_inventory_count: None,
            created_at: now,
            updated_at: now,
        };
        for record in [ollama, lmstudio, gemini] {
            self.session.insert(
                record.connection_id.clone(),
                SessionConnectionState::default(),
            );
            self.records.insert(record.connection_id.clone(), record);
        }
    }

    fn snapshot(&self) -> ProviderRuntimeSnapshot {
        let providers = [
            ProviderId::Ollama,
            ProviderId::LmStudio,
            ProviderId::CustomOpenAi,
            ProviderId::Gemini,
        ]
        .into_iter()
        .map(|provider_id| ProviderDto {
            provider_id,
            label: provider_id.display_name().to_string(),
            connection_count: self
                .records
                .values()
                .filter(|record| record.provider_id == provider_id)
                .count(),
        })
        .collect();

        let connections = self
            .records
            .values()
            .map(|record| self.connection_dto(record))
            .collect();

        ProviderRuntimeSnapshot {
            providers,
            connections,
        }
    }

    fn apply_migration(
        &mut self,
        request: ProviderMigrationRequest,
    ) -> Result<MigrationCounters, ProviderErrorDto> {
        let mut next = ProviderRuntime::new();
        let mut counters = MigrationCounters::default();
        for legacy in request.provider_connections {
            let Some(provider_id) = normalize_legacy_provider_id(&legacy) else {
                if is_legacy_sidecar(&legacy) {
                    counters.skipped_sidecar_entries += 1;
                }
                continue;
            };
            match provider_id {
                ProviderId::Ollama | ProviderId::LmStudio => {
                    migrate_default_local_connection(&mut next, provider_id, legacy, &mut counters);
                }
                ProviderId::CustomOpenAi => {
                    migrate_custom_connection(&mut next, legacy, &mut counters);
                }
                ProviderId::Gemini => {
                    migrate_gemini_connection(&mut next, legacy, &mut counters);
                }
            }
        }
        if request
            .active_provider_id
            .as_deref()
            .is_some_and(is_sidecar_alias)
        {
            counters.skipped_sidecar_entries += 1;
        }
        if request
            .active_model_id
            .as_deref()
            .is_some_and(is_sidecar_alias)
        {
            counters.skipped_sidecar_entries += 1;
        }
        *self = next;
        Ok(counters)
    }

    fn load_store_file(&mut self, store: ProviderStoreFile) {
        let mut next = ProviderRuntime {
            records: BTreeMap::new(),
            session: BTreeMap::new(),
            active_streams: BTreeMap::new(),
            next_connection: store.next_connection.max(1),
        };
        for stored in store.connections {
            let record = stored.try_into_record();
            next.session.insert(
                record.connection_id.clone(),
                SessionConnectionState::default(),
            );
            next.records.insert(record.connection_id.clone(), record);
        }
        let defaults = ProviderRuntime::new();
        for provider_id in [ProviderId::Ollama, ProviderId::LmStudio, ProviderId::Gemini] {
            if !next
                .records
                .values()
                .any(|record| record.provider_id == provider_id)
            {
                for record in defaults
                    .records
                    .values()
                    .filter(|record| record.provider_id == provider_id)
                {
                    next.session.insert(
                        record.connection_id.clone(),
                        SessionConnectionState::default(),
                    );
                    next.records
                        .insert(record.connection_id.clone(), record.clone());
                }
            }
        }
        *self = next;
    }

    fn connection_dto(&self, record: &ConnectionRecord) -> ConnectionDto {
        let session = self
            .session
            .get(&record.connection_id)
            .cloned()
            .unwrap_or_default();
        let inventory = if session.inventory.state == InventoryKind::Unknown {
            record
                .stale_inventory_count
                .map(|count| ModelInventoryState {
                    state: InventoryKind::Stale,
                    count,
                    last_refresh_at: None,
                })
                .unwrap_or_else(|| session.inventory.clone())
        } else {
            session.inventory.clone()
        };
        let readiness = if record.approval_state == ConnectionApprovalState::Disabled {
            ReadinessState::ConfigurationDisabled
        } else if session.readiness == ReadinessState::Unknown
            && record.stale_inventory_count.is_some()
        {
            ReadinessState::Stale
        } else {
            session.readiness
        };

        ConnectionDto {
            provider_id: record.provider_id,
            connection_id: record.connection_id.as_str().to_string(),
            label: record.label.clone(),
            approval_state: record.approval_state,
            transport_class: record
                .endpoint
                .as_ref()
                .map(|endpoint| endpoint.transport_class),
            locality: record.endpoint.as_ref().map(|endpoint| endpoint.locality),
            credential_required: record.credential_requirement == CredentialRequirement::Required,
            credential_configured: record.credential_configured,
            readiness,
            checked_this_session: session.checked_this_session,
            last_explicit_check_at: session.last_explicit_check_at,
            check_in_progress: session.check_in_progress,
            refresh_in_progress: session.refresh_in_progress,
            inventory,
            safe_failure_category: session.failure_category.or_else(|| {
                record
                    .disabled_reason
                    .as_ref()
                    .map(|_| "configuration_disabled".to_string())
            }),
            safe_detail: session
                .safe_detail
                .or_else(|| record.disabled_reason.clone()),
        }
    }

    fn create_connection(
        &mut self,
        request: ProviderCreateConnectionRequest,
    ) -> Result<ConnectionDto, ProviderErrorDto> {
        if request.provider_id == ProviderId::Gemini {
            return Err(ProviderErrorDto::new(
                "fixed_provider_route",
                "Gemini uses a fixed provider route.",
                "Gemini connections are Rust-owned and cannot be created from endpoint input.",
            ));
        }

        if request.provider_id != ProviderId::CustomOpenAi {
            return Err(ProviderErrorDto::new(
                "default_connection_edit_required",
                "Default provider connections must be edited explicitly.",
                "Use the edit connection command for Rust-owned default provider records.",
            ));
        }

        let endpoint = validate_endpoint(request.provider_id, &request.endpoint)?;
        let connection_id = self.next_connection_id();
        let now = now_millis();
        let credential_requirement = if endpoint.transport_class == TransportClass::RemoteHttps {
            CredentialRequirement::Required
        } else {
            CredentialRequirement::None
        };
        let credential_binding = if request.provider_id == ProviderId::CustomOpenAi {
            Some(CredentialBindingRef::CustomOpenAi(connection_id.clone()))
        } else {
            None
        };
        let record = ConnectionRecord {
            provider_id: request.provider_id,
            connection_id: connection_id.clone(),
            label: safe_label(&request.label, request.provider_id.display_name()),
            endpoint: Some(endpoint),
            approval_state: ConnectionApprovalState::PendingApproval,
            credential_requirement,
            credential_binding,
            credential_configured: false,
            disabled_reason: None,
            stale_inventory_count: None,
            created_at: now,
            updated_at: now,
        };
        self.session
            .insert(connection_id.clone(), SessionConnectionState::default());
        self.records.insert(connection_id.clone(), record);
        let record = self.records.get(&connection_id).expect("inserted record");
        Ok(self.connection_dto(record))
    }

    fn edit_connection(
        &mut self,
        request: ProviderEditConnectionRequest,
    ) -> Result<ConnectionDto, ProviderErrorDto> {
        let connection_id = ConnectionId::new(request.connection_id);
        let reset_session = request.endpoint.is_some();
        let endpoint = match request.endpoint {
            Some(endpoint) => Some(validate_endpoint(request.provider_id, &endpoint)?),
            None => None,
        };
        {
            let record = self.connection_record_mut(request.provider_id, &connection_id)?;
            if request.provider_id == ProviderId::Gemini {
                return Err(ProviderErrorDto::new(
                    "fixed_provider_route",
                    "Gemini uses a fixed provider route.",
                    "Gemini endpoint configuration is Rust-owned.",
                ));
            }
            if let Some(label) = request.label {
                record.label = safe_label(&label, request.provider_id.display_name());
            }
            if let Some(endpoint) = endpoint {
                record.endpoint = Some(endpoint);
                record.approval_state = ConnectionApprovalState::PendingApproval;
            }
            record.updated_at = now_millis();
        }
        if reset_session {
            self.session
                .insert(connection_id.clone(), SessionConnectionState::default());
        }
        let record = self.connection_record(request.provider_id, &connection_id)?;
        Ok(self.connection_dto(record))
    }

    fn disable_connection(
        &mut self,
        request: ProviderConnectionSelector,
    ) -> Result<ConnectionDto, ProviderErrorDto> {
        let connection_id = ConnectionId::new(request.connection_id);
        let record = self.connection_record_mut(request.provider_id, &connection_id)?;
        record.approval_state = ConnectionApprovalState::Disabled;
        record.disabled_reason =
            Some("Connection disabled by explicit Provider Manager action.".to_string());
        record.updated_at = now_millis();
        let state = self.session.entry(connection_id.clone()).or_default();
        state.readiness = ReadinessState::ConfigurationDisabled;
        state.checked_this_session = false;
        let record = self.connection_record(request.provider_id, &connection_id)?;
        Ok(self.connection_dto(record))
    }

    fn delete_connection(
        &mut self,
        request: ProviderConnectionSelector,
    ) -> Result<ProviderOperationResult, ProviderErrorDto> {
        let connection_id = ConnectionId::new(request.connection_id);
        let record = self.connection_record(request.provider_id, &connection_id)?;
        if record.provider_id != ProviderId::CustomOpenAi {
            return Err(ProviderErrorDto::new(
                "default_connection_not_deleted",
                "Default provider connections cannot be deleted.",
                "Disable or edit the Rust-owned default connection instead.",
            ));
        }
        self.records.remove(&connection_id);
        self.session.remove(&connection_id);
        Ok(ProviderOperationResult {
            ok: true,
            state: ReadinessState::ConfigurationDisabled,
            category: "deleted".to_string(),
            detail: "Connection deleted.".to_string(),
        })
    }

    fn approve_connection(
        &mut self,
        request: ProviderConnectionSelector,
    ) -> Result<ConnectionDto, ProviderErrorDto> {
        let connection_id = ConnectionId::new(request.connection_id);
        let record = self.connection_record_mut(request.provider_id, &connection_id)?;
        if record.approval_state == ConnectionApprovalState::Disabled {
            return Err(ProviderErrorDto::new(
                "configuration_disabled",
                "Connection is disabled.",
                "Enable by editing the connection before approval.",
            ));
        }
        record.approval_state = ConnectionApprovalState::Approved;
        record.updated_at = now_millis();
        let record = self.connection_record(request.provider_id, &connection_id)?;
        Ok(self.connection_dto(record))
    }

    fn credential_status(
        &mut self,
        request: ProviderConnectionSelector,
    ) -> Result<ProviderCredentialStatus, ProviderErrorDto> {
        let connection_id = ConnectionId::new(request.connection_id);
        let (binding, provider_id, required, connection_id_string) = {
            let record = self.connection_record(request.provider_id, &connection_id)?;
            (
                record.credential_binding.clone(),
                record.provider_id,
                record.credential_requirement == CredentialRequirement::Required,
                record.connection_id.as_str().to_string(),
            )
        };
        let configured = binding.as_ref().map(credential_is_present).unwrap_or(false);
        let record = self.connection_record_mut(request.provider_id, &connection_id)?;
        record.credential_configured = configured;
        Ok(ProviderCredentialStatus {
            provider_id,
            connection_id: connection_id_string,
            required,
            configured,
        })
    }

    fn credential_binding(
        &self,
        provider_id: ProviderId,
        connection_id: &ConnectionId,
    ) -> Result<CredentialBindingRef, ProviderErrorDto> {
        let record = self.connection_record(provider_id, connection_id)?;
        record.credential_binding.clone().ok_or_else(|| {
            ProviderErrorDto::new(
                "credential_not_supported",
                "Provider connection does not use credentials.",
                "This provider connection has no Rust-owned credential binding.",
            )
        })
    }

    fn mark_credential_configured(
        &mut self,
        provider_id: ProviderId,
        connection_id: &ConnectionId,
        configured: bool,
    ) -> Result<ProviderCredentialStatus, ProviderErrorDto> {
        let record = self.connection_record_mut(provider_id, connection_id)?;
        record.credential_configured = configured;
        record.updated_at = now_millis();
        Ok(ProviderCredentialStatus {
            provider_id: record.provider_id,
            connection_id: record.connection_id.as_str().to_string(),
            required: record.credential_requirement == CredentialRequirement::Required,
            configured,
        })
    }

    fn begin_check_connection(
        &mut self,
        request: ProviderModelOperationRequest,
    ) -> Result<ResolvedConnection, ProviderErrorDto> {
        let connection_id = ConnectionId::new(request.connection_id);
        self.require_approved(request.provider_id, &connection_id)?;
        let record = self
            .connection_record(request.provider_id, &connection_id)?
            .clone();
        let state = self.session.entry(connection_id).or_default();
        if state.check_in_progress {
            return Err(ProviderErrorDto::new(
                "operation_in_progress",
                "Connection check is already running.",
                "Duplicate connection checks are blocked.",
            ));
        }
        state.check_in_progress = true;
        state.readiness = ReadinessState::Checking;
        state.checked_this_session = false;
        state.last_explicit_check_at = Some(now_millis());
        state.failure_category = None;
        state.safe_detail = None;
        Ok(ResolvedConnection { record })
    }

    fn finish_check_connection(
        &mut self,
        connection_id: &ConnectionId,
        result: &ProviderOperationResult,
    ) {
        let state = self.session.entry(connection_id.clone()).or_default();
        state.check_in_progress = false;
        state.last_explicit_check_at = Some(now_millis());
        if result.ok {
            state.readiness = ReadinessState::Ready;
            state.checked_this_session = true;
            state.failure_category = None;
            state.safe_detail = Some(result.detail.clone());
        } else {
            state.readiness = result.state;
            state.checked_this_session = false;
            state.failure_category = Some(result.category.clone());
            state.safe_detail = Some(result.detail.clone());
        }
    }

    fn begin_refresh_models(
        &mut self,
        request: ProviderModelOperationRequest,
    ) -> Result<ResolvedConnection, ProviderErrorDto> {
        let connection_id = ConnectionId::new(request.connection_id);
        self.require_approved(request.provider_id, &connection_id)?;
        let record = self
            .connection_record(request.provider_id, &connection_id)?
            .clone();
        let state = self.session.entry(connection_id).or_default();
        if state.refresh_in_progress {
            return Err(ProviderErrorDto::new(
                "operation_in_progress",
                "Model refresh is already running.",
                "Duplicate model refresh operations are blocked.",
            ));
        }
        state.refresh_in_progress = true;
        state.inventory = ModelInventoryState {
            state: InventoryKind::Refreshing,
            count: state.inventory.count,
            last_refresh_at: state.inventory.last_refresh_at,
        };
        state.failure_category = None;
        state.safe_detail = None;
        Ok(ResolvedConnection { record })
    }

    fn finish_refresh_models(
        &mut self,
        connection_id: &ConnectionId,
        result: &ProviderOperationResult,
        models: Vec<String>,
    ) {
        let state = self.session.entry(connection_id.clone()).or_default();
        state.refresh_in_progress = false;
        if result.ok {
            state.inventory = ModelInventoryState {
                state: InventoryKind::CurrentSession,
                count: models.len(),
                last_refresh_at: Some(now_millis()),
            };
            state.current_session_models = models;
            state.failure_category = None;
            state.safe_detail = Some(result.detail.clone());
        } else {
            state.inventory = ModelInventoryState {
                state: InventoryKind::Failed,
                count: 0,
                last_refresh_at: Some(now_millis()),
            };
            state.readiness = result.state;
            state.failure_category = Some(result.category.clone());
            state.safe_detail = Some(result.detail.clone());
        }
    }

    fn chat_eligibility(
        &self,
        request: &ProviderStreamChatRequest,
    ) -> Result<ChatEligibility, ProviderErrorDto> {
        if request.operation_intent != "chat" {
            return Ok(ineligible(
                ReadinessState::PolicyDenied,
                "invalid_operation_intent",
                "Only explicit chat operation intent is accepted.",
            ));
        }
        let connection_id = ConnectionId::new(request.connection_id.clone());
        let record = self.connection_record(request.provider_id, &connection_id)?;
        if record.approval_state == ConnectionApprovalState::Disabled {
            return Ok(ineligible(
                ReadinessState::ConfigurationDisabled,
                "configuration_disabled",
                "Connection is disabled.",
            ));
        }
        if record.approval_state != ConnectionApprovalState::Approved {
            return Ok(ineligible(
                ReadinessState::ConfigurationDisabled,
                "connection_not_approved",
                "Connection is not approved for chat.",
            ));
        }
        let state = self
            .session
            .get(&connection_id)
            .cloned()
            .unwrap_or_default();
        if state.check_in_progress || state.refresh_in_progress {
            return Ok(ineligible(
                ReadinessState::Checking,
                "operation_in_progress",
                "Connection check or model refresh is in progress.",
            ));
        }
        if !state.checked_this_session || state.readiness != ReadinessState::Ready {
            return Ok(ineligible(
                state.readiness,
                "current_session_check_required",
                "A successful explicit connection check is required in this session.",
            ));
        }
        if state.inventory.state != InventoryKind::CurrentSession {
            return Ok(ineligible(
                ReadinessState::Stale,
                "current_session_inventory_required",
                "Current-session model inventory is required before chat.",
            ));
        }
        if !state
            .current_session_models
            .iter()
            .any(|id| id == &request.model_id)
        {
            return Ok(ineligible(
                ReadinessState::ModelUnavailable,
                "model_unavailable",
                "Selected model is not in the current-session model inventory.",
            ));
        }
        Ok(ChatEligibility {
            eligible: true,
            state: ReadinessState::Ready,
            category: "eligible".to_string(),
            detail: "Chat is eligible.".to_string(),
        })
    }

    fn resolve_for_chat(
        &mut self,
        request: &ProviderStreamChatRequest,
    ) -> Result<(ResolvedConnection, ChatEligibility, String), ProviderErrorDto> {
        let eligibility = self.chat_eligibility(request)?;
        let operation_id = request
            .operation_id
            .as_deref()
            .filter(|id| !id.trim().is_empty())
            .map(|id| safe_label(id, "provider-stream"))
            .unwrap_or_else(|| format!("provider-stream-{}", now_millis()));
        let connection_id = ConnectionId::new(request.connection_id.clone());
        let record = self
            .connection_record(request.provider_id, &connection_id)?
            .clone();
        if eligibility.eligible {
            self.active_streams.insert(operation_id.clone(), true);
        }
        Ok((ResolvedConnection { record }, eligibility, operation_id))
    }

    fn stream_is_active(&self, operation_id: &str) -> bool {
        self.active_streams
            .get(operation_id)
            .copied()
            .unwrap_or(false)
    }

    fn finish_stream(&mut self, operation_id: &str) {
        self.active_streams.remove(operation_id);
    }

    fn cancel_stream(&mut self, operation_id: &str) -> bool {
        match self.active_streams.get_mut(operation_id) {
            Some(active) => {
                *active = false;
                true
            }
            None => false,
        }
    }

    fn connection_record(
        &self,
        provider_id: ProviderId,
        connection_id: &ConnectionId,
    ) -> Result<&ConnectionRecord, ProviderErrorDto> {
        let record = self.records.get(connection_id).ok_or_else(|| {
            ProviderErrorDto::new(
                "unknown_connection",
                "Unknown connection.",
                "Connection ID is not present in the Rust-owned provider store.",
            )
        })?;
        if record.provider_id != provider_id {
            return Err(ProviderErrorDto::new(
                "provider_connection_mismatch",
                "Connection does not belong to provider.",
                "Provider ID and connection ID do not match the Rust-owned provider store.",
            ));
        }
        Ok(record)
    }

    fn connection_record_mut(
        &mut self,
        provider_id: ProviderId,
        connection_id: &ConnectionId,
    ) -> Result<&mut ConnectionRecord, ProviderErrorDto> {
        let record = self.records.get_mut(connection_id).ok_or_else(|| {
            ProviderErrorDto::new(
                "unknown_connection",
                "Unknown connection.",
                "Connection ID is not present in the Rust-owned provider store.",
            )
        })?;
        if record.provider_id != provider_id {
            return Err(ProviderErrorDto::new(
                "provider_connection_mismatch",
                "Connection does not belong to provider.",
                "Provider ID and connection ID do not match the Rust-owned provider store.",
            ));
        }
        Ok(record)
    }

    fn require_approved(
        &self,
        provider_id: ProviderId,
        connection_id: &ConnectionId,
    ) -> Result<(), ProviderErrorDto> {
        let record = self.connection_record(provider_id, connection_id)?;
        match record.approval_state {
            ConnectionApprovalState::Approved => Ok(()),
            ConnectionApprovalState::PendingApproval => Err(ProviderErrorDto::new(
                "connection_not_approved",
                "Connection is not approved.",
                "Provider operation requires an approved Rust-owned connection record.",
            )),
            ConnectionApprovalState::Disabled => Err(ProviderErrorDto::new(
                "configuration_disabled",
                "Connection is disabled.",
                "Provider operation requires an enabled Rust-owned connection record.",
            )),
        }
    }

    fn next_connection_id(&mut self) -> ConnectionId {
        let id = ConnectionId::new(format!("conn-{:08}", self.next_connection));
        self.next_connection += 1;
        id
    }
}

#[tauri::command]
pub fn provider_list_runtime_state(
    state: State<'_, ProviderRuntimeState>,
) -> Result<ProviderRuntimeSnapshot, ProviderErrorDto> {
    Ok(state.lock()?.snapshot())
}

#[tauri::command]
pub fn provider_create_connection(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderCreateConnectionRequest,
) -> Result<ConnectionDto, ProviderErrorDto> {
    state.lock()?.create_connection(request)
}

#[tauri::command]
pub fn provider_edit_connection(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderEditConnectionRequest,
) -> Result<ConnectionDto, ProviderErrorDto> {
    state.lock()?.edit_connection(request)
}

#[tauri::command]
pub fn provider_disable_connection(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderConnectionSelector,
) -> Result<ConnectionDto, ProviderErrorDto> {
    state.lock()?.disable_connection(request)
}

#[tauri::command]
pub fn provider_delete_connection(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderConnectionSelector,
) -> Result<ProviderOperationResult, ProviderErrorDto> {
    state.lock()?.delete_connection(request)
}

#[tauri::command]
pub fn provider_approve_connection(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderConnectionSelector,
) -> Result<ConnectionDto, ProviderErrorDto> {
    state.lock()?.approve_connection(request)
}

#[tauri::command]
pub async fn provider_check_connection(
    state: State<'_, ProviderRuntimeState>,
    gates: State<'_, GateState>,
    request: ProviderModelOperationRequest,
) -> Result<ProviderOperationResult, ProviderErrorDto> {
    let connection = state.lock()?.begin_check_connection(request)?;
    let result = run_provider_check(&connection, &gates).await;
    state
        .lock()?
        .finish_check_connection(connection.connection_id(), &result);
    Ok(result)
}

#[tauri::command]
pub async fn provider_refresh_models(
    state: State<'_, ProviderRuntimeState>,
    gates: State<'_, GateState>,
    request: ProviderModelOperationRequest,
) -> Result<ProviderOperationResult, ProviderErrorDto> {
    let connection = state.lock()?.begin_refresh_models(request)?;
    let (result, models) = run_provider_refresh(&connection, &gates).await;
    state
        .lock()?
        .finish_refresh_models(connection.connection_id(), &result, models);
    Ok(result)
}

#[tauri::command]
pub async fn provider_stream_chat(
    state: State<'_, ProviderRuntimeState>,
    gates: State<'_, GateState>,
    request: ProviderStreamChatRequest,
    on_event: Channel<String>,
) -> Result<ProviderOperationResult, ProviderErrorDto> {
    let (connection, eligibility, operation_id) = state.lock()?.resolve_for_chat(&request)?;
    if !eligibility.eligible {
        return Ok(ProviderOperationResult {
            ok: false,
            state: eligibility.state,
            category: eligibility.category,
            detail: eligibility.detail,
        });
    }
    let result = run_provider_stream(
        &state,
        &connection,
        &request,
        &operation_id,
        on_event,
        &gates,
    )
    .await;
    state.lock()?.finish_stream(&operation_id);
    Ok(result)
}

#[tauri::command]
pub fn provider_cancel_stream(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderCancelStreamRequest,
) -> Result<ProviderOperationResult, ProviderErrorDto> {
    let operation_id = request.operation_id.trim();
    if operation_id.is_empty() {
        return Err(ProviderErrorDto::new(
            "invalid_operation",
            "Invalid operation.",
            "Operation ID is required for cancellation.",
        ));
    }
    let cancelled = state.lock()?.cancel_stream(operation_id);
    Ok(ProviderOperationResult {
        ok: cancelled,
        state: ReadinessState::Unknown,
        category: "cancelled".to_string(),
        detail: if cancelled {
            "Stream cancellation was requested.".to_string()
        } else {
            "No active provider stream matched the cancellation request.".to_string()
        },
    })
}

#[tauri::command]
pub fn provider_store_credential(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderCredentialStoreRequest,
) -> Result<ProviderCredentialStatus, ProviderErrorDto> {
    let connection_id = ConnectionId::new(request.connection_id.clone());
    let binding = {
        let runtime = state.lock()?;
        runtime.credential_binding(request.provider_id, &connection_id)?
    };
    store_credential(&binding, &request.value)?;
    state
        .lock()?
        .mark_credential_configured(request.provider_id, &connection_id, true)
}

#[tauri::command]
pub fn provider_clear_credential(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderConnectionSelector,
) -> Result<ProviderCredentialStatus, ProviderErrorDto> {
    let connection_id = ConnectionId::new(request.connection_id.clone());
    let binding = {
        let runtime = state.lock()?;
        runtime.credential_binding(request.provider_id, &connection_id)?
    };
    clear_credential(&binding)?;
    state
        .lock()?
        .mark_credential_configured(request.provider_id, &connection_id, false)
}

#[tauri::command]
pub fn provider_credential_status(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderConnectionSelector,
) -> Result<ProviderCredentialStatus, ProviderErrorDto> {
    state.lock()?.credential_status(request)
}

#[tauri::command]
pub fn provider_migrate_legacy_config(
    app: AppHandle,
    state: State<'_, ProviderRuntimeState>,
    request: ProviderMigrationRequest,
) -> Result<ProviderMigrationResult, ProviderErrorDto> {
    let config_dir = provider_config_dir(&app)?;
    let mut runtime = state.lock()?;
    let counters = runtime.apply_migration(request)?;
    let backup_created = write_store_to_dir(&config_dir, &runtime)?;
    Ok(ProviderMigrationResult {
        migrated_connections: counters.migrated_connections,
        disabled_connections: counters.disabled_connections,
        skipped_sidecar_entries: counters.skipped_sidecar_entries,
        backup_created,
        recovery_detail: None,
        snapshot: runtime.snapshot(),
    })
}

fn validate_endpoint(
    provider_id: ProviderId,
    raw_endpoint: &str,
) -> Result<EndpointOrigin, ProviderErrorDto> {
    if provider_id == ProviderId::Gemini {
        return Err(ProviderErrorDto::new(
            "fixed_provider_route",
            "Gemini uses a fixed provider route.",
            "Gemini endpoint is not user-configurable.",
        ));
    }

    let endpoint = raw_endpoint.trim();
    if endpoint.is_empty() {
        return Err(ProviderErrorDto::new(
            "invalid_endpoint",
            "Endpoint is required.",
            "Provider endpoint cannot be empty.",
        ));
    }
    let url = reqwest::Url::parse(endpoint).map_err(|_| {
        ProviderErrorDto::new(
            "invalid_endpoint",
            "Endpoint is invalid.",
            "Provider endpoint must be an absolute URL.",
        )
    })?;

    if !url.username().is_empty() || url.password().is_some() {
        return Err(ProviderErrorDto::new(
            "invalid_endpoint_credentials",
            "Endpoint credentials are not allowed.",
            "Provider endpoint cannot include username or password.",
        ));
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err(ProviderErrorDto::new(
            "invalid_endpoint_components",
            "Endpoint query strings and fragments are not allowed.",
            "Provider endpoint must not include query strings or fragments.",
        ));
    }

    let host = url.host_str().ok_or_else(|| {
        ProviderErrorDto::new(
            "invalid_endpoint_host",
            "Endpoint host is required.",
            "Provider endpoint must include a host.",
        )
    })?;

    let path = url.path();
    let local_host = normalize_loopback_host(host);
    if let Some(normalized_host) = local_host {
        return validate_loopback_endpoint(provider_id, &url, normalized_host);
    }

    validate_remote_endpoint(provider_id, &url, host, path)
}

fn validate_loopback_endpoint(
    provider_id: ProviderId,
    url: &reqwest::Url,
    normalized_host: &str,
) -> Result<EndpointOrigin, ProviderErrorDto> {
    if url.scheme() != "http" {
        return Err(ProviderErrorDto::new(
            "invalid_loopback_scheme",
            "Loopback endpoints must use HTTP.",
            "Only HTTP loopback provider endpoints are allowed for local providers.",
        ));
    }
    validate_allowed_path(provider_id, url.path())?;
    let port = url
        .port()
        .or_else(|| provider_id.default_local_port())
        .ok_or_else(|| {
            ProviderErrorDto::new(
                "invalid_loopback_port",
                "Loopback endpoint port is required.",
                "Custom local endpoints must include an explicit port.",
            )
        })?;
    let host = if normalized_host == "::1" {
        "[::1]".to_string()
    } else {
        normalized_host.to_string()
    };
    let base_path = normalized_base_path(provider_id, url.path())?;
    let origin = match &base_path {
        Some(path) => format!("http://{host}:{port}{path}"),
        None => format!("http://{host}:{port}"),
    };
    Ok(EndpointOrigin {
        normalized_origin: origin,
        base_path,
        transport_class: TransportClass::LoopbackHttp,
        locality: LocalityClassification::LocalLoopback,
    })
}

fn validate_remote_endpoint(
    provider_id: ProviderId,
    url: &reqwest::Url,
    host: &str,
    path: &str,
) -> Result<EndpointOrigin, ProviderErrorDto> {
    if provider_id != ProviderId::CustomOpenAi {
        return Err(ProviderErrorDto::new(
            "remote_endpoint_not_allowed",
            "Remote endpoint is not allowed for this provider.",
            "Only Custom OpenAI-compatible connections may use remote endpoints.",
        ));
    }
    if url.scheme() != "https" {
        return Err(ProviderErrorDto::new(
            "remote_endpoint_requires_https",
            "Remote endpoints must use HTTPS.",
            "Custom OpenAI-compatible remote endpoints require HTTPS.",
        ));
    }
    if host.parse::<IpAddr>().is_ok() {
        return Err(ProviderErrorDto::new(
            "remote_ip_literal_rejected",
            "Remote endpoint host is not allowed.",
            "Remote Custom OpenAI-compatible endpoints require DNS hostnames, not IP literals.",
        ));
    }
    validate_allowed_path(provider_id, path)?;
    let base_path = normalized_base_path(provider_id, path)?;
    let origin = match (url.port(), &base_path) {
        (Some(port), Some(path)) => {
            format!("https://{}:{}{}", host.to_ascii_lowercase(), port, path)
        }
        (Some(port), None) => format!("https://{}:{}", host.to_ascii_lowercase(), port),
        (None, Some(path)) => format!("https://{}{}", host.to_ascii_lowercase(), path),
        (None, None) => format!("https://{}", host.to_ascii_lowercase()),
    };
    Ok(EndpointOrigin {
        normalized_origin: origin,
        base_path,
        transport_class: TransportClass::RemoteHttps,
        locality: LocalityClassification::RemotePublic,
    })
}

fn validate_allowed_path(provider_id: ProviderId, path: &str) -> Result<(), ProviderErrorDto> {
    let allowed = match provider_id {
        ProviderId::Ollama | ProviderId::LmStudio => path.is_empty() || path == "/",
        ProviderId::CustomOpenAi => path.is_empty() || path == "/" || path == "/v1",
        ProviderId::Gemini => false,
    };
    if allowed {
        Ok(())
    } else {
        Err(ProviderErrorDto::new(
            "invalid_endpoint_path",
            "Endpoint path is not allowed.",
            "Provider endpoints may use only provider-specific approved base paths.",
        ))
    }
}

fn normalized_base_path(
    provider_id: ProviderId,
    path: &str,
) -> Result<Option<String>, ProviderErrorDto> {
    validate_allowed_path(provider_id, path)?;
    if provider_id == ProviderId::CustomOpenAi && path == "/v1" {
        Ok(Some("/v1".to_string()))
    } else {
        Ok(None)
    }
}

fn normalize_loopback_host(host: &str) -> Option<&'static str> {
    match host.trim().to_ascii_lowercase().as_str() {
        "localhost" | "127.0.0.1" => Some("127.0.0.1"),
        "::1" | "[::1]" => Some("::1"),
        _ => None,
    }
}

fn safe_label(label: &str, fallback: &str) -> String {
    let sanitized = label
        .trim()
        .chars()
        .filter(|ch| ch.is_ascii_graphic() || *ch == ' ')
        .take(80)
        .collect::<String>();
    if sanitized.is_empty() {
        fallback.to_string()
    } else {
        sanitized
    }
}

fn sanitize_detail(detail: &str) -> String {
    let mut out = String::new();
    for ch in detail.chars().take(240) {
        if ch.is_control() {
            out.push(' ');
        } else {
            out.push(ch);
        }
    }
    let lower = out.to_ascii_lowercase();
    if lower.contains("bearer ") || lower.contains("authorization") || lower.contains("sk-") {
        "Provider error detail was redacted.".to_string()
    } else {
        out
    }
}

fn store_credential(binding: &CredentialBindingRef, value: &str) -> Result<(), ProviderErrorDto> {
    let secret = value.trim();
    if secret.is_empty() {
        return Err(ProviderErrorDto::new(
            "credential_empty",
            "Credential is required.",
            "Provider credential cannot be empty.",
        ));
    }
    let account = binding.account_name();
    let entry = keyring::Entry::new(PROVIDER_SECRET_SERVICE, &account).map_err(|_| {
        ProviderErrorDto::new(
            "credential_store_unavailable",
            "Credential storage is unavailable.",
            "Unable to open secure provider credential storage.",
        )
    })?;
    entry.set_password(secret).map_err(|_| {
        ProviderErrorDto::new(
            "credential_store_failed",
            "Credential could not be stored.",
            "Secure provider credential storage rejected the write.",
        )
    })
}

fn clear_credential(binding: &CredentialBindingRef) -> Result<(), ProviderErrorDto> {
    let account = binding.account_name();
    let entry = keyring::Entry::new(PROVIDER_SECRET_SERVICE, &account).map_err(|_| {
        ProviderErrorDto::new(
            "credential_store_unavailable",
            "Credential storage is unavailable.",
            "Unable to open secure provider credential storage.",
        )
    })?;
    match entry.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(ProviderErrorDto::new(
            "credential_clear_failed",
            "Credential could not be cleared.",
            "Secure provider credential storage rejected the delete.",
        )),
    }
}

fn credential_is_present(binding: &CredentialBindingRef) -> bool {
    let account = binding.account_name();
    keyring::Entry::new(PROVIDER_SECRET_SERVICE, &account)
        .and_then(|entry| entry.get_password())
        .map(|secret| !secret.is_empty())
        .unwrap_or(false)
}

fn enforce_provider_policy(
    command: &str,
    connection: &ResolvedConnection,
    gates: &GateState,
) -> Result<(), ProviderErrorDto> {
    let endpoint = connection.endpoint()?;
    if matches!(
        endpoint.locality,
        LocalityClassification::RemotePublic | LocalityClassification::FixedRemote
    ) && !gates.network_open()
    {
        let detail = PolicyError::gate_closed(command, Gate::Network).to_string();
        return Err(ProviderErrorDto::new(
            "network_denied",
            "Network access is disabled.",
            &detail,
        ));
    }
    Ok(())
}

fn read_bound_credential(
    connection: &ResolvedConnection,
) -> Result<Option<String>, ProviderOperationResult> {
    let Some(binding) = connection.record.credential_binding.as_ref() else {
        return Ok(None);
    };
    let account = binding.account_name();
    let entry = keyring::Entry::new(PROVIDER_SECRET_SERVICE, &account).map_err(|_| {
        operation_result(
            false,
            ReadinessState::RequiresApiKey,
            "requires_api_key",
            "Provider credential storage is unavailable.",
        )
    })?;
    match entry.get_password() {
        Ok(secret) if !secret.is_empty() => Ok(Some(secret)),
        _ if connection.record.credential_requirement == CredentialRequirement::Required => {
            Err(operation_result(
                false,
                ReadinessState::RequiresApiKey,
                "requires_api_key",
                "Provider credential is required before this operation.",
            ))
        }
        _ => Ok(None),
    }
}

fn provider_client(timeout_secs: u64) -> Result<reqwest::Client, ProviderOperationResult> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(CHECK_TIMEOUT_SECS))
        .timeout(Duration::from_secs(timeout_secs))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| {
            operation_result(
                false,
                ReadinessState::ConnectionCheckFailed,
                "connection_check_failed",
                "Provider HTTP client could not be initialized.",
            )
        })
}

fn operation_result(
    ok: bool,
    state: ReadinessState,
    category: &str,
    detail: &str,
) -> ProviderOperationResult {
    ProviderOperationResult {
        ok,
        state,
        category: category.to_string(),
        detail: sanitize_detail(detail),
    }
}

async fn provider_error_result(
    state: ReadinessState,
    category: &str,
    response: reqwest::Response,
) -> ProviderOperationResult {
    let status = response.status();
    let safe_state = match status.as_u16() {
        401 => ReadinessState::AuthenticationFailed,
        403 => ReadinessState::PermissionDenied,
        429 => ReadinessState::QuotaExhausted,
        404 => ReadinessState::EndpointUnavailable,
        _ => state,
    };
    let safe_category = match status.as_u16() {
        401 => "authentication_failed",
        403 => "permission_denied",
        429 => "quota_exhausted",
        404 => "endpoint_unavailable",
        _ => category,
    };
    let body = response
        .bytes()
        .await
        .ok()
        .map(|bytes| {
            String::from_utf8_lossy(&bytes[..bytes.len().min(MAX_ERROR_BODY_BYTES)]).to_string()
        })
        .unwrap_or_default();
    let detail = if body.trim().is_empty() {
        format!("Provider returned HTTP {}.", status.as_u16())
    } else {
        format!("Provider returned HTTP {}.", status.as_u16())
    };
    operation_result(false, safe_state, safe_category, &detail)
}

async fn limited_json(
    response: reqwest::Response,
) -> Result<serde_json::Value, ProviderOperationResult> {
    let status = response.status();
    if status.is_redirection() {
        return Err(operation_result(
            false,
            ReadinessState::EndpointUnavailable,
            "redirect_rejected",
            "Provider attempted to redirect the request.",
        ));
    }
    if !status.is_success() {
        return Err(provider_error_result(
            ReadinessState::ConnectionCheckFailed,
            "connection_check_failed",
            response,
        )
        .await);
    }
    let bytes = response.bytes().await.map_err(|_| {
        operation_result(
            false,
            ReadinessState::ConnectionCheckFailed,
            "connection_check_failed",
            "Provider response could not be read.",
        )
    })?;
    if bytes.len() > MAX_JSON_BODY_BYTES {
        return Err(operation_result(
            false,
            ReadinessState::ConnectionCheckFailed,
            "response_too_large",
            "Provider response exceeded the configured size limit.",
        ));
    }
    serde_json::from_slice(&bytes).map_err(|_| {
        operation_result(
            false,
            ReadinessState::ConnectionCheckFailed,
            "provider_response_invalid",
            "Provider response was not valid JSON.",
        )
    })
}

fn provider_route(
    connection: &ResolvedConnection,
    suffix: &str,
) -> Result<String, ProviderErrorDto> {
    let endpoint = connection.endpoint()?;
    Ok(format!(
        "{}{}",
        endpoint.normalized_origin.trim_end_matches('/'),
        suffix
    ))
}

fn openai_route(connection: &ResolvedConnection, suffix: &str) -> Result<String, ProviderErrorDto> {
    let endpoint = connection.endpoint()?;
    let base = endpoint.normalized_origin.trim_end_matches('/');
    if base.ends_with("/v1") {
        Ok(format!("{base}{suffix}"))
    } else {
        Ok(format!("{base}/v1{suffix}"))
    }
}

fn enforce_remote_resolution(
    connection: &ResolvedConnection,
) -> Result<(), ProviderOperationResult> {
    let endpoint = connection.endpoint().map_err(|err| {
        operation_result(
            false,
            ReadinessState::ConfigurationDisabled,
            &err.code,
            &err.detail,
        )
    })?;
    if endpoint.locality == LocalityClassification::LocalLoopback {
        return Ok(());
    }
    let url = reqwest::Url::parse(&endpoint.normalized_origin).map_err(|_| {
        operation_result(
            false,
            ReadinessState::EndpointUnavailable,
            "endpoint_unavailable",
            "Provider endpoint could not be parsed.",
        )
    })?;
    let host = url.host_str().ok_or_else(|| {
        operation_result(
            false,
            ReadinessState::EndpointUnavailable,
            "endpoint_unavailable",
            "Provider endpoint host is missing.",
        )
    })?;
    if host.parse::<IpAddr>().is_ok() {
        return Err(operation_result(
            false,
            ReadinessState::EndpointUnavailable,
            "remote_ip_literal_rejected",
            "Remote provider endpoint host must be a DNS hostname.",
        ));
    }
    let port = url.port_or_known_default().unwrap_or(443);
    let addrs = (host, port).to_socket_addrs().map_err(|_| {
        operation_result(
            false,
            ReadinessState::EndpointUnavailable,
            "endpoint_unavailable",
            "Provider endpoint hostname could not be resolved.",
        )
    })?;
    for addr in addrs {
        if !is_public_resolved_ip(addr.ip()) {
            return Err(operation_result(
                false,
                ReadinessState::EndpointUnavailable,
                "endpoint_unavailable",
                "Provider endpoint resolved to a non-public address.",
            ));
        }
    }
    Ok(())
}

fn is_public_resolved_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_multicast()
                || ip.is_broadcast()
                || ip.is_unspecified()
                || ip.octets()[0] == 0
                || ip.octets()[0] == 10
                || ip.octets()[0] == 127
                || (ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1]))
                || (ip.octets()[0] == 169 && ip.octets()[1] == 254)
                || (ip.octets()[0] == 172 && (16..=31).contains(&ip.octets()[1]))
                || (ip.octets()[0] == 192 && ip.octets()[1] == 168)
                || (ip.octets()[0] == 192 && ip.octets()[1] == 0 && ip.octets()[2] == 0)
                || (ip.octets()[0] == 192 && ip.octets()[1] == 0 && ip.octets()[2] == 2)
                || (ip.octets()[0] == 198 && (18..=19).contains(&ip.octets()[1]))
                || (ip.octets()[0] == 198 && ip.octets()[1] == 51 && ip.octets()[2] == 100)
                || (ip.octets()[0] == 203 && ip.octets()[1] == 0 && ip.octets()[2] == 113)
                || ip.octets()[0] >= 224)
        }
        IpAddr::V6(ip) => {
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || ip.is_unique_local()
                || ip.is_unicast_link_local())
        }
    }
}

fn parse_ollama_models(value: &serde_json::Value) -> Vec<String> {
    value
        .get("models")
        .and_then(|models| models.as_array())
        .map(|models| {
            models
                .iter()
                .filter_map(|model| model.get("name").and_then(|name| name.as_str()))
                .filter(|name| !name.trim().is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

fn parse_openai_models(value: &serde_json::Value) -> Vec<String> {
    value
        .get("data")
        .and_then(|models| models.as_array())
        .map(|models| {
            models
                .iter()
                .filter_map(|model| model.get("id").and_then(|name| name.as_str()))
                .filter(|name| !name.trim().is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

fn parse_gemini_models(value: &serde_json::Value) -> Vec<String> {
    value
        .get("models")
        .and_then(|models| models.as_array())
        .map(|models| {
            models
                .iter()
                .filter_map(|model| model.get("name").and_then(|name| name.as_str()))
                .filter(|name| !name.trim().is_empty())
                .map(|name| name.trim_start_matches("models/").to_string())
                .collect()
        })
        .unwrap_or_default()
}

async fn run_provider_check(
    connection: &ResolvedConnection,
    gates: &GateState,
) -> ProviderOperationResult {
    if let Err(err) = enforce_provider_policy("provider_check_connection", connection, gates) {
        return operation_result(false, ReadinessState::NetworkDenied, &err.code, &err.detail);
    }
    if let Err(result) = enforce_remote_resolution(connection) {
        return result;
    }
    let credential = match read_bound_credential(connection) {
        Ok(credential) => credential,
        Err(result) => return result,
    };
    match connection.record.provider_id {
        ProviderId::Ollama => {
            adapter_get_json(connection, "/api/version", credential, CHECK_TIMEOUT_SECS)
                .await
                .map(|_| {
                    operation_result(
                        true,
                        ReadinessState::Ready,
                        "ready",
                        "Connection check succeeded.",
                    )
                })
                .unwrap_or_else(|result| result)
        }
        ProviderId::LmStudio | ProviderId::CustomOpenAi => {
            adapter_get_json(connection, "/models", credential, CHECK_TIMEOUT_SECS)
                .await
                .map(|_| {
                    operation_result(
                        true,
                        ReadinessState::Ready,
                        "ready",
                        "Connection check succeeded.",
                    )
                })
                .unwrap_or_else(|result| result)
        }
        ProviderId::Gemini => {
            let Some(key) = credential else {
                return operation_result(
                    false,
                    ReadinessState::RequiresApiKey,
                    "requires_api_key",
                    "Gemini credential is required.",
                );
            };
            let client = match provider_client(CHECK_TIMEOUT_SECS) {
                Ok(client) => client,
                Err(result) => return result,
            };
            let response = client
                .get(format!("{GEMINI_BASE}/models?pageSize=1"))
                .header("x-goog-api-key", key)
                .send()
                .await;
            match response {
                Ok(response) => limited_json(response)
                    .await
                    .map(|_| {
                        operation_result(
                            true,
                            ReadinessState::Ready,
                            "ready",
                            "Connection check succeeded.",
                        )
                    })
                    .unwrap_or_else(|result| result),
                Err(_) => operation_result(
                    false,
                    ReadinessState::EndpointUnavailable,
                    "endpoint_unavailable",
                    "Provider endpoint was unavailable.",
                ),
            }
        }
    }
}

async fn run_provider_refresh(
    connection: &ResolvedConnection,
    gates: &GateState,
) -> (ProviderOperationResult, Vec<String>) {
    if let Err(err) = enforce_provider_policy("provider_refresh_models", connection, gates) {
        return (
            operation_result(false, ReadinessState::NetworkDenied, &err.code, &err.detail),
            Vec::new(),
        );
    }
    if let Err(result) = enforce_remote_resolution(connection) {
        return (result, Vec::new());
    }
    let credential = match read_bound_credential(connection) {
        Ok(credential) => credential,
        Err(result) => return (result, Vec::new()),
    };
    let response = match connection.record.provider_id {
        ProviderId::Ollama => {
            adapter_get_json(connection, "/api/tags", credential, REFRESH_TIMEOUT_SECS)
                .await
                .map(|json| parse_ollama_models(&json))
        }
        ProviderId::LmStudio | ProviderId::CustomOpenAi => {
            adapter_get_json(connection, "/models", credential, REFRESH_TIMEOUT_SECS)
                .await
                .map(|json| parse_openai_models(&json))
        }
        ProviderId::Gemini => {
            let Some(key) = credential else {
                return (
                    operation_result(
                        false,
                        ReadinessState::RequiresApiKey,
                        "requires_api_key",
                        "Gemini credential is required.",
                    ),
                    Vec::new(),
                );
            };
            let client = match provider_client(REFRESH_TIMEOUT_SECS) {
                Ok(client) => client,
                Err(result) => return (result, Vec::new()),
            };
            match client
                .get(format!("{GEMINI_BASE}/models"))
                .header("x-goog-api-key", key)
                .send()
                .await
            {
                Ok(response) => limited_json(response)
                    .await
                    .map(|json| parse_gemini_models(&json)),
                Err(_) => Err(operation_result(
                    false,
                    ReadinessState::RefreshFailed,
                    "refresh_failed",
                    "Provider model refresh failed.",
                )),
            }
        }
    };
    match response {
        Ok(models) if !models.is_empty() => (
            operation_result(
                true,
                ReadinessState::Ready,
                "ready",
                "Model refresh succeeded.",
            ),
            models,
        ),
        Ok(_) => (
            operation_result(
                false,
                ReadinessState::ModelUnavailable,
                "model_unavailable",
                "Provider returned no models.",
            ),
            Vec::new(),
        ),
        Err(result) => (result, Vec::new()),
    }
}

async fn adapter_get_json(
    connection: &ResolvedConnection,
    suffix: &str,
    credential: Option<String>,
    timeout_secs: u64,
) -> Result<serde_json::Value, ProviderOperationResult> {
    let client = provider_client(timeout_secs)?;
    let url = match connection.record.provider_id {
        ProviderId::Ollama => provider_route(connection, suffix),
        ProviderId::LmStudio | ProviderId::CustomOpenAi => openai_route(connection, suffix),
        ProviderId::Gemini => unreachable!("Gemini uses fixed routes"),
    }
    .map_err(|err| {
        operation_result(
            false,
            ReadinessState::ConfigurationDisabled,
            &err.code,
            &err.detail,
        )
    })?;
    let mut request = client.get(url);
    if let Some(secret) = credential {
        request = request.bearer_auth(secret);
    }
    match request.send().await {
        Ok(response) => limited_json(response).await,
        Err(_) => Err(operation_result(
            false,
            ReadinessState::EndpointUnavailable,
            "endpoint_unavailable",
            "Provider endpoint was unavailable.",
        )),
    }
}

async fn run_provider_stream(
    state: &ProviderRuntimeState,
    connection: &ResolvedConnection,
    request: &ProviderStreamChatRequest,
    operation_id: &str,
    on_event: Channel<String>,
    gates: &GateState,
) -> ProviderOperationResult {
    if let Err(err) = enforce_provider_policy("provider_stream_chat", connection, gates) {
        return operation_result(false, ReadinessState::NetworkDenied, &err.code, &err.detail);
    }
    if let Err(result) = enforce_remote_resolution(connection) {
        return result;
    }
    let credential = match read_bound_credential(connection) {
        Ok(credential) => credential,
        Err(result) => return result,
    };
    match connection.record.provider_id {
        ProviderId::Ollama => {
            stream_ollama(
                state,
                connection,
                request,
                operation_id,
                on_event,
                credential,
            )
            .await
        }
        ProviderId::LmStudio | ProviderId::CustomOpenAi => {
            stream_openai_compatible(
                state,
                connection,
                request,
                operation_id,
                on_event,
                credential,
            )
            .await
        }
        ProviderId::Gemini => {
            let Some(key) = credential else {
                return operation_result(
                    false,
                    ReadinessState::RequiresApiKey,
                    "requires_api_key",
                    "Gemini credential is required.",
                );
            };
            stream_gemini(state, request, operation_id, on_event, key).await
        }
    }
}

async fn stream_ollama(
    state: &ProviderRuntimeState,
    connection: &ResolvedConnection,
    request: &ProviderStreamChatRequest,
    operation_id: &str,
    on_event: Channel<String>,
    credential: Option<String>,
) -> ProviderOperationResult {
    let client = match provider_client(STREAM_TIMEOUT_SECS) {
        Ok(client) => client,
        Err(result) => return result,
    };
    let url = match provider_route(connection, "/api/chat") {
        Ok(url) => url,
        Err(err) => {
            return operation_result(
                false,
                ReadinessState::ConfigurationDisabled,
                &err.code,
                &err.detail,
            )
        }
    };
    let body = serde_json::json!({
        "model": request.model_id,
        "messages": request.messages,
        "stream": true,
        "options": {
            "temperature": request.tuning.temperature,
            "num_ctx": request.tuning.num_ctx
        }
    });
    let mut http_request = client.post(url).json(&body);
    if let Some(secret) = credential {
        http_request = http_request.bearer_auth(secret);
    }
    let response = http_request.send().await;
    let mut response = match response {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => {
            return provider_error_result(
                ReadinessState::ConnectionCheckFailed,
                "provider_error",
                response,
            )
            .await
        }
        Err(_) => {
            return operation_result(
                false,
                ReadinessState::EndpointUnavailable,
                "endpoint_unavailable",
                "Provider endpoint was unavailable.",
            )
        }
    };
    let mut served = String::new();
    let mut buf = String::new();
    while let Some(chunk) = match response.chunk().await {
        Ok(chunk) => chunk,
        Err(_) => {
            return operation_result(
                false,
                ReadinessState::ConnectionCheckFailed,
                "stream_failed",
                "Provider stream failed.",
            )
        }
    } {
        if !stream_active(state, operation_id) {
            return operation_result(
                false,
                ReadinessState::Unknown,
                "cancelled",
                "Stream cancelled.",
            );
        }
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(idx) = buf.find('\n') {
            let line = buf[..idx].trim().to_string();
            buf = buf[idx + 1..].to_string();
            if line.is_empty() {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                if served.is_empty() {
                    if let Some(model) = json.get("model").and_then(|model| model.as_str()) {
                        served = model.to_string();
                        if served != request.model_id {
                            return operation_result(
                                false,
                                ReadinessState::ModelUnavailable,
                                "model_unavailable",
                                "Provider reported a different model than requested.",
                            );
                        }
                    }
                }
                if let Some(token) = json
                    .get("message")
                    .and_then(|message| message.get("content"))
                    .and_then(|content| content.as_str())
                {
                    if !token.is_empty() && on_event.send(token.to_string()).is_err() {
                        return operation_result(
                            false,
                            ReadinessState::ConnectionCheckFailed,
                            "stream_failed",
                            "Unable to deliver provider stream token.",
                        );
                    }
                }
            }
        }
    }
    operation_result(
        true,
        ReadinessState::Ready,
        "ready",
        "Chat stream completed.",
    )
}

async fn stream_openai_compatible(
    state: &ProviderRuntimeState,
    connection: &ResolvedConnection,
    request: &ProviderStreamChatRequest,
    operation_id: &str,
    on_event: Channel<String>,
    credential: Option<String>,
) -> ProviderOperationResult {
    let client = match provider_client(STREAM_TIMEOUT_SECS) {
        Ok(client) => client,
        Err(result) => return result,
    };
    let url = match openai_route(connection, "/chat/completions") {
        Ok(url) => url,
        Err(err) => {
            return operation_result(
                false,
                ReadinessState::ConfigurationDisabled,
                &err.code,
                &err.detail,
            )
        }
    };
    let body = serde_json::json!({
        "model": request.model_id,
        "messages": request.messages,
        "stream": true,
        "temperature": request.tuning.temperature
    });
    let mut http_request = client.post(url).json(&body);
    if let Some(secret) = credential {
        http_request = http_request.bearer_auth(secret);
    }
    let response = http_request.send().await;
    let mut response = match response {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => {
            return provider_error_result(
                ReadinessState::ConnectionCheckFailed,
                "provider_error",
                response,
            )
            .await
        }
        Err(_) => {
            return operation_result(
                false,
                ReadinessState::EndpointUnavailable,
                "endpoint_unavailable",
                "Provider endpoint was unavailable.",
            )
        }
    };
    let mut served = String::new();
    let mut buf = String::new();
    while let Some(chunk) = match response.chunk().await {
        Ok(chunk) => chunk,
        Err(_) => {
            return operation_result(
                false,
                ReadinessState::ConnectionCheckFailed,
                "stream_failed",
                "Provider stream failed.",
            )
        }
    } {
        if !stream_active(state, operation_id) {
            return operation_result(
                false,
                ReadinessState::Unknown,
                "cancelled",
                "Stream cancelled.",
            );
        }
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(idx) = buf.find('\n') {
            let line = buf[..idx].trim().to_string();
            buf = buf[idx + 1..].to_string();
            if !line.starts_with("data:") {
                continue;
            }
            let payload = line[5..].trim();
            if payload == "[DONE]" || payload.is_empty() {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) {
                if served.is_empty() {
                    if let Some(model) = json.get("model").and_then(|model| model.as_str()) {
                        served = model.to_string();
                        if served != request.model_id {
                            return operation_result(
                                false,
                                ReadinessState::ModelUnavailable,
                                "model_unavailable",
                                "Provider reported a different model than requested.",
                            );
                        }
                    }
                }
                if let Some(token) = json
                    .get("choices")
                    .and_then(|choices| choices.get(0))
                    .and_then(|choice| choice.get("delta"))
                    .and_then(|delta| delta.get("content"))
                    .and_then(|content| content.as_str())
                {
                    if !token.is_empty() && on_event.send(token.to_string()).is_err() {
                        return operation_result(
                            false,
                            ReadinessState::ConnectionCheckFailed,
                            "stream_failed",
                            "Unable to deliver provider stream token.",
                        );
                    }
                }
            }
        }
    }
    operation_result(
        true,
        ReadinessState::Ready,
        "ready",
        "Chat stream completed.",
    )
}

async fn stream_gemini(
    state: &ProviderRuntimeState,
    request: &ProviderStreamChatRequest,
    operation_id: &str,
    on_event: Channel<String>,
    credential: String,
) -> ProviderOperationResult {
    let client = match provider_client(STREAM_TIMEOUT_SECS) {
        Ok(client) => client,
        Err(result) => return result,
    };
    let contents: Vec<serde_json::Value> = request
        .messages
        .iter()
        .filter(|message| message.role != "system")
        .map(|message| {
            serde_json::json!({
                "role": if message.role == "assistant" { "model" } else { "user" },
                "parts": [{ "text": message.content }]
            })
        })
        .collect();
    if contents.is_empty() {
        return operation_result(
            false,
            ReadinessState::ConnectionCheckFailed,
            "request_invalid",
            "Chat request did not include user-visible content.",
        );
    }
    let model_path = if request.model_id.starts_with("models/") {
        request.model_id.clone()
    } else {
        format!("models/{}", request.model_id)
    };
    let body = serde_json::json!({
        "contents": contents,
        "generationConfig": { "temperature": request.tuning.temperature }
    });
    let response = client
        .post(format!(
            "{GEMINI_BASE}/{model_path}:streamGenerateContent?alt=sse"
        ))
        .header("x-goog-api-key", credential)
        .json(&body)
        .send()
        .await;
    let mut response = match response {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => {
            return provider_error_result(
                ReadinessState::ConnectionCheckFailed,
                "provider_error",
                response,
            )
            .await
        }
        Err(_) => {
            return operation_result(
                false,
                ReadinessState::EndpointUnavailable,
                "endpoint_unavailable",
                "Provider endpoint was unavailable.",
            )
        }
    };
    let mut buf = String::new();
    while let Some(chunk) = match response.chunk().await {
        Ok(chunk) => chunk,
        Err(_) => {
            return operation_result(
                false,
                ReadinessState::ConnectionCheckFailed,
                "stream_failed",
                "Provider stream failed.",
            )
        }
    } {
        if !stream_active(state, operation_id) {
            return operation_result(
                false,
                ReadinessState::Unknown,
                "cancelled",
                "Stream cancelled.",
            );
        }
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(idx) = buf.find('\n') {
            let line = buf[..idx].trim().to_string();
            buf = buf[idx + 1..].to_string();
            let payload = line.strip_prefix("data:").unwrap_or(&line).trim();
            if payload.is_empty() || payload == "[DONE]" {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) {
                if let Some(parts) = json
                    .get("candidates")
                    .and_then(|candidates| candidates.get(0))
                    .and_then(|candidate| candidate.get("content"))
                    .and_then(|content| content.get("parts"))
                    .and_then(|parts| parts.as_array())
                {
                    for part in parts {
                        if let Some(token) = part.get("text").and_then(|text| text.as_str()) {
                            if !token.is_empty() && on_event.send(token.to_string()).is_err() {
                                return operation_result(
                                    false,
                                    ReadinessState::ConnectionCheckFailed,
                                    "stream_failed",
                                    "Unable to deliver provider stream token.",
                                );
                            }
                        }
                    }
                }
            }
        }
    }
    operation_result(
        true,
        ReadinessState::Ready,
        "ready",
        "Chat stream completed.",
    )
}

fn stream_active(state: &ProviderRuntimeState, operation_id: &str) -> bool {
    state
        .lock()
        .map(|runtime| runtime.stream_is_active(operation_id))
        .unwrap_or(false)
}

fn provider_config_dir(app: &AppHandle) -> Result<PathBuf, ProviderErrorDto> {
    app.path().app_config_dir().map_err(|_| {
        ProviderErrorDto::new(
            "provider_store_unavailable",
            "Provider store is unavailable.",
            "Unable to resolve the Tauri app configuration directory.",
        )
    })
}

fn write_store_to_dir(
    config_dir: &Path,
    runtime: &ProviderRuntime,
) -> Result<bool, ProviderErrorDto> {
    std::fs::create_dir_all(config_dir).map_err(|_| {
        ProviderErrorDto::new(
            "provider_store_write_failed",
            "Provider store could not be written.",
            "Unable to create provider configuration directory.",
        )
    })?;
    let target = config_dir.join(PROVIDER_STORE_FILE);
    let temp = config_dir.join(format!("{PROVIDER_STORE_FILE}.tmp"));
    let data =
        serde_json::to_vec_pretty(&ProviderStoreFile::from_runtime(runtime)).map_err(|_| {
            ProviderErrorDto::new(
                "provider_store_serialize_failed",
                "Provider store could not be written.",
                "Unable to serialize provider configuration.",
            )
        })?;
    std::fs::write(&temp, data).map_err(|_| {
        ProviderErrorDto::new(
            "provider_store_write_failed",
            "Provider store could not be written.",
            "Unable to write temporary provider configuration.",
        )
    })?;
    let backup_created = if target.exists() {
        let backup = config_dir.join(format!(
            "provider-runtime.v{}.{}.bak",
            PROVIDER_STORE_VERSION,
            now_millis()
        ));
        std::fs::rename(&target, &backup).map_err(|_| {
            ProviderErrorDto::new(
                "provider_store_backup_failed",
                "Provider store backup could not be created.",
                "Unable to move existing provider configuration to backup.",
            )
        })?;
        true
    } else {
        false
    };
    std::fs::rename(&temp, &target).map_err(|_| {
        ProviderErrorDto::new(
            "provider_store_commit_failed",
            "Provider store could not be committed.",
            "Unable to atomically move temporary provider configuration into place.",
        )
    })?;
    Ok(backup_created)
}

fn read_store_from_dir(config_dir: &Path) -> Result<Option<ProviderStoreFile>, ProviderErrorDto> {
    let target = config_dir.join(PROVIDER_STORE_FILE);
    if !target.exists() {
        return Ok(None);
    }
    let data = std::fs::read(&target).map_err(|_| {
        ProviderErrorDto::new(
            "provider_store_read_failed",
            "Provider store could not be read.",
            "Unable to read provider configuration.",
        )
    })?;
    let store = serde_json::from_slice::<ProviderStoreFile>(&data).map_err(|_| {
        ProviderErrorDto::new(
            "provider_store_corrupt",
            "Provider store is corrupt.",
            "Provider configuration could not be parsed; safe defaults are required.",
        )
    })?;
    if store.version != PROVIDER_STORE_VERSION {
        return Err(ProviderErrorDto::new(
            "provider_store_version_unsupported",
            "Provider store version is unsupported.",
            "Provider configuration version does not match this runtime.",
        ));
    }
    Ok(Some(store))
}

fn load_store_or_defaults(
    config_dir: &Path,
    runtime: &mut ProviderRuntime,
) -> Result<Option<String>, ProviderErrorDto> {
    match read_store_from_dir(config_dir) {
        Ok(Some(store)) => {
            runtime.load_store_file(store);
            Ok(None)
        }
        Ok(None) => Ok(None),
        Err(err)
            if err.code == "provider_store_corrupt"
                || err.code == "provider_store_version_unsupported" =>
        {
            *runtime = ProviderRuntime::new();
            Ok(Some(
                "Provider store could not be loaded; safe defaults were restored.".to_string(),
            ))
        }
        Err(err) => Err(err),
    }
}

fn normalize_legacy_provider_id(legacy: &LegacyProviderConnection) -> Option<ProviderId> {
    for value in [legacy.id.as_deref(), legacy.provider_kind.as_deref()]
        .into_iter()
        .flatten()
    {
        let normalized = value.trim().to_ascii_lowercase();
        if is_sidecar_alias(&normalized) {
            return None;
        }
        match normalized.as_str() {
            "ollama" => return Some(ProviderId::Ollama),
            "lmstudio" | "lm-studio" => return Some(ProviderId::LmStudio),
            "custom-openai" | "openai-compatible" | "custom" => {
                return Some(ProviderId::CustomOpenAi)
            }
            "gemini" => return Some(ProviderId::Gemini),
            _ => {}
        }
    }
    None
}

fn is_legacy_sidecar(legacy: &LegacyProviderConnection) -> bool {
    [legacy.id.as_deref(), legacy.provider_kind.as_deref()]
        .into_iter()
        .flatten()
        .any(is_sidecar_alias)
}

fn is_sidecar_alias(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "sidecar" | "agent-sidecar" | "experimental-sidecar" | "adk" | "gemini-adk"
    )
}

fn migrate_default_local_connection(
    runtime: &mut ProviderRuntime,
    provider_id: ProviderId,
    legacy: LegacyProviderConnection,
    counters: &mut MigrationCounters,
) {
    let connection_id = match provider_id {
        ProviderId::Ollama => ConnectionId::new("ollama:local-default"),
        ProviderId::LmStudio => ConnectionId::new("lmstudio:local-default"),
        ProviderId::CustomOpenAi | ProviderId::Gemini => return,
    };
    let stale_count = non_empty_model_count(&legacy);
    let Some(record) = runtime.records.get_mut(&connection_id) else {
        return;
    };
    if let Some(label) = legacy.label.as_deref() {
        record.label = safe_label(label, provider_id.display_name());
    }
    if let Some(count) = stale_count {
        record.stale_inventory_count = Some(count);
    }
    match legacy.base_url.as_deref() {
        Some(base_url) => match validate_endpoint(provider_id, base_url) {
            Ok(endpoint) if endpoint.locality == LocalityClassification::LocalLoopback => {
                record.endpoint = Some(endpoint);
                record.approval_state = ConnectionApprovalState::Approved;
                record.disabled_reason = None;
                counters.migrated_connections += 1;
            }
            Ok(_) | Err(_) => {
                disable_migrated_record(
                    record,
                    "Legacy endpoint was invalid or unsafe and was disabled.",
                );
                counters.disabled_connections += 1;
            }
        },
        None => {
            counters.migrated_connections += 1;
        }
    }
}

fn migrate_gemini_connection(
    runtime: &mut ProviderRuntime,
    legacy: LegacyProviderConnection,
    counters: &mut MigrationCounters,
) {
    let connection_id = ConnectionId::new("gemini:fixed");
    let Some(record) = runtime.records.get_mut(&connection_id) else {
        return;
    };
    if let Some(count) = non_empty_model_count(&legacy) {
        record.stale_inventory_count = Some(count);
    }
    let api_key_env = legacy.api_key_env.as_deref().unwrap_or("").trim();
    if !api_key_env.is_empty() && api_key_env != "GEMINI_API_KEY" {
        disable_migrated_record(
            record,
            "Legacy credential mapping was arbitrary and requires explicit re-entry.",
        );
        counters.disabled_connections += 1;
    } else {
        counters.migrated_connections += 1;
    }
}

fn migrate_custom_connection(
    runtime: &mut ProviderRuntime,
    legacy: LegacyProviderConnection,
    counters: &mut MigrationCounters,
) {
    let label = legacy
        .label
        .as_deref()
        .unwrap_or(ProviderId::CustomOpenAi.display_name());
    let stale_count = non_empty_model_count(&legacy);
    let api_key_env = legacy.api_key_env.as_deref().unwrap_or("").trim();
    let arbitrary_secret_mapping = !api_key_env.is_empty();
    let (endpoint, mut approval_state, mut disabled_reason, credential_requirement) =
        match legacy.base_url.as_deref() {
            Some(base_url) => match validate_endpoint(ProviderId::CustomOpenAi, base_url) {
                Ok(endpoint) => {
                    let credential_requirement =
                        if endpoint.transport_class == TransportClass::RemoteHttps {
                            CredentialRequirement::Required
                        } else {
                            CredentialRequirement::None
                        };
                    let approval_state = if endpoint.transport_class == TransportClass::LoopbackHttp
                    {
                        ConnectionApprovalState::Approved
                    } else {
                        ConnectionApprovalState::PendingApproval
                    };
                    (Some(endpoint), approval_state, None, credential_requirement)
                }
                Err(_) => (
                    None,
                    ConnectionApprovalState::Disabled,
                    Some("Legacy endpoint was invalid or unsafe and was disabled.".to_string()),
                    CredentialRequirement::None,
                ),
            },
            None => (
                None,
                ConnectionApprovalState::Disabled,
                Some("Legacy endpoint was missing and was disabled.".to_string()),
                CredentialRequirement::None,
            ),
        };
    if arbitrary_secret_mapping {
        approval_state = ConnectionApprovalState::Disabled;
        disabled_reason = Some(
            "Legacy credential mapping was arbitrary and requires explicit re-entry.".to_string(),
        );
    }
    let connection_id = runtime.next_connection_id();
    let now = now_millis();
    let record = ConnectionRecord {
        provider_id: ProviderId::CustomOpenAi,
        connection_id: connection_id.clone(),
        label: safe_label(label, ProviderId::CustomOpenAi.display_name()),
        endpoint,
        approval_state,
        credential_requirement,
        credential_binding: Some(CredentialBindingRef::CustomOpenAi(connection_id.clone())),
        credential_configured: false,
        disabled_reason,
        stale_inventory_count: stale_count,
        created_at: now,
        updated_at: now,
    };
    if record.approval_state == ConnectionApprovalState::Disabled {
        counters.disabled_connections += 1;
    } else {
        counters.migrated_connections += 1;
    }
    runtime
        .session
        .insert(connection_id.clone(), SessionConnectionState::default());
    runtime.records.insert(connection_id, record);
}

fn disable_migrated_record(record: &mut ConnectionRecord, detail: &str) {
    record.approval_state = ConnectionApprovalState::Disabled;
    record.disabled_reason = Some(detail.to_string());
    record.updated_at = now_millis();
}

fn non_empty_model_count(legacy: &LegacyProviderConnection) -> Option<usize> {
    let count = legacy
        .models
        .iter()
        .filter(|model| !model.id.trim().is_empty())
        .count();
    (count > 0).then_some(count)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn ineligible(state: ReadinessState, category: &str, detail: &str) -> ChatEligibility {
    ChatEligibility {
        eligible: false,
        state,
        category: category.to_string(),
        detail: sanitize_detail(detail),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_registry_rejects_sidecar_as_normal_provider() {
        assert!(ProviderId::from_str("sidecar").is_err());
        assert!(ProviderId::from_str("agent-sidecar").is_err());
    }

    #[test]
    fn default_records_are_rust_owned_and_approved() {
        let runtime = ProviderRuntime::new();
        let snapshot = runtime.snapshot();
        assert_eq!(snapshot.providers.len(), 4);
        assert!(snapshot
            .connections
            .iter()
            .any(|connection| connection.provider_id == ProviderId::Ollama
                && connection.connection_id == "ollama:local-default"
                && connection.approval_state == ConnectionApprovalState::Approved));
        assert!(snapshot
            .connections
            .iter()
            .any(|connection| connection.provider_id == ProviderId::LmStudio
                && connection.connection_id == "lmstudio:local-default"
                && connection.approval_state == ConnectionApprovalState::Approved));
        assert!(!snapshot
            .connections
            .iter()
            .any(|connection| connection.provider_id == ProviderId::CustomOpenAi));
    }

    #[test]
    fn local_endpoints_normalize_to_approved_loopback_forms() {
        let endpoint = validate_endpoint(ProviderId::LmStudio, "http://localhost:1234")
            .expect("localhost should normalize");
        assert_eq!(endpoint.normalized_origin, "http://127.0.0.1:1234");
        assert_eq!(endpoint.transport_class, TransportClass::LoopbackHttp);
        assert_eq!(endpoint.locality, LocalityClassification::LocalLoopback);

        let ipv6 = validate_endpoint(ProviderId::Ollama, "http://[::1]:11434")
            .expect("IPv6 loopback should validate");
        assert_eq!(ipv6.normalized_origin, "http://[::1]:11434");
    }

    #[test]
    fn remote_endpoints_cannot_be_classified_as_local() {
        let err = validate_endpoint(ProviderId::Ollama, "https://example.com")
            .expect_err("remote Ollama endpoint should be rejected");
        assert_eq!(err.code, "remote_endpoint_not_allowed");
    }

    #[test]
    fn custom_remote_requires_https_dns_hostname_and_allowed_path() {
        let endpoint = validate_endpoint(ProviderId::CustomOpenAi, "https://api.example.com/v1")
            .expect("remote custom endpoint should validate");
        assert_eq!(endpoint.normalized_origin, "https://api.example.com/v1");
        assert_eq!(endpoint.transport_class, TransportClass::RemoteHttps);
        assert_eq!(endpoint.locality, LocalityClassification::RemotePublic);

        let http = validate_endpoint(ProviderId::CustomOpenAi, "http://api.example.com")
            .expect_err("remote custom endpoint must use HTTPS");
        assert_eq!(http.code, "remote_endpoint_requires_https");

        let ip = validate_endpoint(ProviderId::CustomOpenAi, "https://203.0.113.10")
            .expect_err("literal IP remotes should be rejected");
        assert_eq!(ip.code, "remote_ip_literal_rejected");

        let path = validate_endpoint(ProviderId::CustomOpenAi, "https://api.example.com/other")
            .expect_err("arbitrary paths should be rejected");
        assert_eq!(path.code, "invalid_endpoint_path");
    }

    #[test]
    fn endpoint_validation_rejects_credentials_query_and_fragments() {
        for endpoint in [
            "http://user:pass@127.0.0.1:11434",
            "http://127.0.0.1:11434?x=1",
            "http://127.0.0.1:11434/#frag",
        ] {
            assert!(
                validate_endpoint(ProviderId::Ollama, endpoint).is_err(),
                "{endpoint} should be rejected"
            );
        }
    }

    #[test]
    fn runtime_request_rejects_legacy_execution_authority_fields() {
        let payload = serde_json::json!({
            "providerId": "ollama",
            "connectionId": "ollama:local-default",
            "modelId": "llama3.1",
            "messages": [],
            "tuning": { "temperature": 0.7, "numCtx": 8192 },
            "operationIntent": "chat",
            "baseUrl": "http://evil.example",
            "keyName": "GEMINI_API_KEY"
        });
        let parsed = serde_json::from_value::<ProviderStreamChatRequest>(payload);
        assert!(parsed.is_err());
    }

    #[test]
    fn stale_or_unknown_session_never_authorizes_chat() {
        let runtime = ProviderRuntime::new();
        let request = ProviderStreamChatRequest {
            provider_id: ProviderId::Ollama,
            connection_id: "ollama:local-default".to_string(),
            model_id: "llama3.1".to_string(),
            messages: Vec::new(),
            tuning: ProviderTuningValues {
                temperature: 0.7,
                num_ctx: 8192,
            },
            operation_intent: "chat".to_string(),
            operation_id: None,
        };
        let eligibility = runtime
            .chat_eligibility(&request)
            .expect("eligibility result");
        assert!(!eligibility.eligible);
        assert_eq!(eligibility.category, "current_session_check_required");
    }

    #[test]
    fn safe_dtos_do_not_expose_endpoints_or_credential_bindings() {
        let runtime = ProviderRuntime::new();
        let serialized = serde_json::to_string(&runtime.snapshot()).expect("serialize snapshot");
        for forbidden in [
            "127.0.0.1",
            "localhost",
            "generativelanguage",
            "CredentialBindingRef",
            "GEMINI_API_KEY",
            "Authorization",
            "Bearer",
        ] {
            assert!(
                !serialized.contains(forbidden),
                "snapshot should not expose {forbidden}"
            );
        }
    }

    #[test]
    fn credential_store_request_rejects_frontend_secret_names() {
        let payload = serde_json::json!({
            "providerId": "gemini",
            "connectionId": "gemini:fixed",
            "value": "test-secret",
            "keyName": "GEMINI_API_KEY"
        });
        let parsed = serde_json::from_value::<ProviderCredentialStoreRequest>(payload);
        assert!(parsed.is_err());
    }

    #[test]
    fn credential_bindings_are_fixed_inside_rust() {
        let mut runtime = ProviderRuntime::new();
        let gemini_binding = runtime
            .credential_binding(ProviderId::Gemini, &ConnectionId::new("gemini:fixed"))
            .expect("Gemini should have fixed binding");
        assert_eq!(gemini_binding.account_name(), "PROVIDER_GEMINI_API_KEY");

        let custom = runtime
            .create_connection(ProviderCreateConnectionRequest {
                provider_id: ProviderId::CustomOpenAi,
                label: "Remote".to_string(),
                endpoint: "https://api.example.com/v1".to_string(),
            })
            .expect("custom connection should be created");
        let binding = runtime
            .credential_binding(
                ProviderId::CustomOpenAi,
                &ConnectionId::new(custom.connection_id.clone()),
            )
            .expect("custom connection should have binding");
        assert_eq!(
            binding.account_name(),
            format!("PROVIDER_CUSTOM_OPENAI_{}", custom.connection_id)
        );
    }

    #[test]
    fn provider_without_binding_cannot_store_credentials() {
        let runtime = ProviderRuntime::new();
        let err = runtime
            .credential_binding(
                ProviderId::Ollama,
                &ConnectionId::new("ollama:local-default"),
            )
            .expect_err("Ollama should not expose credential binding");
        assert_eq!(err.code, "credential_not_supported");
    }

    #[test]
    fn valid_local_migration_preserves_stale_inventory_without_chat_authority() {
        let mut runtime = ProviderRuntime::new();
        let counters = runtime
            .apply_migration(ProviderMigrationRequest {
                provider_connections: vec![
                    LegacyProviderConnection {
                        id: Some("ollama".to_string()),
                        label: Some("Local Ollama".to_string()),
                        provider_kind: Some("ollama".to_string()),
                        base_url: Some("http://localhost:11434".to_string()),
                        api_key_env: None,
                        models: vec![LegacyModelInventoryEntry {
                            id: "llama3.1".to_string(),
                        }],
                    },
                    LegacyProviderConnection {
                        id: Some("custom-openai".to_string()),
                        label: Some("Local compatible".to_string()),
                        provider_kind: Some("openai-compatible".to_string()),
                        base_url: Some("http://127.0.0.1:8000/v1".to_string()),
                        api_key_env: None,
                        models: vec![LegacyModelInventoryEntry {
                            id: "local-model".to_string(),
                        }],
                    },
                ],
                active_provider_id: None,
                active_model_id: None,
            })
            .expect("migration should apply");
        assert_eq!(counters.migrated_connections, 2);

        let snapshot = runtime.snapshot();
        let ollama = snapshot
            .connections
            .iter()
            .find(|connection| connection.connection_id == "ollama:local-default")
            .expect("Ollama connection");
        assert_eq!(ollama.readiness, ReadinessState::Stale);
        assert_eq!(ollama.inventory.state, InventoryKind::Stale);
        assert_eq!(ollama.inventory.count, 1);

        let request = ProviderStreamChatRequest {
            provider_id: ProviderId::Ollama,
            connection_id: "ollama:local-default".to_string(),
            model_id: "llama3.1".to_string(),
            messages: Vec::new(),
            tuning: ProviderTuningValues {
                temperature: 0.7,
                num_ctx: 8192,
            },
            operation_intent: "chat".to_string(),
            operation_id: None,
        };
        let eligibility = runtime.chat_eligibility(&request).expect("eligibility");
        assert!(!eligibility.eligible);
        assert_eq!(eligibility.category, "current_session_check_required");
    }

    #[test]
    fn remote_custom_migrates_pending_approval_not_chat_eligible() {
        let mut runtime = ProviderRuntime::new();
        runtime
            .apply_migration(ProviderMigrationRequest {
                provider_connections: vec![LegacyProviderConnection {
                    id: Some("custom-openai".to_string()),
                    label: Some("Remote".to_string()),
                    provider_kind: Some("openai-compatible".to_string()),
                    base_url: Some("https://api.example.com/v1".to_string()),
                    api_key_env: None,
                    models: vec![LegacyModelInventoryEntry {
                        id: "gpt-compatible".to_string(),
                    }],
                }],
                active_provider_id: None,
                active_model_id: None,
            })
            .expect("migration should apply");
        let custom = runtime
            .snapshot()
            .connections
            .into_iter()
            .find(|connection| connection.provider_id == ProviderId::CustomOpenAi)
            .expect("custom connection");
        assert_eq!(
            custom.approval_state,
            ConnectionApprovalState::PendingApproval
        );
        assert_eq!(custom.locality, Some(LocalityClassification::RemotePublic));
        assert_eq!(custom.readiness, ReadinessState::Stale);

        let request = ProviderStreamChatRequest {
            provider_id: ProviderId::CustomOpenAi,
            connection_id: custom.connection_id,
            model_id: "gpt-compatible".to_string(),
            messages: Vec::new(),
            tuning: ProviderTuningValues {
                temperature: 0.7,
                num_ctx: 8192,
            },
            operation_intent: "chat".to_string(),
            operation_id: None,
        };
        let eligibility = runtime.chat_eligibility(&request).expect("eligibility");
        assert!(!eligibility.eligible);
        assert_eq!(eligibility.category, "connection_not_approved");
    }

    #[test]
    fn invalid_endpoint_and_arbitrary_api_key_env_migrate_disabled() {
        let mut runtime = ProviderRuntime::new();
        let counters = runtime
            .apply_migration(ProviderMigrationRequest {
                provider_connections: vec![
                    LegacyProviderConnection {
                        id: Some("custom-openai".to_string()),
                        label: Some("Bad endpoint".to_string()),
                        provider_kind: Some("openai-compatible".to_string()),
                        base_url: Some("https://203.0.113.10".to_string()),
                        api_key_env: None,
                        models: Vec::new(),
                    },
                    LegacyProviderConnection {
                        id: Some("custom-openai".to_string()),
                        label: Some("Legacy key env".to_string()),
                        provider_kind: Some("openai-compatible".to_string()),
                        base_url: Some("https://api.example.com/v1".to_string()),
                        api_key_env: Some("OPENAI_API_KEY".to_string()),
                        models: Vec::new(),
                    },
                ],
                active_provider_id: None,
                active_model_id: None,
            })
            .expect("migration should apply");
        assert_eq!(counters.disabled_connections, 2);
        let disabled = runtime
            .snapshot()
            .connections
            .iter()
            .filter(|connection| {
                connection.provider_id == ProviderId::CustomOpenAi
                    && connection.approval_state == ConnectionApprovalState::Disabled
            })
            .count();
        assert_eq!(disabled, 2);
    }

    #[test]
    fn sidecar_aliases_do_not_become_provider_connections() {
        let mut runtime = ProviderRuntime::new();
        let counters = runtime
            .apply_migration(ProviderMigrationRequest {
                provider_connections: vec![LegacyProviderConnection {
                    id: Some("agent-sidecar".to_string()),
                    label: Some("Sidecar".to_string()),
                    provider_kind: Some("sidecar".to_string()),
                    base_url: Some("http://127.0.0.1:8787".to_string()),
                    api_key_env: None,
                    models: vec![LegacyModelInventoryEntry {
                        id: "sidecar-model".to_string(),
                    }],
                }],
                active_provider_id: Some("sidecar".to_string()),
                active_model_id: Some("sidecar-model".to_string()),
            })
            .expect("migration should apply");
        assert_eq!(counters.skipped_sidecar_entries, 2);
        assert!(!runtime
            .snapshot()
            .connections
            .iter()
            .any(|connection| connection.connection_id.contains("sidecar")));
    }

    #[test]
    fn migration_is_idempotent_for_same_input() {
        let request = ProviderMigrationRequest {
            provider_connections: vec![LegacyProviderConnection {
                id: Some("ollama".to_string()),
                label: Some("Ollama".to_string()),
                provider_kind: Some("ollama".to_string()),
                base_url: Some("http://127.0.0.1:11434".to_string()),
                api_key_env: None,
                models: Vec::new(),
            }],
            active_provider_id: None,
            active_model_id: None,
        };
        let mut first = ProviderRuntime::new();
        let mut second = ProviderRuntime::new();
        first
            .apply_migration(request.clone())
            .expect("first migration should apply");
        second
            .apply_migration(request)
            .expect("second migration should apply");
        assert_eq!(
            serde_json::to_string(&first.snapshot()).expect("first snapshot"),
            serde_json::to_string(&second.snapshot()).expect("second snapshot")
        );
    }

    #[test]
    fn provider_store_writes_backup_and_no_secret_material() {
        let dir = temp_provider_dir("store-backup");
        let runtime = ProviderRuntime::new();
        let first_backup = write_store_to_dir(&dir, &runtime).expect("first write");
        assert!(!first_backup);
        let second_backup = write_store_to_dir(&dir, &runtime).expect("second write");
        assert!(second_backup);
        let store = read_store_from_dir(&dir)
            .expect("store read")
            .expect("store should exist");
        let serialized = serde_json::to_string(&store).expect("serialize store");
        for forbidden in [
            "sk-",
            "Bearer",
            "Authorization",
            "GEMINI_API_KEY",
            "OPENAI_API_KEY",
            "apiKeyEnv",
        ] {
            assert!(
                !serialized.contains(forbidden),
                "store should not contain {forbidden}"
            );
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_store_recovers_to_safe_defaults() {
        let dir = temp_provider_dir("corrupt-store");
        std::fs::create_dir_all(&dir).expect("create temp provider dir");
        std::fs::write(dir.join(PROVIDER_STORE_FILE), b"{not-json").expect("write corrupt store");
        let mut runtime = ProviderRuntime::new();
        runtime.records.clear();
        let recovery = load_store_or_defaults(&dir, &mut runtime).expect("safe recovery");
        assert!(recovery.is_some());
        assert!(runtime
            .snapshot()
            .connections
            .iter()
            .any(|connection| connection.connection_id == "ollama:local-default"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn adapter_model_parsers_do_not_generate_text() {
        let ollama = serde_json::json!({
            "models": [{ "name": "llama3.1" }, { "name": "nomic" }]
        });
        assert_eq!(parse_ollama_models(&ollama), vec!["llama3.1", "nomic"]);

        let openai = serde_json::json!({
            "data": [{ "id": "local-model" }, { "id": "remote-model" }]
        });
        assert_eq!(
            parse_openai_models(&openai),
            vec!["local-model", "remote-model"]
        );

        let gemini = serde_json::json!({
            "models": [{ "name": "models/gemini-2.5" }]
        });
        assert_eq!(parse_gemini_models(&gemini), vec!["gemini-2.5"]);
    }

    #[test]
    fn adapter_routes_are_derived_from_rust_records_only() {
        let mut runtime = ProviderRuntime::new();
        let custom = runtime
            .create_connection(ProviderCreateConnectionRequest {
                provider_id: ProviderId::CustomOpenAi,
                label: "Local".to_string(),
                endpoint: "http://127.0.0.1:8000".to_string(),
            })
            .expect("custom connection");
        let record = runtime
            .connection_record(
                ProviderId::CustomOpenAi,
                &ConnectionId::new(custom.connection_id),
            )
            .expect("custom record")
            .clone();
        let resolved = ResolvedConnection { record };
        assert_eq!(
            openai_route(&resolved, "/models").expect("route"),
            "http://127.0.0.1:8000/v1/models"
        );
    }

    #[test]
    fn remote_resolution_rejects_non_public_addresses() {
        assert!(!is_public_resolved_ip(
            "127.0.0.1".parse().expect("loopback")
        ));
        assert!(!is_public_resolved_ip("10.1.2.3".parse().expect("private")));
        assert!(!is_public_resolved_ip("100.64.1.1".parse().expect("cgnat")));
        assert!(!is_public_resolved_ip("203.0.113.10".parse().expect("doc")));
        assert!(is_public_resolved_ip("8.8.8.8".parse().expect("public")));
    }

    #[test]
    fn policy_denial_happens_before_credential_requirement() {
        let mut runtime = ProviderRuntime::new();
        let custom = runtime
            .create_connection(ProviderCreateConnectionRequest {
                provider_id: ProviderId::CustomOpenAi,
                label: "Remote".to_string(),
                endpoint: "https://api.example.com/v1".to_string(),
            })
            .expect("custom connection");
        runtime
            .approve_connection(ProviderConnectionSelector {
                provider_id: ProviderId::CustomOpenAi,
                connection_id: custom.connection_id.clone(),
            })
            .expect("approve");
        let connection = ResolvedConnection {
            record: runtime
                .connection_record(
                    ProviderId::CustomOpenAi,
                    &ConnectionId::new(custom.connection_id),
                )
                .expect("record")
                .clone(),
        };
        let gates = GateState::with_policy_ceiling(crate::policy::GatePolicyCeiling::new(
            true, false, true,
        ));
        let err = enforce_provider_policy("provider_refresh_models", &connection, &gates)
            .expect_err("network gate should deny before credential reads");
        assert_eq!(err.code, "network_denied");
    }

    fn temp_provider_dir(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("codename-r1-{label}-{}", now_millis()))
    }
}
