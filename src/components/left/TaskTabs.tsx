import { useState } from 'react';
import { Plus, X, FileSearch, Radar, Code2 } from 'lucide-react';
import { useApp } from '../../state/AppState';
import type { TaskKind } from '../../types';

const KIND_ICON: Record<TaskKind, typeof FileSearch> = {
  analysis: FileSearch,
  research: Radar,
  codegen: Code2,
};

export function TaskTabs() {
  const { tasks, activeTaskId, setActiveTaskId, addTask, closeTask } = useApp();
  const [menu, setMenu] = useState(false);

  return (
    <div className="relative flex items-stretch h-8 bg-neutral-950 border-b border-neutral-800 type-control font-mono select-none">
      <div className="flex items-stretch overflow-x-auto no-scrollbar">
        {tasks.map((t) => {
          const Icon = KIND_ICON[t.kind];
          const active = t.id === activeTaskId;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTaskId(t.id)}
              className={`group flex items-center gap-2 px-3 border-r border-neutral-800 whitespace-nowrap transition-colors ${
                active
                  ? 'bg-neutral-900 text-neutral-200 border-b-2 border-b-emerald-500'
                  : 'text-neutral-500 hover:bg-neutral-900/60 hover:text-neutral-300'
              }`}
              title={`${t.name} · isolated context`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="tracking-wider">{t.name}</span>
              {tasks.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Close ${t.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTask(t.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      closeTask(t.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-neutral-600 hover:text-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setMenu((v) => !v)}
        className="px-2 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-900 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
        title="New isolated task frame"
        aria-label="New isolated task frame"
        aria-haspopup="menu"
        aria-expanded={menu}
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {menu && (
        <div role="menu" className="absolute top-8 right-0 z-50 w-44 bg-neutral-900 border border-neutral-700 shadow-2xl">
          {(
            [
              ['analysis', 'Document Analysis', FileSearch],
              ['research', 'Research Thread', Radar],
              ['codegen', 'Code Workspace', Code2],
            ] as [TaskKind, string, typeof FileSearch][]
          ).map(([kind, label, Icon]) => (
            <button
              key={kind}
              onClick={() => {
                addTask(kind);
                setMenu(false);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 text-left border-b border-neutral-800 last:border-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
            >
              <Icon className="w-3 h-3" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
