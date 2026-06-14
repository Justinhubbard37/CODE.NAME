# CODE NAME: | — Agent Harness (Tauri v2 Desktop App)

Local-first, model-agnostic agent harness over a self-growing knowledge
ecosystem (Knowledge Graph · GraphRAG · Vector store). Two-pane governed
workspace: **Mission Control** (left) + **Execution Canvas** (right), with a
stealth config drawer, hard capability gates, and a gated drag-drop ingestion
pipeline.

Stack: Tauri v2 (Rust shell) + React 19 + TypeScript + Vite + Tailwind v4 +
@xyflow/react.

## Prerequisites (Windows)

1. **Node.js** (LTS) — https://nodejs.org
2. **Rust** — https://rustup.rs
3. **Microsoft C++ Build Tools** (Desktop development with C++)
5. **Python 3.11+** on PATH (`python`/`python3`) — runs the agent sidecar
4. **WebView2** — preinstalled on Windows 11; on Windows 10 install the Evergreen runtime.

If PowerShell blocks `npm`, run once:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Run (desktop)

```bash
npm install
npm run tauri dev      # or: npm run desktop
```

This launches the native window; Tauri starts the Vite dev server (port 3000)
and loads it in the webview.

## Build a desktop installer

```bash
npm run tauri build    # or: npm run desktop:build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Frontend only (browser, no native shell)

```bash
npm run dev            # http://localhost:3000
```

## Local models

Point the stealth drawer (bottom-left `>`) at a local endpoint:
- Ollama → http://localhost:11434
- LM Studio → http://localhost:1234

The status capsule reads READY once an endpoint responds. With none connected,
chat falls back to an offline synthetic stream so the UI stays demoable.
