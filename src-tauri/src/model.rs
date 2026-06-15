//! Cloud/model HTTP proxy (Phase 2).
//!
//! The webview cannot call cloud APIs directly — browser CORS blocks cross-site
//! requests, so a fetch from the page to e.g. https://ollama.com never reaches
//! the server. These commands make the request from the Rust shell via reqwest
//! (not a browser, so no CORS), reading the API key from the OS keychain here so
//! it never enters the webview. Local endpoints keep using the webview path.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::State;

use crate::policy::{Gate, PolicyError};
use crate::sidecar::GateState;

const SERVICE: &str = "com.codename.harness";

#[derive(Deserialize, Serialize)]
pub struct ChatMsg {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelReq {
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub key_name: Option<String>,
    pub network_class: Option<String>,
    pub runs_local_only: Option<bool>,
    pub uses_cloud: Option<bool>,
    pub temperature: f64,
    pub num_ctx: u32,
    pub messages: Vec<ChatMsg>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProviderKind {
    Ollama,
    LmStudio,
    OpenAiCompatible,
    Gemini,
    Custom,
    Synthetic,
    A2a,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NetworkClass {
    LocalOnly,
    Cloud,
    CloudCapable,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SecretRequirement {
    None,
    Optional,
    Keychain,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ProviderTrust {
    provider_kind: ProviderKind,
    network_class: NetworkClass,
    runs_local_only: bool,
    requires_network: bool,
    cloud_capable: bool,
    secret_requirement: SecretRequirement,
}

/// Read the API key from the OS keychain by name. Raw key material never comes
/// from the webview.
fn read_key(key_name: &Option<String>) -> Option<String> {
    if let Some(name) = key_name {
        if let Ok(entry) = keyring::Entry::new(SERVICE, name) {
            if let Ok(pw) = entry.get_password() {
                if !pw.is_empty() {
                    return Some(pw);
                }
            }
        }
    }
    None
}

async fn http_error(resp: reqwest::Response, model: &str) -> String {
    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();
    let detail = body.to_lowercase();
    let missing = status == 404 || detail.contains("not found") || detail.contains("no such model");
    if missing {
        format!("model \"{model}\" not found at this endpoint (HTTP {status})")
    } else {
        format!("HTTP {status}")
    }
}

fn parse_provider_kind(kind: &str) -> ProviderKind {
    match kind.trim().to_ascii_lowercase().as_str() {
        "ollama" => ProviderKind::Ollama,
        "lmstudio" => ProviderKind::LmStudio,
        "openai" | "openai-compatible" => ProviderKind::OpenAiCompatible,
        "gemini" => ProviderKind::Gemini,
        "custom" => ProviderKind::Custom,
        "synthetic" => ProviderKind::Synthetic,
        "a2a" => ProviderKind::A2a,
        _ => ProviderKind::Unknown,
    }
}

fn parse_network_class(class: Option<&str>) -> Option<NetworkClass> {
    match class?.trim().to_ascii_lowercase().as_str() {
        "local-only" => Some(NetworkClass::LocalOnly),
        "cloud" => Some(NetworkClass::Cloud),
        "cloud-capable" => Some(NetworkClass::CloudCapable),
        "unknown" => Some(NetworkClass::Unknown),
        _ => Some(NetworkClass::Unknown),
    }
}

fn ollama_cloud_model(model: &str) -> bool {
    let model = model.to_ascii_lowercase();
    model.contains("-cloud") || model.contains(":cloud")
}

fn cloud_url_hint(kind: ProviderKind, base_url: &str) -> bool {
    let base = base_url.to_ascii_lowercase();
    matches!(kind, ProviderKind::Ollama) && base.contains("ollama.com")
}

fn classify_provider(
    kind: &str,
    base_url: &str,
    model: &str,
    network_class: Option<&str>,
    runs_local_only: Option<bool>,
    uses_cloud: Option<bool>,
    key_name: &Option<String>,
) -> ProviderTrust {
    let provider_kind = parse_provider_kind(kind);

    let class = match provider_kind {
        ProviderKind::Gemini => NetworkClass::Cloud,
        ProviderKind::Synthetic | ProviderKind::A2a => NetworkClass::LocalOnly,
        ProviderKind::Unknown => NetworkClass::Unknown,
        ProviderKind::Ollama
            if uses_cloud == Some(true)
                || ollama_cloud_model(model)
                || cloud_url_hint(provider_kind, base_url) =>
        {
            NetworkClass::CloudCapable
        }
        ProviderKind::Ollama | ProviderKind::LmStudio => {
            parse_network_class(network_class).unwrap_or(NetworkClass::LocalOnly)
        }
        ProviderKind::OpenAiCompatible | ProviderKind::Custom => {
            match parse_network_class(network_class) {
                Some(NetworkClass::LocalOnly) if runs_local_only != Some(false) => {
                    NetworkClass::LocalOnly
                }
                Some(NetworkClass::Cloud) => NetworkClass::Cloud,
                Some(NetworkClass::Unknown) => NetworkClass::Unknown,
                _ => NetworkClass::CloudCapable,
            }
        }
    };

    let runs_local_only = class == NetworkClass::LocalOnly;
    let secret_requirement = if runs_local_only {
        SecretRequirement::None
    } else if key_name
        .as_ref()
        .is_some_and(|name| !name.trim().is_empty())
        || provider_kind == ProviderKind::Gemini
    {
        SecretRequirement::Keychain
    } else {
        SecretRequirement::Optional
    };

    ProviderTrust {
        provider_kind,
        network_class: class,
        runs_local_only,
        requires_network: !runs_local_only,
        cloud_capable: !runs_local_only,
        secret_requirement,
    }
}

fn enforce_model_network_gate(
    command: &str,
    trust: ProviderTrust,
    network_open: bool,
) -> Result<(), String> {
    if trust.requires_network && !network_open {
        return Err(PolicyError::gate_closed(command, Gate::Network).to_string());
    }
    Ok(())
}

/// List the models available at an endpoint (cloud-safe; runs from the shell).
#[tauri::command]
pub async fn model_list(
    kind: String,
    base_url: String,
    key_name: Option<String>,
    model: Option<String>,
    network_class: Option<String>,
    runs_local_only: Option<bool>,
    uses_cloud: Option<bool>,
    gates: State<'_, GateState>,
) -> Result<Vec<String>, String> {
    let model = model.unwrap_or_default();
    let trust = classify_provider(
        &kind,
        &base_url,
        &model,
        network_class.as_deref(),
        runs_local_only,
        uses_cloud,
        &key_name,
    );
    enforce_model_network_gate("model_list", trust, gates.network_open())?;
    if trust.provider_kind == ProviderKind::Gemini {
        return Err("Gemini model listing is deferred to Rust provider implementation".to_string());
    }
    let base = base_url.trim_end_matches('/');
    let key = read_key(&key_name);
    let url = if kind == "ollama" {
        format!("{base}/api/tags")
    } else {
        format!("{base}/v1/models")
    };
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let mut rb = client.get(&url);
    if let Some(k) = &key {
        rb = rb.header("Authorization", format!("Bearer {k}"));
    }
    let resp = rb.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let names: Vec<String> = if kind == "ollama" {
        v.get("models")
            .and_then(|m| m.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    } else {
        v.get("data")
            .and_then(|d| d.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|m| m.get("id").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    };
    Ok(names)
}

/// Stream a chat reply from a model endpoint, pushing tokens to the webview over
/// a Channel. Returns the model the server reported it actually ran.
#[tauri::command]
pub async fn model_stream(
    req: ModelReq,
    on_event: Channel<String>,
    gates: State<'_, GateState>,
) -> Result<String, String> {
    let trust = classify_provider(
        &req.kind,
        &req.base_url,
        &req.model,
        req.network_class.as_deref(),
        req.runs_local_only,
        req.uses_cloud,
        &req.key_name,
    );
    enforce_model_network_gate("model_stream", trust, gates.network_open())?;
    if trust.provider_kind == ProviderKind::Gemini {
        return Err("Gemini cloud routing is deferred to Rust provider implementation".to_string());
    }
    let base = req.base_url.trim_end_matches('/');
    let key = read_key(&req.key_name);
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut served = String::new();

    if req.kind == "ollama" {
        let body = serde_json::json!({
            "model": req.model,
            "messages": req.messages,
            "stream": true,
            "options": { "temperature": req.temperature, "num_ctx": req.num_ctx }
        });
        let mut rb = client.post(format!("{base}/api/chat")).json(&body);
        if let Some(k) = &key {
            rb = rb.header("Authorization", format!("Bearer {k}"));
        }
        let mut resp = rb.send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(http_error(resp, &req.model).await);
        }
        let mut buf = String::new();
        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            buf.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(idx) = buf.find('\n') {
                let line = buf[..idx].trim().to_string();
                buf = buf[idx + 1..].to_string();
                if line.is_empty() {
                    continue;
                }
                if let Ok(j) = serde_json::from_str::<serde_json::Value>(&line) {
                    if served.is_empty() {
                        if let Some(m) = j.get("model").and_then(|m| m.as_str()) {
                            served = m.to_string();
                        }
                    }
                    if let Some(tok) = j
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_str())
                    {
                        if !tok.is_empty() {
                            on_event.send(tok.to_string()).map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
        }
    } else {
        let body = serde_json::json!({
            "model": req.model,
            "messages": req.messages,
            "stream": true,
            "temperature": req.temperature
        });
        let mut rb = client
            .post(format!("{base}/v1/chat/completions"))
            .json(&body);
        if let Some(k) = &key {
            rb = rb.header("Authorization", format!("Bearer {k}"));
        }
        let mut resp = rb.send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(http_error(resp, &req.model).await);
        }
        let mut buf = String::new();
        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            buf.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(idx) = buf.find('\n') {
                let line = buf[..idx].trim().to_string();
                buf = buf[idx + 1..].to_string();
                if !line.starts_with("data:") {
                    continue;
                }
                let payload = line[5..].trim().to_string();
                if payload == "[DONE]" {
                    continue;
                }
                if let Ok(j) = serde_json::from_str::<serde_json::Value>(&payload) {
                    if served.is_empty() {
                        if let Some(m) = j.get("model").and_then(|m| m.as_str()) {
                            served = m.to_string();
                        }
                    }
                    if let Some(tok) = j
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c| c.get("delta"))
                        .and_then(|d| d.get("content"))
                        .and_then(|c| c.as_str())
                    {
                        if !tok.is_empty() {
                            on_event.send(tok.to_string()).map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
        }
    }

    Ok(served)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trust(
        kind: &str,
        model: &str,
        network_class: Option<&str>,
        runs_local_only: Option<bool>,
        uses_cloud: Option<bool>,
        key_name: Option<String>,
    ) -> ProviderTrust {
        classify_provider(
            kind,
            "http://localhost:8000",
            model,
            network_class,
            runs_local_only,
            uses_cloud,
            &key_name,
        )
    }

    #[test]
    fn network_closed_blocks_model_list_for_cloud_provider() {
        let t = trust(
            "gemini",
            "gemini-2.0-flash",
            Some("local-only"),
            Some(true),
            None,
            None,
        );
        let err = enforce_model_network_gate("model_list", t, false).expect_err("cloud denied");
        assert!(err.contains("network gate is closed"));
        assert!(err.contains("model_list"));
    }

    #[test]
    fn network_closed_blocks_model_stream_for_cloud_provider() {
        let t = trust(
            "openai",
            "gpt-4.1",
            Some("cloud"),
            Some(false),
            None,
            Some("OPENAI_API_KEY".to_string()),
        );
        let err = enforce_model_network_gate("model_stream", t, false).expect_err("cloud denied");
        assert!(err.contains("network gate is closed"));
        assert!(err.contains("model_stream"));
    }

    #[test]
    fn network_closed_blocks_unknown_custom_cloud_capable_endpoint() {
        let t = trust("custom", "default", None, None, None, None);
        assert_eq!(t.network_class, NetworkClass::CloudCapable);
        assert!(t.requires_network);
        assert!(enforce_model_network_gate("model_list", t, false).is_err());

        let unknown = trust("not-real", "default", None, None, None, None);
        assert_eq!(unknown.network_class, NetworkClass::Unknown);
        assert!(unknown.requires_network);
        assert!(enforce_model_network_gate("model_stream", unknown, false).is_err());
    }

    #[test]
    fn network_closed_allows_local_only_provider_classification() {
        let t = trust("lmstudio", "local-model", None, None, None, None);
        assert_eq!(t.network_class, NetworkClass::LocalOnly);
        assert!(!t.requires_network);
        enforce_model_network_gate("model_list", t, false).expect("local-only allowed");
    }

    #[test]
    fn gemini_cannot_be_marked_local_only_by_frontend_input() {
        let t = trust(
            "gemini",
            "gemini-2.0-flash",
            Some("local-only"),
            Some(true),
            None,
            None,
        );
        assert_eq!(t.provider_kind, ProviderKind::Gemini);
        assert_eq!(t.network_class, NetworkClass::Cloud);
        assert!(t.requires_network);
    }

    #[test]
    fn synthetic_local_only_route_does_not_require_network_or_secret() {
        let t = trust(
            "synthetic",
            "offline",
            Some("cloud"),
            Some(false),
            Some(true),
            None,
        );
        assert_eq!(t.network_class, NetworkClass::LocalOnly);
        assert!(!t.requires_network);
        assert_eq!(t.secret_requirement, SecretRequirement::None);
        enforce_model_network_gate("model_stream", t, false).expect("synthetic allowed");
    }

    #[test]
    fn ollama_cloud_model_requires_network_even_on_localhost() {
        let t = trust(
            "ollama",
            "gpt-oss:120b-cloud",
            Some("local-only"),
            Some(true),
            None,
            None,
        );
        assert_eq!(t.network_class, NetworkClass::CloudCapable);
        assert!(t.requires_network);
    }

    #[test]
    fn model_gate_denial_does_not_echo_secret_or_endpoint_material() {
        let t = trust(
            "gemini",
            "gemini-2.0-flash",
            Some("cloud"),
            Some(false),
            None,
            Some("GEMINI_API_KEY".to_string()),
        );
        let err =
            enforce_model_network_gate("model_stream Bearer sk-test-api-key prompt", t, false)
                .expect_err("cloud denied");
        for forbidden in [
            "Bearer",
            "sk-test-api-key",
            "prompt",
            "GEMINI_API_KEY",
            "localhost",
            "gemini-2.0-flash",
        ] {
            assert!(
                !err.contains(forbidden),
                "denial should not contain sensitive material {forbidden}"
            );
        }
    }
}
