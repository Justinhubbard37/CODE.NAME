import { useEffect, useState } from 'react';
import { Layout, X } from 'lucide-react';
import { subscribeAgentUI, getAgentUI, setAgentUI } from './a2ui/bus';
import { A2UIRenderer } from './a2ui/A2UIRenderer';
import type { A2UIAction, A2UIPayload } from './a2ui/types';
import { executeTool } from '../../lib/webmcp';
import { useApp } from '../../state/AppState';

/**
 * Renders agent-generated A2UI into the right pane (Phase 4).
 *
 * Phase 5 Slice 5.3: subscribes per-task — switching tabs shows that
 * tab's own agent UI.
 * Phase 5 Slice 5.2: button actions carry form field `values`.
 */
export function AgentUIPanel() {
  const { sendMessage, activeTaskId } = useApp();
  const [ui, setUi] = useState<A2UIPayload | null>(getAgentUI(activeTaskId));

  // Re-subscribe whenever the active tab changes (Slice 5.3).
  useEffect(() => {
    setUi(getAgentUI(activeTaskId));
    return subscribeAgentUI(activeTaskId, setUi);
  }, [activeTaskId]);

  if (!ui) return null;

  function handleAction(a: A2UIAction) {
    if (a.tool) {
      // Pass form values as extra tool args (Slice 5.2).
      void executeTool(a.tool, { ...(a.toolArgs ?? {}), ...(a.values ?? {}) });
    } else if (a.prompt) {
      // Append form field values as labelled context lines (Slice 5.2).
      const suffix =
        a.values && Object.keys(a.values).length
          ? '\n' + Object.entries(a.values).map(([k, v]) => `${k}: ${v}`).join('\n')
          : '';
      sendMessage(a.prompt + suffix);
    }
  }

  return (
    <div className="shrink-0 border-b border-neutral-800 bg-neutral-900/40 max-h-64 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-1.5 type-label font-mono uppercase tracking-wider text-neutral-400">
        <span className="flex items-center gap-1">
          <Layout className="w-3 h-3" aria-hidden="true" /> Agent UI · A2UI
        </span>
        <button
          onClick={() => setAgentUI(activeTaskId, null)}
          aria-label="Dismiss agent UI"
          className="text-neutral-400 hover:text-neutral-300 flex items-center gap-1 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
        >
          <X className="w-3 h-3" aria-hidden="true" /> dismiss
        </button>
      </div>
      <div className="px-3 pb-3">
        <A2UIRenderer payload={ui} onAction={handleAction} />
      </div>
    </div>
  );
}
