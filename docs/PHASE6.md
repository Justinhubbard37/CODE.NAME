# Phase 6 — Tabs as Real Environments

## Goal

Turn pool leases from in-memory accounting tokens into real, isolated sidecar resources. Each tab that opens a browser context or agent runtime gets a dedicated sidecar-managed instance; closing or evicting the tab tears that instance down. Tabs cannot share data or context even when they share a pool.

---

## Slice 6.1 — Bind pool lease to real sidecar resource

**Done when:** leasing a slot creates a real isolated context in the sidecar.  
**Stays safe:** if sidecar is offline, lease stays a safe placeholder (no handle).

### Changes

| File | What changed |
|------|-------------|
| `sidecar/agent_sidecar.py` | Added `_pool_contexts` registry (`dict` + `threading.Lock`). Added `/a2a/pool/create` endpoint: mints UUID handle, stores `{kind, taskId, leaseId, createdAt, tabId/runnerReady}`, returns `{handle, kind}`. Added `/a2a/pool/release` endpoint: idempotent pop; closes CDP tab if `tabId` is set. |
| `src-tauri/src/sidecar.rs` | Added `sidecar_pool_create` command (POST `/a2a/pool/create`, 10 s timeout). Added `sidecar_pool_release` command (POST `/a2a/pool/release`, idempotent). |
| `src-tauri/src/lib.rs` | Registered both new commands in `invoke_handler!`. |
| `src/lib/sidecar.ts` | Added `sidecarPoolCreate(kind, taskId, leaseId)` → `{handle, kind} \| null`. Added `sidecarPoolRelease(handle)` → `void`. Both null-safe when sidecar is offline. |
| `src/lib/pools.ts` | Added `ContextCreator` / `ContextDestroyer` types. Added `configurePoolBackend(create, destroy)` injection point. Extended `Lease` with optional `handle?: string`. `lease()` fires `_onCreate` fire-and-forget after inserting the entry; attaches handle to the in-array object when the promise resolves. |
| `src/state/AppState.tsx` | Calls `configurePoolBackend(...)` in the startup `useEffect` (before `installWebMcp`), wiring real sidecar calls as the backend. |

### Design notes

- `lease()` stays **synchronous** — existing callers unchanged. The async handle attaches in a microtask after the pool slot is already granted.
- Offline safety: `sidecarPoolCreate` returns `null` on any error; `_teardown` is a no-op when `l.handle` is absent.

---

## Slice 6.2 — Release real resources when tabs close

**Done when:** closing tabs frees real contexts and pool count drops.  
**Stays safe:** if teardown fails, log it and force-evict.

### Changes

| File | What changed |
|------|-------------|
| `src/lib/pools.ts` | Added `_teardown(lease)` helper: calls `_onRelease(handle)` fire-and-forget; logs on rejection; never throws. Wired into `release()`, `releaseAll()`, and `evictIdle()` — all three paths now call `_teardown` before splicing the entry. Added `_resetPool()` export for test isolation. |
| `sidecar/agent_sidecar.py` | `/a2a/pool/release` endpoint pops the context from `_pool_contexts` and closes the CDP tab if `tabId` is set. Idempotent (unknown handle → `ok: true`). |

### Design notes

- `_teardown` is always fire-and-forget — the TS-side splice happens regardless of sidecar response.
- `evictIdle()` calls `_teardown` before removing each stale entry, so idle-evicted tabs also clean up their sidecar resources.

---

## Slice 6.3 — Prove isolation between tabs

**Done when:** tests confirm two tabs stay separate while sharing the pool.

### New file: `src/lib/pools.test.ts` (15 tests)

| Group | Tests |
|-------|-------|
| `lease()` | First slot granted; same-tab keep-alive returns same id; two tabs get distinct ids; pool exhaustion blocks at capacity |
| `release()` | Releasing tab-A leaves tab-B's lease intact |
| `releaseAll()` | Clears only the given task's leases |
| `evictIdle()` | Removes expired leases; leaves unexpired leases alone |
| `configurePoolBackend()` | `onCreate` called on new lease (not keep-alive); handle attached after microtask flush; `onRelease` called on `release()`; `onRelease` called on `evictIdle()`; teardown failure is silent |
| Cross-tab isolation | Distinct slot ids; releasing one tab does not evict the other |

All 28 tests pass (`npm test`). TypeScript strict-mode clean (`npm run lint`).

---

## Test run

```
Test Files  5 passed (5)
     Tests  28 passed (28)
  Duration  ~2s
```

---

## Architecture summary

```
AppState.tsx (startup)
  └─ configurePoolBackend(sidecarPoolCreate, sidecarPoolRelease)
        │
        ▼
pools.ts  ──lease()──►  _onCreate(kind, taskId, leaseId)
                              │  (fire-and-forget, attaches handle)
                              ▼
                        Rust: sidecar_pool_create
                              │
                              ▼
                        Python: /a2a/pool/create
                              └─ _pool_contexts[handle] = {kind, taskId, ...}

        ──release()/releaseAll()/evictIdle()──►  _teardown(lease)
                              │  (fire-and-forget, force-evict regardless)
                              ▼
                        Rust: sidecar_pool_release
                              │
                              ▼
                        Python: /a2a/pool/release
                              └─ _pool_contexts.pop(handle)
                                 CDP tab close if browser context
```

Each tab's context is keyed by an opaque UUID handle minted by the sidecar. No two tabs share a handle. Cross-tab data sharing through the pool is structurally impossible.
