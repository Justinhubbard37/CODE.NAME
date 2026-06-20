import { describe, expect, it } from 'vitest';
import { canToggleTabCapability, isTabCapabilityUnavailable, tabCapabilityStatusLabel } from './capabilityUi';
import type { RuntimeCapabilityState } from './capabilities';

const unavailableBrowser: RuntimeCapabilityState = {
  name: 'browser.open',
  registered: true,
  connected: false,
  policyAllowed: true,
  explicitlyAuthorized: false,
  boundToActiveRequest: false,
  status: 'unavailable',
  statusLabel: 'Unavailable',
  detail: 'Registered scaffold; no connected runtime.',
};

describe('capability UI decisions', () => {
  it('marks unavailable browser capability as unavailable and non-toggleable', () => {
    expect(isTabCapabilityUnavailable('browser', unavailableBrowser)).toBe(true);
    expect(canToggleTabCapability('browser', unavailableBrowser)).toBe(false);
    expect(tabCapabilityStatusLabel('browser', true, true, unavailableBrowser)).toBe('N/A');
  });

  it('keeps filesystem, network, and tools as policy states', () => {
    expect(isTabCapabilityUnavailable('tools', unavailableBrowser)).toBe(false);
    expect(canToggleTabCapability('tools', unavailableBrowser)).toBe(true);
    expect(tabCapabilityStatusLabel('tools', true, true, unavailableBrowser)).toBe('POLICY');
    expect(tabCapabilityStatusLabel('network', true, false, unavailableBrowser)).toBe('BLOCKED');
    expect(tabCapabilityStatusLabel('filesystem', false, true, unavailableBrowser)).toBe('OFF');
  });
});
