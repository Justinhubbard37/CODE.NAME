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

describe('config runtime migration and normalization', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = installStorage();
  });

  it('writes schemaVersion 3 and creates one pre-migration backup without secrets', () => {
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
    expect(providers.some((provider) => provider.id === 'ollama-cloud')).toBe(false);
    expect(providers.find((provider) => provider.id === 'ollama')?.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'gpt-oss:120b-cloud', executionClass: 'unknown', availability: 'stale' }),
      ]),
    );
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
        { id: 'gemini-cloud-secondary', kind: 'gemini', model: 'gemini-2.5-pro' },
        { id: 'lmstudio-local', kind: 'lmstudio', model: 'local-model' },
      ],
      profiles: [
        { id: 'gemini', name: 'Gemini', endpointId: 'gemini-cloud' },
        { id: 'gemini-secondary', name: 'Gemini secondary', endpointId: 'gemini-cloud-secondary' },
        { id: 'lm', name: 'LM', endpointId: 'lmstudio-local' },
      ],
      activeProfileId: 'lm',
    }));

    const profiles = loadProfiles();
    expect(profiles.find((profile) => profile.id === 'gemini')).toMatchObject({
      providerId: 'gemini',
      modelId: 'gemini-2.0-flash',
    });
    expect(profiles.find((profile) => profile.id === 'gemini-secondary')).toMatchObject({
      providerId: 'gemini',
      modelId: 'gemini-2.5-pro',
    });
    expect(profiles.find((profile) => profile.id === 'lm')).toMatchObject({
      providerId: 'lmstudio',
      modelId: 'local-model',
    });
    expect(loadActiveProfileId()).toBe('lm');
    expect(loadEndpoints().filter((provider) => provider.id === 'gemini')).toHaveLength(1);
    expect(loadEndpoints().some((provider) => provider.id === 'gemini-cloud-secondary')).toBe(false);
  });

  it('normalizes all duplicate legacy providers to exactly four canonical providers', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      endpoints: [
        { id: 'ollama-local', label: 'Ollama (Local)', kind: 'ollama', model: 'llama3.1' },
        { id: 'ollama-cloud', label: 'Ollama Cloud', kind: 'ollama', model: 'gpt-oss:model-cloud' },
        { id: 'lmstudio-local', label: 'LM Studio (Local)', kind: 'lmstudio', model: 'local-model' },
        { id: 'gemini-cloud', label: 'Gemini Cloud', kind: 'gemini', model: 'gemini-2.0-flash' },
        { id: 'gemini-cloud-secondary', label: 'Gemini (cloud - secondary)', kind: 'gemini', model: 'gemini-2.5-pro' },
        { id: 'agent-sidecar-a2a', label: 'Agent Sidecar (A2A)', kind: 'a2a', model: 'adk-agent' },
      ],
      profiles: [
        { id: 'ollama-local-profile', name: 'Ollama Local', endpointId: 'ollama-local' },
        { id: 'ollama-cloud-profile', name: 'Ollama Cloud', endpointId: 'ollama-cloud' },
        { id: 'lm-profile', name: 'LM Studio Local', endpointId: 'lmstudio-local' },
        { id: 'gemini-profile', name: 'Gemini Secondary', endpointId: 'gemini-cloud-secondary' },
      ],
      activeProfileId: 'ollama-cloud-profile',
    }));

    const providers = loadEndpoints();
    const profiles = loadProfiles();

    expect(providers.map((provider) => provider.id)).toEqual([
      'ollama',
      'lmstudio',
      'custom-openai',
      'gemini',
    ]);
    expect(profiles.map((profile) => profile.providerId)).toEqual([
      'ollama',
      'ollama',
      'lmstudio',
      'gemini',
    ]);
    expect(profiles.find((profile) => profile.id === 'ollama-cloud-profile')?.modelId).toBe('gpt-oss:model-cloud');
    expect(loadActiveProfileId()).toBe('ollama-cloud-profile');
  });

  it('preserves custom OpenAI-compatible configuration under one canonical runtime entry', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      schemaVersion: 2,
      providerConnections: [
        {
          id: 'custom-prod',
          label: 'Production OpenAI-compatible',
          providerKind: 'openai-compatible',
          baseUrl: 'https://models.example.test',
          requiresNetwork: true,
          requiresSecret: true,
          secretRequirement: 'keychain',
          apiKeyEnv: 'CUSTOM_API_KEY',
          status: 'available',
          detail: '1 model.',
          userEditable: true,
          models: [{
            id: 'custom-model',
            displayName: 'custom-model',
            executionClass: 'cloud',
            availability: 'available',
            source: 'openai-compatible',
            discoveredAt: 1,
            capabilities: [],
          }],
        },
      ],
      runtimeProfiles: [{
        id: 'custom-profile',
        label: 'Custom',
        providerId: 'custom-prod',
        modelId: 'custom-model',
        defaultTemperature: 0.4,
        defaultContextWindow: 4096,
      }],
      activeProfileId: 'custom-profile',
      gates: { filesystem: true, network: true, tools: true },
    }));

    const providers = loadEndpoints();
    const custom = providers.find((provider) => provider.id === 'custom-openai');

    expect(providers.filter((provider) => provider.id === 'custom-openai')).toHaveLength(1);
    expect(custom).toMatchObject({
      label: 'Custom OpenAI-compatible',
      providerKind: 'openai-compatible',
      baseUrl: '',
      requiresNetwork: false,
      requiresSecret: false,
      secretRequirement: 'none',
      userEditable: true,
    });
    expect(custom?.apiKeyEnv).toBeUndefined();
    expect(custom?.models).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'custom-model', availability: 'stale' })]));
    expect(loadProfiles()[0]).toMatchObject({
      providerId: 'custom-openai',
      modelId: 'custom-model',
    });
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

  it('normalizes active Agent Sidecar aliases to an unselected normal runtime state', () => {
    storage.set(CONFIG_KEY, JSON.stringify({
      schemaVersion: 2,
      providerConnections: [{
        id: 'agent-sidecar-a2a',
        label: 'Agent Sidecar (A2A)',
        providerKind: 'a2a',
        baseUrl: 'http://127.0.0.1:0',
        requiresNetwork: false,
        requiresSecret: false,
        secretRequirement: 'none',
        status: 'available',
        models: [],
      }],
      runtimeProfiles: [{
        id: 'sidecar-profile',
        label: 'Sidecar',
        providerId: 'agent-sidecar-a2a',
        modelId: 'agent-model',
        defaultTemperature: 0.5,
        defaultContextWindow: 4096,
      }],
      activeProfileId: 'sidecar-profile',
      gates: { filesystem: true, network: true, tools: true },
    }));

    expect(loadActiveProfileId()).toBe('sidecar-profile');
    expect(loadProfiles()[0]).toMatchObject({
      providerId: '',
      modelId: '',
    });
    expect(loadEndpoints().map((provider) => provider.id)).toEqual([
      'ollama',
      'lmstudio',
      'custom-openai',
      'gemini',
    ]);
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

  it('never creates a second migration backup key and keeps normalized loads idempotent', () => {
    storage.set(MIGRATION_BACKUP_KEY, 'existing-backup');
    storage.set(CONFIG_KEY, JSON.stringify({
      schemaVersion: 2,
      providerConnections: [
        {
          id: 'ollama-local',
          label: 'Ollama (Local)',
          providerKind: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
          requiresNetwork: false,
          requiresSecret: false,
          secretRequirement: 'none',
          status: 'available',
          models: [],
        },
        {
          id: 'gemini-cloud-secondary',
          label: 'Gemini (cloud - secondary)',
          providerKind: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com',
          requiresNetwork: true,
          requiresSecret: true,
          secretRequirement: 'keychain',
          status: 'requires_api_key',
          models: [],
        },
      ],
      runtimeProfiles: [{
        id: 'broken-phase-3a',
        label: 'Broken',
        providerId: 'gemini-cloud-secondary',
        modelId: 'gemini-2.5-pro',
        defaultTemperature: 0.7,
        defaultContextWindow: 8192,
      }],
      activeProfileId: 'broken-phase-3a',
      gates: { filesystem: true, network: true, tools: true },
    }));

    loadProfiles();
    const firstSaved = storage.get(CONFIG_KEY);
    loadProfiles();

    expect(storage.get(CONFIG_KEY)).toBe(firstSaved);
    expect(JSON.parse(firstSaved ?? '{}').schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(loadProfiles()[0]).toMatchObject({
      providerId: 'gemini',
      modelId: 'gemini-2.5-pro',
    });
    expect(loadEndpoints().map((provider) => provider.id)).toEqual([
      'ollama',
      'lmstudio',
      'custom-openai',
      'gemini',
    ]);
    expect(Array.from(storage.keys()).filter((key) => key.includes('backup'))).toEqual([MIGRATION_BACKUP_KEY]);
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
