/**
 * Gated + audited write chokepoint helpers (Phase 0/1 contract).
 * KG content writes require local persistence, so they are governed by the
 * filesystem gate. Every write — allowed or denied — produces an AuditRecord.
 *
 * Phase 7 (Slice 7.2): adds a tamper-evident hash chain.
 *   hashAuditRecord() — canonical SHA-256 of a record.
 *   verifyAuditChain() — check that the prevHash links are unbroken.
 */
import { v4 as uuidv4 } from 'uuid';
import type {
  AuditAction,
  AuditActor,
  AuditRecord,
  GateDecision,
  SecurityGates,
} from '../types';

export function evaluateKgWrite(gates: SecurityGates): GateDecision {
  if (!gates.filesystem) {
    return { allowed: false, gate: 'filesystem', reason: 'filesystem gate closed' };
  }
  return { allowed: true, gate: 'filesystem' };
}

export function makeAudit(p: {
  actor: AuditActor;
  action: AuditAction;
  target: { kind: 'node' | 'edge' | 'file'; id: string };
  decision: GateDecision;
  before?: unknown;
  after?: unknown;
  diff?: string;
  provenance?: { source?: string; ingestionId?: string };
}): AuditRecord {
  return { id: uuidv4().slice(0, 12), ts: Date.now(), ...p };
}

/**
 * Deterministic SHA-256 of an AuditRecord (Phase 7, Slice 7.2).
 * Keys are sorted before serialisation so the hash is stable across JS engines.
 */
export async function hashAuditRecord(r: AuditRecord): Promise<string> {
  const canonical = JSON.stringify(r, Object.keys(r).sort() as never[]);
  const buf = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify the tamper-evident hash chain (Phase 7, Slice 7.2).
 *
 * Records are sorted chronologically (ts asc, then id as tie-breaker).
 * For each consecutive pair (prev → curr), asserts that
 *   hashAuditRecord(prev) === curr.prevHash.
 * The first record in the chain may have no prevHash (genesis record).
 *
 * Returns:
 *   ok          — true if the chain is intact.
 *   brokenAt    — id of the first record whose prevHash is wrong (if !ok).
 *   checkedCount — number of link checks performed (= records − 1, min 0).
 */
export async function verifyAuditChain(
  records: AuditRecord[],
): Promise<{ ok: boolean; brokenAt?: string; checkedCount: number }> {
  const sorted = [...records].sort(
    (a, b) => a.ts - b.ts || a.id.localeCompare(b.id),
  );
  let checkedCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const expected = await hashAuditRecord(sorted[i - 1]);
    checkedCount++;
    if (sorted[i].prevHash !== expected) {
      return { ok: false, brokenAt: sorted[i].id, checkedCount };
    }
  }
  return { ok: true, checkedCount };
}
