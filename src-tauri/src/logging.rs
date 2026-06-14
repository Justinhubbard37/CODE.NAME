//! Structured logging initialisation and helpers (Phase 9, Slice 9.1).
//!
//! • Initialises `tracing` with a daily-rolling file appender writing to the
//!   platform log directory (`app_log_dir()`).
//! • Exposes two Tauri commands:
//!     - `get_log_dir`  — returns the log directory path as a string.
//!     - `open_log_dir` — opens the directory in the OS file manager.
//!
//! Call `init_logging(app)` from inside the Tauri `setup()` closure **before**
//! any other code that emits log events.  The returned `WorkerGuard` must be
//! kept alive for the entire process — `Box::leak` is the correct pattern here.
//!
//! SPDX-License-Identifier: Apache-2.0

use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tracing_appender::rolling;
use tracing_subscriber::{fmt, EnvFilter};

/// Initialise file-backed structured logging.
/// Returns the log directory (used to pass `CODENAME_LOG_DIR` to the sidecar).
///
/// # Panics
/// Panics only if the platform log directory cannot be resolved — which should
/// never happen on a correctly installed Tauri app.
pub fn init_logging(app: &AppHandle) -> PathBuf {
    let log_dir = app
        .path()
        .app_log_dir()
        .expect("cannot resolve app log dir");

    std::fs::create_dir_all(&log_dir).ok();

    let file_appender = rolling::daily(&log_dir, "codename.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    // Leak the guard so the background writer lives for the whole process.
    Box::leak(Box::new(guard));

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    fmt::Subscriber::builder()
        .with_env_filter(filter)
        .with_writer(non_blocking)
        .with_ansi(false)
        .init();

    log_dir
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Returns the absolute path of the log directory as a UTF-8 string.
#[tauri::command]
pub fn get_log_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_log_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// Opens the log directory in the OS native file manager.
#[tauri::command]
pub fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| e.to_string())?;
    // tauri-plugin-opener handles cross-platform reveal-in-finder/explorer.
    tauri_plugin_opener::open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())
}
