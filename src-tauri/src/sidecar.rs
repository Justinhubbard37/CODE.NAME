//! Python agent-sidecar supervisor (Phase 3, Slice 3.6 — auto-restart with backoff).
//!
//! Spawns the loopback A2A sidecar, reads its handshake (ephemeral port +
//! per-launch token) from stdout, holds it in managed state, and kills it on
//! app exit. On unexpected exit the supervisor waits with exponential backoff
//! (2 s, 4 s, 8 s, 16 s, 30 s cap) and respawns — no AppHandle needed at
//! retry time because the script path is resolved once at start().
//! The Rust shell owns the lifecycle (docs/contracts/sidecar.md).

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::policy::{apply_gate_policy, EffectiveGateState, GatePolicyCeiling, GateValues};

#[derive(Default, Clone, Serialize)]
pub struct SidecarInfo {
    pub status: String, // stopped | starting | ready | restarting | error
    pub host: String,
    pub port: u16,
    // The per-launch bearer token stays inside the Rust shell — it is NEVER
    // serialized out to the webview (Phase 1 security spine).
    #[serde(skip)]
    pub token: String,
}

#[derive(Deserialize)]
struct Handshake {
    host: String,
    port: u16,
    token: String,
}

/// Capability gate state owned by the Rust shell (Phase 1.3). The webview keeps
/// this in sync via `set_gates`; the sidecar commands read it to enforce the
/// gates at the process level, so closing a gate severs the bridge even if a
/// UI-layer check is bypassed.
pub struct GateState {
    pub filesystem: AtomicBool,
    pub network: AtomicBool,
    pub tools: AtomicBool,
    max_filesystem: AtomicBool,
    max_network: AtomicBool,
    max_tools: AtomicBool,
}

impl Default for GateState {
    fn default() -> Self {
        Self {
            filesystem: AtomicBool::new(true),
            network: AtomicBool::new(true),
            tools: AtomicBool::new(true),
            max_filesystem: AtomicBool::new(true),
            max_network: AtomicBool::new(true),
            max_tools: AtomicBool::new(true),
        }
    }
}

impl GateState {
    #[cfg(test)]
    pub fn with_policy_ceiling(ceiling: GatePolicyCeiling) -> Self {
        Self {
            filesystem: AtomicBool::new(ceiling.max_filesystem),
            network: AtomicBool::new(ceiling.max_network),
            tools: AtomicBool::new(ceiling.max_tools),
            max_filesystem: AtomicBool::new(ceiling.max_filesystem),
            max_network: AtomicBool::new(ceiling.max_network),
            max_tools: AtomicBool::new(ceiling.max_tools),
        }
    }

    pub fn tools_open(&self) -> bool {
        self.tools.load(Ordering::SeqCst)
    }
    pub fn network_open(&self) -> bool {
        self.network.load(Ordering::SeqCst)
    }
    #[allow(dead_code)]
    pub fn filesystem_open(&self) -> bool {
        self.filesystem.load(Ordering::SeqCst)
    }

    pub fn policy_ceiling(&self) -> GatePolicyCeiling {
        GatePolicyCeiling::new(
            self.max_filesystem.load(Ordering::SeqCst),
            self.max_network.load(Ordering::SeqCst),
            self.max_tools.load(Ordering::SeqCst),
        )
    }

    pub fn apply_requested(&self, requested: GateValues) -> EffectiveGateState {
        let effective = apply_gate_policy(requested, self.policy_ceiling());
        self.filesystem
            .store(effective.filesystem, Ordering::SeqCst);
        self.network.store(effective.network, Ordering::SeqCst);
        self.tools.store(effective.tools, Ordering::SeqCst);
        effective
    }
}

/// Webview → shell: push the current gate state. Called whenever the user
/// toggles a gate. Rust applies its policy ceiling and returns the effective
/// state so the webview cannot keep displaying a gate Rust refused to open.
#[tauri::command]
pub fn set_gates(
    filesystem: bool,
    network: bool,
    tools: bool,
    gates: State<GateState>,
) -> EffectiveGateState {
    gates.apply_requested(GateValues::new(filesystem, network, tools))
}

#[cfg(test)]
mod gate_tests {
    use super::*;

    #[test]
    fn fully_open_policy_applies_requested_state() {
        let gates = GateState::default();
        let effective = gates.apply_requested(GateValues::new(true, false, true));

        assert_eq!(effective.values(), GateValues::new(true, false, true));
        assert!(gates.filesystem_open());
        assert!(!gates.network_open());
        assert!(gates.tools_open());
        assert!(!effective.changed_by_policy);
    }

