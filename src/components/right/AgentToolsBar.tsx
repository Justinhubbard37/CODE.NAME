import { Wrench } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { useT } from '../../i18n';

/** Lists registered tool scaffolding and whether it is bound to the active request. */
export function AgentToolsBar() {
  const { runtimeCapabilities } = useApp();
  const t = useT();
  const states = runtimeCapabilities.toolBindings;

  return (
    <div className="shrink-0 border-b border-neutral-800 bg-neutral-950 px-3 py-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
      <Wrench className="w-3 h-3 text-neutral-500 shrink-0" aria-hidden="true" />
      <span className="type-label font-mono text-neutral-400 uppercase tracking-wider shrink-0">Tool Bindings</span>
      {states.length === 0 ? (
        // Empty state (Slice 10.4): keep the bar present with an explanation
        // instead of collapsing it, so the row never silently disappears.
        <span className="type-meta font-mono text-neutral-400 italic shrink-0">{t('tools.empty')}</span>
      ) : (
        states.map((state) => {
          return (
            <span
              key={state.name}
              title={`${state.name} - ${state.detail}`}
              className={`type-meta font-mono border border-neutral-800 px-1.5 py-0.5 whitespace-nowrap ${
                state.boundToActiveRequest
                  ? 'text-emerald-300/80'
                  : state.status === 'unavailable'
                    ? 'text-neutral-500'
                    : state.status === 'policy-blocked'
                      ? 'text-red-300/80'
                      : 'text-neutral-400'
              }`}
            >
              {state.name} · {state.statusLabel}
            </span>
          );
        })
      )}
    </div>
  );
}
