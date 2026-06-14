# Phase 5 — The Right-Pane Protocols, For Real

**Status:** Complete  
**Lint:** `npm run lint` → clean (0 errors)

---

## Overview

Phase 5 hardens the agent interaction surface: new graph-mutation tools, interactive A2UI forms, per-tab UI isolation, a real CDP browser harness, and a sandboxed file-write audit trail.

---

## Slice 5.1 — New WebMCP Tools

**Files:** `src/state/AppState.tsx`, `src/lib/sidecar.ts`

Three new tools registered in the WebMCP gate system:

| Tool | Description |
|---|---|
| `graph.get` | Read any node by `id` or `label`; returns full `NodeData` as JSON |
| `graph.link` | Create a directed edge between two existing nodes; filesystem-gated + audited via `makeAudit` |
| `ingest.text` | Ingest raw text as a document node — functionally identical to dropping a `.txt` file |

`graph.link` creates an `AuditRecord` with `action: 'link'` and `target.kind: 'edge'` regardless of whether the gate allows the write, ensuring the denial is also audited.

---

## Slice 5.2 — Interactive A2UI Forms

**Files:** `src/components/right/a2ui/types.ts`, `src/components/right/a2ui/A2UIRenderer.tsx`, `src/components/right/AgentUIPanel.tsx`

- Added `A2UIAction` interface with optional `values: Record<string, string>` field.
- `textfield` components are now **fully interactive** — the `readOnly` attribute is removed; each textfield maintains controlled local state via `useState` inside a dedicated `TextField` sub-component.
- `A2UIRenderer` holds a shared `formRef: RefObject<Map<string, string>>` passed to every node. Textfield changes write into the ref synchronously with no extra re-renders.
- Button clicks snapshot `Object.fromEntries(formRef.current)` and pass the result as `values` in `onAction`.
- `AgentUIPanel` wires `values` through: when a button calls a tool, form values are merged into `toolArgs`; when a button sends a prompt, form values are appended as labelled lines.
- The trusted-catalog constraint (`TRUSTED` set) is unchanged — no new component types can be injected.

---

## Slice 5.3 — Per-Tab A2UI Bus

**Files:** `src/components/right/a2ui/bus.ts`, `src/components/right/AgentUIPanel.tsx`, `src/state/AppState.tsx`

Replaced the Phase 4 global singleton with a `Map<taskId, A2UIPayload | null>`:

```typescript
setAgentUI(taskId, payload)   // write into a tab's slot
getAgentUI(taskId)             // read current payload
subscribeAgentUI(taskId, fn)   // subscribe; returns unsubscribe callback
clearAgentUI(taskId)           // clean up on tab close
```

- `AgentUIPanel` re-subscribes whenever `activeTaskId` changes via a `useEffect([activeTaskId])` dependency.
- `AppState.tsx` `ui.render` tool passes `activeTaskIdRef.current` so the agent always writes to its own tab's slot.
- The dismiss button calls `setAgentUI(activeTaskId, null)` to clear only the active tab.

---

## Slice 5.4 — Real Browser CDP Harness

**Files:** `sidecar/agent_sidecar.py`, `src-tauri/src/sidecar.rs`, `src-tauri/src/lib.rs`, `src/lib/sidecar.ts`, `src/state/AppState.tsx`

Added a pure-stdlib Chrome DevTools Protocol client to the sidecar (no `websockets` package required):

- `_ws_connect / _ws_send / _ws_recv` — minimal raw WebSocket implementation using `socket` + `struct` + `os.urandom`.
- `_cdp_open(url, nav_timeout=20)` — opens a new Chrome tab via `GET /json/new`, waits for `Page.loadEventFired`, extracts up to 8 000 chars of `document.body.innerText` via `Runtime.evaluate`, then closes the tab.
- If Chrome is not running on `localhost:9222`, raises `RuntimeError` with platform-specific launch instructions included in the `error` field of the response.
- New `/a2a/browser_open` POST endpoint (token-authenticated).
- New `sidecar_browser_open` Rust command (45 s timeout) registered in `lib.rs`.
- `sidecarBrowserOpen(url)` function added to `src/lib/sidecar.ts`.
- `AppState.tsx` `browser.open` tool: replaced the stub with a real `sidecarBrowserOpen` call. Returns page text on success, Chrome launch guide on failure.

Chrome launch (first-run):
```
macOS:   /Applications/Google\ Chrome.app/.../Google\ Chrome --remote-debugging-port=9222 --no-first-run
Windows: chrome.exe --remote-debugging-port=9222
Linux:   google-chrome --remote-debugging-port=9222
```

---

## Slice 5.5 — Sandboxed Harness File Writes

**Files:** `sidecar/agent_sidecar.py`, `src/kg/commit.ts`, `src/types.ts`, `src/state/AppState.tsx`

- `HARNESS_DIR = ~/.codename/harness/` — all harness-generated files are confined here.
- `_harness_write(relpath, content)` enforces the boundary with `os.path.normpath` comparison; path-escape attempts raise `ValueError`.
- `_flush_harness_manifest()` returns and clears the per-request list of written files.
- `/a2a/browser_open` response always includes `harness_files: []` (list grows as the harness matures).
- `AppState.tsx` `browser.open`: iterates `result.harness_files` and calls `kgStore.appendAudit` for each, recording `actor.kind: 'system'`, `actor.id: 'browser-harness'`, and `target.kind: 'file'`.
- `AuditRecord.target.kind` extended to `'node' | 'edge' | 'file'` in `src/types.ts` and `makeAudit` parameter in `src/kg/commit.ts`.

---

## Files Changed

| File | Change |
|---|---|
| `src/types.ts` | `AuditRecord.target.kind` gains `'file'` |
| `src/components/right/a2ui/types.ts` | Added `A2UIAction` interface |
| `src/components/right/a2ui/bus.ts` | Rewritten — per-task `Map` bus |
| `src/components/right/a2ui/A2UIRenderer.tsx` | Form state + interactive textfields |
| `src/components/right/AgentUIPanel.tsx` | Per-tab subscription, `A2UIAction` wiring |
| `src/state/AppState.tsx` | `graph.get`, `graph.link`, `ingest.text` tools; `ui.render` taskId; `browser.open` CDP |
| `src/lib/sidecar.ts` | `sidecarBrowserOpen()` |
| `src/kg/commit.ts` | `makeAudit` target kind extended |
| `sidecar/agent_sidecar.py` | CDP helpers, `/a2a/browser_open`, harness sandbox |
| `src-tauri/src/sidecar.rs` | `sidecar_browser_open` command |
| `src-tauri/src/lib.rs` | Registered `sidecar_browser_open` |

---

## Deferred

- **Slice 4.6** (SQLite storage backend) — still deferred from Phase 4.
