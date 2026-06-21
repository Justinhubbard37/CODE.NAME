import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  budgetConversationTurns,
  canSendWithRuntime,
  checkProviderConnection,
  classifyProviderFailure,
  clearProviderCredential,
  connectionIdForProvider,
  discoverProviderModels,
  executionClassForModel,
  isOllamaCloudModel,
  loadProviderRuntimeState,
  modelEntryForSelection,
  reachesNetwork,
  streamChat,
  storeProviderCredential,
} from './llm';
import type { ProviderConnection, RuntimeRequestSnapshot } from '../types';

let lastChannel: { onmessage?: (message: string) => void } | undefined;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage?: (message: string) => void;
    constructor() {
      lastChannel = this;
    }
  },
}));

import { invoke } from '@tauri-apps/api/core';

const mockedInvoke = vi.mocked(invoke);

function provider(partial: Partial<ProviderConnection> = {}): ProviderConnection {
  return {
    id: 'ollama',
    connectionId: 'ollama:local-default',
    label: 'Ollama',
    providerKind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    requiresNetwork: false,
    requiresSecret: false,
    secretRequirement: 'none',
    status: 'unknown',
    detail: 'not refreshed',
    models: [],
    ...partial,
  };
}

function snapshot(providerInfo: ProviderConnection, modelId: string): RuntimeRequestSnapshot {
  return {
    providerId: providerInfo.id,
    providerLabel: providerInfo.label,
    modelId,
    modelLabel: modelId,
    executionClass: executionClassForModel(providerInfo, modelId),
    requestStartedAt: 1,
    outcome: 'success',
    temperature: 0.4,
    contextWindow: 4096,
  };
}

function rustModel(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    displayLabel: id,
    availability: 'available',
    executionClass: 'local',
    capabilities: [],
    ...overrides,
  };
}

function rustConnection(overrides: Record<string, unknown> = {}) {
  return {
    providerId: 'ollama',
    connectionId: 'ollama:local-default',
    label: 'Ollama',
    approvalState: 'approved',
    transportClass: 'loopback_http',
    locality: 'local_loopback',
    credentialRequired: false,
    credentialConfigured: false,
    readiness: 'ready',
    checkedThisSession: true,
    checkInProgress: false,
    refreshInProgress: false,
    inventory: { state: 'current_session', count: 1 },
    models: [rustModel('llama3.1')],
    chatEligibility: { eligible: false, state: 'model_unavailable', category: 'model_unavailable', detail: 'Select a current-session model.' },
    displayEndpoint: 'http://127.0.0.1:11434',
    ...overrides,
  };
}

function rustSnapshot(models = [rustModel('llama3.1')]) {
  return {
    connections: [rustConnection({ inventory: { state: 'current_session', count: models.length }, models })],
  };
}

