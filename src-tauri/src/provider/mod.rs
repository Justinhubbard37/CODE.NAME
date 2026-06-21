use std::collections::BTreeMap;
use std::net::IpAddr;
use std::str::FromStr;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionApprovalState {
    Approved,
    PendingApproval,
    Disabled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportClass {
    LoopbackHttp,
    RemoteHttps,
    FixedProviderApi,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
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
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderCancelStreamRequest {
    pub operation_id: String,
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
    next_connection: u64,
}

impl ProviderRuntime {
    fn new() -> Self {
        let mut runtime = Self {
            records: BTreeMap::new(),
            session: BTreeMap::new(),
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

    fn connection_dto(&self, record: &ConnectionRecord) -> ConnectionDto {
        let session = self
            .session
            .get(&record.connection_id)
            .cloned()
            .unwrap_or_default();
        let readiness = if record.approval_state == ConnectionApprovalState::Disabled {
            ReadinessState::ConfigurationDisabled
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
            credential_configured: false,
            readiness,
            checked_this_session: session.checked_this_session,
            last_explicit_check_at: session.last_explicit_check_at,
            check_in_progress: session.check_in_progress,
            refresh_in_progress: session.refresh_in_progress,
            inventory: session.inventory,
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

    fn check_connection(
        &mut self,
        request: ProviderModelOperationRequest,
    ) -> Result<ProviderOperationResult, ProviderErrorDto> {
        let connection_id = ConnectionId::new(request.connection_id);
        self.require_approved(request.provider_id, &connection_id)?;
        let state = self.session.entry(connection_id).or_default();
        if state.check_in_progress {
            return Err(ProviderErrorDto::new(
                "operation_in_progress",
                "Connection check is already running.",
                "Duplicate connection checks are blocked.",
            ));
        }
        state.readiness = ReadinessState::EndpointUnavailable;
        state.checked_this_session = false;
        state.last_explicit_check_at = Some(now_millis());
        state.failure_category = Some("adapter_unavailable".to_string());
        state.safe_detail =
            Some("Provider adapter transport is not active in this foundation commit.".to_string());
        Ok(ProviderOperationResult {
            ok: false,
            state: ReadinessState::EndpointUnavailable,
            category: "adapter_unavailable".to_string(),
            detail: "Provider adapter transport is not active in this foundation commit."
                .to_string(),
        })
    }

    fn refresh_models(
        &mut self,
        request: ProviderModelOperationRequest,
    ) -> Result<ProviderOperationResult, ProviderErrorDto> {
        let connection_id = ConnectionId::new(request.connection_id);
        self.require_approved(request.provider_id, &connection_id)?;
        let state = self.session.entry(connection_id).or_default();
        if state.refresh_in_progress {
            return Err(ProviderErrorDto::new(
                "operation_in_progress",
                "Model refresh is already running.",
                "Duplicate model refresh operations are blocked.",
            ));
        }
        state.inventory = ModelInventoryState {
            state: InventoryKind::Failed,
            count: 0,
            last_refresh_at: Some(now_millis()),
        };
        state.readiness = ReadinessState::RefreshFailed;
        state.failure_category = Some("adapter_unavailable".to_string());
        state.safe_detail =
            Some("Provider adapter transport is not active in this foundation commit.".to_string());
        Ok(ProviderOperationResult {
            ok: false,
            state: ReadinessState::RefreshFailed,
            category: "adapter_unavailable".to_string(),
            detail: "Provider adapter transport is not active in this foundation commit."
                .to_string(),
        })
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
pub fn provider_check_connection(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderModelOperationRequest,
) -> Result<ProviderOperationResult, ProviderErrorDto> {
    state.lock()?.check_connection(request)
}

#[tauri::command]
pub fn provider_refresh_models(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderModelOperationRequest,
) -> Result<ProviderOperationResult, ProviderErrorDto> {
    state.lock()?.refresh_models(request)
}

#[tauri::command]
pub fn provider_stream_chat(
    state: State<'_, ProviderRuntimeState>,
    request: ProviderStreamChatRequest,
) -> Result<ProviderOperationResult, ProviderErrorDto> {
    let runtime = state.lock()?;
    let eligibility = runtime.chat_eligibility(&request)?;
    Ok(ProviderOperationResult {
        ok: eligibility.eligible,
        state: eligibility.state,
        category: eligibility.category,
        detail: eligibility.detail,
    })
}

#[tauri::command]
pub fn provider_cancel_stream(
    _state: State<'_, ProviderRuntimeState>,
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
    Ok(ProviderOperationResult {
        ok: true,
        state: ReadinessState::Unknown,
        category: "cancelled".to_string(),
        detail: "No active provider stream matched the cancellation request.".to_string(),
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
}
