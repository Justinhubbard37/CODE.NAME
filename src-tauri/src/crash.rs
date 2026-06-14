//! Crash reporting opt-in (Phase 9, Slice 9.3).
//!
//! • `set_crash_consent(enabled)` — toggle.  Installs a custom panic hook on
//!   first enable; removes it (restores default) on disable.
//! • On panic with consent ON: writes `crash_<timestamp>.txt` to the platform
//!   log directory.  Uses statics so the hook doesn't need AppHandle.
//! • JS errors: `append_js_crash_log(message, stack)` — same dir, same format.
//! • `get_crash_reports` — list filenames (newest first).
//! • `clear_crash_reports` — delete all crash_*.txt files.
//! • `open_crash_folder` — open the log dir in the OS file manager.
//!
//! SPDX-License-Identifier: Apache-2.0

use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        OnceLock,
    },
};
use tauri::{AppHandle, Manager};

// ---------------------------------------------------------------------------
// Statics — accessible from the panic hook without AppHandle
// ---------------------------------------------------------------------------

static CRASH_CONSENT: AtomicBool = AtomicBool::new(false);
static CRASH_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Called once from `lib.rs` setup() after `init_logging` so the directory is
/// known before any panic could occur.
pub fn init_crash_dir(app: &AppHandle) {
    let dir = app
        .path()
        .app_log_dir()
        .expect("cannot resolve app log dir for crash reports");
    std::fs::create_dir_all(&dir).ok();
    CRASH_DIR.set(dir).ok(); // silently ignore if already set (tests)
}

// ---------------------------------------------------------------------------
// Panic hook
// ---------------------------------------------------------------------------

fn install_hook() {
    std::panic::set_hook(Box::new(|info| {
        if !CRASH_CONSENT.load(Ordering::SeqCst) {
            return;
        }
        let dir = match CRASH_DIR.get() {
            Some(d) => d,
            None => return,
        };
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let path = dir.join(format!("crash_{ts}.txt"));
        let msg = info.to_string();
        let _ = std::fs::write(&path, &msg);
        tracing::error!("PANIC (crash report written to {path:?}): {msg}");
    }));
}

fn remove_hook() {
    // Restore the default panic hook.
    let _ = std::panic::take_hook();
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Enable or disable crash-report collection.
/// Installs / removes the custom panic hook accordingly.
#[tauri::command]
pub fn set_crash_consent(enabled: bool) {
    let was = CRASH_CONSENT.swap(enabled, Ordering::SeqCst);
    if enabled && !was {
        install_hook();
        tracing::info!("crash reporting enabled");
    } else if !enabled && was {
        remove_hook();
        tracing::info!("crash reporting disabled");
    }
}

/// Return whether crash reporting is currently enabled.
#[tauri::command]
pub fn get_crash_consent() -> bool {
    CRASH_CONSENT.load(Ordering::SeqCst)
}

/// Write a JS-side error to the crash log directory (only when consented).
#[tauri::command]
pub fn append_js_crash_log(message: String, stack: String) -> Result<(), String> {
    if !CRASH_CONSENT.load(Ordering::SeqCst) {
        return Ok(());
    }
    let dir = CRASH_DIR.get().ok_or("crash dir not initialised")?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = dir.join(format!("crash_js_{ts}.txt"));
    let content = format!("[JS Error]\n{message}\n\n{stack}");
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    tracing::warn!("JS crash logged: {message}");
    Ok(())
}

/// List crash report filenames (newest first, basenames only).
#[tauri::command]
pub fn get_crash_reports(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let mut entries: Vec<(std::time::SystemTime, String)> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("crash_")
        })
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let mtime = e.metadata().and_then(|m| m.modified()).ok()?;
            Some((mtime, name))
        })
        .collect();
    entries.sort_by(|a, b| b.0.cmp(&a.0)); // newest first
    Ok(entries.into_iter().map(|(_, n)| n).collect())
}

/// Delete all crash_*.txt files in the log directory.
#[tauri::command]
pub fn clear_crash_reports(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        if let Ok(e) = entry {
            if e.file_name().to_string_lossy().starts_with("crash_") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    tracing::info!("crash reports cleared");
    Ok(())
}

/// Open the crash / log directory in the OS file manager.
#[tauri::command]
pub fn open_crash_folder(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())
}