    #[test]
    fn closing_gates_is_allowed_even_with_closed_policy_ceiling() {
        let gates = GateState::with_policy_ceiling(GatePolicyCeiling::new(false, false, false));
        let effective = gates.apply_requested(GateValues::new(false, false, false));

        assert_eq!(effective.values(), GateValues::new(false, false, false));
        assert!(!gates.filesystem_open());
        assert!(!gates.network_open());
        assert!(!gates.tools_open());
        assert!(!effective.changed_by_policy);
    }

    #[test]
    fn network_policy_lock_blocks_direct_reopen_attempt() {
        let gates = GateState::with_policy_ceiling(GatePolicyCeiling::new(true, false, true));
        let effective = gates.apply_requested(GateValues::new(true, true, true));

        assert_eq!(effective.values(), GateValues::new(true, false, true));
        assert!(gates.filesystem_open());
        assert!(!gates.network_open());
        assert!(gates.tools_open());
        assert!(effective.changed_by_policy);
    }

    #[test]
    fn tools_policy_lock_blocks_direct_reopen_attempt() {
        let gates = GateState::with_policy_ceiling(GatePolicyCeiling::new(true, true, false));
        let effective = gates.apply_requested(GateValues::new(true, true, true));

        assert_eq!(effective.values(), GateValues::new(true, true, false));
        assert!(gates.filesystem_open());
        assert!(gates.network_open());
        assert!(!gates.tools_open());
        assert!(effective.changed_by_policy);
    }

    #[test]
    fn filesystem_policy_lock_blocks_direct_reopen_attempt() {
        let gates = GateState::with_policy_ceiling(GatePolicyCeiling::new(false, true, true));
        let effective = gates.apply_requested(GateValues::new(true, true, true));

        assert_eq!(effective.values(), GateValues::new(false, true, true));
        assert!(!gates.filesystem_open());
        assert!(gates.network_open());
        assert!(gates.tools_open());
        assert!(effective.changed_by_policy);
    }

    #[test]
    fn multiple_policy_locks_block_direct_reopen_attempts() {
        let gates = GateState::with_policy_ceiling(GatePolicyCeiling::new(false, false, true));
        let effective = gates.apply_requested(GateValues::new(true, true, true));

        assert_eq!(effective.values(), GateValues::new(false, false, true));
        assert!(!gates.filesystem_open());
        assert!(!gates.network_open());
        assert!(gates.tools_open());
        assert_eq!(effective.locked_gates.len(), 2);
    }
}

/// Maximum backoff cap in milliseconds.
const BACKOFF_CAP_MS: u64 = 30_000;
/// Base backoff in milliseconds (doubles each attempt up to the cap).
const BACKOFF_BASE_MS: u64 = 2_000;

#[derive(Clone)]
pub struct SidecarManager {
    info: Arc<Mutex<SidecarInfo>>,
    child: Arc<Mutex<Option<Child>>>,
    shutting_down: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    /// Consecutive restart attempts since the last successful start (reset to 0 on
    /// a successful handshake so the backoff ladder resets after each recovery).
    restart_count: Arc<AtomicU32>,
    /// Script path resolved once at start() time; used by the watch/retry thread
    /// so it never needs an AppHandle after the first launch.
    script: Arc<Mutex<Option<PathBuf>>>,
    /// Log directory passed to the Python sidecar as CODENAME_LOG_DIR (9.1).
    log_dir: Arc<Mutex<Option<std::path::PathBuf>>>,
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self {
            info: Arc::new(Mutex::new(SidecarInfo::default())),
            child: Arc::new(Mutex::new(None)),
            shutting_down: Arc::new(AtomicBool::new(false)),
            cancel: Arc::new(AtomicBool::new(false)),
            restart_count: Arc::new(AtomicU32::new(0)),
            script: Arc::new(Mutex::new(None)),
            log_dir: Arc::new(Mutex::new(None)),
        }
    }
}

fn script_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join("sidecar/agent_sidecar.py");
        if p.exists() {
            return Some(p);
        }
    }
    // dev fallback: <project>/sidecar/agent_sidecar.py
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../sidecar/agent_sidecar.py");
    if dev.exists() {
        return Some(dev);
    }
    None
}

