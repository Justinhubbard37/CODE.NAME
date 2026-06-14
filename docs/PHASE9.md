# Phase 9 — See Everything, Survive Anything

**Status:** Complete  
**Verification:** `tsc --noEmit` clean · 38/38 tests pass

---

## Overview

Phase 9 adds production-grade observability and resilience to the CODE NAME
harness: structured logs from both the Rust shell and Python sidecar, a
health-check watchdog that auto-restarts an unresponsive sidecar, an opt-in
crash reporter that writes local crash files (never transmitted), and a real
metrics panel backed by live KG store counts.

---

## Slice 9.1 — Structured Logging

**Goal:** Replace ad-hoc `eprintln!` / silent failures with structured,
file-backed logs from both the Rust shell and the Python sidecar.

### Rust side (`src-tauri/`)

| File | Change |
|---|---|
| `Cargo.toml` | Added `tracing`, `tracing-subscriber` (env-filter), `tracing-appender` |
| `src/logging.rs` | **New.** `init_logging(app)` — daily-rolling appender → `<log_dir>/codename.log`; `get_log_dir` and `open_log_dir` Tauri commands |
| `src/lib.rs` | `mod logging`; call `init_logging` first in `setup()`; pass `log_dir` to `SidecarManager::set_log_dir`; register `get_log_dir` / `open_log_dir` |
| `src/sidecar.rs` | Added `log_dir: Arc<Mutex<Option<PathBuf>>>` field + `set_log_dir()`; spawn child with `CODENAME_LOG_DIR` env var; `eprintln!` → `tracing::error!` / `tracing::warn!` |

`WorkerGuard` is kept alive for the process via `Box::leak` — standard Tauri
pattern, prevents the background writer thread from being dropped.

### Python side (`sidecar/agent_sidecar.py`)

Added `import logging` + `logging.handlers`. At startup:

```python
_log_dir = os.environ.get("CODENAME_LOG_DIR", "")
# If set: RotatingFileHandler → <log_dir>/sidecar.log (5 MB × 3 backups)
# Else:   StreamHandler(sys.stderr)  ← dev fallback
logging.basicConfig(level=logging.INFO, ...)
log = logging.getLogger("codename.sidecar")
```

### UI

`StealthDrawer.tsx` — new **Logs** section at the bottom: "View Logs" button
calls `open_log_dir`; resolved path shown in muted mono text beneath the
button.

---

## Slice 9.2 — Health Watchdog

**Goal:** Poll the sidecar's `/health` endpoint every 10 s; auto-restart after
3 consecutive failures; surface status in the telemetry console.

### Rust

`src-tauri/src/sidecar.rs` — new `sidecar_health` command:

```rust
pub async fn sidecar_health(mgr: State<'_, SidecarManager>) -> Result<HealthResponse, String>
```

- Returns `{ ok, latency_ms, reason? }` — never returns `Err` so the frontend
  can distinguish "alive but unhealthy" from "unreachable".
- Returns `ok: false, reason: "sidecar not running"` immediately when
  `info.port == 0`.
- 5-second HTTP timeout on the request.

### TypeScript (`src/state/AppState.tsx`)

```
watchdogHealth: 'unknown' | 'ok' | 'degraded' | 'offline'
```

- `useEffect` polls `sidecar_health` every 10 s (initial probe after 2 s).
- On success → `'ok'`, `failCount = 0`.
- On failure → `failCount++`; `'degraded'` until 3rd failure → `'offline'` +
  call `sidecar_restart` + reset counter.
- Exposed on `AppStateValue` + consumed by `TelemetryConsole`.

### UI

`TelemetryConsole.tsx` — `SIDECAR` row: colour-coded  
`text-emerald-400` (OK) · `text-amber-400` (WARN) · `text-red-400` (DOWN) · `text-neutral-600` (unknown).

---

## Slice 9.3 — Crash Reporting (Opt-In)

**Goal:** Local-only crash logs for both Rust panics and unhandled JS errors;
consent toggle in the drawer; no telemetry ever leaves the machine.

