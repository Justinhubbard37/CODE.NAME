import { ChevronDown, ChevronRight, Bot } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { StatusModule } from './StatusModule';

export function AgentHeader() {
  const { activeTask, showActivity, setShowActivity } = useApp();
  const activityCount = activeTask.activity.length;

  return (
    <div className="flex items-center justify-between gap-2 px-3 h-10 bg-neutral-950 border-b border-neutral-800 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Bot className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
        <span className="font-mono type-section text-neutral-200 tracking-wider truncate">
          {activeTask.agent}
        </span>
        <span className="type-meta text-neutral-400 font-mono uppercase truncate">
          {activeTask.name}
        </span>
        <button
          onClick={() => setShowActivity(!showActivity)}
          className="flex items-center gap-0.5 type-control font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-600 rounded px-1 py-0.5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
          title={showActivity ? 'Collapse activity stream' : 'Expand activity stream'}
          aria-label={showActivity ? 'Collapse activity stream' : 'Expand activity stream'}
          aria-expanded={showActivity}
        >
          {showActivity ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
          LOGIC
          {activityCount > 0 && (
            <span className="text-emerald-400/80">{activityCount}</span>
          )}
        </button>
      </div>
      <StatusModule />
    </div>
  );
}
