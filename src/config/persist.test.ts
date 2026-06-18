import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONFIG_KEY,
  CONFIG_SCHEMA_VERSION,
  MIGRATION_BACKUP_KEY,
  loadActiveProfileId,
  loadEndpoints,
  loadProfiles,
} from './persist';

function installStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
      clear: () => data.clear(),
    },
    configurable: true,
  });
  return data;
}

describe('config v1 to v2 runtime migration', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = installStorage();
  });

  it('writes schemaVersion 2 and creates one pre-migration backup without secrets', () => {
    const legacy = {
      endpoints: [
        {
          id: 'gemini-cloud',
          kind: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com',
          model: 'gemini-2.0-flash',
          apiKeyEnv: 'GEMINI_API_KEY',
          secretValue: 'SHOULD_NOT_COPY',
        },
      ],
      profiles: [
        {
          id: 'profile-gemini',
          name: 'Gemini',
          endpointId: 'gemini-cloud',
          temperature: 0.3,
          contextWindow: 2048,
        },
      ],
      activeProfileId: 'profile-gemini',
    };
    storage.set(CONFIG_KEY, JSON.stringify(legacy));

    const profiles = loadProfiles();
    const saved = JSON.parse(storage.get(CONFIG_KEY) ?? '{}');

    expect(saved.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(storage.get(MIGRATION_BACKUP_KEY)).toBe(JSON.stringify(legacy));
    expect(JSON.stringify(saved)).not.toContain('SHOULD_NOT_COPY');
    expect(profiles[0]).toMatchObject({
      id: 'profile-gemini',
      providerId: 'gemini',
      modelId: 'gemini-2.0-flash',
      defaultTemperature: 0.3,
      defaultContextWindow: 2048,
    });
  });

  it('migrates Ollama local and cloud endpoints into one user-facing provider', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      endpoints: [
        { id: 'ollama-local', kind: 'ollama', model: 'llama3.1' },
        { id: 'ollama-cloud', kind: 'ollama', model: 'gpt-oss:120b-cloud' },
      ],
      profiles: [
        { id: 'local', name: 'Local', endpointId: 'ollama-local', temperature: 0.2, contextWindow: 4096 },
        { id: 'cloud', name: 'Cloud', endpointId: 'ollama-cloud', temperature: 0.8, contextWindow: 8192 },
      ],
      activeProfileId: 'cloud',
    }));

    const providers = loadEndpoints();
    const profiles = loadProfiles();

    expect(providers.filter((provider) => provider.id === 'ollama')).toHaveLength(1);
    expect(providers.find((provider) => provider.id === 'ollama')).toMatchObject({
      label: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434',
      providerKind: 'ollama',
    });
    expect(profiles.find((profile) => profile.id === 'local')).toMatchObject({
      providerId: 'ollama',
      modelId: 'llama3.1',
    });
    expect(profiles.find((profile) => profile.id === 'cloud')).toMatchObject({
      providerId: 'ollama',
      modelId: 'gpt-oss:120b-cloud',
    });
  });

  it('migrates legacy Gemini and LM Studio profile providers', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      endpoints: [
        { id: 'gemini-cloud', kind: 'gemini', model: 'gemini-2.0-flash' },
        { id: 'lmstudio-local', kind: 'lmstudio', model: 'local-model' },
      ],
      profiles: [
        { id: 'gemini', name: 'Gemini', endpointId: 'gemini-cloud' },
        { id: 'lm', name: 'LM', endpointId: 'lmstudio-local' },
      ],
      activeProfileId: 'lm',
    }));

    const profiles = loadProfiles();
    expect(profiles.find((profile) => profile.id === 'gemini')).toMatchObject({
      providerId: 'gemini',
      modelId: 'gemini-2.0-flash',
    });
    expect(profiles.find((profile) => profile.id === 'lm')).toMatchObject({
      providerId: 'lmstudio',
      modelId: 'local-model',
    });
    expect(loadActiveProfileId()).toBe('lm');
  });

  it('removes active Agent Sidecar from normal provider/model selection without switching', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      endpoints: [
        { id: 'agent-sidecar', kind: 'a2a', model: 'adk-agent' },
      ],
      profiles: [
        { id: 'sidecar', name: 'Sidecar', endpointId: 'agent-sidecar', temperature: 0.6, contextWindow: 4096 },
      ],
      activeProfileId: 'sidecar',
    }));

    const profiles = loadProfiles();
    expect(loadActiveProfileId()).toBe('sidecar');
    expect(profiles[0]).toMatchObject({
      providerId: '',
      modelId: '',
      defaultTemperature: 0.6,
      defaultContextWindow: 4096,
    });
    expect(loadEndpoints().some((provider) => provider.id === 'agent-sidecar')).toBe(false);
  });

  it('does not overwrite an existing migration backup', () => {
    storage.set(MIGRATION_BACKUP_KEY, 'existing-backup');
    storage.set(CONFIG_KEY, JSON.stringify({
      endpoints: [{ id: 'lmstudio-local', kind: 'lmstudio', model: 'local-model' }],
      profiles: [{ id: 'lm', name: 'LM', endpointId: 'lmstudio-local' }],
      activeProfileId: 'lm',
    }));

    loadProfiles();
    expect(storage.get(MIGRATION_BACKUP_KEY)).toBe('existing-backup');
  });
});