fn python_candidates() -> &'static [&'static str] {
    if cfg!(windows) {
        &["python", "py", "python3"]
    } else {
        &["python3", "python"]
    }
}

/// Internal: spawn the sidecar from `path` and start the watch thread.
/// The watch thread handles the handshake, drains stdout, and on unexpected
/// exit it schedules an exponential-backoff retry by calling itself recursively
/// on a new thread.
fn do_start(
    path: PathBuf,
    info: Arc<Mutex<SidecarInfo>>,
    child_slot: Arc<Mutex<Option<Child>>>,
    shutting_down: Arc<AtomicBool>,
    restart_count: Arc<AtomicU32>,
    log_dir: Option<PathBuf>,
) {
    {
        let mut i = info.lock().unwrap();
        i.status = "starting".to_string();
        i.host.clear();
        i.port = 0;
        i.token.clear();
    }

    let mut spawned = None;
    for exe in python_candidates() {
        let mut cmd = Command::new(exe);
        cmd.arg(&path)
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        // Phase 9, Slice 9.1: let the sidecar write its own rotating log file.
        if let Some(dir) = &log_dir {
            cmd.env("CODENAME_LOG_DIR", dir);
        }
        match cmd.spawn() {
            Ok(c) => {
                spawned = Some(c);
                break;
            }
            Err(_) => continue,
        }
    }
    let mut child = match spawned {
        Some(c) => c,
        None => {
            info.lock().unwrap().status = "error".to_string();
            tracing::error!("[sidecar] no python interpreter found");
            return;
        }
    };

    if let Some(out) = child.stdout.take() {
        let info2 = info.clone();
        let shutting2 = shutting_down.clone();
        let rc2 = restart_count.clone();
        let path2 = path.clone();
        let slot2 = child_slot.clone();
        let log_dir2 = log_dir.clone();

        thread::spawn(move || {
            let mut reader = BufReader::new(out);
            let mut first = String::new();
            let mut handshake_ok = false;

            if reader.read_line(&mut first).unwrap_or(0) > 0 {
                if let Ok(hs) = serde_json::from_str::<Handshake>(first.trim()) {
                    let mut i = info2.lock().unwrap();
                    i.host = hs.host;
                    i.port = hs.port;
                    i.token = hs.token;
                    i.status = "ready".to_string();
                    handshake_ok = true;
                }
            }

            // Reset the backoff counter after a successful handshake so the
            // ladder starts fresh after each clean recovery.
            if handshake_ok {
                rc2.store(0, Ordering::SeqCst);
            }

            // Drain until EOF; EOF means the child exited.
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap_or(0) > 0 {
                line.clear();
            }

            if shutting2.load(Ordering::SeqCst) {
                // Intentional shutdown — do not restart.
                return;
            }

            // Unexpected exit — schedule a restart with exponential backoff.
            let attempt = rc2.fetch_add(1, Ordering::SeqCst);
            let delay_ms = (BACKOFF_BASE_MS * (1u64 << attempt.min(4))).min(BACKOFF_CAP_MS);
            tracing::warn!(
                "[sidecar] unexpected exit (attempt {}), restarting in {}ms",
                attempt, delay_ms
            );
            {
                let mut i = info2.lock().unwrap();
                i.status = "restarting".to_string();
                i.port = 0;
                i.token.clear();
            }
            thread::sleep(Duration::from_millis(delay_ms));

            if shutting2.load(Ordering::SeqCst) {
                return; // shutdown came in during the sleep
            }

            do_start(path2, info2, slot2, shutting2, rc2, log_dir2);
        });
    }

    *child_slot.lock().unwrap() = Some(child);
}

impl SidecarManager {
    /// Store the log directory so it can be passed to the Python sidecar.
    pub fn set_log_dir(&self, dir: std::path::PathBuf) {
        *self.log_dir.lock().unwrap() = Some(dir);
    }

    pub fn start(&self, app: &AppHandle) {
        self.shutting_down.store(false, Ordering::SeqCst);
        self.restart_count.store(0, Ordering::SeqCst);

        let path = match script_path(app) {
            Some(p) => p,
            None => {
                self.info.lock().unwrap().status = "error".to_string();
                tracing::error!("[sidecar] agent_sidecar.py not found");
                return;
            }
        };

        // Persist for the watch thread's own retries.
        *self.script.lock().unwrap() = Some(path.clone());

        let log_dir = self.log_dir.lock().unwrap().clone();
        do_start(
            path,
            self.info.clone(),
            self.child.clone(),
            self.shutting_down.clone(),
            self.restart_count.clone(),
            log_dir,
        );
    }

