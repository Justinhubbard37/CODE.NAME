import { beforeEach, describe, expect, it } from 'vitest';
import {
  CANONICAL_RUNTIME_PROFILE_DEFAULTS,
} from './defaults';
import {
  CONFIG_KEY,
  CONFIG_SCHEMA_VERSION,
  MIGRATION_BACKUP_KEY,
  loadActiveProfileId,
  loadEndpoints,
  loadProfiles,
} from './persist';
import { resolveEffectiveRuntimeTuning } from './runtimeTuning';

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

  it('migrates missing legacy temperature and context window to canonical defaults', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      endpoints: [{ id: 'ollama-local', kind: 'ollama', model: 'llama3.1' }],
      profiles: [{ id: 'legacy-missing', name: 'Legacy', endpointId: 'ollama-local' }],
      activeProfileId: 'legacy-missing',
    }));

    const [profile] = loadProfiles();

    expect(profile.defaultTemperature).toBe(CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultTemperature);
    expect(profile.defaultContextWindow).toBe(CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultContextWindow);
  });

  it('normalizes missing v2 defaultTemperature and persists the repair', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      providerConnections: [],
      runtimeProfiles: [{
        id: 'broken',
        label: 'Broken',
        providerId: 'ollama',
        modelId: 'llama3.1',
        defaultContextWindow: 4096,
      }],
      activeProfileId: 'broken',
      gates: { filesystem: true, network: true, tools: true },
    }));

    const [profile] = loadProfiles();
    const saved = JSON.parse(storage.get(CONFIG_KEY) ?? '{}');

    expect(profile.defaultTemperature).toBe(CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultTemperature);
    expect(saved.runtimeProfiles[0].defaultTemperature).toBe(CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultTemperature);
  });

  it('normalizes missing v2 defaultContextWindow and persists the repair', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      providerConnections: [],
      runtimeProfiles: [{
        id: 'broken',
        label: 'Broken',
        providerId: 'ollama',
        modelId: 'llama3.1',
        defaultTemperature: 0.4,
      }],
      activeProfileId: 'broken',
      gates: { filesystem: true, network: true, tools: true },
    }));

    const [profile] = loadProfiles();
    const saved = JSON.parse(storage.get(CONFIG_KEY) ?? '{}');

    expect(profile.defaultContextWindow).toBe(CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultContextWindow);
    expect(saved.runtimeProfiles[0].defaultContextWindow).toBe(CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultContextWindow);
  });

  it('normalizes null v2 tuning values safely', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      providerConnections: [],
      runtimeProfiles: [{
        id: 'broken',
        label: 'Broken',
        providerId: 'ollama',
        modelId: 'llama3.1',
        defaultTemperature: null,
        defaultContextWindow: null,
      }],
      activeProfileId: 'broken',
      gates: { filesystem: true, network: true, tools: true },
    }));

    const [profile] = loadProfiles();

    expect(profile.defaultTemperature).toBe(CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultTemperature);
    expect(profile.defaultContextWindow).toBe(CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultContextWindow);
  });

  it('normalizes malformed and out-of-range v2 tuning values safely', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      providerConnections: [],
      runtimeProfiles: [{
        id: 'broken',
        label: 'Broken',
        providerId: 'ollama',
        modelId: 'llama3.1',
        defaultTemperature: 9,
        defaultContextWindow: 'large',
      }],
      activeProfileId: 'broken',
      gates: { filesystem: true, network: true, tools: true },
    }));

    const [profile] = loadProfiles();

    expect(profile.defaultTemperature).toBe(CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultTemperature);
    expect(profile.defaultContextWindow).toBe(CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultContextWindow);
  });

  it('preserves valid v2 tuning values and keeps temperature zero valid', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      providerConnections: [],
      runtimeProfiles: [{
        id: 'valid',
        label: 'Valid',
        providerId: 'ollama',
        modelId: 'llama3.1',
        defaultTemperature: 0,
        defaultContextWindow: 512,
      }],
      activeProfileId: 'valid',
      gates: { filesystem: true, network: true, tools: true },
    }));

    const [profile] = loadProfiles();

    expect(profile.defaultTemperature).toBe(0);
    expect(profile.defaultContextWindow).toBe(512);
  });

  it('resolves effective tuning by override, then profile default, then canonical default', () => {
    expect(resolveEffectiveRuntimeTuning({
      runtimeOverrides: { temperature: 0, contextWindow: 2048 },
      profile: { defaultTemperature: 0.8, defaultContextWindow: 4096 },
    })).toEqual({ temperature: 0, contextWindow: 2048 });

    expect(resolveEffectiveRuntimeTuning({
      profile: { defaultTemperature: 0.8, defaultContextWindow: 4096 },
    })).toEqual({ temperature: 0.8, contextWindow: 4096 });

    expect(resolveEffectiveRuntimeTuning({
      runtimeOverrides: { temperature: Number.NaN, contextWindow: 0 },
      profile: { defaultTemperature: undefined, defaultContextWindow: undefined },
    })).toEqual({
      temperature: CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultTemperature,
      contextWindow: CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultContextWindow,
    });
  });

  it('returns finite effective tuning values for rendering and request snapshots after migration', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      providerConnections: [],
      runtimeProfiles: [{
        id: 'broken',
        label: 'Broken',
        providerId: 'ollama',
        modelId: 'llama3.1',
        defaultTemperature: undefined,
        defaultContextWindow: undefined,
      }],
      activeProfileId: 'broken',
      gates: { filesystem: true, network: true, tools: true },
    }));

    const [profile] = loadProfiles();
    const tuning = resolveEffectiveRuntimeTuning({ profile });
    const requestSnapshotTuning = {
      temperature: tuning.temperature,
      contextWindow: tuning.contextWindow,
    };

    expect(profile.defaultTemperature).not.toBeUndefined();
    expect(profile.defaultContextWindow).not.toBeUndefined();
    expect(Number.isFinite(tuning.temperature)).toBe(true);
    expect(Number.isFinite(tuning.contextWindow)).toBe(true);
    expect(Number.isFinite(requestSnapshotTuning.temperature)).toBe(true);
    expect(Number.isFinite(requestSnapshotTuning.contextWindow)).toBe(true);
  });
});
