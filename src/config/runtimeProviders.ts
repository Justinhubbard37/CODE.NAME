import type { ModelInventoryEntry, ProviderConnection } from '../types';
import { defaultProviderConnections } from './defaults';

export const CANONICAL_PROVIDER_IDS = ['ollama', 'lmstudio', 'custom-openai', 'gemini'] as const;
export type CanonicalProviderId = (typeof CANONICAL_PROVIDER_IDS)[number];
export type ProviderMenuActionId = 'setup-sidecar' | 'provider-manager';
export type SettingsView = 'settings' | 'provider-manager' | 'sidecar-setup';

export type NormalProviderMenuItem =
  | { type: 'provider'; provider: ProviderConnection }
  | { type: 'divider'; id: 'management-divider' }
  | {
      type: 'action';
      id: ProviderMenuActionId;
      label: string;
      target: SettingsView;
    };

const LEGACY_ID_ALIASES: Record<string, CanonicalProviderId | 'sidecar'> = {
  'ollama': 'ollama',
  'ollama-local': 'ollama',
  'ollama-cloud': 'ollama',
  'lmstudio': 'lmstudio',
  'lm-studio': 'lmstudio',
  'lmstudio-local': 'lmstudio',
  'lm-studio-local': 'lmstudio',
  'gemini': 'gemini',
  'gemini-cloud': 'gemini',
  'gemini-cloud-secondary': 'gemini',
  'custom-openai': 'custom-openai',
  'custom-openai-compatible': 'custom-openai',
  'openai-compatible': 'custom-openai',
  'agent-sidecar': 'sidecar',
  'agent-sidecar-a2a': 'sidecar',
  'sidecar': 'sidecar',
};

const defaultById = new Map(defaultProviderConnections.map((provider) => [provider.id, provider]));

function cloneProvider(provider: ProviderConnection): ProviderConnection {
  return {
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
    lastFailure: undefined,
  };
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_()]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isOllamaCloudTaggedModel(id: string): boolean {
  const lowered = id.toLowerCase();
  return lowered.endsWith(':cloud') || lowered.endsWith('-cloud');
}

function normalizeModelForProvider(
  model: ModelInventoryEntry,
  providerId: CanonicalProviderId,
): ModelInventoryEntry {
  if (providerId === 'ollama') {
    return {
      ...model,
      executionClass: isOllamaCloudTaggedModel(model.id) ? 'cloud' : 'local',
      source: model.source === 'configured' ? 'ollama' : model.source,
    };
  }
  if (providerId === 'lmstudio') {
    return {
      ...model,
      executionClass: 'local',
      source: model.source === 'configured' ? 'lmstudio' : model.source,
    };
  }
  if (providerId === 'gemini') {
    return {
      ...model,
      executionClass: 'cloud',
      source: model.source === 'configured' ? 'gemini' : model.source,
    };
  }
  return {
    ...model,
    source: model.source === 'configured' ? 'openai-compatible' : model.source,
  };
}

function mergeModels(
  existing: ModelInventoryEntry[],
  incoming: ModelInventoryEntry[] | undefined,
  providerId: CanonicalProviderId,
): ModelInventoryEntry[] {
  const merged = new Map<string, ModelInventoryEntry>();
  for (const model of [...existing, ...(incoming ?? [])]) {
    if (!model?.id) continue;
    merged.set(model.id, normalizeModelForProvider({ ...model }, providerId));
  }
  return Array.from(merged.values());
}

export function canonicalProviderIdFromFields(fields: {
  id?: unknown;
  label?: unknown;
  kind?: unknown;
  providerKind?: unknown;
}): CanonicalProviderId | 'sidecar' | undefined {
  const values = [
    normalizeToken(fields.id),
    normalizeToken(fields.providerKind),
    normalizeToken(fields.kind),
    normalizeToken(fields.label),
  ].filter(Boolean);

  for (const value of values) {
    const direct = LEGACY_ID_ALIASES[value];
    if (direct) return direct;
  }

  if (values.some((value) => value.includes('agent-sidecar') || value === 'a2a')) return 'sidecar';
  if (values.some((value) => value.includes('ollama'))) return 'ollama';
  if (values.some((value) => value.includes('lmstudio') || value.includes('lm-studio'))) return 'lmstudio';
  if (values.some((value) => value.includes('gemini'))) return 'gemini';
  if (values.some((value) => value.includes('openai-compatible') || value.includes('custom-openai'))) {
    return 'custom-openai';
  }
  if (values.some((value) => value === 'custom' || value === 'openai')) return 'custom-openai';
  return undefined;
}