### Rust (`src-tauri/src/crash.rs`) — new file

| Symbol | Purpose |
|---|---|
| `static CRASH_CONSENT: AtomicBool` | Gate — checked in panic hook without AppHandle |
| `static CRASH_DIR: OnceLock<PathBuf>` | Set once in `init_crash_dir(app)` during setup |
| `set_crash_consent(enabled)` | Installs / removes custom panic hook |
| `get_crash_consent()` | Returns current consent state |
| `append_js_crash_log(message, stack)` | Writes `crash_js_<ts>.txt` (no-op if not consented) |
| `get_crash_reports()` | Lists `crash_*.txt` files, newest first |
| `clear_crash_reports()` | Deletes all `crash_*.txt` in log dir |
| `open_crash_folder()` | Opens log dir in OS file manager |

Panic hook writes `crash_<timestamp>.txt` via `std::fs::write` — safe to call
from a panic context (no locks held beyond the file write).

### TypeScript (`src/state/AppState.tsx`)

`window.onerror` + `window.unhandledrejection` listeners installed in a
`useEffect`. On each event: calls `get_crash_consent`; if true, calls
`append_js_crash_log`. Listeners removed on unmount.

### UI (`src/components/config/StealthDrawer.tsx`)

New **Crash Reports** section above the Logs section:
- Toggle button: `○ off` / `● collecting`
- When consented: shows disclaimer ("written locally — never transmitted")
- Lists up to 5 crash filenames when present + "Clear all reports" button

---

## Slice 9.4 — Real Metrics

**Goal:** Replace the synthetic VECTORS estimate in `TelemetryConsole` with
true counts from the KG store plus derived task metrics.

### `src/kg/store.ts`

`counts()` now returns all five dimensions:

```typescript
{ nodes, edges, audit, vectors, chunks }
```

Previously `chunks` was computed on-the-fly from nodes; now it reads directly
from the IDB `chunks` object store.

### `src/components/left/TelemetryConsole.tsx` — full rewrite

| Row | Source |
|---|---|
| UPTIME | `Date.now() - bootTs` (1 s ticker) |
| KG NODES | `kgStore.counts().nodes` (15 s poll) |
| KG EDGES | `kgStore.counts().edges` |
| CHUNKS | `kgStore.counts().chunks` |
| VECTORS | `kgStore.counts().vectors` |
| TOOLS | `tasks.flatMap(t => t.messages).filter(m => m.role === 'tool').length` |
| ~TOKENS | `Σ message.content.length / 4` |
| DB LOOPS | `endpoints.filter(e => e.status === 'ready').length / endpoints.length` |
| SIDECAR | `watchdogHealth` (from Slice 9.2) — colour-coded |

---

## File Change Summary

| File | Action |
|---|---|
| `src-tauri/Cargo.toml` | Added `tracing`, `tracing-subscriber`, `tracing-appender` |
| `src-tauri/src/lib.rs` | Added `mod crash`, `mod logging`; wired setup(); registered 9 new commands |
| `src-tauri/src/logging.rs` | **New** — tracing init + `get_log_dir` / `open_log_dir` commands |
| `src-tauri/src/crash.rs` | **New** — panic hook + 6 crash commands |
| `src-tauri/src/sidecar.rs` | Added `log_dir` field, `set_log_dir()`, `sidecar_health` command; eprintln → tracing |
| `sidecar/agent_sidecar.py` | Added `logging` + `RotatingFileHandler` setup at startup |
| `src/state/AppState.tsx` | Added `watchdogHealth` state + 10 s watchdog + JS crash handler effect |
| `src/kg/store.ts` | `counts()` now includes `chunks` |
| `src/components/left/TelemetryConsole.tsx` | Full rewrite — real store counts, tool calls, token estimate, watchdog row |
| `src/components/config/StealthDrawer.tsx` | Added Crash Reports section + View Logs section |

---

## Deferred

Nothing deferred from Phase 9. All four slices are complete.
