# CODE NAME 2 - Agent Harness (Tauri v2 Desktop App)

CODE NAME 2 is a local-first, model-agnostic desktop agent harness. The current
implementation includes a governed two-pane workspace, local knowledge-graph
persistence, hybrid graph search, a supervised Python sidecar, settings for model
routing, capability gates, and a gated ingestion path.

Current reality: GraphRAG and production semantic vector search are roadmap
capabilities. The repo currently has graph/search and retrieval scaffolding, with
stub vector embeddings used as a local fallback. Capability gates exist in the UI
and are partially mirrored into Rust, but backend enforcement is not complete yet.

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

Point the settings drawer at a local endpoint:

- Ollama -> http://localhost:11434
- LM Studio -> http://localhost:1234

The status capsule reflects endpoint checks. With no real provider connected,
chat can fall back to an offline synthetic stream so the UI stays demoable; that
fallback is not proof that a real model/provider is ready.

## Current Stabilization Notes

- Graph search is implemented as local hybrid retrieval over the current graph
  and stub-vector scaffolding, not production GraphRAG.
- Vector storage exists structurally, but current embeddings are deterministic
  stub vectors unless a real sidecar/provider path is added later.
- Capability gates are real controls, but not every backend command is fully
  enforced by Rust yet.
- API keys are stored through the OS keychain path, but current frontend APIs can
  still request secret values through `secret_get`; this is a known security gap
  for a later hardening phase.