    pub fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        self.restart_count.store(0, Ordering::SeqCst);
        if let Some(mut c) = self.child.lock().unwrap().take() {
            let _ = c.kill();
        }
        let mut i = self.info.lock().unwrap();
        i.status = "stopped".to_string();
        i.port = 0;
        i.token.clear();
    }

    pub fn snapshot(&self) -> SidecarInfo {
        self.info.lock().unwrap().clone()
    }

    /// Ask any in-flight stream to stop (STOP button). The stream loop checks
    /// this between chunks and ends cleanly.
    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn sidecar_info(mgr: State<SidecarManager>) -> SidecarInfo {
    mgr.snapshot()
}

#[tauri::command]
pub fn sidecar_restart(app: AppHandle, mgr: State<SidecarManager>) -> SidecarInfo {
    mgr.shutdown();
    mgr.start(&app);
    mgr.snapshot()
}

/// Webview → shell: cancel the in-flight stream (STOP button).
#[tauri::command]
pub fn sidecar_cancel(mgr: State<SidecarManager>) {
    mgr.request_cancel();
}

/// Post a tool-execution result back to the sidecar (Slice 3.4).
/// Called by the webview after it has executed a WebMCP tool on behalf of the
/// agent. The sidecar's blocking tool proxy picks it up via /a2a/tool_result.
#[tauri::command]
pub async fn sidecar_tool_result(
    call_id: String,
    result: String,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<(), String> {
    if !gates.tools_open() {
        return Err("tools gate closed".to_string());
    }
    let info = mgr.snapshot();
    if info.status != "ready" {
        return Err("sidecar not ready".to_string());
    }
    let url = format!("http://{}:{}/a2a/tool_result", info.host, info.port);
    let payload = serde_json::json!({ "callId": call_id, "result": result });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", info.token))
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("tool_result HTTP {}", resp.status().as_u16()));
    }
    Ok(())
}

