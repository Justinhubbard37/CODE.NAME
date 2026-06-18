# CODE NAME - Documentation

Start here.

## Guides

- **[User Guide](USER_GUIDE.md)** - get going: ingest documents, use Auto
  knowledge search with visible route traces, access Advanced
  Lexical/Semantic/Hybrid/Graph KB retrieval, select chat context, chat with
  local or cloud models through the canonical provider/model selectors, use
  tools, read the audit ledger, and the keyboard shortcuts.
- **[Admin Guide](ADMIN_GUIDE.md)** - run it for a team: accounts and roles
  (RBAC), workspaces, security gates, the admin policy ceiling, identity/SSO,
  secrets, the tamper-evident audit chain, SIEM forwarding, logging, and the
  agent sidecar.
- **[Troubleshooting](TROUBLESHOOTING.md)** - fixes for common issues: models,
  ingestion, tools, sidecar, keys, installation, and build problems.
- **[Release, Signing & Auto-Update](RELEASE.md)** - ship it: build installers
  per OS, Windows/macOS code signing and notarization, the Tauri auto-updater,
  and the CI secrets checklist.

## Reference & history

- **[Packaging](PACKAGING.md)** - building and bundling the desktop app.
- **[Blueprint](BLUEPRINT.md)**, **[Roadmap](ROADMAP.md)**, **[Strategy](STRATEGY.md)** -
  product direction.
- **`PHASE*.md`** - per-phase implementation notes and contracts.

## In-app help

- The **first-run setup wizard** (shown on first launch; skippable) ends with
  links to these guides.
- **Settings -> Help & docs** lists the guides; **Settings -> Logs** opens your
  log folder for diagnostics. Open Settings any time with **Ctrl/Cmd + ,**.

## Phase 3A — Canonical Runtime Control and Provider Truthfulness

Status: `IMPLEMENTED — PENDING OWNER REVIEW`

Phase 3A documents the current runtime-control implementation: one provider
selector, one provider-scoped model selector, unified Ollama behavior,
provider-specific model discovery, real Gemini discovery and streamed generation
through Rust/Tauri, Parameter Tray tuning-only scope, temporary per-chat tuning
overrides, per-message provider/model provenance, structured provider failures,
dedicated Agent Sidecar Setup, no automatic model pulls/downloads, no automatic
cloud inference during discovery, and no synthetic fallback masquerading as a
real provider response.

Phase 3A is not accepted until owner manual verification is completed.

## Current UI note

- Phase 3A — Canonical Runtime Control and Provider Truthfulness is implemented
  with status `IMPLEMENTED — PENDING OWNER REVIEW`. Everyday runtime control is
  now one rightmost provider selector plus one adjacent provider-scoped model
  selector. Settings is the canonical Provider Manager for endpoints,
  credentials, inventory refresh, persistent Runtime Profile defaults, and
  Agent Sidecar Setup. The Parameter Tray is tuning-only, provider failures
  render as structured error cards, and ordinary provider failures no longer use
  a synthetic assistant fallback. Phase 3A is not accepted until owner manual
  verification is completed.
- Phase 2J improves readability through typography scale, font weight, and
  line-height across existing UI surfaces. No brand colors or theme values
  changed, no UI layout, component structure, or interaction design changed, no
  retrieval behavior changed, no semantic indexing behavior changed, no database
  schema changed, and no graph behavior changed. Graph visual-polish work remains
  backlog.
