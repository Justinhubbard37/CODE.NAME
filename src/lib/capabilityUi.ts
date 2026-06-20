import type { RuntimeCapabilityState } from './capabilities';
import type { TabCaps } from '../types';

export function isTabCapabilityUnavailable(
  capability: keyof TabCaps,
  runtimeCapability: RuntimeCapabilityState | undefined,
): boolean {
  return capability === 'browser' && runtimeCapability?.status === 'unavailable';
}

export function canToggleTabCapability(
  capability: keyof TabCaps,
  runtimeCapability: RuntimeCapabilityState | undefined,
): boolean {
  return !isTabCapabilityUnavailable(capability, runtimeCapability);
}

export function tabCapabilityStatusLabel(
  capability: keyof TabCaps,
  capEnabled: boolean,
  policyOpen: boolean,
  runtimeCapability: RuntimeCapabilityState | undefined,
): string {
  if (isTabCapabilityUnavailable(capability, runtimeCapability)) return 'N/A';
  if (capEnabled && policyOpen) return 'POLICY';
  if (capEnabled) return 'BLOCKED';
  return 'OFF';
}
