/**
 * Shared supervised pools (Phase 5 / Phase 6). Browser contexts and agent
 * runtimes are shared and capped (systemConfig.pools); tabs lease their own
 * isolated slot — N tabs do NOT spawn N browsers.
 *
 * Phase 6 (Slices 6.1 / 6.2): real sidecar context lifecycle is injected via
 * configurePoolBackend(). pools.ts stays synchronous and testable; AppState.tsx
 * wires in the live sidecar callbacks at startup. If the sidecar is offline the
 * handle is simply absent and teardown is skipped (safe placeholder behaviour).
 */
import { systemConfig } from '../config/system';

export type PoolKind = 'browser' | 'agent';

/**
 * Factory called when a NEW lease is created (not reused). Returns the opaque
 * sidecar handle to store with the lease, or null when the sidecar is offline.
 */
type ContextCreator = (
  kind: PoolKind,
  taskId: string,
  leaseId: string,
) => Promise<string | null>;

/**
 * Destructor called when a lease is released or idle-evicted. Best-effort:
 * failure is logged but the TS-side lease is always force-evicted.
 */
type ContextDestroyer = (handle: string) => Promise<void>;

let _onCreate: ContextCreator | null = null;
let _onRelease: ContextDestroyer | null = null;

/**
 * Wire in real sidecar callbacks (called once from AppState.tsx at startup).
 * Pass null/null to reset back to no-op (used in tests via _resetPool).
 */
export function configurePoolBackend(
  create: ContextCreator | null,
  destroy: ContextDestroyer | null,
): void {
  _onCreate = create;
  _onRelease = destroy;
}

interface Lease {
  kind: PoolKind;
  taskId: string;
  id: string;
  ts: number;
  /** Opaque sidecar context handle (present once async create resolves). */
  handle?: string;
}

const leases: Lease[] = [];
const subs = new Set<() => void>();

function emit() {
  subs.forEach((s) => s());
}

export function subscribePools(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

function capacity(kind: PoolKind): number {
  return kind === 'browser'
    ? systemConfig.pools.maxBrowserContexts
    : systemConfig.pools.maxAgents;
}

export interface LeaseResult {
  ok: boolean;
  id?: string;
  reason?: string;
}

/**
 * Tear down the sidecar context for a lease (Slice 6.2). Fire-and-forget:
 * logs on failure but never throws — the caller always force-evicts.
 */
function _teardown(l: Lease): void {
  if (l.handle && _onRelease) {
    void _onRelease(l.handle).catch((err) => {
      console.warn(`[pool] context teardown failed for ${l.handle}:`, err);
    });
  }
}

/**
 * Lease a pool slot for the given (kind, taskId) pair.
 *
 * - If a lease already exists for this tab it is kept-alive and reused.
 * - If the pool is full, returns { ok: false }.
 * - On a new lease, fires _onCreate asynchronously and attaches the handle
 *   to the in-array entry when the promise resolves (Slice 6.1).
 */
export function lease(kind: PoolKind, taskId: string): LeaseResult {
  const existing = leases.find((l) => l.kind === kind && l.taskId === taskId);
  if (existing) {
    existing.ts = Date.now(); // keep-alive
    return { ok: true, id: existing.id };
  }
  const used = leases.filter((l) => l.kind === kind).length;
  if (used >= capacity(kind)) {
    return { ok: false, reason: `${kind} pool exhausted (${used}/${capacity(kind)})` };
  }
  const id = `${kind}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: Lease = { kind, taskId, id, ts: Date.now() };
  leases.push(entry);
  emit();

  // Fire-and-forget: create real sidecar context and attach handle (Slice 6.1).
  if (_onCreate) {
    void _onCreate(kind, taskId, id).then((handle) => {
      if (handle) {
        // Find entry by id in case the array was mutated while awaiting.
        const live = leases.find((l) => l.id === id);
        if (live) live.handle = handle;
      }
    }).catch((err) => {
      console.warn(`[pool] context create failed for ${id}:`, err);
    });
  }

  return { ok: true, id };
}

export function release(kind: PoolKind, taskId: string): void {
  const i = leases.findIndex((l) => l.kind === kind && l.taskId === taskId);
  if (i >= 0) {
    _teardown(leases[i]);
    leases.splice(i, 1);
    emit();
  }
}

export function releaseAll(taskId: string): void {
  let changed = false;
  for (let i = leases.length - 1; i >= 0; i--) {
    if (leases[i].taskId === taskId) {
      _teardown(leases[i]);
      leases.splice(i, 1);
      changed = true;
    }
  }
  if (changed) emit();
}

export function poolSnapshot() {
  return {
    browser: { used: leases.filter((l) => l.kind === 'browser').length, cap: capacity('browser') },
    agent: { used: leases.filter((l) => l.kind === 'agent').length, cap: capacity('agent') },
    leases: [...leases],
  };
}

/** Evict pool slots idle beyond systemConfig.pools.idleEvictMs. */
export function evictIdle(now = Date.now()): number {
  const max = systemConfig.pools.idleEvictMs;
  let removed = 0;
  for (let i = leases.length - 1; i >= 0; i--) {
    if (now - leases[i].ts > max) {
      _teardown(leases[i]); // Slice 6.2: tear down real context on idle eviction
      leases.splice(i, 1);
      removed++;
    }
  }
  if (removed) emit();
  return removed;
}

/**
 * Reset pool state for testing. Clears all leases and backend callbacks.
 * Exported only for vitest — never call in production code.
 */
export function _resetPool(): void {
  leases.length = 0;
  _onCreate = null;
  _onRelease = null;
}

if (typeof window !== 'undefined') {
  setInterval(() => evictIdle(), 30_000);
}
