/**
 * Canonical runtime LLM transport.
 *
 * Normal chat requests route through the active Runtime Profile snapshot. This
 * module never falls back to synthetic generation after provider failure.
 */
import type {
  ExecutionClass,
  ModelAvailability,
  ModelInventoryEntry,
  ProviderConnection,
  ProviderFailure,
  ProviderFailureCategory,
  ProviderKind,
  RuntimeRequestSnapshot,
} from '../types';
import { secretPresent } from './secrets';

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onActivity?: (kind: 'network' | 'reasoning' | 'tool' | 'system', text: string) => void;
  onModel?: (model: string) => void;
  signal?: AbortSignal;
}

export class ProviderRequestError extends Error {
  failure: ProviderFailure;

  constructor(failure: ProviderFailure) {
    super(failure.safeMessage);
    this.name = 'ProviderRequestError';
    this.failure = failure;
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isOllamaCloudModel(modelId: string): boolean {
  const lowered = modelId.toLowerCase();
  return lowered.endsWith(':cloud') || lowered.endsWith('-cloud');
}

export function executionClassForModel(provider: ProviderConnection, modelId: string): ExecutionClass {
  if (!provider.id || !modelId) return 'unknown';
  if (provider.providerKind === 'ollama') return isOllamaCloudModel(modelId) ? 'cloud' : 'local';
  if (provider.providerKind === 'gemini') return 'cloud';
  if (provider.requiresNetwork) return 'cloud';
  return 'local';
}

export function reachesNetwork(provider: ProviderConnection, modelId?: string): boolean {
  return provider.requiresNetwork || (provider.providerKind === 'ollama' && !!modelId && isOllamaCloudModel(modelId));
}

export function providerStatusLabel(status: ProviderConnection['status']): string {
  const labels: Record<ProviderConnection['status'], string> = {
    ready: 'Ready',
    available: 'Available',
    requires_api_key: 'Requires API key',
    requires_sign_in: 'Requires sign-in',
    server_offline: 'Server offline',
    unavailable: 'Unavailable',
    unknown: 'Unknown',
    configuring: 'Unavailable',
  };
  return labels[status];
}

export function modelAvailabilityLabel(status: ModelAvailability): string {
  const labels: Record<ModelAvailability, string> = {
    available: 'Available',
    ready: 'Ready',
    requires_api_key: 'Requires API key',
    requires_sign_in: 'Requires sign-in',
    server_offline: 'Server offline',
    unavailable: 'Unavailable',
    unknown: 'Unknown',
  };
  return labels[status];
}

export function executionClassLabel(executionClass: ExecutionClass): string {
  if (executionClass === 'local') return 'Local';
  if (executionClass === 'cloud') return 'Cloud';
  if (executionClass === 'sidecar') return 'Sidecar';
  return 'Unknown';
}

export function keyNameForProvider(provider: ProviderConnection): string | undefined {
  if (provider.apiKeyEnv) return provider.apiKeyEnv;
  if (provider.providerKind === 'gemini') return 'GEMINI_API_KEY';
  return undefined;
}

export function modelEntryForSelection(
  provider: ProviderConnection | undefined,
  modelId: string,
): ModelInventoryEntry | undefined {
  if (!provider || !modelId) return undefined;
  const found = provider.models.find((model) => model.id === modelId);
  if (found) return found;
  return {
    id: modelId,
    displayName: modelId,
    executionClass: executionClassForModel(provider, modelId),
    availability:
      provider.status === 'requires_api_key'
        ? 'requires_api_key'
        : provider.status === 'server_offline'
          ? 'server_offline'
          : provider.status === 'requires_sign_in'
            ? 'requires_sign_in'
            : 'unavailable',
    source: 'configured',
    discoveredAt: 0,
    capabilities: [],
  };
}

export function isModelSelectable(model: ModelInventoryEntry): boolean {
  return model.availability === 'available' || model.availability === 'ready' || model.availability === 'unknown';
}

export function canSendWithRuntime(
  provider: ProviderConnection | undefined,
  model: ModelInventoryEntry | undefined,
): { ok: boolean; reason: string } {
  if (!provider?.id) return { ok: false, reason: 'Select a provider.' };
  if (!model?.id) return { ok: false, reason: 'Select a model.' };
  if (provider.status === 'requires_api_key' || model.availability === 'requires_api_key') {
    return { ok: false, reason: 'API key is missing.' };
  }
  if (provider.status === 'requires_sign_in' || model.availability === 'requires_sign_in') {
    return { ok: false, reason: 'Provider sign-in is required.' };
  }
  if (provider.status === 'server_offline' || model.availability === 'server_offline') {
    return { ok: false, reason: 'Provider server is unavailable.' };
  }
  if (model.availability === 'unavailable') {
    return { ok: false, reason: 'Selected model is unavailable.' };
  }
  return { ok: true, reason: '' };
}

function safeBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

function providerKindForShell(kind: ProviderKind): string {
  if (kind === 'openai-compatible') return 'custom';
  return kind;
}

function nowModel(
  id: string,
  provider: ProviderConnection,
  source: ModelInventoryEntry['source'],
): ModelInventoryEntry {
  return {
    id,
    displayName: id,
    executionClass: executionClassForModel(provider, id),
    availability: 'available',
    source,
    discoveredAt: Date.now(),
    capabilities: [],
  };
}

function geminiModelFromShell(raw: Record<string, unknown>): ModelInventoryEntry {
  const id = String(raw.id ?? raw.name ?? '');
  const methods = Array.isArray(raw.supportedGenerationMethods)
    ? raw.supportedGenerationMethods.map(String)
    : [];
  return {
    id,
    displayName: String(raw.displayName ?? id),
    executionClass: 'cloud',
    availability: 'available',
    source: 'gemini',
    discoveredAt: Date.now(),
    capabilities: methods,
    inputTokenLimit: typeof raw.inputTokenLimit === 'number' ? raw.inputTokenLimit : undefined,
    outputTokenLimit: typeof raw.outputTokenLimit === 'number' ? raw.outputTokenLimit : undefined,
    maxTemperature: typeof raw.maxTemperature === 'number' ? raw.maxTemperature : undefined,
    thinkingSupported: raw.thinkingSupported === true,
  };
}

async function shellModelList(provider: ProviderConnection, modelId = ''): Promise<string[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string[]>('model_list', {
    kind: providerKindForShell(provider.providerKind),
    baseUrl: provider.baseUrl,
    keyName: keyNameForProvider(provider),
    model: modelId,
    networkClass: provider.requiresNetwork ? 'cloud-capable' : 'local-only',
    runsLocalOnly: !provider.requiresNetwork,
    usesCloud: provider.providerKind === 'ollama' && isOllamaCloudModel(modelId),
  });
}

export async function discoverProviderModels(
  provider: ProviderConnection,
  networkOpen: boolean,
): Promise<Pick<ProviderConnection, 'status' | 'detail' | 'models' | 'lastFailure'>> {
  if (provider.requiresNetwork && !networkOpen) {
    return {
      status: 'unavailable',
      detail: 'Network gate closed.',
      models: [],
      lastFailure: classifyProviderFailure(new Error('network gate closed'), provider, '', 'cloud'),
    };
  }

  const keyName = keyNameForProvider(provider);
  if (provider.requiresSecret && keyName && !(await secretPresent(keyName))) {
    return {
      status: 'requires_api_key',
      detail: 'API key is missing.',
      models: [],
      lastFailure: undefined,
    };
  }

  try {
    if (provider.providerKind === 'gemini') {
      if (!isTauri()) {
        return {
          status: 'unavailable',
          detail: 'Gemini discovery is available in the desktop app.',
          models: [],
          lastFailure: undefined,
        };
      }
      const { invoke } = await import('@tauri-apps/api/core');
      const raw = await invoke<Record<string, unknown>[]>('gemini_model_list', {
        keyName: keyName ?? 'GEMINI_API_KEY',
      });
      const models = raw
        .map(geminiModelFromShell)
        .filter((model) => model.id && model.capabilities.includes('generateContent'));
      return {
        status: models.length ? 'available' : 'unavailable',
        detail: models.length ? `${models.length} compatible model(s).` : 'No generateContent models returned.',
        models,
        lastFailure: undefined,
      };
    }

    if ((provider.requiresNetwork || isTauri()) && provider.providerKind !== 'ollama') {
      const models = await shellModelList(provider);
      return {
        status: models.length ? 'available' : 'unavailable',
        detail: models.length ? `${models.length} model(s).` : 'No models returned.',
        models: models.map((id) =>
          nowModel(
            id,
            provider,
            provider.providerKind === 'lmstudio' ? 'lmstudio' : provider.providerKind === 'custom' ? 'custom' : 'openai-compatible',
          ),
        ),
        lastFailure: undefined,
      };
    }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const url =
      provider.providerKind === 'ollama'
        ? `${safeBase(provider.baseUrl)}/api/tags`
        : `${safeBase(provider.baseUrl)}/v1/models`;
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const failure = classifyProviderFailure({ status: res.status }, provider, '', 'unknown');
      return {
        status: failure.category === 'endpoint_unreachable' ? 'server_offline' : 'unavailable',
        detail: failure.safeMessage,
        models: [],
        lastFailure: failure,
      };
    }
    const body = (await res.json()) as { models?: { name?: string }[]; data?: { id?: string }[] };
    const ids =
      provider.providerKind === 'ollama'
        ? (body.models ?? []).map((m) => m.name).filter((id): id is string => !!id)
        : (body.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
    const source = provider.providerKind === 'ollama' ? 'ollama' : provider.providerKind === 'lmstudio' ? 'lmstudio' : 'openai-compatible';
    return {
      status: ids.length ? 'available' : 'unavailable',
      detail: ids.length ? `${ids.length} model(s).` : 'No models returned.',
      models: ids.map((id) => nowModel(id, provider, source)),
      lastFailure: undefined,
    };
  } catch (err) {
    const failure = classifyProviderFailure(err, provider, '', 'unknown');
    return {
      status: failure.category === 'timeout' ? 'unavailable' : 'server_offline',
      detail: failure.safeMessage,
      models: [],
      lastFailure: failure,
    };
  }
}

function httpStatusFromUnknown(err: unknown): number | undefined {
  if (typeof err === 'object' && err && 'status' in err && typeof (err as { status?: unknown }).status === 'number') {
    return (err as { status: number }).status;
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  const match = message.match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : undefined;
}

function categoryFromError(
  err: unknown,
  provider: ProviderConnection,
  modelId: string,
  executionClass: ExecutionClass,
): ProviderFailureCategory {
  const status = httpStatusFromUnknown(err);
  const message = err instanceof Error ? err.message : String(err ?? '');
  const lower = message.toLowerCase();
  if (lower.includes('api_key_missing') || lower.includes('no api key') || lower.includes('api key is missing')) {
    return 'api_key_missing';
  }
  if (
    provider.providerKind === 'ollama' &&
    executionClass === 'cloud' &&
    (status === 401 || status === 403 || lower.includes('sign in') || lower.includes('signin'))
  ) {
    return 'sign_in_required';
  }
  if (status === 401) return 'authentication_failed';
  if (status === 403) return 'permission_denied';
  if (status === 429) return 'quota_exhausted';
  if (status === 404 || /model.*(missing|not found|unavailable)|no such model/.test(lower)) return 'model_unavailable';
  if (status === 400) return 'request_invalid';
  if (lower.includes('timeout') || lower.includes('timed out') || (err instanceof DOMException && err.name === 'AbortError')) {
    return 'timeout';
  }
  if (/connection refused|dns|failed to fetch|networkerror|unreachable|could not connect|connection reset/.test(lower)) {
    return 'endpoint_unreachable';
  }
  if (/invalid stream|stream_error|sse|ndjson|unexpected token|json parse|unterminated string/.test(lower)) {
    return 'stream_error';
  }
  if (status && status >= 400) return 'provider_error';
  return 'unknown';
}

export function classifyProviderFailure(
  err: unknown,
  provider: ProviderConnection,
  modelId: string,
  executionClass: ExecutionClass,
): ProviderFailure {
  const category = categoryFromError(err, provider, modelId, executionClass);
  const httpStatus = httpStatusFromUnknown(err);
  const messages: Record<ProviderFailureCategory, { safeMessage: string; retryable: boolean; nextStep?: string }> = {
    api_key_missing: {
      safeMessage: 'API key is missing.',
      retryable: false,
      nextStep: 'Open Provider Manager to add an API key.',
    },
    sign_in_required: {
      safeMessage: 'Ollama sign-in required for this cloud model.',
      retryable: false,
      nextStep: 'Sign in to Ollama, then retry.',
    },
    authentication_failed: {
      safeMessage: 'Provider authentication failed.',
      retryable: false,
      nextStep: 'Check the provider credential in Provider Manager.',
    },
    permission_denied: {
      safeMessage: 'Provider permission denied.',
      retryable: false,
      nextStep: 'Check account access for this provider and model.',
    },
    quota_exhausted: {
      safeMessage: 'Provider quota is exhausted.',
      retryable: true,
      nextStep: 'Wait for quota to reset or choose another model.',
    },
    model_unavailable: {
      safeMessage: 'Selected model is unavailable.',
      retryable: false,
      nextStep: 'Choose an available model from the model selector.',
    },
    endpoint_unreachable: {
      safeMessage:
        provider.providerKind === 'lmstudio'
          ? 'LM Studio server is unavailable.'
          : provider.providerKind === 'ollama'
            ? 'Ollama server is unavailable.'
            : 'Provider endpoint is unreachable.',
      retryable: true,
      nextStep:
        provider.providerKind === 'lmstudio'
          ? 'Start the LM Studio local server, then retry.'
          : provider.providerKind === 'ollama'
            ? 'Start the Ollama local daemon, then retry.'
            : 'Check the provider endpoint, then retry.',
    },
    request_invalid: {
      safeMessage: 'Provider rejected the request.',
      retryable: false,
      nextStep: 'Check model settings and request content.',
    },
    timeout: {
      safeMessage: 'Provider request timed out.',
      retryable: true,
      nextStep: 'Retry or choose a different model.',
    },
    stream_error: {
      safeMessage: 'Provider stream was invalid.',
      retryable: true,
      nextStep: 'Retry or refresh the provider connection.',
    },
    provider_error: {
      safeMessage: 'Provider returned an error.',
      retryable: true,
      nextStep: 'Retry or choose another model.',
    },
    unknown: {
      safeMessage: 'Provider request failed.',
      retryable: true,
      nextStep: 'Retry or check Provider Manager.',
    },
  };
  return {
    category,
    httpStatus,
    providerId: provider.id,
    modelId,
    executionClass,
    ...messages[category],
  };
}

function throwFailure(
  err: unknown,
  provider: ProviderConnection,
  modelId: string,
  executionClass: ExecutionClass,
): never {
  if (err instanceof ProviderRequestError) throw err;
  throw new ProviderRequestError(classifyProviderFailure(err, provider, modelId, executionClass));
}

function modelForWire(modelId: string): string {
  return modelId.startsWith('models/') ? modelId.slice('models/'.length) : modelId;
}

async function httpError(res: Response): Promise<Error> {
  let safe = `HTTP ${res.status}`;
  try {
    const text = (await res.text()).slice(0, 500);
    const parsed = JSON.parse(text) as { error?: unknown };
    const error = parsed.error as string | { message?: string } | undefined;
    const detail = typeof error === 'string' ? error : error?.message;
    if (detail) safe = `HTTP ${res.status}: ${detail.slice(0, 200)}`;
  } catch {
    /* keep status-only failure */
  }
  return new Error(safe);
}

export function budgetConversationTurns(turns: ChatTurn[], contextWindow: number): ChatTurn[] {
  const systemTurns = turns.filter((turn) => turn.role === 'system');
  const bodyTurns = turns.filter((turn) => turn.role !== 'system');
  const maxChars = Math.max(1, contextWindow) * 4;
  const kept: ChatTurn[] = [];
  let used = systemTurns.reduce((sum, turn) => sum + turn.content.length, 0);
  for (const turn of [...bodyTurns].reverse()) {
    const cost = turn.content.length;
    if (kept.length > 0 && used + cost > maxChars) break;
    kept.unshift(turn);
    used += cost;
  }
  return [...systemTurns, ...kept];
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
      await reader.cancel().catch(() => {});
      throw new Error('timeout');
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

async function streamOllama(
  provider: ProviderConnection,
  snapshot: RuntimeRequestSnapshot,
  turns: ChatTurn[],
  cb: StreamCallbacks,
): Promise<string> {
  const res = await fetch(`${safeBase(provider.baseUrl)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: cb.signal,
    body: JSON.stringify({
      model: modelForWire(snapshot.modelId),
      messages: turns.filter((turn) => turn.role !== 'system'),
      stream: true,
      options: {
        temperature: snapshot.temperature,
        num_ctx: snapshot.contextWindow,
      },
    }),
  });
  if (!res.ok) throw await httpError(res);
  if (!res.body) throw new Error('invalid stream: no response body');
  let full = '';
  let reported = false;
  let parsed = false;
  await readLines(res.body, cb.signal, (line) => {
    if (!line.trim()) return;
    const json = JSON.parse(line) as { model?: string; message?: { content?: string } };
    parsed = true;
    if (!reported && json.model) {
      reported = true;
      cb.onModel?.(json.model);
    }
    const token = json.message?.content ?? '';
    if (token) {
      full += token;
      cb.onToken(token);
    }
  });
  if (!parsed) throw new Error('invalid stream: NDJSON response was empty');
  return full;
}

async function streamOpenAICompatible(
  provider: ProviderConnection,
  snapshot: RuntimeRequestSnapshot,
  turns: ChatTurn[],
  cb: StreamCallbacks,
): Promise<string> {
  const res = await fetch(`${safeBase(provider.baseUrl)}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: cb.signal,
    body: JSON.stringify({
      model: snapshot.modelId,
      messages: turns,
      stream: true,
      temperature: snapshot.temperature,
    }),
  });
  if (!res.ok) throw await httpError(res);
  if (!res.body) throw new Error('invalid stream: no response body');
  let full = '';
  let reported = false;
  let parsed = false;
  await readLines(res.body, cb.signal, (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    const json = JSON.parse(payload) as {
      model?: string;
      choices?: { delta?: { content?: string } }[];
    };
    parsed = true;
    if (!reported && json.model) {
      reported = true;
      cb.onModel?.(json.model);
    }
    const token = json.choices?.[0]?.delta?.content ?? '';
    if (token) {
      full += token;
      cb.onToken(token);
    }
  });
  if (!parsed) throw new Error('invalid stream: SSE response was empty');
  return full;
}

async function streamModelViaShell(
  provider: ProviderConnection,
  snapshot: RuntimeRequestSnapshot,
  turns: ChatTurn[],
  cb: StreamCallbacks,
): Promise<string> {
  const { invoke, Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<string>();
  let full = '';
  channel.onmessage = (token) => {
    full += token;
    cb.onToken(token);
  };
  const served = await invoke<string>('model_stream', {
    req: {
      kind: providerKindForShell(provider.providerKind),
      baseUrl: provider.baseUrl,
      model: snapshot.modelId,
      keyName: keyNameForProvider(provider),
      networkClass: reachesNetwork(provider, snapshot.modelId) ? 'cloud-capable' : 'local-only',
      runsLocalOnly: !reachesNetwork(provider, snapshot.modelId),
      usesCloud: provider.providerKind === 'ollama' && isOllamaCloudModel(snapshot.modelId),
      temperature: snapshot.temperature,
      numCtx: snapshot.contextWindow,
      messages: turns,
    },
    onEvent: channel,
  });
  if (served) cb.onModel?.(served);
  return full;
}

export async function streamChat(
  provider: ProviderConnection,
  snapshot: RuntimeRequestSnapshot,
  turns: ChatTurn[],
  cb: StreamCallbacks,
): Promise<string> {
  const executionClass = snapshot.executionClass;
  const budgetedTurns = budgetConversationTurns(turns, snapshot.contextWindow);
  cb.onActivity?.('network', `${provider.label} · ${snapshot.modelId} · ${executionClassLabel(executionClass)}`);
  try {
    if (provider.providerKind === 'gemini') {
      if (!isTauri()) throw new Error('Gemini generation is available in the desktop app.');
      return await streamModelViaShell(provider, snapshot, budgetedTurns, cb);
    }
    if (provider.providerKind === 'ollama') {
      return await streamOllama(provider, snapshot, budgetedTurns, cb);
    }
    if (reachesNetwork(provider, snapshot.modelId) && isTauri()) {
      return await streamModelViaShell(provider, snapshot, budgetedTurns, cb);
    }
    return await streamOpenAICompatible(provider, snapshot, budgetedTurns, cb);
  } catch (err) {
    throwFailure(err, provider, snapshot.modelId, executionClass);
  }
}

export async function pingEndpoint(provider: ProviderConnection): Promise<{ ok: boolean; detail: string }> {
  const result = await discoverProviderModels(provider, true);
  return {
    ok: result.status === 'ready' || result.status === 'available',
    detail: result.detail ?? providerStatusLabel(result.status),
  };
}

export async function listModels(provider: ProviderConnection): Promise<string[]> {
  const result = await discoverProviderModels(provider, true);
  return result.models.map((model) => model.id);
}

export function classifyEndpoint(provider: ProviderConnection): {
  providerKind: ProviderKind;
  networkClass: 'local-only' | 'cloud' | 'cloud-capable' | 'unknown';
  runsLocalOnly: boolean;
  requiresNetwork: boolean;
  cloudCapable: boolean;
  secretRequirement: ProviderConnection['secretRequirement'];
  requiresSecret: boolean;
} {
  const requiresNetwork = provider.requiresNetwork;
  return {
    providerKind: provider.providerKind,
    networkClass: requiresNetwork ? 'cloud-capable' : 'local-only',
    runsLocalOnly: !requiresNetwork,
    requiresNetwork,
    cloudCapable: requiresNetwork,
    secretRequirement: provider.secretRequirement,
    requiresSecret: provider.requiresSecret,
  };
}
