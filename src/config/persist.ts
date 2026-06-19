/**
 * Runtime config persistence.
 *
 * LocalStorage keeps provider connection metadata, Runtime Profiles, active
 * profile id, and gates. Secret values are never stored here; cloud keys stay in
 * the Rust-backed OS secret store.
 */
import type {
  ConfigProfile,
  ModelInventoryEntry,
  ProviderConnection,
  RuntimeProfile,
  SecurityGates,
} from '../types';
import {
  defaultProviderConnections,
  defaultRuntimeProfiles,
  defaultGates,
} from './defaults';
import { normalizeRuntimeProfileTuning } from './runtimeTuning';

export const CONFIG_KEY = 'codename:config:v1';
export const MIGRATION_BACKUP_KEY = 'codename:config:v1:pre-runtime-consolidation-backup';
const SCHEMA_VERSION = 2;

interface LegacyEndpoint {
  id: string;
  label?: string;
  kind?: string;
  providerKind?: string;
  baseUrl?: string;
  model?: string;
  isLocal?: boolean;
  networkClass?: string;
  runsLocalOnly?: boolean;
  requiresNetwork?: boolean;
  requiresSecret?: boolean;
  secretRequirement?: string;
  apiKeyEnv?: string;
  models?: string[];
}

interface LegacyProfile {
  id: string;
  name?: string;
  label?: string;
  endpointId?: string;
  providerId?: string;
  modelId?: string;
  temperature?: number;
  contextWindow?: number;
  defaultTemperature?: number;
  defaultContextWindow?: number;
}

interface SavedConfigV1 {
  endpoints?: LegacyEndpoint[];
  profiles?: LegacyProfile[];
  activeProfileId?: string;
  gates?: SecurityGates;
}

interface SavedConfigV2 {
  schemaVersion: 2;
  providerConnections: ProviderConnection[];
  runtimeProfiles: RuntimeProfile[];
  activeProfileId: string;
  gates: SecurityGates;
}

type AnySavedConfig = Partial<SavedConfigV1 & SavedConfigV2> | null;

function isStorageAvailable(): boolean {
  return typeof localStorage !== 'undefined';
}

function cloneDefaultProviders(): ProviderConnection[] {
  return defaultProviderConnections.map((p) => ({
    ...p,
    models: p.models.map((m) => ({ ...m })),
  }));
}

function cloneDefaultProfiles(): RuntimeProfile[] {
  return defaultRuntimeProfiles.map((p) => ({ ...p }));
}

function readRaw(): { raw: string | null; parsed: AnySavedConfig } {
  if (!isStorageAvailable()) return { raw: null, parsed: null };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return { raw, parsed: raw ? (JSON.parse(raw) as AnySavedConfig) : null };
  } catch {
    return { raw: null, parsed: null };
  }
}

