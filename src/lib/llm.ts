/**
 * Canonical runtime LLM bridge.
 *
 * R1 provider execution authority lives in Rust/Tauri. This module sends only
 * logical provider/connection/model intent plus messages and tuning values.
 */
import type {
  ExecutionClass,
  ModelAvailability,
  ModelInventoryEntry,
  ProviderConnection,
  ProviderFailure,
  ProviderFailureCategory,
  ProviderKind,
  ProviderStatus,
  RuntimeRequestSnapshot,
} from '../types';

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

interface ProviderOperationResult {
  ok: boolean;
  state: ProviderStatus;
  category: ProviderFailureCategory | string;
  detail: string;
}

interface RustInventoryState {
  state: 'unknown' | 'stale' | 'current_session' | 'refreshing' | 'failed';
  count: number;
  lastRefreshAt?: number;
}

interface RustModelDto {
  id: string;
  displayLabel: string;
  availability: 'available' | 'stale' | 'unavailable' | 'unknown';
  executionClass: 'local' | 'cloud' | 'unknown';
  capabilities: string[];
}

export interface RustChatEligibility {
  eligible: boolean;
  state: ProviderStatus;
  category: string;
  detail: string;
}

interface RustConnectionDto {
  providerId: string;
  connectionId: string;
  label: string;
  approvalState: 'approved' | 'pending_approval' | 'disabled';
  transportClass?: 'loopback_http' | 'remote_https' | 'fixed_provider_api';
  locality?: 'local_loopback' | 'remote_public' | 'fixed_remote';
  credentialRequired: boolean;
  credentialConfigured: boolean;
  readiness: ProviderStatus;
  checkedThisSession: boolean;
  checkInProgress: boolean;
  refreshInProgress: boolean;
  inventory: RustInventoryState;
  models: RustModelDto[];
  chatEligibility: RustChatEligibility;
  displayEndpoint?: string;
  safeFailureCategory?: string;
  safeDetail?: string;
}

interface RustProviderSnapshot {
  connections: RustConnectionDto[];
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
  const rustModel = provider.models.find((model) => model.id === modelId);
  if (rustModel) return rustModel.executionClass;
  if (provider.providerKind === 'gemini') return 'cloud';
  if (provider.locality === 'local_loopback') return 'local';
  if (provider.locality === 'remote_public' || provider.locality === 'fixed_remote') return 'cloud';
  if (provider.requiresNetwork) return 'cloud';
  return 'unknown';
}

export function reachesNetwork(provider: ProviderConnection, modelId?: string): boolean {
  const rustModel = modelId ? provider.models.find((model) => model.id === modelId) : undefined;
  if (rustModel) return rustModel.executionClass === 'cloud';
  return provider.locality === 'remote_public' || provider.locality === 'fixed_remote' || provider.requiresNetwork;
}

export function providerStatusLabel(status: ProviderConnection['status']): string {
  const labels: Record<ProviderConnection['status'], string> = {
    ready: 'Ready',
    stale: 'Stale',
    checking: 'Checking',
    requires_api_key: 'Requires API key',
    requires_sign_in: 'Requires sign-in',
    endpoint_unavailable: 'Endpoint unavailable',
    authentication_failed: 'Authentication failed',
    permission_denied: 'Permission denied',
    quota_exhausted: 'Quota exhausted',
    model_unavailable: 'Model unavailable',
    connection_check_failed: 'Check failed',
    refresh_failed: 'Refresh failed',
    configuration_disabled: 'Disabled',
    policy_denied: 'Policy denied',
    network_denied: 'Network denied',
    unknown: 'Unknown',
    configuring: 'Checking',
    available: 'Available',
    server_offline: 'Endpoint unavailable',
    unavailable: 'Unavailable',
  };
  return labels[status];
}

