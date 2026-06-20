import { useEffect, useState } from 'react';
import { useApp } from '../../state/AppState';
import { subscribePools, poolSnapshot } from '../../lib/pools';
import { canToggleTabCapability, isTabCapabilityUnavailable, tabCapabilityStatusLabel } from '../../lib/capabilityUi';
import type { TabCaps } from '../../types';

const CAPS: [keyof TabCaps, string][] = [
  ['browser', 'BROWSER'],
  ['tools', 'TOOLS'],
  ['network', 'NET'],
  ['filesystem', 'FS'],
];

/**
 * Per-tab environment strip (Phase 5): session id, per-tab capability scope
 * (tighten only), and shared-pool usage. Tabs share infra, not unapproved state.
 */
export function EnvironmentBar() {
  const { activeTask, setTabCap, gates, runtimeCapabilities } = useApp();
  const [pools, setPools] = useState(poolSnapshot());
  useEffect(() => subscribePools(() => setPools(poolSnapshot())), []);

  const caps = activeTask.session.caps;
  const browserCapability = runtimeCapabilities.toolBindings.find((state) => state.name === 'browser.open');

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 h-7 bg-neutral-950 border-b border-neutral-900 type-meta font-mono overflow-x-auto no-scrollbar">
      <span className="text-neutral-400 uppercase tracking-wider shrink-0">ENV {activeTask.session.id}</span>
      <span className="text-neutral-800 shrink-0">|</span>
      {CAPS.map(([k, label]) => {
        const globalOpen = k === 'browser' ? gates.tools : gates[k as keyof typeof gates];
        const on = caps[k] && (globalOpen ?? true);
        const unavailable = isTabCapabilityUnavailable(k, browserCapability);
        const toggleable = canToggleTabCapability(k, browserCapability);
        const statusLabel = tabCapabilityStatusLabel(k, caps[k], globalOpen ?? true, browserCapability);
        return (
          <button
            key={k}
            onClick={() => {
              if (!toggleable) return;
              setTabCap(activeTask.id, k, !caps[k]);
            }}
            disabled={!toggleable}
            title={
              unavailable
                ? 'Browser execution is unavailable; this is policy scope only'
                : 'Policy scope only; not an active runtime binding'
            }
            aria-disabled={!toggleable}
            aria-label={`${label} capability for this tab: ${
              unavailable ? 'unavailable' : caps[k] ? 'granted policy scope' : 'revoked policy scope'
            }`}
            aria-pressed={unavailable ? false : !!caps[k]}
            className={`px-1.5 py-0.5 border shrink-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${
              unavailable
                ? 'border-neutral-800 text-neutral-500 cursor-not-allowed opacity-70'
                : on
                ? 'border-emerald-500/40 text-emerald-300'
                : caps[k]
                  ? 'border-amber-500/40 text-amber-400'
                  : 'border-red-500/40 text-red-400 line-through'
            }`}
          >
            {label} {statusLabel}
          </button>
        );
      })}
      <span className="text-neutral-800 shrink-0">|</span>
      <span className="text-neutral-400 shrink-0">
        POOL scaffold br {pools.browser.used}/{pools.browser.cap} · ag {pools.agent.used}/{pools.agent.cap}
      </span>
    </div>
  );
}
