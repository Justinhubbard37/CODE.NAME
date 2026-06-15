import { afterEach, describe, it, expect, vi } from 'vitest';
import { pingEndpoint, reachesNetwork, streamChat } from './llm';
import type { Endpoint } from '../types';

vi.mock('./secrets', () => ({
  secretPresent: vi.fn(),
}));

import { secretPresent } from './secrets';

const mockedSecretPresent = vi.mocked(secretPresent);

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
  });

  it('a pure local model does NOT reach the network', () => {
    expect(reachesNetwork(ep({ kind: 'ollama', isLocal: true, model: 'gemma4:26b' }))).toBe(false);
  });

  it('a non-local (cloud) endpoint reaches the network', () => {
    expect(
      reachesNetwork(ep({ kind: 'gemini', isLocal: false, model: 'gemini-2.0-flash' })),
    ).toBe(true);
  });

  it('an explicit usesCloud flag reaches the network even when marked local', () => {
    expect(reachesNetwork(ep({ isLocal: true, usesCloud: true }))).toBe(true);
  });

  it('an Ollama "-cloud" model on the local daemon reaches the network', () => {
    expect(
      reachesNetwork(ep({ kind: 'ollama', isLocal: true, model: 'gpt-oss:120b-cloud' })),
    ).toBe(true);
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
    expect(text).toContain('Gemini cloud routing deferred to Slice 1.4');
    expect(tokens.join('')).toBe(text);
    expect(activity.some((msg) => msg.includes('Gemini cloud routing deferred to Slice 1.4'))).toBe(true);
  });
});
