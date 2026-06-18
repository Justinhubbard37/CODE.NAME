import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  budgetConversationTurns,
  canSendWithRuntime,
  classifyProviderFailure,
  discoverProviderModels,
  executionClassForModel,
  isOllamaCloudModel,
  modelEntryForSelection,
  reachesNetwork,
  streamChat,
} from './llm';
import type { ProviderConnection, RuntimeRequestSnapshot } from '../types';

vi.mock('./secrets', () => ({
  secretPresent: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage?: (message: string) => void;
  },
}));

import { secretPresent } from './secrets';
import { invoke } from '@tauri-apps/api/core';

const mockedSecretPresent = vi.mocked(secretPresent);
const mockedInvoke = vi.mocked(invoke);

function provider(partial: Partial<ProviderConnection> = {}): ProviderConnection {
  return {
    id: 'ollama',
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
    providerBaseUrl: providerInfo.baseUrl,
    providerKind: providerInfo.providerKind,
  };
}

function stream(body: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

describe('canonical runtime transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockedSecretPresent.mockReset();
    mockedInvoke.mockReset();
    vi.unstubAllGlobals();
  });

  it('classifies Ollama cloud suffixes while keeping ordinary Ollama local', () => {
    const ollama = provider();
    expect(isOllamaCloudModel('gpt-oss:120b-cloud')).toBe(true);
    expect(isOllamaCloudModel('gpt-oss:120b:cloud')).toBe(true);
    expect(executionClassForModel(ollama, 'llama3.1')).toBe('local');
    expect(executionClassForModel(ollama, 'gpt-oss:120b-cloud')).toBe('cloud');
    expect(reachesNetwork(ollama, 'llama3.1')).toBe(false);
    expect(reachesNetwork(ollama, 'gpt-oss:120b-cloud')).toBe(true);
  });

  it('keeps selected unavailable models visible and disables send', () => {
    const p = provider({
      models: [
        {
          id: 'llama3.1',
          displayName: 'llama3.1',
          executionClass: 'local',
          availability: 'available',
          source: 'ollama',
          discoveredAt: 1,
          capabilities: [],
        },
      ],
    });
    const selected = modelEntryForSelection(p, 'missing-model');
    expect(selected?.availability).toBe('unavailable');
    expect(canSendWithRuntime(p, selected).ok).toBe(false);
  });

  it('discovers Ollama models from the local daemon and tags cloud suffix models as cloud', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.1' }, { name: 'gpt-oss:120b-cloud' }] }),
    }));
    const result = await discoverProviderModels(provider(), true);
    expect(result.status).toBe('available');
    expect(result.models.map((model) => [model.id, model.executionClass])).toEqual([
      ['llama3.1', 'local'],
      ['gpt-oss:120b-cloud', 'cloud'],
    ]);
  });

  it('Gemini without a key does not make a discovery network request', async () => {
    mockedSecretPresent.mockResolvedValue(false);
    const result = await discoverProviderModels(provider({
      id: 'gemini',
      label: 'Gemini',
      providerKind: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      requiresNetwork: true,
      requiresSecret: true,
      secretRequirement: 'keychain',
      apiKeyEnv: 'GEMINI_API_KEY',
    }), true);
    expect(result.status).toBe('requires_api_key');
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('Gemini discovery uses the Rust command and filters generateContent models', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedSecretPresent.mockResolvedValue(true);
    mockedInvoke.mockResolvedValue([
      {
        id: 'models/gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        inputTokenLimit: 1000,
        outputTokenLimit: 2000,
        maxTemperature: 1,
        thinkingSupported: true,
        supportedGenerationMethods: ['generateContent'],
      },
      {
        id: 'models/embed',
        displayName: 'Embed',
        supportedGenerationMethods: ['embedContent'],
      },
    ]);
    const result = await discoverProviderModels(provider({
      id: 'gemini',
      label: 'Gemini',
      providerKind: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      requiresNetwork: true,
      requiresSecret: true,
      secretRequirement: 'keychain',
      apiKeyEnv: 'GEMINI_API_KEY',
    }), true);
    expect(mockedInvoke).toHaveBeenCalledWith('gemini_model_list', { keyName: 'GEMINI_API_KEY' });
    expect(result.models).toHaveLength(1);
    expect(JSON.stringify(mockedInvoke.mock.calls)).not.toContain('sk-');
  });

  it('parses LM Studio and custom OpenAI-compatible inventories through /v1/models', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'local-model' }] }),
    }));
    const lm = await discoverProviderModels(provider({
      id: 'lmstudio',
      label: 'LM Studio',
      providerKind: 'lmstudio',
      baseUrl: 'http://localhost:1234',
    }), true);
    expect(lm.models[0].source).toBe('lmstudio');

    const custom = await discoverProviderModels(provider({
      id: 'custom-openai',
      label: 'Custom',
      providerKind: 'openai-compatible',
      baseUrl: 'http://localhost:8000',
    }), true);
    expect(custom.models[0].source).toBe('openai-compatible');
  });

  it('sends Ollama cloud-tagged models to the configured local daemon', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      body: stream('{"model":"gpt-oss:120b-cloud","message":{"content":"hi"}}\n'),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const p = provider();
    const text = await streamChat(
      p,
      snapshot(p, 'gpt-oss:120b-cloud'),
      [{ role: 'user', content: 'hello' }],
      { onToken: () => {} },
    );
    expect(text).toBe('hi');
    expect(fetchSpy.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).model).toBe('gpt-oss:120b-cloud');
  });

  it('routes Gemini generation through Rust without frontend key material', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue('models/gemini-2.5-pro');
    const p = provider({
      id: 'gemini',
      label: 'Gemini',
      providerKind: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      requiresNetwork: true,
      requiresSecret: true,
      secretRequirement: 'keychain',
      apiKeyEnv: 'GEMINI_API_KEY',
    });
    await streamChat(p, snapshot(p, 'models/gemini-2.5-pro'), [{ role: 'user', content: 'hello' }], {
      onToken: () => {},
    });
    expect(mockedInvoke).toHaveBeenCalledWith(
      'model_stream',
      expect.objectContaining({
        req: expect.objectContaining({
          kind: 'gemini',
          keyName: 'GEMINI_API_KEY',
          model: 'models/gemini-2.5-pro',
        }),
      }),
    );
    expect(JSON.stringify(mockedInvoke.mock.calls)).not.toContain('AIza');
  });

  it('does not synthesize fallback text after provider failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    await expect(
      streamChat(provider(), snapshot(provider(), 'llama3.1'), [{ role: 'user', content: 'hello' }], {
        onToken: () => {},
      }),
    ).rejects.toMatchObject({
      failure: expect.objectContaining({ category: 'endpoint_unreachable' }),
    });
  });

  it('classifies structured provider failures', () => {
    const gemini = provider({
      id: 'gemini',
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
    expect(classifyProviderFailure(new Error('HTTP 400'), gemini, 'm', 'cloud').category).toBe('request_invalid');
    expect(classifyProviderFailure(new Error('invalid stream'), gemini, 'm', 'cloud').category).toBe('stream_error');
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
