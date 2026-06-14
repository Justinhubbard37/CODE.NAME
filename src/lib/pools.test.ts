/**
 * Slice 6.3 — Isolation and lifecycle tests for the pool module.
 *
 * Uses _resetPool() for singleton isolation between cases.
 * onCreate / onRelease are vi.fn() — no Tauri mock required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  lease,
  release,
  releaseAll,
  evictIdle,
  poolSnapshot,
  configurePoolBackend,
  _resetPool,
} from './pools';

beforeEach(() => {
  _resetPool();
});

// ── Basic lease mechanics ────────────────────────────────────────────────────

describe('lease()', () => {
  it('grants first slot for a new tab', () => {
    const r = lease('browser', 'tab-A');
    expect(r.ok).toBe(true);
    expect(typeof r.id).toBe('string');
  });

  it('reuses the same slot id for the same tab (keep-alive)', () => {
    const r1 = lease('browser', 'tab-A');
    const r2 = lease('browser', 'tab-A');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.id).toBe(r2.id);
  });

  it('gives two different tabs distinct slot ids (isolation proof)', () => {
    const r1 = lease('browser', 'tab-A');
    const r2 = lease('browser', 'tab-B');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.id).not.toBe(r2.id);
  });

  it('blocks a tab when pool is at capacity (maxBrowserContexts = 4)', () => {
    // System default maxBrowserContexts is 4 (from systemConfig.pools).
    lease('browser', 'tab-A');
    lease('browser', 'tab-B');
    lease('browser', 'tab-C');
    lease('browser', 'tab-D');
    const r5 = lease('browser', 'tab-E');
    expect(r5.ok).toBe(false);
    expect(r5.reason).toMatch(/exhausted/);
  });
});

// ── Release mechanics ────────────────────────────────────────────────────────

describe('release()', () => {
  it("releasing tab-A does not affect tab-B's lease", () => {
    lease('browser', 'tab-A');
    const r2 = lease('browser', 'tab-B');
    release('browser', 'tab-A');
    const snap = poolSnapshot();
    expect(snap.browser.used).toBe(1);
    expect(snap.leases.some((l) => l.id === r2.id)).toBe(true);
  });
});

describe('releaseAll()', () => {
  it("clears only the given task's leases", () => {
    lease('browser', 'tab-A');
    lease('agent', 'tab-A');
    lease('browser', 'tab-B');
    releaseAll('tab-A');
    const snap = poolSnapshot();
    expect(snap.browser.used).toBe(1);
    expect(snap.agent.used).toBe(0);
    expect(snap.leases[0].taskId).toBe('tab-B');
  });
});

// ── Idle eviction ────────────────────────────────────────────────────────────

describe('evictIdle()', () => {
  it('removes leases past the idle threshold', () => {
    lease('browser', 'tab-A');
    // Pass a future `now` far beyond idleEvictMs (default 300 000 ms).
    const removed = evictIdle(Date.now() + 400_000);
    expect(removed).toBe(1);
    expect(poolSnapshot().browser.used).toBe(0);
  });

  it('leaves unexpired leases alone', () => {
    lease('browser', 'tab-A');
    const removed = evictIdle(Date.now() + 1_000); // only 1 s forward
    expect(removed).toBe(0);
    expect(poolSnapshot().browser.used).toBe(1);
  });
});

// ── Backend injection (Slices 6.1 / 6.2) ────────────────────────────────────

describe('configurePoolBackend()', () => {
  it('calls onCreate for a new lease (not a keep-alive)', async () => {
    const onCreate = vi.fn().mockResolvedValue('handle-abc');
    configurePoolBackend(onCreate, null);

    lease('browser', 'tab-A');
    // Flush the microtask that attaches the handle.
    await Promise.resolve();

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledWith('browser', 'tab-A', expect.any(String));

    // Reuse (keep-alive) must NOT trigger a second onCreate call.
    lease('browser', 'tab-A');
    await Promise.resolve();
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('handle is attached to the lease entry after microtask flush', async () => {
    configurePoolBackend(vi.fn().mockResolvedValue('handle-xyz'), null);
    lease('browser', 'tab-A');
    await Promise.resolve();

    const snap = poolSnapshot();
    // poolSnapshot copies the array but Lease objects are the same references.
    const l = snap.leases[0] as { handle?: string };
    expect(l.handle).toBe('handle-xyz');
  });

  it('calls onRelease when release() is called', async () => {
    const onRelease = vi.fn().mockResolvedValue(undefined);
    configurePoolBackend(vi.fn().mockResolvedValue('handle-abc'), onRelease);

    lease('browser', 'tab-A');
    await Promise.resolve(); // let handle attach

    release('browser', 'tab-A');
    await Promise.resolve(); // let teardown fire

    expect(onRelease).toHaveBeenCalledOnce();
    expect(onRelease).toHaveBeenCalledWith('handle-abc');
  });

  it('calls onRelease when evictIdle() removes a lease', async () => {
    const onRelease = vi.fn().mockResolvedValue(undefined);
    configurePoolBackend(vi.fn().mockResolvedValue('handle-def'), onRelease);

    lease('browser', 'tab-A');
    await Promise.resolve();

    evictIdle(Date.now() + 400_000);
    await Promise.resolve();

    expect(onRelease).toHaveBeenCalledWith('handle-def');
  });

  it('teardown failure is silent — does not throw to caller', async () => {
    const onRelease = vi.fn().mockRejectedValue(new Error('sidecar gone'));
    configurePoolBackend(vi.fn().mockResolvedValue('handle-err'), onRelease);

    lease('browser', 'tab-A');
    await Promise.resolve();

    // release() must not throw even when onRelease rejects.
    expect(() => release('browser', 'tab-A')).not.toThrow();
    // Allow the rejected promise to settle — should not produce an unhandled rejection.
    await Promise.resolve();
    await Promise.resolve();
  });
});

// ── Cross-tab isolation (Slice 6.3 spec) ─────────────────────────────────────

describe('cross-tab isolation', () => {
  it('two tabs with separate leases cannot share a slot id', () => {
    const r1 = lease('browser', 'tab-A');
    const r2 = lease('browser', 'tab-B');
    expect(r1.id).not.toBe(r2.id);
  });

  it('releasing one tab does not free the other tab slot', () => {
    lease('browser', 'tab-A');
    const r2 = lease('browser', 'tab-B');
    release('browser', 'tab-A');
    // tab-B slot must still be present and counted.
    const snap = poolSnapshot();
    expect(snap.browser.used).toBe(1);
    expect(snap.leases[0].id).toBe(r2.id);
  });
});