/// Legacy non-semantic graph hash-vector endpoint (Phase 4 compatibility).
/// This is not used for Phase 2F SQLite KB semantic retrieval, which uses
/// Rust-owned local Ollama embeddings persisted in SQLite.
#[tauri::command]
pub async fn sidecar_embed(
    texts: Vec<String>,
    mgr: State<'_, SidecarManager>,
) -> Result<Vec<Vec<f64>>, String> {
    let info = mgr.snapshot();
    if info.status != "ready" {
        return Err("sidecar not ready".to_string());
    }
    let url = format!("http://{}:{}/a2a/embed", info.host, info.port);
    let payload = serde_json::json!({ "texts": texts });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", info.token))
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("embed HTTP {}", resp.status().as_u16()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    // Single text → { embedding: [...] }, batch → { embeddings: [[...], ...] }
    if let Some(arr) = v.get("embeddings").and_then(|e| e.as_array()) {
        let vecs: Vec<Vec<f64>> = arr
            .iter()
            .map(|row| {
                row.as_array()
                    .map(|a| a.iter().filter_map(|x| x.as_f64()).collect())
                    .unwrap_or_default()
            })
            .collect();
        return Ok(vecs);
    }
    if let Some(arr) = v.get("embedding").and_then(|e| e.as_array()) {
        let vec: Vec<f64> = arr.iter().filter_map(|x| x.as_f64()).collect();
        return Ok(vec![vec]);
    }
    Err("unexpected embed response shape".to_string())
}

/// Run label-propagation + LLM community summarization via the sidecar
/// (Phase 4, Slice 4.4). Returns community objects with memberIds + summary.
#[tauri::command]
pub async fn sidecar_communities(
    nodes: serde_json::Value,
    edges: serde_json::Value,
    mgr: State<'_, SidecarManager>,
) -> Result<serde_json::Value, String> {
    let info = mgr.snapshot();
    if info.status != "ready" {
        return Err("sidecar not ready".to_string());
    }
    let url = format!("http://{}:{}/a2a/communities", info.host, info.port);
    let payload = serde_json::json!({ "nodes": nodes, "edges": edges });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", info.token))
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("communities HTTP {}", resp.status().as_u16()));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

/// Navigate to a URL via Chrome DevTools Protocol and return the page text.
/// Requires Chrome running with --remote-debugging-port=9222 (Phase 5, Slice 5.4).
#[tauri::command]
pub async fn sidecar_browser_open(
    url: String,
    mgr: State<'_, SidecarManager>,
) -> Result<serde_json::Value, String> {
    let info = mgr.snapshot();
    if info.status != "ready" {
        return Err("sidecar not ready".to_string());
    }
    let endpoint = format!("http://{}:{}/a2a/browser_open", info.host, info.port);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", info.token))
        .json(&serde_json::json!({ "url": url }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

/// Create a real isolated context in the sidecar pool (Phase 6, Slice 6.1).
/// Returns {handle, kind} on success. If the sidecar is offline the caller
/// stores a placeholder with no handle.
#[tauri::command]
pub async fn sidecar_pool_create(
    kind: String,
    task_id: String,
    lease_id: String,
    mgr: State<'_, SidecarManager>,
) -> Result<serde_json::Value, String> {
    let info = mgr.snapshot();
    if info.status != "ready" {
        return Err("sidecar not ready".to_string());
    }
    let endpoint = format!("http://{}:{}/a2a/pool/create", info.host, info.port);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", info.token))
        .json(&serde_json::json!({ "kind": kind, "taskId": task_id, "leaseId": lease_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

/// Release a sidecar pool context and tear down its real resource (Phase 6, Slice 6.2).
/// Idempotent — returns ok even if the handle was already released.
#[tauri::command]
pub async fn sidecar_pool_release(
    handle: String,
    mgr: State<'_, SidecarManager>,
) -> Result<serde_json::Value, String> {
    let info = mgr.snapshot();
    if info.status != "ready" {
        return Err("sidecar not ready".to_string());
    }
    let endpoint = format!("http://{}:{}/a2a/pool/release", info.host, info.port);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", info.token))
        .json(&serde_json::json!({ "handle": handle }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

/// Confirm the process on the handshake port is really our A2A agent by reading
/// its agent card and checking the protocol version (Phase 1.5).
async fn verify_agent_card(client: &reqwest::Client, host: &str, port: u16) -> Result<(), String> {
    let url = format!("http://{}:{}/.well-known/agent-card.json", host, port);
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("agent card HTTP {}", resp.status().as_u16()));
    }
    let card: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let proto = card
        .get("protocolVersion")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if !proto.starts_with("0.3") {
        return Err(format!("unexpected sidecar agent (protocol '{}')", proto));
    }
    Ok(())
}

/// Send a chat to the sidecar over loopback A2A and return the reply text.
/// The bearer token is read from managed state and stays inside Rust — the
/// webview only ever passes the message string and model settings (Phase 1 +
/// Slice 3.3). Model and temperature are forwarded to the sidecar in the A2A
/// params.settings field so the user's active profile drives the agent.
#[tauri::command]
pub async fn sidecar_send(
    message: String,
    model: Option<String>,
    temperature: Option<f64>,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<String, String> {
    if !gates.tools_open() {
        return Err("tools gate closed".to_string());
    }
    let info = mgr.snapshot();
    if info.status != "ready" {
        return Err("sidecar not ready".to_string());
    }
    let url = format!("http://{}:{}/a2a", info.host, info.port);
    let mid = format!(
        "m-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "message/send",
        "params": {
            "message": {
                "kind": "message",
                "role": "user",
                "messageId": mid,
                "parts": [{ "kind": "text", "text": message }]
            },
            "settings": {
                "model": model,
                "temperature": temperature
            }
        }
    });

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    verify_agent_card(&client, &info.host, info.port).await?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", info.token))
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("A2A HTTP {}", resp.status().as_u16()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let text = v
        .get("result")
        .and_then(|r| r.get("parts"))
        .and_then(|p| p.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                .collect::<String>()
        })
        .unwrap_or_default();
    Ok(text)
}

/// Stream a chat reply from the sidecar, pushing each text chunk to the webview
/// through a Tauri Channel as it arrives. The bearer token stays inside Rust
/// (Phase 1). Model settings from the active profile are forwarded to the
/// sidecar so the user's chosen model actually drives the agent (Slice 3.3).
#[tauri::command]
pub async fn sidecar_stream(
    message: String,
    on_event: tauri::ipc::Channel<String>,
    model: Option<String>,
    temperature: Option<f64>,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<(), String> {
    if !gates.tools_open() {
        return Err("tools gate closed".to_string());
    }
    let info = mgr.snapshot();
    if info.status != "ready" {
        return Err("sidecar not ready".to_string());
    }
    let url = format!("http://{}:{}/a2a", info.host, info.port);
    let mid = format!(
        "m-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "message/stream",
        "params": {
            "message": {
                "kind": "message",
                "role": "user",
                "messageId": mid,
                "parts": [{ "kind": "text", "text": message }]
            },
            "settings": {
                "model": model,
                "temperature": temperature
            }
        }
    });

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    verify_agent_card(&client, &info.host, info.port).await?;
    mgr.cancel.store(false, Ordering::SeqCst);
    let mut resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", info.token))
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("A2A HTTP {}", resp.status().as_u16()));
    }

    let mut buf = String::new();
    'read: while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        if mgr.cancel.load(Ordering::SeqCst) {
            break;
        }
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(idx) = buf.find("\n\n") {
            let frame = buf[..idx].trim().to_string();
            buf = buf[idx + 2..].to_string();
            let data = match frame.strip_prefix("data:") {
                Some(d) => d.trim(),
                None => continue,
            };
            let ev: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let kind = ev
                .get("result")
                .and_then(|r| r.get("kind"))
                .and_then(|k| k.as_str())
                .unwrap_or("");

            if kind == "tool_call" {
                // Slice 3.4: relay a tool-call request to the webview. The app
                // executes it via WebMCP (gated + audited) and posts the result
                // back through sidecar_tool_result, unblocking the agent's proxy.
                let result = ev.get("result");
                let call_id = result
                    .and_then(|r| r.get("callId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let name = result
                    .and_then(|r| r.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let args = result
                    .and_then(|r| r.get("args"))
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({}));
                // Key order keeps the marker first so the webview can cheaply
                // detect a tool-call frame (startsWith) before parsing.
                let frame = serde_json::json!({
                    "__tool_call__": true,
                    "id": call_id,
                    "name": name,
                    "args": args,
                })
                .to_string();
                if on_event.send(frame).is_err() {
                    break 'read;
                }
            } else if kind == "message" {
                // Normal text token — concatenate the message parts and forward.
                let text: String = ev
                    .get("result")
                    .and_then(|r| r.get("parts"))
                    .and_then(|p| p.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                            .collect::<String>()
                    })
                    .unwrap_or_default();
                if !text.is_empty() && on_event.send(text).is_err() {
                    break 'read;
                }
            } else if kind == "status-update" {
                // The agent reports a final status update when the turn is done.
                let is_final = ev
                    .get("result")
                    .and_then(|r| r.get("final"))
                    .and_then(|f| f.as_bool())
                    .unwrap_or(false);
                if is_final {
                    break 'read;
                }
            }
        }
    }
    Ok(())
}
// ---------------------------------------------------------------------------
// Phase 9, Slice 9.2 — Health check command
// ---------------------------------------------------------------------------

/// Response returned by the sidecar /health endpoint.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub latency_ms: u64,
    /// Optional reason when ok == false.
    pub reason: Option<String>,
}

/// Probe the sidecar's unauthenticated /health endpoint.
/// Returns ok=false (with a reason) instead of Err so the frontend can
/// distinguish "sidecar alive but unhealthy" from "sidecar unreachable".
#[tauri::command]
pub async fn sidecar_health(mgr: State<'_, SidecarManager>) -> Result<HealthResponse, String> {
    let info = mgr.snapshot();
    if info.port == 0 {
        return Ok(HealthResponse {
            ok: false,
            latency_ms: 0,
            reason: Some("sidecar not running".into()),
        });
    }
    let url = format!("http://{}:{}/health", info.host, info.port);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let start = std::time::Instant::now();
    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let latency_ms = start.elapsed().as_millis() as u64;
            // Parse body; tolerate any JSON shape — we only need "ok"
            let body: serde_json::Value = resp
                .json()
                .await
                .unwrap_or(serde_json::json!({ "ok": true }));
            let ok = body.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
            Ok(HealthResponse { ok, latency_ms, reason: None })
        }
        Ok(resp) => Ok(HealthResponse {
            ok: false,
            latency_ms: start.elapsed().as_millis() as u64,
            reason: Some(format!("HTTP {}", resp.status().as_u16())),
        }),
        Err(e) => Ok(HealthResponse {
            ok: false,
            latency_ms: start.elapsed().as_millis() as u64,
            reason: Some(e.to_string()),
        }),
    }
}
