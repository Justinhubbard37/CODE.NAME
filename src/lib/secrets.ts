/**
 * Secrets bridge (Phase 2.4). Reads/writes API keys in the OS keychain through
 * the Rust shell. All access is Tauri-guarded so the app still runs in a plain
 * browser (where keychain access simply isn't available).
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Read a secret from the OS keychain. Returns null if unset or unavailable. */
export async function getSecret(name: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string | null>('secret_get', { name });
  } catch {
    return null;
  }
}

/** Store a secret in the OS keychain. Returns true on success. */
export async function setSecret(name: string, value: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secret_set', { name, value });
    return true;
  } catch {
    return false;
  }
}

/** Remove a secret from the OS keychain. */
export async function deleteSecret(name: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secret_delete', { name });
  } catch {
    /* ignore */
  }
}
