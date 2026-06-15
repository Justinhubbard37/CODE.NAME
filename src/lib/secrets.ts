/**
 * Secrets bridge. The webview can set/delete API keys and check whether one is
 * present, but it cannot read raw secret values back out of the Rust shell.
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Check whether a secret exists in the OS keychain. */
export async function secretPresent(name: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<unknown>('secret_present', { name })) === true;
  } catch {
    return false;
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
