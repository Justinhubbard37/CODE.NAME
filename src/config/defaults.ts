import type {
  Endpoint,
  ConfigProfile,
  SecurityGates,
  WorkTask,
} from '../types';

/**
 * Local-first endpoint registry. Local loopback engines come first and are the
 * default route; cloud is registered but secondary. The harness is model
 * agnostic — every entry is probed and selectable.
 */
export const defaultEndpoints: Endpoint[] = [
  {
    id: 'agent-sidecar',
    label: 'Agent Sidecar (A2A)',
    kind: 'a2a',
    providerKind: 'a2a',
    baseUrl: 'http://127.0.0.1:0',
    model: 'adk-agent',
    isLocal: true,
    networkClass: 'local-only',
    runsLocalOnly: true,
    requiresNetwork: false,
    cloudCapable: false,
    secretRequirement: 'none',
    status: 'offline',
  },
  {
    id: 'ollama-local',
    label: 'Ollama (local)',
    kind: 'ollama',
    providerKind: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3.1',
    isLocal: true,
    networkClass: 'local-only',
    runsLocalOnly: true,
    requiresNetwork: false,
    cloudCapable: false,
    secretRequirement: 'none',
    status: 'offline',
  },
  {
    id: 'ollama-cloud',
    label: 'Ollama Cloud',
    kind: 'ollama',
    providerKind: 'ollama',
    baseUrl: 'https://ollama.com',
    model: 'gpt-oss:120b',
    isLocal: false,
    networkClass: 'cloud',
    runsLocalOnly: false,
    requiresNetwork: true,
    cloudCapable: true,
    requiresSecret: true,
    secretRequirement: 'keychain',
    usesCloud: true,
    apiKeyEnv: 'OLLAMA_API_KEY',
    status: 'offline',
  },
  {
    id: 'lmstudio-local',
    label: 'LM Studio (local)',
    kind: 'lmstudio',
    providerKind: 'lmstudio',
    baseUrl: 'http://localhost:1234',
    model: 'local-model',
    isLocal: true,
    networkClass: 'local-only',
    runsLocalOnly: true,
    requiresNetwork: false,
    cloudCapable: false,
    secretRequirement: 'none',
    status: 'offline',
  },
  {
    id: 'custom-openai',
    label: 'Custom OpenAI-compatible',
    kind: 'custom',
    providerKind: 'openai-compatible',
    baseUrl: 'http://localhost:8000',
    model: 'default',
    isLocal: true,
    networkClass: 'local-only',
    runsLocalOnly: true,
    requiresNetwork: false,
    cloudCapable: false,
    secretRequirement: 'none',
    status: 'offline',
  },
  {
    id: 'gemini-cloud',
    label: 'Gemini (cloud · secondary)',
    kind: 'gemini',
    providerKind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.0-flash',
    isLocal: false,
    networkClass: 'cloud',
    runsLocalOnly: false,
    requiresNetwork: true,
    cloudCapable: true,
    requiresSecret: true,
    secretRequirement: 'keychain',
    apiKeyEnv: 'GEMINI_API_KEY',
    status: 'offline',
  },
];

/**
 * Fixed providers whose transport identity (kind, URL, local/cloud, key name) is
 * NOT user-editable — only the chosen model and the API key are. This keeps
 * Ollama Local (your computer) and Ollama Cloud (ollama.com) from ever being
 * conflated. "custom-openai" is intentionally NOT here: it exists for custom URLs.
 */
export const LOCKED_ENDPOINT_IDS = new Set([
  'agent-sidecar',
  'ollama-local',
  'ollama-cloud',
  'lmstudio-local',
  'gemini-cloud',
]);

export const defaultProfiles: ConfigProfile[] = [
  {
    id: 'profile-balanced',
    name: 'BALANCED',
    endpointId: 'ollama-local',
    temperature: 0.7,
    contextWindow: 8192,
  },
  {
    id: 'profile-precise',
    name: 'PRECISE',
    endpointId: 'ollama-local',
    temperature: 0.2,
    contextWindow: 16384,
  },
  {
    id: 'profile-creative',
    name: 'CREATIVE',
    endpointId: 'lmstudio-local',
    temperature: 1.0,
    contextWindow: 8192,
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
  session: { id: 'sess-primary', caps: { browser: true, tools: true, network: true, filesystem: true } },
};
