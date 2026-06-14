import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Pencil } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { EndpointEditor } from '../config/EndpointEditor';
import { reachesNetwork } from '../../lib/llm';
import type { Endpoint, EndpointStatus } from '../../types';

const COLOR: Record<EndpointStatus, string> = {
  offline: 'text-neutral-500 border-neutral-700 bg-neutral-800/40',
  configuring: 'text-amber-300 border-amber-500/50 bg-amber-500/10',
  ready: 'text-emerald-300 border-emerald-500/50 bg-emerald-500/10',
  error: 'text-red-300 border-red-500/50 bg-red-500/10',
};
const DOT: Record<EndpointStatus, string> = {
  offline: 'bg-neutral-500',
  configuring: 'bg-amber-400 animate-pulse',
  ready: 'bg-emerald-400',
  error: 'bg-red-400',
};

export function StatusModule() {
  const { endpoints, activeEndpoint, refreshEndpoints, activeProfile, updateProfile, updateEndpoint } =
    useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const st = activeEndpoint.status;

  // Close the matrix when clicking anywhere outside it, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Route the active profile to the chosen endpoint, then close.
  const selectEndpoint = (id: string) => {
    updateProfile(activeProfile.id, { endpointId: id });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative font-mono text-[10px]">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-2 py-1 border rounded-full transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${COLOR[st]}`}
          title="Endpoint connectivity — click to choose where chat routes"
          aria-label={`Endpoint ${activeEndpoint.label}: ${st}. Choose where chat routes`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${DOT[st]}`} />
          <span className="uppercase tracking-wider">{st}</span>
          <span className="text-neutral-500">·</span>
          <span className="text-neutral-400 normal-case">{activeEndpoint.label}</span>
        </button>
        <button
          onClick={() => refreshEndpoints()}
          className="p-1 text-neutral-500 hover:text-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
          title="Probe all endpoints"
          aria-label="Probe all endpoints"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div role="menu" aria-label="Endpoint matrix" className="absolute top-8 right-0 z-50 w-72 bg-neutral-900 border border-neutral-700 shadow-2xl p-1">
          <div className="px-2 py-1 text-neutral-500 uppercase tracking-wider border-b border-neutral-800">
            Endpoint Matrix · click to route · ✎ to edit
          </div>
          {endpoints.map((e) => {
            const active = e.id === activeEndpoint.id;
            return (
              <div
                key={e.id}
                className={`flex items-center justify-between gap-2 px-1 transition-colors hover:bg-neutral-800 ${
                  active ? 'bg-neutral-800/60' : ''
                }`}
              >
                <button
                  onClick={() => selectEndpoint(e.id)}
                  title={`Route chat to ${e.label}`}
                  aria-label={`Route chat to ${e.label}${active ? ' (active)' : ''}`}
                  role="menuitemradio"
                  aria-checked={active}
                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left py-1.5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
                >
                  <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[e.status]}`} />
                  <div className="min-w-0">
                    <div className="text-neutral-300 truncate">
                      {e.label}
                      {active && <span className="ml-1 text-[8px] text-emerald-400">ACTIVE</span>}
                    </div>
                    <div className="text-[8px] text-neutral-600 truncate">
                      {e.model} · {e.detail ?? e.status}
                      {reachesNetwork(e) ? ' · CLOUD' : ' · LOCAL'}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setEditing(e);
                    setOpen(false);
                  }}
                  title="Edit this endpoint"
                  aria-label={`Edit endpoint ${e.label}`}
                  className="shrink-0 p-1 text-neutral-600 hover:text-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
                >
                  <Pencil className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EndpointEditor
          endpoint={editing}
          onClose={() => setEditing(null)}
          onSave={updateEndpoint}
        />
      )}
    </div>
  );
}
