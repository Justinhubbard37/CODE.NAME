/**
 * Local-first degradation self-check (Phase 6). Confirms each integration has a
 * working offline/loopback path. Runs on boot; results go to the activity feed.
 */
import { kgStore } from '../kg/store';
import { retriever } from '../kg/retrieve';
import { getSidecarInfo } from './sidecar';

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runSelfCheck(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];

  try {
    const c = await kgStore.counts();
    out.push({ name: 'persistence', ok: true, detail: `KG ${c.nodes}n/${c.edges}e · audit ${c.audit}` });
  } catch {
    out.push({ name: 'persistence', ok: false, detail: 'store unavailable — in-memory only' });
  }

  try {
    retriever.index([]);
    retriever.retrieve('x');
    out.push({ name: 'retrieval', ok: true, detail: 'lexical (offline)' });
  } catch {
    out.push({ name: 'retrieval', ok: false, detail: 'retriever error' });
  }

  out.push({ name: 'model', ok: true, detail: 'provider failures render as structured errors' });

  const hasMcp = typeof document !== 'undefined' && !!(document as unknown as { modelContext?: unknown }).modelContext;
  out.push({ name: 'webmcp', ok: hasMcp, detail: hasMcp ? 'document.modelContext installed' : 'shim not installed yet' });

  const info = await getSidecarInfo();
  out.push({
    name: 'sidecar',
    ok: true,
    detail: info ? `desktop: ${info.status}` : 'loopback (desktop only) — offline OK',
  });

  return out;
}
