/** Per-tab permission resolution (Phase 5). A tab may TIGHTEN but never loosen
 *  the global gates: effective = global AND tab-capability.
 *
 *  Phase 8.5: optional AdminPolicy ceiling applied first, before user gates.
 *  Three-layer resolution: policy ceiling → user gate → tab cap → effective gate.
 */
import type { SecurityGates, TabCaps } from '../types';
import type { AdminPolicy } from '../auth/policy';

export const FULL_CAPS: TabCaps = {
  browser: true,
  tools: true,
  network: true,
  filesystem: true,
};

export function effectiveGates(
  global: SecurityGates,
  caps: TabCaps,
  policy?: AdminPolicy,
): SecurityGates {
  const ceiling = (k: keyof SecurityGates): boolean => policy?.[k] ?? true;
  return {
    filesystem: ceiling('filesystem') && global.filesystem && caps.filesystem,
    network:    ceiling('network')    && global.network    && caps.network,
    tools:      ceiling('tools')      && global.tools      && caps.tools,
  };
}