function writeConfig(cfg: SavedConfigV2): void {
  if (!isStorageAvailable()) return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function writeBackupOnce(raw: string | null): void {
  if (!raw || !isStorageAvailable()) return;
  try {
    if (!localStorage.getItem(MIGRATION_BACKUP_KEY)) {
      localStorage.setItem(MIGRATION_BACKUP_KEY, raw);
    }
  } catch {
    /* backup best-effort only */
  }
}

function secretRequirement(value: unknown): ProviderConnection['secretRequirement'] {
  return value === 'keychain' || value === 'optional' ? value : 'none';
}

function modelInventoryFromStrings(
  models: string[] | undefined,
  source: ModelInventoryEntry['source'],
  executionFor: (id: string) => ModelInventoryEntry['executionClass'],
): ModelInventoryEntry[] {
  const discoveredAt = Date.now();
  return (models ?? [])
    .filter(Boolean)
    .map((id) => ({
      id,
      displayName: id,
      executionClass: executionFor(id),
      availability: 'available' as const,
      source,
      discoveredAt,
      capabilities: [],
    }));
}

function isOllamaCloudModel(id: string): boolean {
  const lowered = id.toLowerCase();
  return lowered.endsWith(':cloud') || lowered.endsWith('-cloud');
}

function defaultProvider(id: string): ProviderConnection | undefined {
  return cloneDefaultProviders().find((p) => p.id === id);
}

function providerFromLegacyEndpoint(endpoint: LegacyEndpoint): ProviderConnection | null {
  const id = endpoint.id;
  if (id === 'agent-sidecar' || endpoint.kind === 'a2a' || endpoint.providerKind === 'a2a') {
    return null;
  }
  if (id === 'ollama-local' || id === 'ollama-cloud' || endpoint.kind === 'ollama') {
    const base = defaultProvider('ollama')!;
    return {
      ...base,
      models: modelInventoryFromStrings(endpoint.models, 'migration', (modelId) =>
        isOllamaCloudModel(modelId) ? 'cloud' : 'local',
      ),
    };
  }
  if (id === 'lmstudio-local' || endpoint.kind === 'lmstudio') {
    const base = defaultProvider('lmstudio')!;
    return {
      ...base,
      baseUrl: endpoint.baseUrl || base.baseUrl,
      models: modelInventoryFromStrings(endpoint.models, 'migration', () => 'local'),
    };
  }
  if (id === 'gemini-cloud' || endpoint.kind === 'gemini') {
    const base = defaultProvider('gemini')!;
    return {
      ...base,
      models: [],
    };
  }
  if (
    id === 'custom-openai' ||
    endpoint.kind === 'custom' ||
    endpoint.kind === 'openai' ||
    endpoint.providerKind === 'openai-compatible'
  ) {
    const defaultCustom = defaultProvider(id === 'custom-openai' ? 'custom-openai' : '') ?? defaultProvider('custom-openai')!;
    const customId = id || `custom-${Date.now()}`;
    const requiresNetwork =
      endpoint.requiresNetwork ??
      (!endpoint.isLocal && endpoint.networkClass !== 'local-only' && endpoint.runsLocalOnly !== true);
    return {
      ...defaultCustom,
      id: customId,
      label: endpoint.label || defaultCustom.label,
      providerKind: 'openai-compatible',
      baseUrl: endpoint.baseUrl || defaultCustom.baseUrl,
      requiresNetwork,
      requiresSecret: endpoint.requiresSecret ?? endpoint.secretRequirement === 'keychain',
      secretRequirement: secretRequirement(endpoint.secretRequirement),
      apiKeyEnv: endpoint.apiKeyEnv,
      userEditable: true,
      status: 'unknown',
      detail: 'Model inventory has not been refreshed.',
      models: modelInventoryFromStrings(endpoint.models, 'migration', () =>
        requiresNetwork ? 'cloud' : 'local',
      ),
    };
  }
  return null;
}

function providerIdForLegacyEndpoint(endpointId?: string): string {
  if (endpointId === 'ollama-local' || endpointId === 'ollama-cloud') return 'ollama';
  if (endpointId === 'lmstudio-local') return 'lmstudio';
  if (endpointId === 'gemini-cloud') return 'gemini';
  if (endpointId === 'agent-sidecar') return '';
  return endpointId ?? '';
}

function legacyEndpointModel(endpoints: LegacyEndpoint[], endpointId?: string): string {
  if (!endpointId) return '';
  return endpoints.find((e) => e.id === endpointId)?.model ?? '';
}

function migrateProfile(profile: LegacyProfile, endpoints: LegacyEndpoint[]): RuntimeProfile {
  const legacyEndpointId = profile.endpointId ?? profile.providerId;
  const providerId = providerIdForLegacyEndpoint(legacyEndpointId);
  const defaultProfile = defaultRuntimeProfiles.find((p) => p.id === profile.id);
  const modelId =
    profile.modelId ??
    legacyEndpointModel(endpoints, legacyEndpointId) ??
    defaultProfile?.modelId ??
    '';
  return normalizeRuntimeProfileTuning({
    id: profile.id || `profile-${Date.now()}`,
    label: profile.label || profile.name || defaultProfile?.label || 'PROFILE',
    providerId,
    modelId: providerId ? modelId : '',
    defaultTemperature:
      profile.defaultTemperature ?? profile.temperature ?? defaultProfile?.defaultTemperature,
    defaultContextWindow:
      profile.defaultContextWindow ?? profile.contextWindow ?? defaultProfile?.defaultContextWindow,
  });
}

function dedupeProviders(providers: ProviderConnection[]): ProviderConnection[] {
  const merged = new Map<string, ProviderConnection>();
  for (const provider of [...cloneDefaultProviders(), ...providers]) {
    const existing = merged.get(provider.id);
    merged.set(provider.id, {
      ...(existing ?? provider),
      ...provider,
      models: provider.models ?? existing?.models ?? [],
      status: provider.status === 'configuring' ? 'unknown' : provider.status,
    });
  }
  return Array.from(merged.values()).map((provider) => ({
    ...provider,
    detail: provider.detail || 'Model inventory has not been refreshed.',
    lastFailure: undefined,
  }));
}

function normalizeV2(cfg: Partial<SavedConfigV2>): SavedConfigV2 {
  const providerConnections = dedupeProviders(cfg.providerConnections ?? []);
  const runtimeProfiles =
    cfg.runtimeProfiles && cfg.runtimeProfiles.length
      ? cfg.runtimeProfiles.map((p) => normalizeRuntimeProfileTuning({ ...p }))
      : cloneDefaultProfiles();
  const activeProfileId =
    cfg.activeProfileId && runtimeProfiles.some((p) => p.id === cfg.activeProfileId)
      ? cfg.activeProfileId
      : runtimeProfiles[0].id;
  return {
    schemaVersion: SCHEMA_VERSION,
    providerConnections,
    runtimeProfiles,
    activeProfileId,
    gates: cfg.gates ?? defaultGates,
  };
}

function migrateV1(cfg: SavedConfigV1): SavedConfigV2 {
  const legacyEndpoints = cfg.endpoints ?? [];
  const migratedProviders = legacyEndpoints
    .map(providerFromLegacyEndpoint)
    .filter((p): p is ProviderConnection => !!p);
  const providerConnections = dedupeProviders(migratedProviders);
  const runtimeProfiles =
    cfg.profiles && cfg.profiles.length
      ? cfg.profiles.map((p) => migrateProfile(p, legacyEndpoints))
      : cloneDefaultProfiles();
  const activeLegacyProfile = runtimeProfiles.find((p) => p.id === cfg.activeProfileId);
  const activeProfileId =
    cfg.activeProfileId && activeLegacyProfile
      ? cfg.activeProfileId
      : runtimeProfiles[0].id;
  return {
    schemaVersion: SCHEMA_VERSION,
    providerConnections,
    runtimeProfiles,
    activeProfileId,
    gates: cfg.gates ?? defaultGates,
  };
}

function loadConfig(): SavedConfigV2 {
  const { raw, parsed } = readRaw();
  if (!parsed) {
    return normalizeV2({});
  }
  if (parsed.schemaVersion === SCHEMA_VERSION && parsed.providerConnections) {
    const normalized = normalizeV2(parsed as SavedConfigV2);
    try {
      writeConfig(normalized);
    } catch {
      /* persistence can fail in private/browser test contexts */
    }
    return normalized;
  }
  writeBackupOnce(raw);
  const migrated = migrateV1(parsed as SavedConfigV1);
  try {
    writeConfig(migrated);
  } catch {
    /* persistence can fail in private/browser test contexts */
  }
  return migrated;
}

export function loadProviderConnections(): ProviderConnection[] {
  return loadConfig().providerConnections;
}

export function loadRuntimeProfiles(): RuntimeProfile[] {
  return loadConfig().runtimeProfiles;
}

export function loadActiveRuntimeProfileId(): string {
  return loadConfig().activeProfileId;
}

export function loadGates(): SecurityGates {
  return loadConfig().gates;
}

export function saveConfig(cfg: {
  providerConnections?: ProviderConnection[];
  runtimeProfiles?: RuntimeProfile[];
  endpoints?: ProviderConnection[];
  profiles?: ConfigProfile[];
  activeProfileId: string;
  gates: SecurityGates;
}): void {
  if (!isStorageAvailable()) return;
  const saved: SavedConfigV2 = {
    schemaVersion: SCHEMA_VERSION,
    providerConnections: cfg.providerConnections ?? cfg.endpoints ?? cloneDefaultProviders(),
    runtimeProfiles: cfg.runtimeProfiles ?? cfg.profiles ?? cloneDefaultProfiles(),
    activeProfileId: cfg.activeProfileId,
    gates: cfg.gates,
  };
  try {
    writeConfig(normalizeV2(saved));
  } catch {
    /* storage unavailable or over quota - config just won't persist */
  }
}

export function loadEndpoints(): ProviderConnection[] {
  return loadProviderConnections();
}

export function loadProfiles(): RuntimeProfile[] {
  return loadRuntimeProfiles();
}

export function loadActiveProfileId(): string {
  return loadActiveRuntimeProfileId();
}

export const CONFIG_SCHEMA_VERSION = SCHEMA_VERSION;
