import { describe, it, expect } from 'vitest';
import { effectiveGates, FULL_CAPS } from './perms';
import type { SecurityGates, TabCaps } from '../types';

const allOpen: SecurityGates = { filesystem: true, network: true, tools: true };

describe('effectiveGates (per-tab scope is tighten-only)', () => {
  it('equals the global gates when the tab keeps full capabilities', () => {
    expect(effectiveGates(allOpen, FULL_CAPS)).toEqual(allOpen);
  });

  it('lets a tab REVOKE a capability the global gate allows', () => {
    const caps: TabCaps = { browser: true, tools: false, network: true, filesystem: true };
    const e = effectiveGates(allOpen, caps);
    expect(e.tools).toBe(false);
    expect(e.network).toBe(true);
    expect(e.filesystem).toBe(true);
  });

  it('does NOT let a tab GRANT a capability the global gate denies', () => {
    const globalClosed: SecurityGates = { filesystem: false, network: false, tools: false };
    expect(effectiveGates(globalClosed, FULL_CAPS)).toEqual({
      filesystem: false,
      network: false,
      tools: false,
    });
  });
});
