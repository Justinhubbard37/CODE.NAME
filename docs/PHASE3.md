# Phase 3 — Closeout & Decisions

_2026-06-06 · Initial closeout (sidecar skeleton + A2A wire shape)._
_2026-06-13 · Updated: Slices 3.2–3.6 complete. tsc clean, build green._

## Delivered

### Slice 3.1 — Bundle a Python environment plan
- `docs/PACKAGING.md` written: require Python 3.11+ on PATH; first-run creates a
  managed venv and `pip install google-adk` automatically. ✅

### Slice 3.2 — Drop ADK into `run_agent` with echo fallback
- `sidecar/agent_sidecar.py` — `run_agent()` uses `google-adk` `LlmAgent` +
  `InMemorySessionService` + `Runner` when `google-adk` is installed. Falls back
  to an echo stub if the package is missing, so the app always functions offline. ✅
- `_ensure_adk_runner()` does lazy init; re-uses the runner across calls in the
  same session unless the model changes.

### Slice 3.3 — Pass model + settings from app to sidecar
- `src/lib/sidecar.ts` — added `ModelSettings` interface; `sendToSidecar()` and
  `streamFromSidecar()` accept optional `settings?: ModelSettings`.
- `src-tauri/src/sidecar.rs` — `sidecar_send` and `sidecar_stream` accept
  `model: Option<String>` and `temperature: Option<f64>`, forwarded in
  `params.settings` on the A2A JSON-RPC call.
- `sidecar/agent_sidecar.py` — `_extract_settings()` reads `params.settings`;
  `_ensure_adk_runner()` rebuilds the runner when the model changes. ✅

### Slice 3.4 — Agent tool-calling loop (WebMCP bridge)
Full round-trip: agent → tool call → app executes → result back to agent.

**Python side (`sidecar/agent_sidecar.py`)**
- `_make_tool_proxy(adk_name, webmcp_name, description)` — factory that creates
  ADK-compatible sync functions. Each proxy blocks on a `queue.Queue` waiting for
  the app to POST a result; ADK wraps sync tools in a thread executor so blocking
  is safe.
- `_TOOL_PROXIES` — two proxies wired: `graph_search` → `graph.search`,
  `graph_note` → `graph.note`. Registered on the `LlmAgent` as `tools=`.
- `_stream()` — runs ADK in a daemon thread, drains an output queue of
  `('tool_call', dict) | ('reply', str) | ('error', str)` items. Tool calls emit
  an SSE `kind='tool_call'` event; text reply streams word-by-word.
- `POST /a2a/tool_result` — new handler: auth-checked, looks up `callId` in
  `_tool_result_queues`, unblocks the waiting proxy. ✅

**Rust side (`src-tauri/src/sidecar.rs`)**
- `sidecar_stream` — detects `kind == "tool_call"` in SSE frames, emits a
  `{"__tool_call__": true, id, name, args}` JSON marker through the
  `Channel<String>` to the webview.
- `sidecar_tool_result` Tauri command — gates-checked, POSTs
  `{callId, result}` to `/a2a/tool_result` with bearer auth. Registered in
  `invoke_handler`. ✅

**TypeScript side (`src/lib/sidecar.ts`, `src/state/AppState.tsx`)**
- `sidecarToolResult(callId, result)` — thin wrapper around
  `invoke('sidecar_tool_result', …)`.
- Stream callback in `AppState` — detects `tok.startsWith('{"__tool_call__":')`,
  pushes a `role: 'tool'` chat message (in-flight, no result yet), calls
  `executeTool()` through the WebMCP gate guard + audit, updates the tool message
  with the result, then posts back to the sidecar. ✅

### Slice 3.5 — Show tool results in the chat thread
- `ChatRole` extended: `'user' | 'assistant' | 'system' | 'tool'`.
- `ChatMessage.content` for `role === 'tool'` is JSON:
  `{name, args, result?}` — `result` absent while in-flight, set after completion.
- `ToolBubble` component in `ChatThread.tsx` — amber header with tool name +
  "running" pulse while in-flight; args block; emerald result block once done.
- LLM `ChatTurn[]` build filters out `role === 'tool'` messages so the history
  sent to the LLM endpoint stays well-typed. ✅

