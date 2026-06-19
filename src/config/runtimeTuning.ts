import type { RuntimeOverrides, RuntimeProfile } from '../types';
import { CANONICAL_RUNTIME_PROFILE_DEFAULTS, defaultRuntimeProfiles } from './defaults';

const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;
const MIN_CONTEXT_WINDOW = 512;
const MAX_CONTEXT_WINDOW = 131072;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function canonicalProfileFor(id: string | undefined): Pick<RuntimeProfile, 'defaultTemperature' | 'defaultContextWindow'> {
  return (
    defaultRuntimeProfiles.find((profile) => profile.id === id) ??
    CANONICAL_RUNTIME_PROFILE_DEFAULTS
  );
}

export function normalizeRuntimeTemperature(
  value: unknown,
  fallback: number = CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultTemperature,
): number {
  const numeric = finiteNumber(value);
  if (numeric === undefined || numeric < MIN_TEMPERATURE || numeric > MAX_TEMPERATURE) {
    return fallback;
  }
  return numeric;
}

export function normalizeRuntimeContextWindow(
  value: unknown,
  fallback: number = CANONICAL_RUNTIME_PROFILE_DEFAULTS.defaultContextWindow,
): number {
  const numeric = finiteNumber(value);
  if (numeric === undefined || numeric < MIN_CONTEXT_WINDOW || numeric > MAX_CONTEXT_WINDOW) {
    return fallback;
  }
  return numeric;
}

export function normalizeRuntimeProfileTuning<T extends Partial<RuntimeProfile>>(profile: T): T & {
  defaultTemperature: number;
  defaultContextWindow: number;
} {
  const fallback = canonicalProfileFor(profile.id);
  return {
    ...profile,
    defaultTemperature: normalizeRuntimeTemperature(
      profile.defaultTemperature,
      fallback.defaultTemperature,
    ),
    defaultContextWindow: normalizeRuntimeContextWindow(
      profile.defaultContextWindow,
      fallback.defaultContextWindow,
    ),
  };
}

export function resolveEffectiveRuntimeTuning({
  runtimeOverrides,
  profile,
}: {
  runtimeOverrides?: RuntimeOverrides;
  profile?: Partial<Pick<RuntimeProfile, 'id' | 'defaultTemperature' | 'defaultContextWindow'>>;
}): { temperature: number; contextWindow: number } {
  const normalizedProfile = normalizeRuntimeProfileTuning(profile ?? {});
  return {
    temperature: normalizeRuntimeTemperature(
      runtimeOverrides?.temperature,
      normalizedProfile.defaultTemperature,
    ),
    contextWindow: normalizeRuntimeContextWindow(
      runtimeOverrides?.contextWindow,
      normalizedProfile.defaultContextWindow,
    ),
  };
}
