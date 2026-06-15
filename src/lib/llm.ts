/**
 * Model-agnostic, local-first LLM transport.
 *
 * Hits every supported endpoint family through one interface:
 *   - ollama            -> POST /api/chat        (NDJSON stream)
 *   - openai / lmstudio -> POST /v1/chat/completions (SSE stream)
 *   - custom            -> OpenAI-compatible by default
 *   - gemini (cloud)    -> explicitly deferred until Rust TLS/provider routing
 *
 * If an endpoint is unreachable (offline, gate closed, no key, deferred cloud)
 * receives a synthetic local stream so the canvas always responds.
 */
import type {
  ConfigProfile,
  Endpoint,
  EndpointNetworkClass,
  ProviderKind,
  SecretRequirement,
} from '../types';
import { secretPresent } from './secrets';

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onActivity?: (kind: 'network' | 'reasoning' | 'tool' | 'system', text: string) => void;
  /** Fired once with the model the server actually used (read from the response). */
  onModel?: (model: string) => void;
  signal?: AbortSignal;
}

async function hasKey(apiKeyEnv?: string): Promise<boolean> {
  if (!apiKeyEnv) return false;
  return secretPresent(apiKeyEnv);
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/* ------------------------------------------------------------------ */
/* Health probing                                                      */
/* ------------------------------------------------------------------ */

export async function pingEndpoint(ep: Endpoint): Promise<{ ok: boolean; detail: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  const keyName = keyNameFor(ep);
  const cloud = reachesNetwork(ep);
  let keySet = false;
  try {
    keySet = await hasKey(keyName);
    // Local-first: an endpoint that needs a key but has none is reported offline
    // WITHOUT any network call — nothing leaves the machine until a key exists.
    if (keyName && !keySet) {
      clearTimeout(t);
      return { ok: false, detail: 'no API key' };
    }
    if (ep.kind === 'gemini') {
      clearTimeout(t);
      return { ok: false, detail: 'Gemini cloud routing remains deferred to Rust provider implementation' };
    }
    // Cloud endpoints aren't probed from the webview (CORS would block it). A
    // present key marks them ready; their model list is fetched via the shell.
    if (cloud) {
      clearTimeout(t);
      return { ok: true, detail: keySet ? 'key set' : 'reachable' };
    }
    const url =
      ep.kind === 'ollama'
        ? `${ep.baseUrl.replace(/\/$/, '')}/api/tags`
        : `${ep.baseUrl.replace(/\/$/, '')}/v1/models`;
    const headers: Record<string, string> = {};
    const res = await fetch(url, { signal: ctl.signal, headers });
    clearTimeout(t);
    if (res.ok) return { ok: true, detail: `HTTP ${res.status}` };
    // A cloud endpoint with a key that fails the model-list probe is still usable
    // for chat (cloud listing paths vary) — mark it ready instead of blocking.
    if (cloud && keySet) return { ok: true, detail: `key set (list HTTP ${res.status})` };
    return { ok: false, detail: `HTTP ${res.status}` };
  } catch (err) {
    clearTimeout(t);
    if (cloud && keySet) return { ok: true, detail: 'key set (probe skipped)' };
    return { ok: false, detail: err instanceof Error ? err.name : 'unreachable' };
  }
}

export interface ProviderClassification {
  providerKind: ProviderKind;
  networkClass: EndpointNetworkClass;
  runsLocalOnly: boolean;
  requiresNetwork: boolean;
  cloudCapable: boolean;
  secretRequirement: SecretRequirement;
  requiresSecret: boolean;
}

function kindToProviderKind(ep: Endpoint): ProviderKind {
  if (ep.providerKind) return ep.providerKind;
  if (ep.kind === 'openai') return 'openai-compatible';
  if (ep.kind === 'custom' && ep.networkClass === 'local-only') return 'openai-compatible';
  return ep.kind;
}

function isOllamaCloudModel(ep: Endpoint): boolean {
  const model = ep.model.toLowerCase();
  return ep.kind === 'ollama' && (model.includes('-cloud') || model.includes(':cloud'));
}

function secretRequirementFor(ep: Endpoint, networkClass: EndpointNetworkClass): SecretRequirement {
  if (ep.secretRequirement) return ep.secretRequirement;
  if (networkClass === 'local-only') return 'none';
  if (ep.apiKeyEnv || ep.kind === 'gemini') return 'keychain';
  return 'optional';
}

export function classifyEndpoint(ep: Endpoint): ProviderClassification {
  const providerKind = kindToProviderKind(ep);

  if (providerKind === 'synthetic' || ep.kind === 'a2a') {
    return {
      providerKind,
      networkClass: 'local-only',
      runsLocalOnly: true,
      requiresNetwork: false,
      cloudCapable: false,
      secretRequirement: 'none',
      requiresSecret: false,
    };
  }

  let networkClass: EndpointNetworkClass;
  if (ep.kind === 'gemini') {
    networkClass = 'cloud';
  } else if (ep.usesCloud || isOllamaCloudModel(ep)) {
    networkClass = ep.networkClass === 'cloud' ? 'cloud' : 'cloud-capable';
  } else if (ep.networkClass) {
    networkClass = ep.networkClass;
  } else if (ep.kind === 'ollama' || ep.kind === 'lmstudio') {
    networkClass = 'local-only';
  } else if (ep.runsLocalOnly === true) {
    networkClass = 'local-only';
  } else {
    networkClass = 'cloud-capable';
  }

  const runsLocalOnly = networkClass === 'local-only';
  const secretRequirement = secretRequirementFor(ep, networkClass);
  return {
    providerKind,
    networkClass,
    runsLocalOnly,
    requiresNetwork: !runsLocalOnly,
    cloudCapable: !runsLocalOnly,
    secretRequirement,
    requiresSecret: secretRequirement === 'keychain',
  };
}

/** True if the route is cloud, cloud-capable, or unknown and therefore governed
 * by the Network gate. Localhost/private addresses are not trusted by URL. */
export function reachesNetwork(ep: Endpoint): boolean {
  return classifyEndpoint(ep).requiresNetwork;
}

/**
 * The keychain/env name to use for this endpoint's API key. If the endpoint
 * doesn't set one explicitly, a cloud endpoint falls back to the conventional
 * name by kind — so a key saved in the Secrets panel is still found even when
 * the endpoint's key-var field is left blank.
 */
function keyNameFor(ep: Endpoint): string | undefined {
  if (ep.apiKeyEnv) return ep.apiKeyEnv;
  if (classifyEndpoint(ep).secretRequirement === 'none') return undefined;
  if (ep.kind === 'ollama') return 'OLLAMA_API_KEY';
  if (ep.kind === 'gemini') return 'GEMINI_API_KEY';
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Model discovery                                                     */
/* ------------------------------------------------------------------ */

/**
 * List the models actually installed/available at an endpoint.
 *   - ollama                     -> GET /api/tags   (.models[].name)
 *   - openai / lmstudio / custom -> GET /v1/models  (.data[].id)
 * Returns [] for gemini/a2a or on any error (caller keeps the typed model).
 */
export async function listModels(ep: Endpoint): Promise<string[]> {
  if (ep.kind === 'gemini' || ep.kind === 'a2a') return [];
  const classification = classifyEndpoint(ep);
  // Cloud endpoints: list via the Rust shell (bypasses browser CORS).
  if (classification.requiresNetwork && isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const keyName = keyNameFor(ep);
      return await invoke<string[]>('model_list', {
        kind: ep.kind,
        baseUrl: ep.baseUrl,
        keyName,
        model: ep.model,
        networkClass: classification.networkClass,
        runsLocalOnly: classification.runsLocalOnly,
        usesCloud: ep.usesCloud === true,
      });
    } catch {
      return [];
    }
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  const base = ep.baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {};
  try {
    const url = ep.kind === 'ollama' ? `${base}/api/tags` : `${base}/v1/models`;
    const res = await fetch(url, { signal: ctl.signal, headers });
    clearTimeout(t);
    if (!res.ok) return [];
    const j = (await res.json()) as {
      models?: { name?: string }[];
      data?: { id?: string }[];
    };
    const raw =
      ep.kind === 'ollama'
        ? (j.models ?? []).map((m) => m.name)
        : (j.data ?? []).map((m) => m.id);
    return raw.filter((n): n is string => !!n);
  } catch {
    clearTimeout(t);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Streaming chat                                                      */
/* ------------------------------------------------------------------ */

export async function streamChat(
  ep: Endpoint,
  profile: ConfigProfile,
  turns: ChatTurn[],
  cb: StreamCallbacks,
): Promise<string> {
  try {
    cb.onActivity?.('network', `${ep.label} · ${ep.model} · ${ep.kind.toUpperCase()}`);
    if (ep.kind === 'gemini') return await streamGemini(ep, turns, cb);
    // Cloud HTTP endpoints go through the Rust shell (no browser CORS; key read
    // from the keychain in Rust). Local endpoints use the webview path below.
    if (reachesNetwork(ep) && isTauri()) return await streamModelViaShell(ep, profile, turns, cb);
    if (ep.kind === 'ollama') return await streamOllama(ep, profile, turns, cb);
    return await streamOpenAI(ep, profile, turns, cb); // openai | lmstudio | custom
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'error';
    cb.onActivity?.('system', `endpoint failed (${reason}) — synthetic fallback`);
    return await syntheticStream(turns, cb, reason);
  }
}

/** Route a chat through the Rust shell — bypasses browser CORS for cloud
 *  endpoints, and the API key is read from the keychain in Rust. */
async function streamModelViaShell(
  ep: Endpoint,
  profile: ConfigProfile,
  turns: ChatTurn[],
  cb: StreamCallbacks,
): Promise<string> {
  const { invoke, Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<string>();
  let full = '';
  channel.onmessage = (tok) => {
    full += tok;
    cb.onToken(tok);
  };
  const keyName = keyNameFor(ep);
  const classification = classifyEndpoint(ep);
  const served = await invoke<string>('model_stream', {
    req: {
      kind: ep.kind,
      baseUrl: ep.baseUrl,
      model: ep.model,
      keyName,
      networkClass: classification.networkClass,
      runsLocalOnly: classification.runsLocalOnly,
      usesCloud: ep.usesCloud === true,
      temperature: profile.temperature,
      numCtx: profile.contextWindow,
      messages: turns,
    },
    onEvent: channel,
  });
  if (served) cb.onModel?.(served);
  return full;
}

async function streamOllama(
  ep: Endpoint,
  profile: ConfigProfile,
  turns: ChatTurn[],
  cb: StreamCallbacks,
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const res = await fetch(`${ep.baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers,
    signal: cb.signal,
    body: JSON.stringify({
      model: ep.model,
      messages: turns,
      stream: true,
      options: { temperature: profile.temperature, num_ctx: profile.contextWindow },
    }),
  });
  if (!res.ok) throw new Error(await httpError(res, ep.model));
  if (!res.body) throw new Error('no response stream');
  let full = '';
  let reported = false;
  await readLines(res.body, cb.signal, (line) => {
    if (!line.trim()) return;
    try {
      const j = JSON.parse(line);
      if (!reported && typeof j.model === 'string') {
        reported = true;
        cb.onModel?.(j.model);
      }
      const tok = j.message?.content ?? '';
      if (tok) {
        full += tok;
        cb.onToken(tok);
      }
    } catch {
      /* ignore partial line */
    }
  });
  return full;
}

async function streamOpenAI(
  ep: Endpoint,
  profile: ConfigProfile,
  turns: ChatTurn[],
  cb: StreamCallbacks,
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const res = await fetch(`${ep.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers,
    signal: cb.signal,
    body: JSON.stringify({
      model: ep.model,
      messages: turns,
      stream: true,
      temperature: profile.temperature,
    }),
  });
  if (!res.ok) throw new Error(await httpError(res, ep.model));
  if (!res.body) throw new Error('no response stream');
  let full = '';
  let reported = false;
  await readLines(res.body, cb.signal, (line) => {
    const s = line.trim();
    if (!s.startsWith('data:')) return;
    const payload = s.slice(5).trim();
    if (payload === '[DONE]') return;
    try {
      const j = JSON.parse(payload);
      if (!reported && typeof j.model === 'string') {
        reported = true;
        cb.onModel?.(j.model);
      }
      const tok = j.choices?.[0]?.delta?.content ?? '';
      if (tok) {
        full += tok;
        cb.onToken(tok);
      }
    } catch {
      /* ignore */
    }
  });
  return full;
}

async function streamGemini(ep: Endpoint, turns: ChatTurn[], cb: StreamCallbacks): Promise<string> {
  if (!(await hasKey(keyNameFor(ep)))) throw new Error('no API key');
  cb.onModel?.(ep.model); // Gemini serves the requested model
  void turns;
  throw new Error('Gemini cloud routing remains deferred to Rust provider implementation');
}

/**
 * Turn a failed HTTP response into a human-readable reason. Detects the common
 * "model not installed" case so the user knows exactly what to fix.
 */
async function httpError(res: Response, model: string): Promise<string> {
  let detail = '';
  try {
    const txt = await res.text();
    try {
      const j = JSON.parse(txt) as { error?: unknown };
      const e = j.error as undefined | string | { message?: string };
      detail = typeof e === 'string' ? e : e?.message ?? txt;
    } catch {
      detail = txt;
    }
  } catch {
    /* no readable body */
  }
  detail = (detail || '').slice(0, 200).trim();
  const base = `HTTP ${res.status}`;
  const missing = res.status === 404 || /not found|no such model|not installed/i.test(detail);
  if (missing) {
    return `the model "${model}" is not installed at this endpoint (${base}). Pick an installed model in the settings drawer, or run "ollama pull ${model}"`;
  }
  return detail ? `${base}: ${detail}` : base;
}

/** Deterministic offline generator — never throws, always streams. */
async function syntheticStream(
  turns: ChatTurn[],
  cb: StreamCallbacks,
  reason?: string,
): Promise<string> {
  const last = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';
  const why = reason ? `\n\nWhy the live model didn't answer: ${reason}.` : '';
  const text =
    `[LOCAL SYNTHETIC NODE] No live model answered, so this reply was generated ` +
    `offline by the harness itself.${why}\n\nReceived prompt: "${last.slice(0, 240)}"\n\n` +
    `Fix: open the settings drawer (bottom-left ">"), pick a model that is actually ` +
    `installed in the Model list, and make sure the status reads READY. For Ollama, the ` +
    `chosen model must be downloaded first.`;
  let full = '';
  const words = text.split(/(\s+)/);
  for (const w of words) {
    if (cb.signal?.aborted) break;
    full += w;
    cb.onToken(w);
    await new Promise((r) => setTimeout(r, 12));
  }
  return full;
}

async function readLines(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
  onLine: (line: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    if (signal?.aborted) {
      reader.cancel().catch(() => {});
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      onLine(line);
    }
  }
  if (buf.trim()) onLine(buf);
}
