# Packaging — CODE NAME desktop installer

## Prerequisites (build machine)
- Node.js LTS, Rust (rustup), Microsoft C++ Build Tools, WebView2 (Win10).
- **Python 3.11+** on PATH — bundled-script runtime for the agent sidecar.

## Build
```powershell
cd "C:\path\to\code-name"
npm install
npm run tauri build   # alias: npm run desktop:build
```
Artifacts: `src-tauri/target/release/bundle/` (MSI/NSIS on Windows, .dmg/.app on
macOS, .deb/.AppImage on Linux).

## What ships
- Frontend: Vite production build (`dist/`), with the 3D graph in its own lazy
  chunk (`Graph3D-*.js`) so startup stays light.
- Rust shell: the supervisor that launches + owns the Python sidecar lifecycle.
- Bundled resource: `sidecar/agent_sidecar.py` (mapped to `resources/sidecar/`
  via `tauri.conf.json > bundle.resources`).

## Runtime requirements on the end-user machine
- **Python 3.11+** must be present for the sidecar (A2A agent runtime). If absent,
  the app still runs; the sidecar shows `error`/`offline` and the harness falls
  back to local-first behavior (synthetic model + lexical retrieval).
- Optional: a local model (Ollama :11434 / LM Studio :1234) for real generation;
  Chrome (remote debugging) for Browser Harness.

## Pre-release checklist
- [ ] `npm run lint` (tsc) clean, `npm run build` clean.
- [ ] `npm run tauri build` produces an installer; launch it.
- [ ] Self-check (activity feed on boot) shows persistence/retrieval/webmcp OK.
- [ ] Gates sever as expected (network -> cloud, tools -> sidecar/tools, fs -> ingest).
- [ ] Icons + product name correct in the installed app.
- [ ] Code-sign (Windows/macOS) before distribution (not configured yet).
