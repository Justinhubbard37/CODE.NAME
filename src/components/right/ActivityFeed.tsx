import { useApp } from '../../state/AppState';
import type { ActivityKind } from '../../types';

const TAG: Record<ActivityKind, { c: string; t: string }> = {
  tool: { c: 'text-sky-400', t: 'TOOL' },
  reasoning: { c: 'text-violet-400', t: 'REASON' },
  query: { c: 'text-emerald-400', t: 'QUERY' },
  system: { c: 'text-amber-400', t: 'SYS' },
  network: { c: 'text-cyan-400', t: 'NET' },
};

export function ActivityFeed() {
  const { activeTask, showActivity } = useApp();
  if (!showActivity) return null;

  const events = activeTask.activity;

  return (
    <div className="shrink-0 max-h-32 overflow-y-auto bg-black/60 border-b border-neutral-800 px-3 py-2 font-mono type-meta">
      {events.length === 0 ? (
        <div className="text-neutral-600 italic">// live activity stream — tool calls, reasoning, retrievals</div>
      ) : (
        events.map((e) => {
          const tag = TAG[e.kind];
          return (
            <div key={e.id} className="flex gap-2">
              <span className="text-neutral-700 shrink-0">
                {new Date(e.ts).toLocaleTimeString([], { hour12: false })}
              </span>
              <span className={`shrink-0 w-12 ${tag.c}`}>[{tag.t}]</span>
              <span className="text-neutral-400 break-all">{e.text}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
