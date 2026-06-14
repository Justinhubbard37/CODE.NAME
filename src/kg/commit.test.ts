import { describe, it, expect } from 'vitest';
import { evaluateKgWrite, makeAudit, hashAuditRecord, verifyAuditChain } from './commit';
import type { SecurityGates, AuditRecord } from '../types';

const open: SecurityGates = { filesystem: true, network: true, tools: true };
const fsClosed: SecurityGates = { filesystem: false, network: true, tools: true };

// ── Gate evaluation ──────────────────────────────────────────────────────────

describe('evaluateKgWrite (the gated KG-write chokepoint)', () => {
  it('allows a write when the filesystem gate is open', () => {
    const d = evaluateKgWrite(open);
    expect(d.allowed).toBe(true);
    expect(d.gate).toBe('filesystem');
  });

  it('denies and explains the write when the filesystem gate is closed', () => {
    const d = evaluateKgWrite(fsClosed);
    expect(d.allowed).toBe(false);
    expect(d.gate).toBe('filesystem');
    expect(d.reason ?? '').toMatch(/filesystem/i);
  });
});

describe('makeAudit', () => {
  it('stamps an id + timestamp and preserves the supplied fields', () => {
    const r = makeAudit({
      actor: { kind: 'user', id: 'director' },
      action: 'create',
      target: { kind: 'node', id: 'n1' },
      decision: { allowed: true, gate: 'filesystem' },
      diff: 'created n1',
    });
    expect(r.id).toBeTruthy();
    expect(typeof r.ts).toBe('number');
    expect(r.action).toBe('create');
    expect(r.target.id).toBe('n1');
    expect(r.decision.allowed).toBe(true);
    expect(r.diff).toBe('created n1');
  });
});

// ── Hash chain (Phase 7, Slice 7.2) ─────────────────────────────────────────

function makeTestRecord(id: string, ts: number, prevHash?: string): AuditRecord {
  return {
    id,
    ts,
    actor: { kind: 'user', id: 'test' },
    action: 'create',
    target: { kind: 'node', id: `node-${id}` },
    decision: { allowed: true, gate: 'filesystem' },
    ...(prevHash !== undefined ? { prevHash } : {}),
  };
}

describe('hashAuditRecord', () => {
  it('returns a 64-char hex SHA-256 string', async () => {
    const r = makeTestRecord('abc', 1000);
    const h = await hashAuditRecord(r);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same record always hashes identically', async () => {
    const r = makeTestRecord('abc', 1000);
    expect(await hashAuditRecord(r)).toBe(await hashAuditRecord(r));
  });

  it('changes when any field changes', async () => {
    const r1 = makeTestRecord('abc', 1000);
    const r2 = makeTestRecord('abc', 1001); // different ts
    expect(await hashAuditRecord(r1)).not.toBe(await hashAuditRecord(r2));
  });
});

describe('verifyAuditChain', () => {
  it('returns ok with checkedCount 0 for an empty ledger', async () => {
    const result = await verifyAuditChain([]);
    expect(result.ok).toBe(true);
    expect(result.checkedCount).toBe(0);
  });

  it('returns ok for a single genesis record (no prevHash)', async () => {
    const r1 = makeTestRecord('r1', 1000);
    const result = await verifyAuditChain([r1]);
    expect(result.ok).toBe(true);
    expect(result.checkedCount).toBe(0);
  });

  it('verifies a correctly-chained two-record ledger', async () => {
    const r1 = makeTestRecord('r1', 1000);
    const h1 = await hashAuditRecord(r1);
    const r2 = makeTestRecord('r2', 2000, h1);
    const result = await verifyAuditChain([r2, r1]); // order shouldn't matter
    expect(result.ok).toBe(true);
    expect(result.checkedCount).toBe(1);
  });

  it('verifies a correctly-chained three-record ledger', async () => {
    const r1 = makeTestRecord('r1', 1000);
    const h1 = await hashAuditRecord(r1);
    const r2 = makeTestRecord('r2', 2000, h1);
    const h2 = await hashAuditRecord(r2);
    const r3 = makeTestRecord('r3', 3000, h2);
    const result = await verifyAuditChain([r1, r2, r3]);
    expect(result.ok).toBe(true);
    expect(result.checkedCount).toBe(2);
  });

  it('detects a tampered second record (wrong prevHash)', async () => {
    const r1 = makeTestRecord('r1', 1000);
    const r2 = makeTestRecord('r2', 2000, 'deadbeef-this-is-wrong');
    const result = await verifyAuditChain([r1, r2]);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe('r2');
    expect(result.checkedCount).toBe(1);
  });

  it('detects a tampered first record (its hash no longer matches r2.prevHash)', async () => {
    const r1 = makeTestRecord('r1', 1000);
    const h1 = await hashAuditRecord(r1);
    const r2 = makeTestRecord('r2', 2000, h1);
    // Tamper r1 after linking r2
    const r1Tampered = { ...r1, diff: 'TAMPERED' };
    const result = await verifyAuditChain([r1Tampered, r2]);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe('r2');
  });

  it('stops at the first broken link and reports checkedCount up to that point', async () => {
    const r1 = makeTestRecord('r1', 1000);
    const h1 = await hashAuditRecord(r1);
    const r2 = makeTestRecord('r2', 2000, 'wrong-hash'); // broken
    const r3 = makeTestRecord('r3', 3000, h1); // irrelevant — won't be reached
    const result = await verifyAuditChain([r1, r2, r3]);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe('r2');
    expect(result.checkedCount).toBe(1); // only the r1→r2 link was checked
  });
});