describe('canonical runtime bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockedInvoke.mockReset();
    lastChannel = undefined;
  });

  it('uses Rust model metadata instead of model-name suffixes for locality display', () => {
    const ollama = provider({
      models: [{
        id: 'gpt-oss:120b-cloud',
        displayName: 'gpt-oss:120b-cloud',
        executionClass: 'local',
        availability: 'available',
        source: 'ollama',
        discoveredAt: 1,
        capabilities: [],
      }],
    });
    expect(isOllamaCloudModel('gpt-oss:120b-cloud')).toBe(true);
    expect(executionClassForModel(ollama, 'gpt-oss:120b-cloud')).toBe('local');
    expect(reachesNetwork(ollama, 'gpt-oss:120b-cloud')).toBe(false);
  });

  it('keeps stale providers visible but ineligible for send', () => {
    const p = provider({
      status: 'stale',
      models: [{
        id: 'llama3.1',
        displayName: 'llama3.1',
        executionClass: 'local',
        availability: 'available',
        source: 'ollama',
        discoveredAt: 1,
        capabilities: [],
      }],
    });
    expect(canSendWithRuntime(p, p.models[0], {
      eligible: false,
      state: 'stale',
      category: 'current_session_check_required',
      detail: 'A successful explicit connection check is required in this session.',
    })).toEqual({
      ok: false,
      reason: 'A successful explicit connection check is required in this session.',
    });
  });

  it('keeps selected unavailable models visible and disables send', () => {
    const p = provider({
      status: 'ready',
      models: [{
        id: 'llama3.1',
        displayName: 'llama3.1',
        executionClass: 'local',
        availability: 'available',
        source: 'ollama',
        discoveredAt: 1,
        capabilities: [],
      }],
    });
    const selected = modelEntryForSelection(p, 'missing-model');
    expect(selected?.availability).toBe('unavailable');
    expect(canSendWithRuntime(p, selected, {
      eligible: false,
      state: 'model_unavailable',
      category: 'model_unavailable',
      detail: 'Selected model is not in the current-session model inventory.',
    }).ok).toBe(false);
  });

  it('keeps send disabled after check succeeds until current-session inventory exists', () => {
    const p = provider({
      status: 'ready',
      models: [{
        id: 'llama3.1',
        displayName: 'llama3.1',
        executionClass: 'local',
        availability: 'available',
        source: 'ollama',
        discoveredAt: 1,
        capabilities: [],
      }],
    });
    expect(canSendWithRuntime(p, p.models[0], {
      eligible: false,
      state: 'stale',
      category: 'current_session_inventory_required',
      detail: 'Current-session model inventory is required before chat.',
    })).toEqual({
      ok: false,
      reason: 'Current-session model inventory is required before chat.',
    });
    expect(canSendWithRuntime(p, p.models[0], {
      eligible: true,
      state: 'ready',
      category: 'eligible',
      detail: 'Chat is eligible.',
    })).toEqual({ ok: true, reason: '' });
  });

  it('checks connections through Rust without endpoint or secret-name authority', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValueOnce({ ok: true, state: 'ready', category: 'ready', detail: 'ok' });
    mockedInvoke.mockResolvedValueOnce(rustSnapshot());

    const result = await checkProviderConnection(provider());

    expect(result.status).toBe('ready');
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, 'provider_check_connection', {
      request: { providerId: 'ollama', connectionId: 'ollama:local-default' },
    });
    expect(JSON.stringify(mockedInvoke.mock.calls)).not.toContain('baseUrl');
    expect(JSON.stringify(mockedInvoke.mock.calls)).not.toContain('keyName');
  });

  it('refreshes models through Rust and reads safe inventory DTOs', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValueOnce({ ok: true, state: 'ready', category: 'ready', detail: 'ok' });
    mockedInvoke.mockResolvedValueOnce(rustSnapshot([rustModel('llama3.1'), rustModel('qwen')]));

    const result = await discoverProviderModels(provider(), true);

    expect(result.models.map((model) => model.id)).toEqual(['llama3.1', 'qwen']);
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, 'provider_refresh_models', {
      request: { providerId: 'ollama', connectionId: 'ollama:local-default' },
    });
  });

  it('hydrates provider runtime state from Rust DTOs over stale frontend defaults', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValueOnce({
      connections: [
        rustConnection({
          displayEndpoint: 'http://127.0.0.1:11555',
          models: [rustModel('rust-model')],
          chatEligibility: {
            eligible: false,
            state: 'stale',
            category: 'current_session_inventory_required',
            detail: 'Current-session model inventory is required before chat.',
          },
        }),
        rustConnection({
          providerId: 'custom-openai',
          connectionId: 'custom-openai:1',
          label: 'Remote A',
          transportClass: 'remote_https',
          locality: 'remote_public',
          credentialRequired: true,
          credentialConfigured: false,
          displayEndpoint: 'https://api-a.example.com/v1',
          models: [rustModel('a', { executionClass: 'cloud' })],
        }),
        rustConnection({
          providerId: 'custom-openai',
          connectionId: 'custom-openai:2',
          label: 'Remote B',
          transportClass: 'remote_https',
          locality: 'remote_public',
          credentialRequired: true,
          credentialConfigured: true,
          displayEndpoint: 'https://api-b.example.com/v1',
          models: [rustModel('b', { executionClass: 'cloud' })],
        }),
      ],
    });

    const hydrated = await loadProviderRuntimeState([
      provider({
        baseUrl: 'http://tampered.example',
        models: [{
          id: 'tampered-model',
          displayName: 'tampered-model',
          executionClass: 'cloud',
          availability: 'available',
          source: 'configured',
          discoveredAt: 1,
          capabilities: [],
        }],
      }),
      provider({
        id: 'custom-openai',
        label: 'Custom OpenAI-compatible',
        providerKind: 'openai-compatible',
        baseUrl: '',
        requiresNetwork: false,
        requiresSecret: false,
        secretRequirement: 'none',
      }),
    ]);

    expect(hydrated.find((p) => p.id === 'ollama')?.baseUrl).toBe('http://127.0.0.1:11555');
    expect(hydrated.find((p) => p.id === 'ollama')?.models.map((model) => model.id)).toEqual(['rust-model']);
    const customConnections = hydrated.filter((p) => p.providerKind === 'openai-compatible' && p.connectionId?.startsWith('custom-openai:'));
    expect(customConnections.map((p) => p.connectionId)).toEqual(['custom-openai:1', 'custom-openai:2']);
    expect(customConnections.map((p) => p.requiresSecret)).toEqual([true, true]);
  });

  it('streams chat through Rust without renderer fetch or provider endpoint payload', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'provider_stream_chat') {
        lastChannel?.onmessage?.('hi');
        expect(JSON.stringify(args)).not.toContain('baseUrl');
        expect(JSON.stringify(args)).not.toContain('Authorization');
        expect(JSON.stringify(args)).not.toContain('keyName');
        return { ok: true, state: 'ready', category: 'ready', detail: 'done' };
      }
      return { ok: true, state: 'unknown', category: 'cancelled', detail: 'none' };
    });

    const text = await streamChat(
      provider({ status: 'ready' }),
      snapshot(provider({ status: 'ready' }), 'llama3.1'),
      [{ role: 'user', content: 'hello' }],
      { onToken: () => {} },
    );

    expect(text).toBe('hi');
    expect(mockedInvoke.mock.calls[0][0]).toBe('provider_stream_chat');
  });

  it('stores and clears provider credentials without frontend-selected key names', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue({ providerId: 'gemini', connectionId: 'gemini:fixed', required: true, configured: true });
    const gemini = provider({
      id: 'gemini',
      connectionId: 'gemini:fixed',
      label: 'Gemini',
      providerKind: 'gemini',
      requiresNetwork: true,
      requiresSecret: true,
      secretRequirement: 'keychain',
    });

    await storeProviderCredential(gemini, 'test-secret');
    await clearProviderCredential(gemini);

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, 'provider_store_credential', {
      request: { providerId: 'gemini', connectionId: 'gemini:fixed', value: 'test-secret' },
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, 'provider_clear_credential', {
      request: { providerId: 'gemini', connectionId: 'gemini:fixed' },
    });
    expect(JSON.stringify(mockedInvoke.mock.calls)).not.toContain('keyName');
    expect(JSON.stringify(mockedInvoke.mock.calls)).not.toContain('credentialBinding');
  });

  it('does not dispatch a provider stream when the abort signal is already aborted', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const ctl = new AbortController();
    ctl.abort();

    await expect(
      streamChat(provider({ status: 'ready' }), snapshot(provider({ status: 'ready' }), 'llama3.1'), [{ role: 'user', content: 'hello' }], {
        signal: ctl.signal,
        onToken: () => {},
      }),
    ).rejects.toMatchObject({
      failure: expect.objectContaining({ category: 'request_invalid' }),
    });
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('does not synthesize fallback text after provider failure', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue({
      ok: false,
      state: 'endpoint_unavailable',
      category: 'endpoint_unavailable',
      detail: 'Provider endpoint was unavailable.',
    });

    await expect(
      streamChat(provider({ status: 'ready' }), snapshot(provider({ status: 'ready' }), 'llama3.1'), [{ role: 'user', content: 'hello' }], {
        onToken: () => {},
      }),
    ).rejects.toMatchObject({
      failure: expect.objectContaining({ category: 'endpoint_unreachable' }),
    });
  });

  it('maps connection IDs without creating a fake custom local default', () => {
    expect(connectionIdForProvider(provider())).toBe('ollama:local-default');
    expect(connectionIdForProvider(provider({ id: 'lmstudio', providerKind: 'lmstudio', connectionId: undefined }))).toBe('lmstudio:local-default');
    expect(connectionIdForProvider(provider({ id: 'custom-openai', providerKind: 'openai-compatible', connectionId: undefined }))).toBe('custom-openai');
  });

  it('classifies structured provider failures', () => {
    const gemini = provider({
      id: 'gemini',
      connectionId: 'gemini:fixed',
      label: 'Gemini',
      providerKind: 'gemini',
      requiresNetwork: true,
      requiresSecret: true,
      secretRequirement: 'keychain',
    });
    expect(classifyProviderFailure(new Error('api_key_missing'), gemini, 'm', 'cloud').category).toBe('api_key_missing');
    expect(classifyProviderFailure(new Error('HTTP 401'), gemini, 'm', 'cloud').category).toBe('authentication_failed');
    expect(classifyProviderFailure(new Error('HTTP 403'), gemini, 'm', 'cloud').category).toBe('permission_denied');
    expect(classifyProviderFailure(new Error('HTTP 429'), gemini, 'm', 'cloud').category).toBe('quota_exhausted');
    expect(classifyProviderFailure(new Error('network_denied'), gemini, 'm', 'cloud').category).toBe('network_denied');
  });

  it('applies context window as an application-side history budget', () => {
    const turns = [
      { role: 'system' as const, content: 'system' },
      { role: 'user' as const, content: 'a'.repeat(200) },
      { role: 'assistant' as const, content: 'b'.repeat(200) },
      { role: 'user' as const, content: 'latest' },
    ];
    const budgeted = budgetConversationTurns(turns, 16);
    expect(budgeted[0].role).toBe('system');
    expect(budgeted.at(-1)?.content).toBe('latest');
    expect(budgeted.length).toBeLessThan(turns.length);
  });
});