export function canonicalProviderIdForReference(
  providerId: string | undefined,
  providers: Pick<ProviderConnection, 'id' | 'label' | 'providerKind'>[] = [],
): CanonicalProviderId | '' {
  const provider = providers.find((candidate) => candidate.id === providerId);
  const canonical = canonicalProviderIdFromFields(provider ?? { id: providerId });
  return canonical && canonical !== 'sidecar' ? canonical : '';
}

function canonicalDefault(providerId: CanonicalProviderId): ProviderConnection {
  const provider = cloneProvider(defaultById.get(providerId)!);
  return {
    ...provider,
    models: provider.models.map((model) => normalizeModelForProvider(model, providerId)),
  };
}

function mergeProvider(
  current: ProviderConnection,
  incoming: ProviderConnection,
  providerId: CanonicalProviderId,
): ProviderConnection {
  const base = canonicalDefault(providerId);
  const status = incoming.status === 'configuring' ? 'unknown' : incoming.status;
  const merged: ProviderConnection = {
    ...current,
    ...incoming,
    id: providerId,
    label: base.label,
    providerKind: base.providerKind,
    status: status ?? current.status,
    detail: incoming.detail || current.detail || base.detail,
    models: mergeModels(current.models, incoming.models, providerId),
    lastFailure: undefined,
  };

  if (providerId === 'ollama') {
    return {
      ...merged,
      baseUrl: base.baseUrl,
      requiresNetwork: false,
      requiresSecret: false,
      secretRequirement: 'none',
      apiKeyEnv: undefined,
      userEditable: base.userEditable,
    };
  }

  if (providerId === 'gemini') {
    return {
      ...merged,
      baseUrl: base.baseUrl,
      requiresNetwork: true,
      requiresSecret: true,
      secretRequirement: 'keychain',
      apiKeyEnv: 'GEMINI_API_KEY',
      userEditable: base.userEditable,
    };
  }

  if (providerId === 'custom-openai') {
    return {
      ...merged,
      providerKind: 'openai-compatible',
      baseUrl: incoming.baseUrl || current.baseUrl || base.baseUrl,
      requiresNetwork: incoming.requiresNetwork ?? current.requiresNetwork,
      requiresSecret: incoming.requiresSecret ?? current.requiresSecret,
      secretRequirement: incoming.secretRequirement ?? current.secretRequirement,
      apiKeyEnv: incoming.apiKeyEnv,
      userEditable: true,
    };
  }

  return {
    ...merged,
    baseUrl: incoming.baseUrl || current.baseUrl || base.baseUrl,
    requiresNetwork: false,
    requiresSecret: false,
    secretRequirement: 'none',
    userEditable: incoming.userEditable ?? current.userEditable,
  };
}

export function normalizeProviderConnections(
  providers: ProviderConnection[] | undefined,
): ProviderConnection[] {
  const canonical = new Map<CanonicalProviderId, ProviderConnection>(
    CANONICAL_PROVIDER_IDS.map((id) => [id, canonicalDefault(id)]),
  );

  for (const provider of providers ?? []) {
    const canonicalId = canonicalProviderIdFromFields(provider);
    if (!canonicalId || canonicalId === 'sidecar') continue;
    canonical.set(canonicalId, mergeProvider(canonical.get(canonicalId)!, provider, canonicalId));
  }

  return CANONICAL_PROVIDER_IDS.map((id) => {
    const provider = canonical.get(id)!;
    return {
      ...provider,
      detail: provider.detail || 'Model inventory has not been refreshed.',
      lastFailure: undefined,
    };
  });
}

export function normalProviderMenuProviders(providers: ProviderConnection[]): ProviderConnection[] {
  return normalizeProviderConnections(providers);
}

export function providerMenuActionTarget(actionId: ProviderMenuActionId): SettingsView {
  return actionId === 'setup-sidecar' ? 'sidecar-setup' : 'provider-manager';
}

export function buildNormalProviderMenu(providers: ProviderConnection[]): NormalProviderMenuItem[] {
  return [
    ...normalProviderMenuProviders(providers).map((provider): NormalProviderMenuItem => ({
      type: 'provider',
      provider,
    })),
    { type: 'divider', id: 'management-divider' },
    {
      type: 'action',
      id: 'setup-sidecar',
      label: 'Set Up Agent Sidecar',
      target: providerMenuActionTarget('setup-sidecar'),
    },
    {
      type: 'action',
      id: 'provider-manager',
      label: 'Provider Manager',
      target: providerMenuActionTarget('provider-manager'),
    },
  ];
}
