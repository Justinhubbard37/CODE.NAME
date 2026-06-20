//! Python agent-sidecar supervisor.
//!
//! Spawns the loopback A2A sidecar, reads its handshake (ephemeral port +
//! per-launch token) from stdout, holds it in managed state, and kills it on
//! app exit. Runtime containment keeps startup and restart strictly explicit;
//! an unexpected exit marks the sidecar unavailable until the user acts in
//! Agent Sidecar Setup.
//! The Rust shell owns the lifecycle (docs/contracts/sidecar.md).

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::policy::{
    apply_gate_policy, require_gates, EffectiveGateState, GatePolicyCeiling, GateSnapshot,
    GateValues,
};

#[derive(Clone, Serialize)]
pub struct SidecarInfo {
    pub status: String, // stopped | starting | ready | error
    pub host: String,
    pub port: u16,
    // The per-launch bearer token stays inside the Rust shell — it is NEVER
    // serialized out to the webview (Phase 1 security spine).
    #[serde(skip)]
    pub token: String,
}

impl Default for SidecarInfo {
    fn default() -> Self {
        Self {
            status: "stopped".to_string(),
            host: String::new(),
            port: 0,
            token: String::new(),
        }
    }
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

const SIDECAR_CONTAINMENT_MESSAGE: &str =
    "Agent Sidecar execution is unavailable during containment remediation";

fn gate_snapshot(gates: &GateState) -> GateSnapshot {
    GateSnapshot::new(
        gates.tools_open(),
        gates.network_open(),
        gates.filesystem_open(),
    )
}

fn require_sidecar_policy(command: &str, gates: &GateState) -> Result<(), String> {
    require_gates(command, gate_snapshot(gates)).map_err(|err| err.to_string())
}

fn sidecar_containment_error(capability: &str) -> String {
    format!("{capability} unavailable: {SIDECAR_CONTAINMENT_MESSAGE}")
}

fn sidecar_unavailable_payload(capability: &str) -> serde_json::Value {
    serde_json::json!({
        "ok": false,
        "status": "unavailable",
        "reason": sidecar_containment_error(capability),
    })
}

fn sidecar_pool_release_payload() -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "status": "unavailable",
        "reason": sidecar_containment_error("Sidecar pool release"),
        "released": false,
    })
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

#[cfg(test)]
mod containment_tests {
    use super::*;

    fn gates(filesystem: bool, network: bool, tools: bool) -> GateState {
        let state = GateState::default();
        state.apply_requested(GateValues::new(filesystem, network, tools));
        state
    }

    #[test]
    fn default_sidecar_state_is_stopped() {
        let info = SidecarInfo::default();

        assert_eq!(info.status, "stopped");
        assert_eq!(info.port, 0);
        assert!(info.token.is_empty());
    }

    #[test]
    fn sidecar_policy_denies_tools_gate_before_execution() {
        let state = gates(true, true, false);
        let err = require_sidecar_policy("sidecar_send", &state).expect_err("tools gate must deny");

        assert!(err.contains("sidecar_send"));
        assert!(err.contains("tools gate is closed"));
    }

    #[test]
    fn sidecar_policy_denies_network_gate_for_network_capable_commands() {
        let state = gates(true, false, true);

        for command in [
            "sidecar_send",
            "sidecar_stream",
            "sidecar_communities",
            "sidecar_browser_open",
            "sidecar_pool_create",
        ] {
            let err = require_sidecar_policy(command, &state)
                .expect_err("closed network gate must deny network-capable sidecar command");
            assert!(err.contains(command));
            assert!(err.contains("network gate is closed"));
        }
    }

    #[test]
    fn containment_error_is_safe_and_not_assistant_like() {
        let err = sidecar_containment_error("Sidecar chat");

        assert!(err.contains("unavailable"));
        assert!(!err.contains("[SIDECAR:STUB]"));
        assert!(!err.contains("[SIDECAR:ADK-ERROR]"));
        assert!(!err.contains("Echo:"));
    }

    #[test]
    fn pool_release_payload_is_safe_idempotent_cleanup() {
        let payload = sidecar_pool_release_payload();

        assert_eq!(payload["ok"], true);
        assert_eq!(payload["status"], "unavailable");
        assert_eq!(payload["released"], false);
        assert!(payload["reason"].as_str().unwrap().contains("unavailable"));
    }
}

#[derive(Clone)]
pub struct SidecarManager {
    info: Arc<Mutex<SidecarInfo>>,
    child: Arc<Mutex<Option<Child>>>,
    shutting_down: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    /// Explicit start/restart generation counter. Automatic retries are disabled
    /// during containment.
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
/// The watch thread handles the handshake and drains stdout. If the process
/// exits unexpectedly, it marks the sidecar unavailable and waits for another
/// explicit user action instead of restarting.
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

