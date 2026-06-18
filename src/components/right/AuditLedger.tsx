import { useState, useEffect, useCallback } from 'react';
import { ScrollText, ChevronDown, ChevronRight, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { kgStore } from '../../kg/store';
import { verifyAuditChain } from '../../kg/commit';
import type { AuditRecord } from '../../types';

/**
 * Surfaces the append-only KG audit ledger (Phase 6) — the write history of the
 * self-growing knowledge graph. Reuses the Phase 0 AuditRecord schema.
 *
 * Phase 7 (Slice 7.2): adds a "Verify Chain" button that checks the tamper-evident
 * hash chain across all audit records and reports the first broken link, if any.
 */
export function AuditLedger() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AuditRecord[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    brokenAt?: string;
    checkedCount: number;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const a = await kgStore.getAudit();
      a.sort((x, y) => y.ts - x.ts);
      setRows(a.slice(0, 80));
    } catch {
      /* store unavailable */
    }
  }, []);

  const verify = useCallback(async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const all = await kgStore.getAudit();
      const result = await verifyAuditChain(all);
      setVerifyResult(result);
    } catch {
      setVerifyResult({ ok: false, checkedCount: 0 });
    } finally {
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <div className="shrink-0 border-b border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-3 py-1 type-label font-mono uppercase tracking-wider text-neutral-500">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 hover:text-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
          aria-expanded={open}
          aria-label={open ? 'Collapse audit ledger' : 'Expand audit ledger'}
        >
          {open ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
          <ScrollText className="w-3 h-3" aria-hidden="true" /> Audit Ledger
          {rows.length > 0 && <span className="text-emerald-400/70">{rows.length}</span>}
        </button>
        {open && (
          <div className="flex items-center gap-2">
            {/* Verify chain button */}
            <button
              onClick={verify}
              disabled={verifying}
              className="flex items-center gap-0.5 text-neutral-600 hover:text-violet-400 disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
              title="Verify tamper-evident hash chain"
              aria-label="Verify tamper-evident hash chain"
            >
              <ShieldCheck className="w-3 h-3" aria-hidden="true" />
              <span className="type-meta">{verifying ? 'checking…' : 'verify'}</span>
            </button>
            <button onClick={load} className="text-neutral-600 hover:text-neutral-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500" title="Refresh audit ledger" aria-label="Refresh audit ledger">
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Verification result banner */}
      {open && verifyResult !== null && (
        <div
          className={`mx-3 mb-1 px-2 py-1 type-meta font-mono flex items-center gap-1.5 ${
            verifyResult.ok
              ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/40'
              : 'bg-red-950/50 text-red-400 border border-red-800/40'
          }`}
        >
          {verifyResult.ok ? (
            <>
              <ShieldCheck className="w-3 h-3 shrink-0" aria-hidden="true" />
              chain intact — {verifyResult.checkedCount} link{verifyResult.checkedCount !== 1 ? 's' : ''} verified
            </>
          ) : (
            <>
              <ShieldAlert className="w-3 h-3 shrink-0" aria-hidden="true" />
              chain broken at record {verifyResult.brokenAt ?? '?'} (after {verifyResult.checkedCount} ok)
            </>
          )}
        </div>
      )}

      {open && (
        <div className="max-h-40 overflow-y-auto px-3 pb-2 font-mono type-meta">
          {rows.length === 0 ? (
            <div className="text-neutral-600 italic">// no audited writes yet</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex gap-2">
                <span className="text-neutral-700 shrink-0">
                  {new Date(r.ts).toLocaleTimeString([], { hour12: false })}
                </span>
                <span className={`shrink-0 w-12 ${r.decision.allowed ? 'text-emerald-400' : 'text-red-400'}`}>
                  [{r.action}]
                </span>
                <span className="text-neutral-500 shrink-0">
                  {r.actor.kind}:{r.actor.id}
                </span>
                <span className="text-neutral-400 break-all">
                  {r.target.kind}/{r.target.id}
                  {r.diff ? ` · ${r.diff}` : ''}
                  {r.decision.allowed ? '' : ` · DENIED(${r.decision.reason ?? ''})`}
                  {r.prevHash ? ` · #${r.prevHash.slice(0, 8)}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
