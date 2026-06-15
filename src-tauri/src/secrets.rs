//! OS keychain-backed secret storage (Phase 2.4).
//!
//! API keys live in the platform credential store (Windows Credential Manager /
//! macOS Keychain / Linux Secret Service), never in a plain-text file. The
//! webview sets/deletes/checks them through these commands; raw values never
//! return to the webview. Each secret is keyed by provider name, e.g.
//! "GEMINI_API_KEY".

const SERVICE: &str = "com.codename.harness";

fn validate_secret_name(name: &str) -> Result<(), String> {
    let valid = !name.is_empty()
        && name.len() <= 80
        && name
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_');
    if valid {
        Ok(())
    } else {
        Err("invalid secret name".to_string())
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    validate_secret_name(&name)?;
    let entry = keyring::Entry::new(SERVICE, &name).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

/// Deprecated compatibility shim. Raw keychain secret reads are intentionally
/// denied so secret values cannot cross into webview memory.
#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    validate_secret_name(&name)?;
    Err("raw secret reads are disabled; use secret_present".to_string())
}

#[tauri::command]
pub fn secret_present(name: String) -> Result<bool, String> {
    validate_secret_name(&name)?;
    let entry =
        keyring::Entry::new(SERVICE, &name).map_err(|_| "secret store unavailable".to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(!v.is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("secret store unavailable".to_string()),
    }
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    validate_secret_name(&name)?;
    let entry = keyring::Entry::new(SERVICE, &name).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_expected_secret_names() {
        assert!(validate_secret_name("GEMINI_API_KEY").is_ok());
        assert!(validate_secret_name("OLLAMA_API_KEY").is_ok());
    }

    #[test]
    fn rejects_unexpected_secret_names() {
        for name in ["", "gemini_api_key", "TOKEN VALUE", "../SECRET"] {
            assert!(validate_secret_name(name).is_err());
        }
        assert!(validate_secret_name(&"A".repeat(81)).is_err());
    }

    #[test]
    fn secret_get_denies_raw_reads_without_secret_material() {
        let err = secret_get("GEMINI_API_KEY".to_string()).expect_err("raw reads must be denied");
        assert!(err.contains("raw secret reads are disabled"));
        for forbidden in ["Bearer", "token", "api key", "prompt", "sk-"] {
            assert!(
                !err.to_lowercase().contains(forbidden),
                "denial should not expose sensitive term {forbidden}"
            );
        }
    }
}