            // Unexpected exit — containment forbids background restarts.
            tracing::warn!("[sidecar] unexpected exit; explicit user restart required");
            {
                let mut i = info2.lock().unwrap();
                i.status = "error".to_string();
                i.port = 0;
                i.token.clear();
            }
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
pub fn sidecar_restart(
    app: AppHandle,
    mgr: State<SidecarManager>,
    gates: State<GateState>,
) -> Result<SidecarInfo, String> {
    require_sidecar_policy("sidecar_restart", &gates)?;
    mgr.shutdown();
    mgr.start(&app);
    Ok(mgr.snapshot())
}

/// Webview → shell: cancel the in-flight stream (STOP button).
#[tauri::command]
pub fn sidecar_cancel(mgr: State<SidecarManager>) {
    mgr.request_cancel();
}

/// Post a tool-execution result back to the sidecar. Containment disables this
/// execution loop, so policy is checked and then a safe unavailable state is
/// returned without contacting the sidecar.
#[tauri::command]
pub async fn sidecar_tool_result(
    call_id: String,
    result: String,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<(), String> {
    require_sidecar_policy("sidecar_tool_result", &gates)?;
    let _ = (call_id, result, mgr);
    Err(sidecar_containment_error("Sidecar tool callback"))
}

/// Legacy non-semantic graph hash-vector endpoint. Disabled during containment.
#[tauri::command]
pub async fn sidecar_embed(
    texts: Vec<String>,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<Vec<Vec<f64>>, String> {
    require_sidecar_policy("sidecar_embed", &gates)?;
    let _ = (texts, mgr);
    Err(sidecar_containment_error("Sidecar embeddings"))
}

/// Sidecar community processing is disabled during containment. No failed,
/// stubbed, or unavailable result may become a community summary.
#[tauri::command]
pub async fn sidecar_communities(
    nodes: serde_json::Value,
    edges: serde_json::Value,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<serde_json::Value, String> {
    require_sidecar_policy("sidecar_communities", &gates)?;
    let _ = (nodes, edges, mgr);
    Ok(sidecar_unavailable_payload("Sidecar communities"))
}

/// Browser execution is disabled during containment.
#[tauri::command]
pub async fn sidecar_browser_open(
    url: String,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<serde_json::Value, String> {
    require_sidecar_policy("sidecar_browser_open", &gates)?;
    let _ = (url, mgr);
    Ok(serde_json::json!({
        "ok": false,
        "status": "unavailable",
        "error": sidecar_containment_error("Sidecar browser"),
        "text": "",
        "harness_files": [],
    }))
}

/// Pool creation is scaffolding during containment and does not allocate a
/// sidecar resource.
#[tauri::command]
pub async fn sidecar_pool_create(
    kind: String,
    task_id: String,
    lease_id: String,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<serde_json::Value, String> {
    require_sidecar_policy("sidecar_pool_create", &gates)?;
    let _ = (kind, task_id, lease_id, mgr);
    Ok(sidecar_unavailable_payload("Sidecar pool create"))
}

/// Pool release is retained as a safe no-op for cleanup callers.
#[tauri::command]
pub async fn sidecar_pool_release(
    handle: String,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<serde_json::Value, String> {
    require_sidecar_policy("sidecar_pool_release", &gates)?;
    let _ = (handle, mgr);
    Ok(sidecar_pool_release_payload())
}

/// Sidecar chat is unavailable during containment. Policy denial is still
/// enforced before returning the safe unavailable error.
#[tauri::command]
pub async fn sidecar_send(
    message: String,
    model: Option<String>,
    temperature: Option<f64>,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<String, String> {
    require_sidecar_policy("sidecar_send", &gates)?;
    let _ = (message, model, temperature, mgr);
    Err(sidecar_containment_error("Sidecar chat"))
}

/// Sidecar streaming is unavailable during containment. Policy denial is still
/// enforced before returning the safe unavailable error.
#[tauri::command]
pub async fn sidecar_stream(
    message: String,
    on_event: tauri::ipc::Channel<String>,
    model: Option<String>,
    temperature: Option<f64>,
    mgr: State<'_, SidecarManager>,
    gates: State<'_, GateState>,
) -> Result<(), String> {
    require_sidecar_policy("sidecar_stream", &gates)?;
    let _ = (message, on_event, model, temperature, mgr);
    Err(sidecar_containment_error("Sidecar stream"))
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
