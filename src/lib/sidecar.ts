/**
 * TS-side bridge to the Rust-supervised Python agent sidecar (Phase 3).
 * - getSidecarInfo() reads {host,port,token,status} from the Rust command.
 * - streamA2A() is a thin A2A client (JSON-RPC message/stream over SSE) matching
 *   the sidecar + A2A 0.3 shape; swap in @a2a-js/sdk later behind this function.
 * All Tauri access is guarded so the app still runs in a plain browser.
 */
export interface SidecarInfo {
  status: string; // stopped | starting | ready | error
  host: string;
  port: number;
  /** Only present in tests; the live shell no longer exposes the token to the webview (Phase 1). */
  token?: string;
}

/**
 * Reserved model settings for a future explicitly approved sidecar runtime.
 * During containment these calls return safe unavailable errors.
 */
export interface ModelSettings {
  model?: string;
  temperature?: number;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getSidecarInfo(): Promise<SidecarInfo | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<SidecarInfo>('sidecar_info');
  } catch {
    return null;
  }
}

export async function restartSidecar(): Promise<SidecarInfo | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<SidecarInfo>('sidecar_restart');
  } catch {
    return null;
  }
}

/**
 * Request sidecar chat through the Rust shell. Containment currently rejects
 * execution before any sidecar request is made.
 */
export async function sendToSidecar(
  message: string,
  settings?: ModelSettings,
): Promise<string> {
  if (!isTauri()) throw new Error('the agent sidecar runs only in the desktop app');
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<string>('sidecar_send', {
    message,
    model: settings?.model ?? null,
    temperature: settings?.temperature ?? null,
  });
}

/**
 * Request sidecar streaming through the Rust shell. Containment currently
 * rejects execution before any sidecar request is made.
 */
export async function streamFromSidecar(
  message: string,
  onToken: (t: string) => void | Promise<void>,
  settings?: ModelSettings,
): Promise<void> {
  if (!isTauri()) throw new Error('the agent sidecar runs only in the desktop app');
  const { invoke, Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<string>();
  channel.onmessage = (t) => { void onToken(t); };
  await invoke('sidecar_stream', {
    message,
    onEvent: channel,
    model: settings?.model ?? null,
    temperature: settings?.temperature ?? null,
  });
}

/**
 * Post a tool-execution result back to the sidecar (Slice 3.4).
 * Called after executeTool() returns so the sidecar's blocking ADK tool proxy
 * can unblock and return the result to the model.
 */
export async function sidecarToolResult(callId: string, result: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('sidecar_tool_result', { callId, result });
  } catch {
    /* best-effort — if this fails the tool proxy times out gracefully */
  }
}

/**
 * Legacy non-semantic graph hash-vector endpoint.
 *
 * This does not produce real embeddings and must not be used for Phase 2F
 * SQLite KB semantic retrieval. That path uses Rust-owned local Ollama
 * embeddings persisted in SQLite.
 */
export async function sidecarEmbed(texts: string[]): Promise<number[][]> {
  if (!isTauri()) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<number[][]>('sidecar_embed', { texts });
  } catch {
    return [];
  }
}

/**
 * Legacy community endpoint wrapper. Rust containment returns unavailable and
 * no community summary should be written from this path.
 */
export async function sidecarCommunities(
  nodes: { id: string; text: string }[],
  edges: { source: string; target: string }[],
): Promise<{ id: string; memberIds: string[]; summary: string }[]> {
  if (!isTauri()) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const res = await invoke<{ communities: { id: string; memberIds: string[]; summary: string }[] }>(
      'sidecar_communities',
      { nodes, edges },
    );
    return res.communities ?? [];
  } catch {
    return [];
  }
}

/**
 * Legacy browser endpoint wrapper. Rust containment returns unavailable and no
 * browser execution is dispatched.
 *
 * Returns an object with:
 *   text  — up to 8 000 chars of the page's innerText (empty if Chrome unavailable)
 *   error — user-readable guidance when Chrome is not reachable
 *   harness_files — list of sandbox-written helper files (Slice 5.5 audit trail)
 */
export async function sidecarBrowserOpen(url: string): Promise<{
  text?: string;
  url?: string;
  title?: string;
  error?: string;
  harness_files?: { path: string; size: number; ts: number }[];
}> {
  if (!isTauri()) return { error: 'browser harness requires the desktop app', text: '' };
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('sidecar_browser_open', { url });
  } catch (e) {
    return { error: String(e), text: '' };
  }
}

/**
 * Legacy pool endpoint wrapper. Rust containment returns unavailable; callers
 * must treat the lease as frontend bookkeeping only.
 */
export async function sidecarPoolCreate(
  kind: string,
  taskId: string,
  leaseId: string,
): Promise<{ handle: string; kind: string } | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<{ handle: string; kind: string }>('sidecar_pool_create', {
      kind,
      taskId,
      leaseId,
    });
  } catch {
    return null;
  }
}

/**
 * Legacy pool release wrapper. Rust containment treats this as unavailable or
 * no-op cleanup, and TS-side lease eviction must not depend on it.
 */
export async function sidecarPoolRelease(handle: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('sidecar_pool_release', { handle });
  } catch {
    /* best-effort: force-evict on the TS side regardless */
  }
}

/** Ask the shell to cancel an in-flight sidecar stream (STOP button). */
export async function cancelSidecar(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('sidecar_cancel');
  } catch {
    /* ignore */
  }
}

export interface A2ACallbacks {
  onToken: (t: string) => void;
  onActivity?: (kind: 'network' | 'system', t: string) => void;
  signal?: AbortSignal;
}

export async function streamA2A(
  info: SidecarInfo,
  text: string,
  cb: A2ACallbacks,
): Promise<string> {
  const url = `http://${info.host}:${info.port}/a2a`;
  cb.onActivity?.('network', `A2A → ${info.host}:${info.port} (token-auth)`);
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'message/stream',
    params: {
      message: {
        kind: 'message',
        role: 'user',
        messageId: crypto.randomUUID(),
        parts: [{ kind: 'text', text }],
      },
    },
  });
  const res = await fetch(url, {
    method: 'POST',
    signal: cb.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${info.token}` },
    body,
  });
  if (!res.ok || !res.body) throw new Error(`A2A HTTP ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  while (true) {
    if (cb.signal?.aborted) {
      reader.cancel().catch(() => {});
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);
      if (!frame.startsWith('data:')) continue;
      try {
        const ev = JSON.parse(frame.slice(5).trim());
        const r = ev.result;
        if (r?.kind === 'message') {
          const t = (r.parts ?? [])
            .map((p: { text?: string }) => p.text ?? '')
            .join('');
          if (t) {
            full += t;
            cb.onToken(t);
          }
        }
      } catch {
        /* ignore partial frame */
      }
    }
  }
  return full;
}
