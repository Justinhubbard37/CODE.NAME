import { afterEach, describe, it, expect, vi } from 'vitest';
import { classifyEndpoint, pingEndpoint, reachesNetwork, streamChat } from './llm';
import type { Endpoint } from '../types';

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

function ep(partial: Partial<Endpoint>): Endpoint {
  return {
    id: 'x',
    label: 'x',
    kind: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3.1',
    isLocal: true,
    status: 'offline',
    ...partial,
  };
}

describe('reachesNetwork (what the Network gate governs)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockedSecretPresent.mockReset();
    mockedInvoke.mockReset();
    vi.unstubAllGlobals();
  });

  it('local Ollama classifies as local-only by default', () => {
    const c = classifyEndpoint(ep({ kind: 'ollama', isLocal: true, model: 'gemma4:26b' }));
    expect(c.networkClass).toBe('local-only');
    expect(c.runsLocalOnly).toBe(true);
    expect(reachesNetwork(ep({ kind: 'ollama', isLocal: true, model: 'gemma4:26b' }))).toBe(false);
  });

  it('local LM Studio classifies as local-only by default', () => {
    const c = classifyEndpoint(ep({ kind: 'lmstudio', isLocal: true, model: 'local-model' }));
    expect(c.networkClass).toBe('local-only');
    expect(c.requiresNetwork).toBe(false);
  });

  it('Gemini classifies as cloud even if marked local', () => {
    const c = classifyEndpoint(
      ep({
        kind: 'gemini',
        isLocal: true,
        networkClass: 'local-only',
        runsLocalOnly: true,
        model: 'gemini-2.0-flash',
      }),
    );
    expect(c.networkClass).toBe('cloud');
    expect(c.requiresNetwork).toBe(true);
    expect(c.secretRequirement).toBe('keychain');
  });

  it('custom endpoint defaults cloud-capable even on localhost', () => {
    const c = classifyEndpoint(ep({ kind: 'custom', isLocal: true, baseUrl: 'http://localhost:8000' }));
    expect(c.networkClass).toBe('cloud-capable');
    expect(c.requiresNetwork).toBe(true);
  });

  it('explicit local-only custom endpoint is supported only when configured', () => {
    const c = classifyEndpoint(
      ep({
        kind: 'custom',
        isLocal: true,
        networkClass: 'local-only',
        runsLocalOnly: true,
        baseUrl: 'http://localhost:8000',
      }),
    );
    expect(c.networkClass).toBe('local-only');
    expect(c.requiresNetwork).toBe(false);
  });

  it('an Ollama cloud model on the local daemon classifies as cloud-capable', () => {
    const c = classifyEndpoint(
      ep({ kind: 'ollama', isLocal: true, networkClass: 'local-only', model: 'gpt-oss:120b-cloud' }),
    );
    expect(c.networkClass).toBe('cloud-capable');
    expect(c.requiresNetwork).toBe(true);
  });

  it('an explicit usesCloud flag reaches the network even when marked local', () => {
    expect(reachesNetwork(ep({ isLocal: true, usesCloud: true }))).toBe(true);
  });

  it('does not treat frontend VITE API key values as runtime secret fallback', async () => {
    mockedSecretPresent.mockResolvedValue(false);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const status = await pingEndpoint(ep({
      kind: 'gemini',
      isLocal: false,
      apiKeyEnv: 'GEMINI_API_KEY',
    }));

    expect(status).toEqual({ ok: false, detail: 'no API key' });
    expect(mockedSecretPresent).toHaveBeenCalledWith('GEMINI_API_KEY');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('marks Gemini cloud execution as deferred instead of using a frontend key', async () => {
    mockedSecretPresent.mockResolvedValue(true);
    const tokens: string[] = [];
    const activity: string[] = [];

    const text = await streamChat(
      ep({ kind: 'gemini', isLocal: false, apiKeyEnv: 'GEMINI_API_KEY', model: 'gemini-2.0-flash' }),
      { id: 'p', name: 'p', endpointId: 'x', temperature: 0.2, contextWindow: 1024 },
      [{ role: 'user', content: 'hello' }],
      {
        onToken: (tok) => tokens.push(tok),
        onActivity: (_kind, msg) => activity.push(msg),
      },
    );

    expect(text).toContain('[LOCAL SYNTHETIC NODE]');
    expect(text).toContain('Gemini cloud routing remains deferred to Rust provider implementation');
    expect(tokens.join('')).toBe(text);
    expect(activity.some((msg) => msg.includes('Gemini cloud routing remains deferred'))).toBe(true);
  });

  it('cloud path routes through Rust without frontend raw fallback secrets', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue('served-model');
    const tokens: string[] = [];

    await streamChat(
      ep({
        kind: 'custom',
        isLocal: false,
        networkClass: 'cloud-capable',
        apiKeyEnv: 'CUSTOM_API_KEY',
      }),
      { id: 'p', name: 'p', endpointId: 'x', temperature: 0.2, contextWindow: 1024 },
      [{ role: 'user', content: 'hello' }],
      { onToken: (tok) => tokens.push(tok) },
    );

    expect(mockedInvoke).toHaveBeenCalledWith(
      'model_stream',
      expect.objectContaining({
        req: expect.objectContaining({
          keyName: 'CUSTOM_API_KEY',
          networkClass: 'cloud-capable',
          runsLocalOnly: false,
          usesCloud: false,
        }),
      }),
    );
    const payload = mockedInvoke.mock.calls[0]?.[1] as { req?: Record<string, unknown> };
    expect(payload.req).not.toHaveProperty('fallbackKey');
    expect(payload.req).not.toHaveProperty('fallback_key');
    expect(JSON.stringify(payload)).not.toContain('sk-test');
  });

  it('synthetic fallback remains distinct', async () => {
    mockedSecretPresent.mockResolvedValue(true);
    const tokens: string[] = [];
    const text = await streamChat(
      ep({ kind: 'gemini', isLocal: false, apiKeyEnv: 'GEMINI_API_KEY' }),
      { id: 'p', name: 'p', endpointId: 'x', temperature: 0.2, contextWindow: 1024 },
      [{ role: 'user', content: 'hello' }],
      { onToken: (tok) => tokens.push(tok) },
    );

    expect(text).toContain('[LOCAL SYNTHETIC NODE]');
    expect(tokens.join('')).toBe(text);
  });
});
