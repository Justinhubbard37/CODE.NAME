import { describe, it, expect } from 'vitest';
import { reachesNetwork } from './llm';
import type { Endpoint } from '../types';

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
});
