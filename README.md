# CODE NAME 2 - Agent Harness (Tauri v2 Desktop App)

CODE NAME 2 is a local-first, model-agnostic desktop agent harness. The current
implementation includes a governed two-pane workspace, local knowledge-graph
persistence, SQLite knowledge-base ingestion/retrieval, a deterministic Auto
retrieval router, real local Ollama semantic chunk retrieval, Hybrid SQLite KB
retrieval with selected-context controls, bounded one-hop Graph traversal
retrieval over SQLite KB entities and relationships, a supervised Python sidecar,
canonical runtime controls for provider/model selection, capability gates, and a
gated ingestion path.

Current reality: full multi-hop GraphRAG reasoning is still a roadmap capability.
SQLite lexical, semantic, Hybrid, and one-hop Graph KB retrieval are
implemented. Graph mode uses Hybrid seed retrieval plus SQLite entities,
chunk-entity links, relationships, active chunks, and active documents. Semantic,
Hybrid, and Graph KB retrieval use locally generated Ollama embeddings persisted
in SQLite. Auto is the default user-facing retrieval mode and uses deterministic
frontend rules, not a model router, to choose existing local backend commands.
Manual Lexical, Semantic, Hybrid, and Graph modes remain available under
Advanced controls. Legacy graph-node hash vectors remain as non-semantic
compatibility scaffolding. Capability gates exist in the UI and are partially
mirrored into Rust, but backend enforcement is not complete yet.

Stack: Tauri v2 (Rust shell) + React 19 + TypeScript + Vite + Tailwind v4 +
React Three Fiber / Three.js, with some legacy React Flow code retained under
`src/legacy`.

## Prerequisites (Windows)

1. **Node.js** (LTS) - https://nodejs.org
2. **Rust** - https://rustup.rs
3. **Microsoft C++ Build Tools** (Desktop development with C++)
4. **Python 3.11+** on PATH (`python`/`python3`) - runs the agent sidecar
5. **WebView2** - preinstalled on Windows 11; on Windows 10 install the Evergreen runtime.

If PowerShell blocks `npm`, run once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Run (desktop)

```bash
npm install
npm run tauri dev      # or: npm run desktop
```

This launches the native window; Tauri starts the Vite dev server and loads it in
the webview.

## Build a desktop installer

```bash
npm run tauri build    # or: npm run desktop:build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Frontend only (browser, no native shell)

```bash
npm run dev            # http://localhost:3000
```

## Local Models

Use the top-right runtime controls for everyday chat routing:

- Select the provider in the rightmost provider selector.
- Select a provider-scoped model in the selector immediately to its left.
- Configure provider endpoints, credentials, inventory refresh, and persistent
  Runtime Profile defaults in Settings -> Provider Manager.

Ollama is one user-facing provider. Local models and cloud-tagged Ollama models
both route through the configured local Ollama daemon; the model suffix
`:cloud` or `-cloud` determines cloud execution. The app does not auto-pull,
auto-download, or preload models.

LM Studio and custom OpenAI-compatible providers discover models through their
configured `/v1/models` endpoints. Gemini discovers compatible models through
the desktop Rust/Tauri backend and streams generation through the same backend;
the Gemini API key stays in OS-backed secret storage and is never returned to
React.

Provider request failures render as structured error cards. They no longer
masquerade as real assistant answers through a synthetic fallback.

## Phase 3A — Canonical Runtime Control and Provider Truthfulness

Status: `IMPLEMENTED — PENDING OWNER REVIEW`

Implemented runtime behavior:

- One rightmost provider selector and one adjacent provider-scoped model
  selector are the everyday runtime controls.
- Ollama is one user-facing provider. Local and cloud-tagged models use the
  configured local daemon; no model pulls, downloads, or cloud inference happen
  automatically during discovery.
- Gemini model discovery and streamed generation run through Rust/Tauri backend
  commands. The Gemini key remains in secure desktop secret storage and never
  enters frontend state, persisted config, logs, messages, activity text, or
  error output.
- The Parameter Tray is tuning-only. Temperature and context-window changes are
  temporary per-chat overrides.
- Each message records safe provider/model provenance, and provider failures
  render as structured failure states instead of synthetic assistant answers.
- Agent Sidecar has a dedicated setup path and is not a normal chat provider.

Phase 3A is not accepted until owner manual verification is completed.

## Current Stabilization Notes

- Phase 3A — Canonical Runtime Control and Provider Truthfulness is implemented
  and pending owner review. It adds one provider selector, one provider-scoped
  model selector, unified Ollama behavior, provider-specific inventory
  discovery, real Gemini discovery/generation through Rust, per-chat temporary
  tuning overrides, per-message runtime provenance, structured provider
  failures, and a dedicated Agent Sidecar Setup area. Phase 3A is not accepted
  until owner manual verification is completed.
- Phase 2J improves readability through typography scale, font weight, and
  line-height across existing UI surfaces. No brand colors or theme values
  changed, no UI layout, component structure, or interaction design changed, no
  retrieval behavior changed, no semantic indexing behavior changed, no database
  schema changed, and no graph behavior changed. Graph visual-polish work remains
  backlog.
- Auto retrieval is frontend-only in this phase. It visibly reports requested
  mode, resolved mode, route reason, semantic readiness, graph expansion counts,
  fallback reason, local-only status, Attach state, and selected result count.
- Auto may visibly degrade to Lexical when semantic or graph prerequisites are
  unavailable. Manual Advanced modes keep their stricter behavior and do not
  silently fallback.
- Graph mode is implemented as bounded one-hop SQLite KB graph traversal: Hybrid
  seed retrieval expands through stored entities, chunk-entity links,
  relationships, and active chunks/documents. It is not full multi-hop GraphRAG
  reasoning.
- Semantic KB retrieval uses local loopback Ollama embeddings for SQLite chunks;
  it does not use OpenAI, Gemini, cloud embeddings, random vectors, or hash-vector
  fallback.
- Hybrid SQLite KB retrieval combines real lexical and semantic KB candidates,
  deduplicates chunks by ID, displays lexical/semantic/combined scores plus match
  reasons, and attaches only user-selected visible chunks when Attach is ON.
- Graph mode labels seed versus expanded evidence, shows traversal depth,
  expansion type, graph reason, graph score, and attaches only user-selected
  visible chunks when Attach is ON.
- Semantic index Build / Refresh remains manual in this phase. Automatic
  semantic indexing after ingestion is future Phase 2I-B and is not implemented.
- Retrieved chunks are never hidden-injected on chat send. Attach remains OFF by
  default, and Attach ON sends only selected visible chunks.
- The bottom-left Parameter Tray is tuning-only for the active chat. Temperature
  and context-window changes there are temporary per-chat runtime overrides and
  do not modify persisted Runtime Profile defaults.
- Each user/assistant chat message stores safe provider/model provenance for the
  runtime snapshot that produced it. Failed provider requests store structured
  safe failure metadata instead of a normal assistant answer.
- Full multi-hop GraphRAG reasoning, external vector DB integration, sidecar
  community GraphRAG, legacy hash-vector GraphRAG, and model auto-pull/download
  are not implemented.
- Capability gates are real controls, but not every backend command is fully
  enforced by Rust yet.
- API keys are stored through the OS keychain path. The frontend can set/delete
  keys and check key presence, but raw keychain secret reads are denied and
  Gemini calls use backend-only key access.
