import { FileCheck2, FilePlus2, FileX2, Loader2, GitFork, RotateCw, Ban, X } from 'lucide-react';
import { useApp } from '../../state/AppState';
import type { QuarantineItem, QuarantineStatus } from '../../types';

/**
 * Ingestion Ledger — the gated file-intake / quarantine panel. Shows files as
 * they are hashed, deduped, and indexed, and surfaces conflict resolution
 * (overwrite / skip / keep both). NOT to be confused with the AuditLedger,
 * which is the append-only knowledge-graph write history.
 */
const META: Record<QuarantineStatus, { icon: typeof FileCheck2; c: string; label: string }> = {
  checking: { icon: Loader2, c: 'text-amber-400', label: 'CHECKING' },
  ready: { icon: FilePlus2, c: 'text-sky-400', label: 'READY' },
  conflict: { icon: FileX2, c: 'text-red-400', label: 'CONFLICT' },
  indexed: { icon: FileCheck2, c: 'text-emerald-400', label: 'INDEXED' },
  skipped: { icon: Ban, c: 'text-neutral-500', label: 'SKIPPED' },
  rejected: { icon: Ban, c: 'text-red-500', label: 'REJECTED' },
};

function Row({ item }: { item: QuarantineItem }) {
  const { resolveConflict, nodes } = useApp();
  const m = META[item.status];
  const Icon = m.icon;
  const target = nodes.find((n) => n.id === item.conflictWith);

  return (
    <div className="border border-neutral-800 bg-neutral-950/60 px-2 py-1.5">
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <Icon aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 ${m.c} ${item.status === 'checking' ? 'animate-spin' : ''}`} />
        <span className="text-neutral-300 truncate flex-1">{item.name}</span>
        <span className={`shrink-0 ${m.c}`}>{m.label}</span>
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-[8px] text-neutral-600 font-mono pl-5">
        <span className="truncate">{item.hash}</span>
        {item.size > 0 && <span>· {item.size}B</span>}
      </div>

      {item.status === 'conflict' && (
        <div className="mt-2 pl-5">
          <div className="text-[8px] text-red-300/80 font-mono mb-1">
            redundant with {target?.data.label ?? item.conflictWith}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => resolveConflict(item.id, 'overwrite')}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-mono border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              <RotateCw className="w-2.5 h-2.5" aria-hidden="true" /> OVERWRITE
            </button>
            <button
              onClick={() => resolveConflict(item.id, 'skip')}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-mono border border-neutral-600 text-neutral-400 hover:bg-neutral-800"
            >
              <Ban className="w-2.5 h-2.5" aria-hidden="true" /> SKIP
            </button>
            <button
              onClick={() => resolveConflict(item.id, 'fork')}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-mono border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
            >
              <GitFork className="w-2.5 h-2.5" aria-hidden="true" /> KEEP BOTH
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function IngestionLedger() {
  const { quarantine, clearLedger } = useApp();
  if (quarantine.length === 0) return null;

  const conflicts = quarantine.filter((q) => q.status === 'conflict').length;

  return (
    <div role="region" aria-label="Ingestion ledger" className="shrink-0 border-b border-neutral-800 bg-neutral-900/40">
      <div className="flex items-center justify-between px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-neutral-500">
        <span>
          Ingestion Ledger
          {conflicts > 0 && <span className="ml-2 text-red-400">{conflicts} conflict(s)</span>}
        </span>
        <button onClick={clearLedger} aria-label="Clear resolved ingestion items" className="text-neutral-600 hover:text-neutral-300 flex items-center gap-1 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500">
          <X className="w-3 h-3" aria-hidden="true" /> clear resolved
        </button>
      </div>
      <div className="px-3 pb-2 space-y-1 max-h-44 overflow-y-auto">
        {quarantine.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
