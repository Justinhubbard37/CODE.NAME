/**
 * Config persistence (endpoints, presets, active preset, gates).
 *
 * Saved to localStorage so the user's edits survive app restarts. This is the
 * webview's own storage — it works in the Tauri window and in browser dev. The
 * knowledge graph uses IndexedDB (kg/store.ts); this is just small config.
 *
 * NOTE: we deliberately do NOT store secret API key *values* here — only the
 * name of the environment variable that holds the key. Real in-app secret
 * storage (OS keychain) is a later step in the blueprint.
 */
import type { Endpoint, ConfigProfile, SecurityGates } from '../types';
import { defaultEndpoints, defaultProfiles, defaultGates, LOCKED_ENDPOINT_IDS } from './defaults';

const KEY = 'codename:config:v1';

interface SavedConfig {
  endpoints?: Endpoint[];
  profiles?: ConfigProfile[];
  activeProfileId?: string;
  gates?: SecurityGates;
}

function normalizeEndpoint(e: Endpoint): Endpoint {
  const model = e.model.toLowerCase();
  const ollamaCloudModel =
    e.kind === 'ollama' && (model.includes('-cloud') || model.includes(':cloud'));
  const providerKind =
    e.providerKind ??
    (e.kind === 'openai'
      ? 'openai-compatible'
      : e.kind === 'custom' && e.networkClass === 'local-only'
        ? 'openai-compatible'
        : e.kind);

  if (e.kind === 'gemini') {
    return {
      ...e,
      providerKind: 'gemini',
      isLocal: false,
      networkClass: 'cloud',
      runsLocalOnly: false,
      cloudCapable: true,
      requiresNetwork: true,
      requiresSecret: true,
      secretRequirement: 'keychain',
    };
  }

  if (e.kind === 'a2a') {
    return {
      ...e,
      providerKind: 'a2a',
      isLocal: true,
      networkClass: 'local-only',
      runsLocalOnly: true,
      cloudCapable: false,
      requiresNetwork: false,
      secretRequirement: 'none',
    };
  }

  if (e.kind === 'ollama' && (e.usesCloud || ollamaCloudModel || e.networkClass === 'cloud')) {
    return {
      ...e,
      providerKind: 'ollama',
      isLocal: false,
      networkClass: e.networkClass === 'cloud' ? 'cloud' : 'cloud-capable',
      runsLocalOnly: false,
      cloudCapable: true,
      requiresNetwork: true,
      requiresSecret: !!e.apiKeyEnv || e.secretRequirement === 'keychain',
      secretRequirement: e.apiKeyEnv || e.secretRequirement === 'keychain' ? 'keychain' : 'optional',
      usesCloud: true,
    };
  }

  const localOnly =
    e.networkClass === 'local-only' ||
    e.runsLocalOnly === true ||
    (e.kind !== 'custom' && e.kind !== 'openai' && e.isLocal === true);

  if (localOnly) {
    return {
      ...e,
      providerKind,
      isLocal: true,
      networkClass: 'local-only',
      runsLocalOnly: true,
      cloudCapable: false,
      requiresNetwork: false,
      requiresSecret: false,
      secretRequirement: 'none',
      usesCloud: false,
    };
  }

  return {
    ...e,
    providerKind,
    isLocal: false,
    networkClass: e.networkClass === 'cloud' ? 'cloud' : 'cloud-capable',
    runsLocalOnly: false,
    cloudCapable: true,
    requiresNetwork: true,
    requiresSecret: !!e.apiKeyEnv || e.secretRequirement === 'keychain',
    secretRequirement: e.apiKeyEnv || e.secretRequirement === 'keychain' ? 'keychain' : 'optional',
  };
}

function read(): SavedConfig {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedConfig) : {};
  } catch {
    return {};
  }
}

/**
 * Merge saved endpoints over the built-in defaults by id, then append any
 * user-created custom endpoints. Live status fields are reset so the app
 * re-probes connectivity fresh on every launch.
 */
export function loadEndpoints(): Endpoint[] {
  const saved = read().endpoints ?? [];
  const savedById = new Map(saved.map((e) => [e.id, e]));
  const merged: Endpoint[] = defaultEndpoints.map((d) => {
    const s = savedById.get(d.id);
    if (!s) return d;
    // Locked providers: transport identity ALWAYS comes from defaults (so a stale
    // or edited config can't break them) — only the chosen model persists. Other
    // endpoints (custom-openai, user customs) persist fully.
    return LOCKED_ENDPOINT_IDS.has(d.id) ? { ...d, model: s.model || d.model } : { ...d, ...s };
  });
  for (const s of saved) {
    if (!defaultEndpoints.some((d) => d.id === s.id)) merged.push(s);
  }
  return merged.map((e) => ({
    ...normalizeEndpoint(e),
    status: 'offline',
    detail: undefined,
    models: undefined,
  }));
}

export function loadProfiles(): ConfigProfile[] {
  const saved = read().profiles;
  return saved && saved.length ? saved : defaultProfiles;
}

export function loadActiveProfileId(): string {
  const cfg = read();
  const profiles = cfg.profiles && cfg.profiles.length ? cfg.profiles : defaultProfiles;
  const id = cfg.activeProfileId;
  return id && profiles.some((p) => p.id === id) ? id : profiles[0].id;
}

export function loadGates(): SecurityGates {
  return read().gates ?? defaultGates;
}

export function saveConfig(cfg: {
  endpoints: Endpoint[];
  profiles: ConfigProfile[];
  activeProfileId: string;
  gates: SecurityGates;
}): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* storage unavailable or over quota — config just won't persist */
  }
}