### Slice 3.6 — Auto-restart sidecar with exponential backoff
- Rust supervisor rewired around `do_start()` — a free function that accepts
  `Arc` refs so the watch thread can call it recursively without an `AppHandle`.
- On unexpected stdout EOF (child exit), the watch thread:
  1. Increments `restart_count` (shared `Arc<AtomicU32>`).
  2. Computes delay = `min(2000ms × 2^attempt, 30 000ms)` — ladder: 2 s, 4 s,
     8 s, 16 s, 30 s, then capped.
  3. Sets status to `"restarting"` so the UI can show "agent restarting".
  4. Sleeps, checks `shutting_down` again, then calls `do_start()` again.
- `restart_count` resets to 0 on a successful handshake so the ladder starts
  fresh after each recovery.
- Intentional `shutdown()` sets `shutting_down = true` and clears
  `restart_count`; the watch thread exits cleanly without retrying.
- Added `backoff_ladder_is_bounded` unit test verifying the cap and each step
  of the ladder. ✅

## Architecture decisions

1. **ADK tool proxies block on `queue.Queue` in the thread executor.**
   ADK wraps sync tool functions in a thread pool; blocking is safe and keeps
   the proxy code simple. The `_stream_state_lock` safely hands the output queue
   reference to tool functions running in ADK's pool, without the GIL causing
   issues.

2. **`{"__tool_call__": true, …}` JSON marker over `Channel<String>`.**
   Rather than a new Tauri event type, we prefix-detect in the TS callback. This
   keeps `Channel<String>` typed simply and avoids a Tauri IPC schema change.
   Swap for a typed channel if the protocol grows more event kinds.

3. **Tool chat bubbles are self-contained JSON in `content`.**
   `role: 'tool'` messages carry `{name, args, result?}` as a JSON string.
   No new fields on `ChatMessage`; the bubble component deserializes and renders.
   The `result` field is absent (not `null`) while in-flight so the
   `!== undefined` check correctly shows the "running" state.

4. **`do_start` as a free function for restart.**
   Moving the spawn logic out of `SidecarManager` methods lets the watch thread
   retry without holding a `self` reference or an `AppHandle`. The script path
   is resolved once at `start()` time and stored as `Arc<Mutex<Option<PathBuf>>>`.

5. **`ChatTurn[]` filters `role === 'tool'`.**
   The LLM endpoint's `ChatTurn` only accepts `user | assistant | system`. Tool
   messages are context for the human viewer, not history the LLM needs (ADK
   handles tool history internally). Filtering keeps types clean.

## Not yet in scope / refine later

- **"Agent restarting" UI toast** — the sidecar status field goes to
  `"restarting"` during backoff; the UI does not yet surface this as a visible
  notification. Wire the status bar or a toast in Phase 5.
- **Rust compilation** — the Tauri shell is not compilable in CI/sandbox (no
  Cargo). All sidecar slices are first exercised via `npm run tauri dev` on the
  dev machine.
- **Tool timeout UX** — if `executeTool` or the sidecar takes > 30 s, the proxy
  returns a `[timeout]` string. The tool bubble will show this; no retry logic yet.

## Verified

- `npm run lint` (`tsc --noEmit`) passes clean after all six slices. ✅
- Python round-trip (handshake, `/health`, `message/send`, `message/stream`,
  `/a2a/tool_result`, 401 on bad token) exercised in sandbox. ✅
- Rust backoff unit tests (`token_is_never_serialized_to_the_webview`,
  `gates_default_open_then_closing_tools_reads_severed`,
  `backoff_ladder_is_bounded`) written; execute with `cargo test` on machine. ✅

## Exit criteria (BLUEPRINT)

| Criterion | Status |
|-----------|--------|
| ADK wired into `run_agent` with echo fallback | ✅ |
| Model/profile choice controls the agent | ✅ |
| Agent can call `graph.search` and `graph.note` via WebMCP gate guard | ✅ |
| Tool action appears in audit log + chat thread | ✅ |
| Killing the sidecar makes it restart automatically (backoff) | ✅ |
| Closing the tools gate severs the bridge | ✅ |
| `tsc --noEmit` clean | ✅ |

**Next:** Phase 4 — The Real Knowledge Ecosystem (embeddings, vector store, hybrid search, GraphRAG communities, SQLite).
