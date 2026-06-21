import { describe, expect, it } from 'vitest';
import type { ModelInventoryEntry, ProviderConnection } from '../types';
import {
  buildNormalProviderMenu,
  normalProviderMenuProviders,
  normalizeProviderConnections,
  providerMenuActionTarget,
} from './runtimeProviders';
import { sidecarCheckResult } from './sidecarSetup';

function model(id: string): ModelInventoryEntry {
  return {
    id,
    displayName: id,
    executionClass: 'local',
    availability: 'available',
    source: 'configured',
    discoveredAt: 1,
    capabilities: [],
  };
}

function provider(partial: Partial<ProviderConnection>): ProviderConnection {
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

describe('canonical provider registry and menu model', () => {
  it('normalizes raw provider records to one canonical entry per runtime provider', () => {
    const providers = normalizeProviderConnections([
      provider({ id: 'ollama-local', label: 'Ollama (Local)', models: [model('qwen3.5:latest')] }),
      provider({ id: 'ollama-cloud', label: 'Ollama Cloud', models: [model('gpt-oss:cloud')] }),
      provider({
        id: 'lmstudio-local',
        label: 'LM Studio (Local)',
        providerKind: 'lmstudio',
        baseUrl: 'http://localhost:1234',
        models: [model('lm-local')],
      }),
      provider({
        id: 'gemini-cloud-secondary',
        label: 'Gemini (cloud - secondary)',
        providerKind: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        requiresNetwork: true,
        requiresSecret: true,
        secretRequirement: 'keychain',
        models: [model('gemini-2.5-pro')],
      }),
      provider({
        id: 'agent-sidecar-a2a',
        label: 'Agent Sidecar (A2A)',
        providerKind: 'custom',
        models: [model('agent')],
      }),
    ]);

    expect(providers.map((item) => item.id)).toEqual([
      'ollama',
      'lmstudio',
      'custom-openai',
      'gemini',
    ]);
    expect(providers.find((item) => item.id === 'ollama')?.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'qwen3.5:latest', executionClass: 'local' }),
        expect.objectContaining({ id: 'gpt-oss:cloud', executionClass: 'local' }),
      ]),
    );
    expect(providers.some((item) => item.label.includes('Sidecar'))).toBe(false);
  });

  it('keeps multiple Custom OpenAI-compatible connections distinct outside the normal menu', () => {
    const providers = normalizeProviderConnections([
      provider({
        id: 'custom-openai:1',
        connectionId: 'custom-openai:1',
        label: 'Remote A',
        providerKind: 'openai-compatible',
        baseUrl: 'https://api-a.example.com/v1',
        requiresNetwork: true,
        requiresSecret: true,
        secretRequirement: 'keychain',
      }),
      provider({
        id: 'custom-openai:2',
        connectionId: 'custom-openai:2',
        label: 'Remote B',
        providerKind: 'openai-compatible',
        baseUrl: 'https://api-b.example.com/v1',
        requiresNetwork: true,
        requiresSecret: true,
        secretRequirement: 'keychain',
      }),
    ]);

    expect(providers.map((item) => item.id)).toEqual([
      'ollama',
      'lmstudio',
      'custom-openai',
      'gemini',
      'custom-openai:1',
      'custom-openai:2',
    ]);
    expect(normalProviderMenuProviders(providers).map((item) => item.id)).toEqual([
      'ollama',
      'lmstudio',
      'custom-openai',
      'gemini',
    ]);
  });

  it('builds the normal provider menu in the required canonical order', () => {
    const menu = buildNormalProviderMenu([
      provider({ id: 'ollama-cloud', label: 'Ollama Cloud' }),
      provider({ id: 'ollama-local', label: 'Ollama (Local)' }),
      provider({ id: 'agent-sidecar', label: 'Agent Sidecar (A2A)', providerKind: 'custom' }),
      provider({ id: 'gemini-cloud', label: 'Gemini Cloud', providerKind: 'gemini' }),
      provider({ id: 'lmstudio-local', label: 'LM Studio (Local)', providerKind: 'lmstudio' }),
    ]);

    expect(menu.map((item) => (item.type === 'provider' ? item.provider.label : item.type === 'action' ? item.label : 'divider'))).toEqual([
      'Ollama',
      'LM Studio',
      'Custom OpenAI-compatible',
      'Gemini',
      'divider',
      'Set Up Agent Sidecar',
      'Provider Manager',
    ]);
  });

  it('excludes legacy IDs, duplicate labels, and Agent Sidecar from normal providers', () => {
    const providers = normalProviderMenuProviders([
      provider({ id: 'ollama-local', label: 'Ollama (Local)' }),
      provider({ id: 'ollama-cloud', label: 'Ollama Cloud' }),
      provider({ id: 'lmstudio-local', label: 'LM Studio (Local)', providerKind: 'lmstudio' }),
      provider({ id: 'gemini-cloud-secondary', label: 'Gemini (cloud - secondary)', providerKind: 'gemini' }),
      provider({ id: 'agent-sidecar-a2a', label: 'Agent Sidecar (A2A)', providerKind: 'custom' }),
    ]);

    const serialized = JSON.stringify(providers);
    expect(providers.map((item) => item.id)).toEqual(['ollama', 'lmstudio', 'custom-openai', 'gemini']);
    expect(serialized).not.toContain('ollama-local');
    expect(serialized).not.toContain('ollama-cloud');
    expect(serialized).not.toContain('lmstudio-local');
    expect(serialized).not.toContain('gemini-cloud');
    expect(serialized).not.toContain('agent-sidecar');
    expect(serialized).not.toContain('Ollama Cloud');
    expect(serialized).not.toContain('Agent Sidecar');
  });

  it('includes one Sidecar setup action and one Provider Manager action with distinct targets', () => {
    const actions = buildNormalProviderMenu([]).filter((item) => item.type === 'action');

    expect(actions).toEqual([
      {
        type: 'action',
        id: 'setup-sidecar',
        label: 'Set Up Agent Sidecar',
        target: 'sidecar-setup',
      },
      {
        type: 'action',
        id: 'provider-manager',
        label: 'Provider Manager',
        target: 'provider-manager',
      },
    ]);
    expect(providerMenuActionTarget('setup-sidecar')).toBe('sidecar-setup');
    expect(providerMenuActionTarget('provider-manager')).toBe('provider-manager');
    expect(providerMenuActionTarget('setup-sidecar')).not.toBe(providerMenuActionTarget('provider-manager'));
  });

  it('does not let raw persisted records inject duplicates into the normal menu', () => {
    const menu = buildNormalProviderMenu([
      provider({ id: 'ollama' }),
      provider({ id: 'ollama' }),
      provider({ id: 'ollama-local', label: 'Ollama Local' }),
      provider({ id: 'ollama-cloud', label: 'Ollama Cloud' }),
      provider({ id: 'gemini-cloud-secondary', label: 'Gemini (cloud - secondary)', providerKind: 'gemini' }),
      provider({ id: 'agent-sidecar', label: 'Agent Sidecar', providerKind: 'custom' }),
    ]);
    const providerItems = menu.filter((item) => item.type === 'provider');

    expect(providerItems).toHaveLength(4);
    expect(providerItems.map((item) => item.provider.id)).toEqual([
      'ollama',
      'lmstudio',
      'custom-openai',
      'gemini',
    ]);
  });

  it('maps Sidecar connection check results truthfully', () => {
    expect(sidecarCheckResult(null)).toEqual({
      kind: 'unavailable',
      message: 'Sidecar unavailable in this runtime.',
    });
    expect(sidecarCheckResult({ status: 'ready', host: '127.0.0.1', port: 4123 })).toEqual({
      kind: 'success',
      message: 'Sidecar ready at 127.0.0.1:4123.',
    });
    expect(sidecarCheckResult({ status: 'error', host: '127.0.0.1', port: 4123 })).toEqual({
      kind: 'failed',
      message: 'Sidecar failed at 127.0.0.1:4123.',
    });
  });
});