export function modelAvailabilityLabel(status: ModelAvailability): string {
  const labels: Record<ModelAvailability, string> = {
    available: 'Available',
    stale: 'Stale',
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
        : provider.status === 'requires_sign_in'
          ? 'requires_sign_in'
          : provider.status === 'endpoint_unavailable' || provider.status === 'server_offline'
            ? 'server_offline'
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
  eligibility?: RustChatEligibility,
): { ok: boolean; reason: string } {
  if (!provider?.id) return { ok: false, reason: 'Select a provider.' };
  if (!model?.id) return { ok: false, reason: 'Select a model.' };
  if (!eligibility) return { ok: false, reason: 'Provider eligibility has not been checked.' };
  if (!eligibility.eligible) return { ok: false, reason: eligibility.detail || providerStatusLabel(eligibility.state) };
  return { ok: true, reason: '' };
}

function canonicalProviderId(provider: ProviderConnection): string {
  if (provider.providerKind === 'openai-compatible' || provider.providerKind === 'custom') return 'custom-openai';
  return provider.id;
}

export function connectionIdForProvider(provider: ProviderConnection): string {
  if (provider.connectionId) return provider.connectionId;
  if (provider.id.includes(':') || provider.id.startsWith('conn-')) return provider.id;
  if (provider.providerKind === 'ollama') return 'ollama:local-default';
  if (provider.providerKind === 'lmstudio') return 'lmstudio:local-default';
  if (provider.providerKind === 'gemini') return 'gemini:fixed';
  return provider.id;
}

function rustModelToInventory(
  model: RustModelDto,
  provider: ProviderConnection,
): ModelInventoryEntry {
  return {
    id: model.id,
    displayName: model.displayLabel || model.id,
    executionClass: model.executionClass === 'local' || model.executionClass === 'cloud' ? model.executionClass : 'unknown',
    availability: model.availability === 'stale' ? 'stale' : model.availability === 'available' ? 'available' : 'unknown',
    source: sourceForProvider(provider),
    discoveredAt: Date.now(),
    capabilities: model.capabilities,
  };
}

function sourceForProvider(provider: ProviderConnection): ModelInventoryEntry['source'] {
  if (provider.providerKind === 'ollama') return 'ollama';
  if (provider.providerKind === 'lmstudio') return 'lmstudio';
  if (provider.providerKind === 'gemini') return 'gemini';
  return 'openai-compatible';
}

function failureCategoryFromState(state: string): ProviderFailureCategory {
  if (state === 'requires_api_key') return 'api_key_missing';
  if (state === 'requires_sign_in') return 'sign_in_required';
  if (state === 'endpoint_unavailable') return 'endpoint_unreachable';
  if (state === 'authentication_failed') return 'authentication_failed';
  if (state === 'permission_denied') return 'permission_denied';
  if (state === 'quota_exhausted') return 'quota_exhausted';
  if (state === 'model_unavailable') return 'model_unavailable';
  if (state === 'connection_check_failed') return 'connection_check_failed';
  if (state === 'refresh_failed') return 'refresh_failed';
  if (state === 'configuration_disabled') return 'configuration_disabled';
  if (state === 'policy_denied') return 'policy_denied';
  if (state === 'network_denied') return 'network_denied';
  return 'provider_error';
}

function failureFromResult(
  result: ProviderOperationResult,
  provider: ProviderConnection,
  modelId: string,
  executionClass: ExecutionClass,
): ProviderFailure {
  const category = failureCategoryFromState(result.state) || failureCategoryFromState(result.category);
  return {
    category,
    safeMessage: result.detail || providerStatusLabel(result.state),
    retryable: category !== 'api_key_missing' && category !== 'configuration_disabled',
    providerId: provider.id,
    modelId,
    executionClass,
    nextStep: 'Use Provider Manager to check the connection or refresh models.',
  };
}

async function invokeRust<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('Provider runtime is available in the desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

async function providerSnapshot(): Promise<RustProviderSnapshot> {
  return invokeRust<RustProviderSnapshot>('provider_list_runtime_state', {});
}

function connectionFromSnapshot(
  snapshot: RustProviderSnapshot,
  provider: ProviderConnection,
): RustConnectionDto | undefined {
  const connectionId = connectionIdForProvider(provider);
  return snapshot.connections.find((connection) => connection.connectionId === connectionId)
    ?? snapshot.connections.find((connection) => connection.providerId === canonicalProviderId(provider));
}

function resultFromConnection(
  provider: ProviderConnection,
  connection: RustConnectionDto | undefined,
  fallback: ProviderOperationResult,
): Pick<ProviderConnection, 'status' | 'detail' | 'models' | 'lastFailure'> {
  const status = connection?.readiness ?? fallback.state;
  const models = (connection?.models ?? []).map((model) => rustModelToInventory(model, provider));
  const failure = fallback.ok
    ? undefined
    : failureFromResult(fallback, provider, provider.models[0]?.id ?? '', executionClassForModel(provider, provider.models[0]?.id ?? ''));
  return {
    status,
    detail: connection?.safeDetail ?? fallback.detail,
    models,
    lastFailure: failure,
  };
}

export async function loadProviderRuntimeState(current: ProviderConnection[]): Promise<ProviderConnection[]> {
  const snapshot = await providerSnapshot();
  const mapped: ProviderConnection[] = current.map((provider): ProviderConnection => {
    const connection = connectionFromSnapshot(snapshot, provider);
    if (!connection) return { ...provider, status: 'unknown', detail: 'No Rust provider connection is approved.' };
    const requiresNetwork = connection.locality === 'remote_public' || connection.locality === 'fixed_remote';
    return {
      ...provider,
      connectionId: connection.connectionId,
      baseUrl: connection.displayEndpoint ?? '',
      displayEndpoint: connection.displayEndpoint ?? '',
      approvalState: connection.approvalState,
      transportClass: connection.transportClass,
      locality: connection.locality,
      requiresSecret: connection.credentialRequired,
      credentialConfigured: connection.credentialConfigured,
      requiresNetwork,
      status: connection.readiness,
      detail: connection.safeDetail ?? providerStatusLabel(connection.readiness),
      checkedThisSession: connection.checkedThisSession,
      checkInProgress: connection.checkInProgress,
      refreshInProgress: connection.refreshInProgress,
      inventoryState: connection.inventory.state,
      inventoryCount: connection.inventory.count,
      chatEligibility: connection.chatEligibility,
      models: connection.models.map((model) => rustModelToInventory(model, provider)),
    };
  });
  const knownConnectionIds = new Set(mapped.map((provider) => provider.connectionId).filter(Boolean));
  const customTemplate = current.find((provider) => canonicalProviderId(provider) === 'custom-openai');
  for (const connection of snapshot.connections) {
    if (connection.providerId !== 'custom-openai' || knownConnectionIds.has(connection.connectionId)) continue;
    const requiresNetwork = connection.locality === 'remote_public' || connection.locality === 'fixed_remote';
    const base = customTemplate ?? {
      id: 'custom-openai',
      label: 'Custom OpenAI-compatible',
      providerKind: 'openai-compatible' as const,
      baseUrl: '',
      requiresNetwork: false,
      requiresSecret: false,
      secretRequirement: 'none' as const,
      status: 'unknown' as const,
      models: [],
    };
    mapped.push({
      ...base,
      id: connection.connectionId,
      connectionId: connection.connectionId,
      label: connection.label,
      baseUrl: connection.displayEndpoint ?? '',
      displayEndpoint: connection.displayEndpoint ?? '',
      approvalState: connection.approvalState,
      transportClass: connection.transportClass,
      locality: connection.locality,
      requiresSecret: connection.credentialRequired,
      credentialConfigured: connection.credentialConfigured,
      requiresNetwork,
      status: connection.readiness,
      detail: connection.safeDetail ?? providerStatusLabel(connection.readiness),
      checkedThisSession: connection.checkedThisSession,
      checkInProgress: connection.checkInProgress,
      refreshInProgress: connection.refreshInProgress,
      inventoryState: connection.inventory.state,
      inventoryCount: connection.inventory.count,
      chatEligibility: connection.chatEligibility,
      models: connection.models.map((model) => rustModelToInventory(model, base)),
    });
  }
  return mapped;
}

export async function providerChatEligibility(
  provider: ProviderConnection,
  modelId: string,
): Promise<RustChatEligibility> {
  return invokeRust<RustChatEligibility>('provider_chat_eligibility', {
    request: {
      providerId: canonicalProviderId(provider),
      connectionId: connectionIdForProvider(provider),
      modelId,
    },
  });
}

export async function createProviderConnection(input: {
  providerId: 'custom-openai';
  label: string;
  endpoint: string;
}): Promise<void> {
  await invokeRust<RustConnectionDto>('provider_create_connection', {
    request: {
      providerId: input.providerId,
      label: input.label,
      endpoint: input.endpoint,
    },
  });
}

export async function editProviderConnection(
  provider: ProviderConnection,
  input: { label?: string; endpoint?: string },
): Promise<void> {
  const request: Record<string, unknown> = {
    providerId: canonicalProviderId(provider),
    connectionId: connectionIdForProvider(provider),
  };
  if (input.label !== undefined) request.label = input.label;
  if (input.endpoint !== undefined) request.endpoint = input.endpoint;
  await invokeRust<RustConnectionDto>('provider_edit_connection', {
    request,
  });
}

export async function disableProviderConnection(provider: ProviderConnection): Promise<void> {
  await invokeRust<RustConnectionDto>('provider_disable_connection', {
    request: {
      providerId: canonicalProviderId(provider),
      connectionId: connectionIdForProvider(provider),
    },
  });
}

export async function deleteProviderConnection(provider: ProviderConnection): Promise<void> {
  await invokeRust<ProviderOperationResult>('provider_delete_connection', {
    request: {
      providerId: canonicalProviderId(provider),
      connectionId: connectionIdForProvider(provider),
    },
  });
}

export async function approveProviderConnection(provider: ProviderConnection): Promise<void> {
  await invokeRust<RustConnectionDto>('provider_approve_connection', {
    request: {
      providerId: canonicalProviderId(provider),
      connectionId: connectionIdForProvider(provider),
    },
  });
}

export async function storeProviderCredential(
  provider: ProviderConnection,
  value: string,
): Promise<void> {
  await invokeRust('provider_store_credential', {
    request: {
      providerId: canonicalProviderId(provider),
      connectionId: connectionIdForProvider(provider),
      value,
    },
  });
}

export async function clearProviderCredential(provider: ProviderConnection): Promise<void> {
  await invokeRust('provider_clear_credential', {
    request: {
      providerId: canonicalProviderId(provider),
      connectionId: connectionIdForProvider(provider),
    },
  });
}

export async function refreshProviderCredentialStatus(provider: ProviderConnection): Promise<void> {
  await invokeRust('provider_credential_status', {
    request: {
      providerId: canonicalProviderId(provider),
      connectionId: connectionIdForProvider(provider),
    },
  });
}

export async function checkProviderConnection(
  provider: ProviderConnection,
): Promise<Pick<ProviderConnection, 'status' | 'detail' | 'models' | 'lastFailure'>> {
  const result = await invokeRust<ProviderOperationResult>('provider_check_connection', {
    request: {
      providerId: canonicalProviderId(provider),
      connectionId: connectionIdForProvider(provider),
    },
  });
  const snapshot = await providerSnapshot();
  return resultFromConnection(provider, connectionFromSnapshot(snapshot, provider), result);
}

export async function discoverProviderModels(
  provider: ProviderConnection,
  _networkOpen: boolean,
): Promise<Pick<ProviderConnection, 'status' | 'detail' | 'models' | 'lastFailure'>> {
  const result = await invokeRust<ProviderOperationResult>('provider_refresh_models', {
    request: {
      providerId: canonicalProviderId(provider),
      connectionId: connectionIdForProvider(provider),
    },
  });
  const snapshot = await providerSnapshot();
  return resultFromConnection(provider, connectionFromSnapshot(snapshot, provider), result);
}

function httpStatusFromUnknown(err: unknown): number | undefined {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const match = message.match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : undefined;
}

function categoryFromError(
  err: unknown,
  provider: ProviderConnection,
  _modelId: string,
  executionClass: ExecutionClass,
): ProviderFailureCategory {
  if (err instanceof ProviderRequestError) return err.failure.category;
  const status = httpStatusFromUnknown(err);
  const message = err instanceof Error ? err.message : String(err ?? '');
  const lower = message.toLowerCase();
  if (lower.includes('requires_api_key') || lower.includes('api_key_missing') || lower.includes('api key')) return 'api_key_missing';
  if (provider.providerKind === 'ollama' && executionClass === 'cloud' && (status === 401 || status === 403)) return 'sign_in_required';
  if (status === 401) return 'authentication_failed';
  if (status === 403) return 'permission_denied';
  if (status === 429) return 'quota_exhausted';
  if (status === 404 || lower.includes('model_unavailable')) return 'model_unavailable';
  if (lower.includes('network_denied') || lower.includes('network gate')) return 'network_denied';
  if (lower.includes('configuration_disabled')) return 'configuration_disabled';
  if (lower.includes('refresh_failed')) return 'refresh_failed';
  if (lower.includes('connection_check_failed')) return 'connection_check_failed';
  if (lower.includes('timeout') || lower.includes('timed out')) return 'timeout';
  if (/connection refused|dns|failed|unreachable|could not connect|connection reset/.test(lower)) return 'endpoint_unreachable';
  if (/stream|sse|ndjson|unexpected token|json parse/.test(lower)) return 'stream_error';
  if (status && status >= 400) return 'provider_error';
  return 'unknown';
}

export function classifyProviderFailure(
  err: unknown,
  provider: ProviderConnection,
  modelId: string,
  executionClass: ExecutionClass,
): ProviderFailure {
  if (err instanceof ProviderRequestError) return err.failure;
  const category = categoryFromError(err, provider, modelId, executionClass);
  const httpStatus = httpStatusFromUnknown(err);
  const messages: Record<ProviderFailureCategory, { safeMessage: string; retryable: boolean; nextStep?: string }> = {
    api_key_missing: { safeMessage: 'API key is missing.', retryable: false, nextStep: 'Open Provider Manager to add an API key.' },
    sign_in_required: { safeMessage: 'Provider sign-in is required.', retryable: false },
    authentication_failed: { safeMessage: 'Provider authentication failed.', retryable: false },
    permission_denied: { safeMessage: 'Provider permission denied.', retryable: false },
    quota_exhausted: { safeMessage: 'Provider quota is exhausted.', retryable: true },
    model_unavailable: { safeMessage: 'Selected model is unavailable.', retryable: false },
    endpoint_unreachable: { safeMessage: 'Provider endpoint is unreachable.', retryable: true },
    connection_check_failed: { safeMessage: 'Provider connection check failed.', retryable: true },
    refresh_failed: { safeMessage: 'Provider model refresh failed.', retryable: true },
    configuration_disabled: { safeMessage: 'Provider connection is disabled.', retryable: false },
    policy_denied: { safeMessage: 'Provider request was denied by policy.', retryable: false },
    network_denied: { safeMessage: 'Network gate is closed.', retryable: false },
    request_invalid: { safeMessage: 'Provider rejected the request.', retryable: false },
    timeout: { safeMessage: 'Provider request timed out.', retryable: true },
    stream_error: { safeMessage: 'Provider stream was invalid.', retryable: true },
    provider_error: { safeMessage: 'Provider returned an error.', retryable: true },
    unknown: { safeMessage: 'Provider request failed.', retryable: true },
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

export async function streamChat(
  provider: ProviderConnection,
  snapshot: RuntimeRequestSnapshot,
  turns: ChatTurn[],
  cb: StreamCallbacks,
): Promise<string> {
  const executionClass = snapshot.executionClass;
  if (cb.signal?.aborted) {
    throw new ProviderRequestError({
      category: 'request_invalid',
      safeMessage: 'Provider request was cancelled before it started.',
      retryable: false,
      providerId: provider.id,
      modelId: snapshot.modelId,
      executionClass,
    });
  }
  const budgetedTurns = budgetConversationTurns(turns, snapshot.contextWindow);
  const operationId = `provider-stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  cb.onActivity?.(
    executionClass === 'cloud' ? 'network' : 'system',
    `${provider.label} - ${snapshot.modelId} - ${executionClassLabel(executionClass)}`,
  );
  const { invoke, Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<string>();
  let full = '';
  channel.onmessage = (token) => {
    full += token;
    cb.onToken(token);
  };
  const cancel = () => {
    invoke('provider_cancel_stream', { request: { operationId } }).catch(() => {});
  };
  cb.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const result = await invoke<ProviderOperationResult>('provider_stream_chat', {
      request: {
        providerId: canonicalProviderId(provider),
        connectionId: connectionIdForProvider(provider),
        modelId: snapshot.modelId,
        messages: budgetedTurns,
        tuning: {
          temperature: snapshot.temperature,
          numCtx: snapshot.contextWindow,
        },
        operationIntent: 'chat',
        operationId,
      },
      onEvent: channel,
    });
    if (!result.ok) throw new ProviderRequestError(failureFromResult(result, provider, snapshot.modelId, executionClass));
    cb.onModel?.(snapshot.modelId);
    return full;
  } catch (err) {
    if (err instanceof ProviderRequestError) throw err;
    throw new ProviderRequestError(classifyProviderFailure(err, provider, snapshot.modelId, executionClass));
  } finally {
    cb.signal?.removeEventListener('abort', cancel);
  }
}

export async function pingEndpoint(provider: ProviderConnection): Promise<{ ok: boolean; detail: string }> {
  const result = await checkProviderConnection(provider);
  return {
    ok: result.status === 'ready',
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
