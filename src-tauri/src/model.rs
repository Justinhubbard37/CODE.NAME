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
    pub temperature: f64,
    pub num_ctx: u32,
    pub messages: Vec<ChatMsg>,
    pub cloud: bool,
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
    let detail: String = body.chars().take(200).collect();
    let missing = status == 404 || detail.to_lowercase().contains("not found");
    if missing {
        format!("model \"{model}\" not found at this endpoint (HTTP {status})")
    } else if detail.trim().is_empty() {
        format!("HTTP {status}")
    } else {
        format!("HTTP {status}: {}", detail.trim())
    }
}

/// List the models available at an endpoint (cloud-safe; runs from the shell).
#[tauri::command]
pub async fn model_list(
    kind: String,
    base_url: String,
    key_name: Option<String>,
) -> Result<Vec<String>, String> {
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
    if req.cloud && !gates.network_open() {
        return Err("network gate closed".to_string());
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
