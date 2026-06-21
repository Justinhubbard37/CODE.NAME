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

function normalizeModelForProvider(
  model: ModelInventoryEntry,
  providerId: CanonicalProviderId,
): ModelInventoryEntry {
  if (providerId === 'ollama') {
    return {
      ...model,
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
  providers: Pick<ProviderConnection, 'id' | 'connectionId' | 'label' | 'providerKind'>[] = [],
): string {
  const provider = providers.find((candidate) => candidate.id === providerId);
  const canonical = canonicalProviderIdFromFields(provider ?? { id: providerId });
  if (!canonical || canonical === 'sidecar') return '';
  if (
    provider &&
    canonical === 'custom-openai' &&
    provider.connectionId &&
    provider.id === provider.connectionId
  ) {
    return provider.id;
  }
  return canonical;
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
      baseUrl: incoming.baseUrl || incoming.displayEndpoint || current.baseUrl || base.baseUrl,
      displayEndpoint: incoming.displayEndpoint ?? current.displayEndpoint,
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
      baseUrl: incoming.baseUrl || incoming.displayEndpoint || current.baseUrl || base.baseUrl,
      displayEndpoint: incoming.displayEndpoint ?? current.displayEndpoint,
      requiresNetwork: true,
      requiresSecret: true,
      secretRequirement: 'keychain',
      apiKeyEnv: 'GEMINI_API_KEY',
      userEditable: base.userEditable,
    };
  }

  if (providerId === 'custom-openai') {
    const hasRustConnection = !!(incoming.connectionId ?? current.connectionId);
    return {
      ...merged,
      providerKind: 'openai-compatible',
      baseUrl: hasRustConnection ? incoming.baseUrl || incoming.displayEndpoint || current.baseUrl || base.baseUrl : base.baseUrl,
      displayEndpoint: hasRustConnection ? incoming.displayEndpoint ?? incoming.baseUrl ?? current.displayEndpoint ?? current.baseUrl : undefined,
      requiresNetwork: hasRustConnection ? incoming.requiresNetwork ?? current.requiresNetwork : false,
      requiresSecret: hasRustConnection ? incoming.requiresSecret ?? current.requiresSecret : false,
      secretRequirement: hasRustConnection ? incoming.secretRequirement ?? current.secretRequirement : 'none',
      apiKeyEnv: undefined,
      userEditable: true,
      models: hasRustConnection
        ? merged.models
        : merged.models.map((model) => ({
            ...model,
            executionClass: 'unknown',
            availability: 'stale',
          })),
    };
  }

  return {
    ...merged,
    baseUrl: incoming.baseUrl || incoming.displayEndpoint || current.baseUrl || base.baseUrl,
    displayEndpoint: incoming.displayEndpoint ?? current.displayEndpoint,
    requiresNetwork: false,
    requiresSecret: false,
    secretRequirement: 'none',
    userEditable: incoming.userEditable ?? current.userEditable,
  };
}

function isAdditionalCustomConnection(provider: ProviderConnection): boolean {
  const canonicalId = canonicalProviderIdFromFields(provider);
  if (canonicalId !== 'custom-openai') return false;
  if (!provider.connectionId) return false;
  const connectionId = provider.connectionId ?? provider.id;
  return provider.id !== 'custom-openai' && connectionId !== 'custom-openai';
}

function mergeAdditionalCustomConnection(provider: ProviderConnection): ProviderConnection {
  const merged = mergeProvider(canonicalDefault('custom-openai'), provider, 'custom-openai');
  const connectionId = provider.connectionId ?? provider.id;
  return {
    ...merged,
    id: provider.id || connectionId,
    connectionId,
    label: provider.label || connectionId,
    baseUrl: provider.baseUrl || provider.displayEndpoint || '',
    displayEndpoint: provider.displayEndpoint ?? provider.baseUrl,
    requiresNetwork: provider.requiresNetwork,
    requiresSecret: provider.requiresSecret,
    secretRequirement: provider.secretRequirement,
    apiKeyEnv: undefined,
    userEditable: true,
  };
}

export function normalizeProviderConnections(
  providers: ProviderConnection[] | undefined,
): ProviderConnection[] {
  const canonical = new Map<CanonicalProviderId, ProviderConnection>(
    CANONICAL_PROVIDER_IDS.map((id) => [id, canonicalDefault(id)]),
  );
  const additionalCustom = new Map<string, ProviderConnection>();

  for (const provider of providers ?? []) {
    const canonicalId = canonicalProviderIdFromFields(provider);
    if (!canonicalId || canonicalId === 'sidecar') continue;
    if (isAdditionalCustomConnection(provider)) {
      const merged = mergeAdditionalCustomConnection(provider);
      additionalCustom.set(merged.connectionId ?? merged.id, merged);
      continue;
    }
    canonical.set(canonicalId, mergeProvider(canonical.get(canonicalId)!, provider, canonicalId));
  }

  const normalProviders = CANONICAL_PROVIDER_IDS.map((id) => {
    const provider = canonical.get(id)!;
    return {
      ...provider,
      detail: provider.detail || 'Model inventory has not been refreshed.',
      lastFailure: undefined,
    };
  });
  return [
    ...normalProviders,
    ...Array.from(additionalCustom.values()).map((provider) => ({
      ...provider,
      detail: provider.detail || 'Model inventory has not been refreshed.',
      lastFailure: undefined,
    })),
  ];
}

export function normalProviderMenuProviders(providers: ProviderConnection[]): ProviderConnection[] {
  return normalizeProviderConnections(providers).filter((provider) =>
    CANONICAL_PROVIDER_IDS.includes(provider.id as CanonicalProviderId),
  );
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
