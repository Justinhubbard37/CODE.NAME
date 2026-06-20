import { describe, expect, it } from 'vitest';
import {
  activeRequestToolSummary,
  buildRuntimeCapabilityState,
  deriveToolCapabilityStates,
} from './capabilities';
import type { ToolMeta } from './webmcp';

const tools: ToolMeta[] = [
  { name: 'graph.search', description: 'Search graph' },
  { name: 'browser.open', description: 'Open browser' },
];

describe('runtime capability state', () => {
  it('does not mark registered tools active when the request has no tool bindings', () => {
    const states = deriveToolCapabilityStates(tools, {
      toolsGateOpen: true,
      hasActiveToolBindings: false,
      explicitlyAuthorized: false,
    });

    expect(states.find((state) => state.name === 'graph.search')).toEqual(expect.objectContaining({
      registered: true,
      connected: true,
      policyAllowed: true,
      explicitlyAuthorized: false,
      boundToActiveRequest: false,
      status: 'not-bound',
      statusLabel: 'Not bound',
    }));
    expect(activeRequestToolSummary(states)).toBe('TEXT-ONLY');
  });

  it('keeps unavailable scaffolding unavailable even with open gates', () => {
    const states = deriveToolCapabilityStates(tools, {
      toolsGateOpen: true,
      hasActiveToolBindings: true,
      explicitlyAuthorized: true,
    });

    expect(states.find((state) => state.name === 'browser.open')).toEqual(expect.objectContaining({
      registered: true,
      connected: false,
      policyAllowed: true,
      explicitlyAuthorized: true,
      boundToActiveRequest: false,
      status: 'unavailable',
      statusLabel: 'Unavailable',
    }));
  });

  it('distinguishes policy-blocked tools from unavailable tools', () => {
    const states = deriveToolCapabilityStates(tools, {
      toolsGateOpen: false,
      hasActiveToolBindings: true,
      explicitlyAuthorized: true,
    });

    expect(states.find((state) => state.name === 'graph.search')?.status).toBe('policy-blocked');
    expect(states.find((state) => state.name === 'browser.open')?.status).toBe('unavailable');
  });

  it('only reports tool-enabled when a connected tool is explicitly authorized and bound', () => {
    const states = deriveToolCapabilityStates([tools[0]], {
      toolsGateOpen: true,
      hasActiveToolBindings: true,
      explicitlyAuthorized: true,
    });

    expect(states[0].boundToActiveRequest).toBe(true);
    expect(activeRequestToolSummary(states)).toBe('TOOL-ENABLED');
  });

  it('builds the central runtime capability snapshot used by UI surfaces', () => {
    const snapshot = buildRuntimeCapabilityState(tools, {
      toolsGateOpen: true,
      hasActiveToolBindings: false,
      explicitlyAuthorized: false,
    });

    expect(snapshot.hasActiveToolBindings).toBe(false);
    expect(snapshot.explicitlyAuthorized).toBe(false);
    expect(snapshot.toolSummary).toBe('TEXT-ONLY');
    expect(snapshot.toolBindings.find((state) => state.name === 'graph.search')?.status).toBe('not-bound');
    expect(snapshot.toolBindings.find((state) => state.name === 'browser.open')?.status).toBe('unavailable');
  });

  it('keeps browser unavailable from central state even before tool registration syncs', () => {
    const snapshot = buildRuntimeCapabilityState([], {
      toolsGateOpen: true,
      hasActiveToolBindings: false,
      explicitlyAuthorized: false,
    });

    expect(snapshot.toolSummary).toBe('TEXT-ONLY');
    expect(snapshot.toolBindings).toContainEqual(expect.objectContaining({
      name: 'browser.open',
      registered: true,
      connected: false,
      boundToActiveRequest: false,
      status: 'unavailable',
    }));
  });
});
