import type {
  ModelInventoryEntry,
  ProviderConnection,
  RuntimeProfile,
  SecurityGates,
  WorkTask,
} from '../types';

const now = 0;

export const CANONICAL_RUNTIME_PROFILE_DEFAULTS = {
  defaultTemperature: 0.7,
  defaultContextWindow: 8192,
} as const;

function configuredModel(
  id: string,
  source: ModelInventoryEntry['source'],
  executionClass: ModelInventoryEntry['executionClass'],
): ModelInventoryEntry {
  return {
    id,
    displayName: id,
    executionClass,
    availability: 'unknown',
    source,
    discoveredAt: now,
    capabilities: [],
  };
}

export const defaultProviderConnections: ProviderConnection[] = [
  {
    id: 'ollama',
    connectionId: 'ollama:local-default',
    label: 'Ollama',
    providerKind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    requiresNetwork: false,
    requiresSecret: false,
    secretRequirement: 'none',
    status: 'unknown',
    detail: 'Model inventory has not been refreshed.',
    models: [configuredModel('llama3.1', 'configured', 'local')],
  },
  {
    id: 'lmstudio',
    connectionId: 'lmstudio:local-default',
    label: 'LM Studio',
    providerKind: 'lmstudio',
    baseUrl: 'http://127.0.0.1:1234',
    requiresNetwork: false,
    requiresSecret: false,
    secretRequirement: 'none',
    status: 'unknown',
    detail: 'Model inventory has not been refreshed.',
    models: [configuredModel('local-model', 'configured', 'local')],
  },
  {
    id: 'custom-openai',
    label: 'Custom OpenAI-compatible',
    providerKind: 'openai-compatible',
    baseUrl: '',
    requiresNetwork: false,
    requiresSecret: false,
    secretRequirement: 'none',
    status: 'unknown',
    detail: 'Create and approve a connection in Provider Manager.',
    userEditable: true,
    models: [],
  },
  {
    id: 'gemini',
    connectionId: 'gemini:fixed',
    label: 'Gemini',
    providerKind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    requiresNetwork: true,
    requiresSecret: true,
    secretRequirement: 'keychain',
    apiKeyEnv: 'GEMINI_API_KEY',
    status: 'unknown',
    detail: 'Model inventory has not been refreshed.',
    models: [],
  },
];

export const NORMAL_PROVIDER_IDS = new Set(defaultProviderConnections.map((p) => p.id));

export const defaultRuntimeProfiles: RuntimeProfile[] = [
  {
    id: 'profile-balanced',
    label: 'BALANCED',
    providerId: 'ollama',
    modelId: 'llama3.1',
    defaultTemperature: CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultTemperature,
    defaultContextWindow: CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultContextWindow,
  },
  {
    id: 'profile-precise',
    label: 'PRECISE',
    providerId: 'ollama',
    modelId: 'llama3.1',
    defaultTemperature: 0.2,
    defaultContextWindow: 16384,
  },
  {
    id: 'profile-creative',
    label: 'CREATIVE',
    providerId: 'lmstudio',
    modelId: 'local-model',
    defaultTemperature: 1.0,
    defaultContextWindow: 8192,
  },
];

export const defaultGates: SecurityGates = {
  filesystem: true,
  network: true,
  tools: true,
};

export const initialTask: WorkTask = {
  id: 'task-primary',
  name: 'PRIMARY ANALYSIS',
  kind: 'analysis',
  agent: 'ANALYST-0',
  messages: [
    {
      id: 'sys-0',
      role: 'system',
      content:
        'Execution canvas online. Local-first routing engaged. Drop a codebase or document onto the left pane to ingest, or query a connected model below.',
      ts: Date.now(),
    },
  ],
  activity: [],
  session: {
    id: 'sess-primary',
    caps: { browser: true, tools: true, network: true, filesystem: true },
  },
};

export const defaultEndpoints = defaultProviderConnections;
export const defaultProfiles = defaultRuntimeProfiles;
export const LOCKED_ENDPOINT_IDS = NORMAL_PROVIDER_IDS;
