//! OS keychain-backed secret storage (Phase 2.4).
//!
//! API keys live in the platform credential store (Windows Credential Manager /
//! macOS Keychain / Linux Secret Service), never in a plain-text file. The
//! webview sets/reads them through these commands; each secret is keyed by the
//! same name used for the env-var fallback (e.g. "GEMINI_API_KEY").

const SERVICE: &str = "com.codename.harness";

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, &name).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, &name).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, &name).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
