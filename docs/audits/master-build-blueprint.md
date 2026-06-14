# CODE NAME 2 Master Build Blueprint

Audit date: 2026-06-14  
Repo path: `C:\Users\justi\Desktop\Codex\code-name2`  
Audit mode: read-only source audit, with this markdown report as the only intended deliverable.

## 1. Executive Summary

CODE NAME 2 is a local-first Tauri v2 desktop agent harness with a React 19 frontend, Rust command layer, Python loopback sidecar, local knowledge graph, model routing, WebMCP-style tools, A2UI rendering, capability gates, local accounts, workspaces, audit ledger, backups, SIEM forwarding, logging, crash reports, CI, and release scaffolding.

Current maturity level: advanced prototype / early alpha. The repo contains a large amount of real wiring, but it is not production-grade because the security and trust boundaries are inconsistent, several docs overstate runtime guarantees, and the critical governance model still depends too heavily on frontend state.

What is real:

- Tauri command registration exists in `src-tauri/src/lib.rs` for sidecar, model proxy, secrets, logs, and crash commands.
- The Python sidecar exists in `sidecar/agent_sidecar.py`, binds `127.0.0.1` on an ephemeral port, mints a per-launch token, exposes A2A-shaped routes, and includes ADK fallback behavior.
- The frontend app is a real two-pane React shell rooted at `src/App.tsx`, `src/state/AppState.tsx`, `src/components/left/MissionControl.tsx`, and `src/components/right/ExecutionCanvas.tsx`.
- Knowledge graph persistence exists in `src/kg/store.ts` using IndexedDB with in-memory fallback.
- Hybrid retrieval exists in `src/kg/retrieve.ts`, but its vector side uses local `stubEmbed()` from `src/kg/vector.ts`, not production embeddings.
- Unit tests exist and pass after rerunning outside the sandbox: 9 test files, 76 tests.
- TypeScript typecheck passes via `npm run lint`.
- Rust compiles under `cargo test --all-features --locked`, but there are zero Rust tests.

What is scaffolded or misleading:

- The docs and UI repeatedly say "GraphRAG" and "Vector store", but production semantic embeddings and durable GraphRAG indexing are not present. `stubEmbed()` is a character-bigram hash.
- The WebMCP surface is a local shim in `src/lib/webmcp.ts`, not a native browser/platform API.
- Browser harness pooling is partially real, but the pool handle is not actually used by `sidecar_browser_open`; `browser.open` creates a CDP tab independently through the sidecar.
- `SlidersStub.tsx` is a misleading filename for real temperature/context controls.
- `docs/BLUEPRINT.md` is stale in places: it still says there are no automated tests and that the token is handed to the web page, while current source has tests and Rust-held sidecar tokens.
- Workspace isolation is incomplete: graph data uses per-workspace IndexedDB names, but config still persists to the single `codename:config:v1` key.

What is missing:

- A backend-owned authorization model. `set_gates`, `secret_get`, `secret_set`, `model_list`, and several sidecar commands trust the webview caller.
- Rust-side network/filesystem enforcement for all network/file-capable commands.
- Production data storage, schema migrations, encrypted at-rest storage, and typed IPC request validation.
- Durable task/chat persistence.
- Real provider verification for cloud model paths.
- Rust integration tests and end-to-end tests run in this audit.
- A threat model and security hardening pass that reflects the current implementation.

Biggest architectural risk: the UI presents "hard capability gates", but backend enforcement is incomplete. `sidecar_send` and `sidecar_stream` check the Tools gate but not the Network gate, while the Python sidecar defaults to a Gemini ADK model. `sidecar_browser_open`, `sidecar_embed`, `sidecar_communities`, and pool commands have no Rust-side gate checks. `secret_get` returns keychain secrets to the webview.

Best next move: stop feature work and do a Phase 0 stabilization/security pass that makes runtime boundaries truthful: backend-owned gate enforcement, secret access redesign, audit hash-chain repair, workspace/config isolation, and docs/UI wording corrections.

## 2. What This Project Is Trying To Become

Confirmed intent from repo evidence:

- A local-first desktop agent harness. Evidence: `README.md` describes "Local-first, model-agnostic agent harness"; `src-tauri/tauri.conf.json` uses product name `CODE NAME` and bundles `../sidecar/agent_sidecar.py`.
- A two-pane governed workspace. Evidence: `src/App.tsx` renders `MissionControl`, `ExecutionCanvas`, `StealthDrawer`, `SettingsScreen`, and `OnboardingWizard`.
- A knowledge graph plus retrieval workspace. Evidence: `src/store.ts` seeds dossier/entity/evidence nodes; `src/kg/store.ts` persists nodes, edges, audit, chunks, vectors; `src/kg/retrieve.ts` exports `HybridRetriever`.
- A model-agnostic chat system. Evidence: `src/lib/llm.ts` supports Ollama, OpenAI-compatible, LM Studio, Gemini, custom, and shell-routed cloud calls.
- A supervised Python agent runtime. Evidence: `src-tauri/src/sidecar.rs` starts `sidecar/agent_sidecar.py`, reads handshake, stores token in Rust state, and forwards A2A calls.
- A tool and agent UI environment. Evidence: `src/lib/webmcp.ts` installs `document.modelContext`; `src/components/right/a2ui/A2UIRenderer.tsx` renders a trusted A2UI catalog.
- Enterprise-ish governance. Evidence: `src/auth/*`, `src/auth/policy.ts`, `src/lib/siem.ts`, `src/components/config/SecurityGates.tsx`, `docs/ADMIN_GUIDE.md`.
- Release packaging ambition. Evidence: `.github/workflows/release.yml`, `docs/RELEASE.md`, `docs/PACKAGING.md`, `src-tauri/tauri.conf.json`.

Inferred intent from naming and seams:

- The app wants to become a governed agent operating environment, not just a chat UI. Evidence: task tabs in `src/components/left/TaskTabs.tsx`, per-tab caps in `src/components/left/EnvironmentBar.tsx`, pools in `src/lib/pools.ts`, and sidecar pool endpoints in `sidecar/agent_sidecar.py`.
- The knowledge graph is intended to become durable shared memory. Evidence: `AuditRecord`, `GateDecision`, per-node `history`, `kgStore.appendAudit()`, and docs/contracts in `docs/contracts/audit.md`.
- The browser harness is intended to become a controlled web execution surface. Evidence: `browser.open` tool in `src/state/AppState.tsx`, CDP helpers in `sidecar/agent_sidecar.py`, and browser-harness integration notes in `docs/integration-notes/browser-harness.md`.
- The current "local accounts" layer is intended as an offline enterprise placeholder before real SSO. Evidence: `docs/ADMIN_GUIDE.md` explicitly says SSO is not implemented and expected to slot behind `AuthContext`.

## 3. Current Architecture Map

Frontend stack:

- React 19, TypeScript, Vite 6, Tailwind v4 plugin, lucide icons, React Three Fiber, drei, Three.js, Tesseract.js, Playwright tests.
- Evidence: `package.json` dependencies include `react`, `react-dom`, `vite`, `@tailwindcss/vite`, `@react-three/fiber`, `@react-three/drei`, `three`, `tesseract.js`, `@playwright/test`.
- Entry points: `index.html`, `src/main.tsx`, `src/App.tsx`.

Backend stack:

- Tauri v2 Rust shell.
- Rust modules: `src-tauri/src/lib.rs`, `sidecar.rs`, `model.rs`, `secrets.rs`, `logging.rs`, `crash.rs`.
- Python sidecar: `sidecar/agent_sidecar.py`, stdlib server with optional `google-adk`.

Runtime environment:

- Desktop app via `npm run desktop` / `tauri dev`.
- Browser preview via `npm run dev`.
- Tauri config: `src-tauri/tauri.conf.json` starts Vite on `http://localhost:3000`, disables native drag/drop, sets `csp` to `null`, and bundles sidecar as a resource.

Data flow:

- UI state lives in `AppStateProvider` (`src/state/AppState.tsx`).
- Graph nodes/edges hydrate from `kgStore` on boot.
- User drag/drop goes through `Dropzone` -> `ingestFiles()` -> `hashFile()` -> `createDocNode()` -> `commit()` -> `kgStore.putNodes()` plus audit.
- Query flow is `GraphQueryInput` -> `runGraphQuery()` -> `retriever.index()` / `retriever.retrieve()` -> hidden node flags.
- Chat flow is `ChatInput` -> `sendMessage()` -> either sidecar path (`streamFromSidecar`) or model path (`streamChat`) -> `ChatThread`.
- Tool flow is sidecar tool-call frame -> `executeTool()` in `src/lib/webmcp.ts` -> registered tools in `AppState.tsx` -> optional `sidecarToolResult()`.

State flow:

- Global app state is React context in `src/state/AppState.tsx`.
- Local accounts are in localStorage via `src/auth/accountStore.ts`.
- Workspaces are localStorage metadata via `src/auth/workspace.ts`.
- Endpoint/profile/gate config is localStorage via `src/config/persist.ts`.
- Language is localStorage via `src/i18n/index.tsx`.
- A2UI state is per-task Map in `src/components/right/a2ui/bus.ts`.
- Pool state is module-level memory in `src/lib/pools.ts`.

Persistence layer:

- Graph, edges, audit, chunks, vectors: IndexedDB in `src/kg/store.ts`, DB version 2.
- Config: localStorage key `codename:config:v1`.
- Accounts: localStorage keys `codename:accounts:v1`, `codename:active-user`.
- Workspaces: localStorage keys `codename:workspaces:v1`, `codename:active-workspace`.
- Admin policy: localStorage key `codename:admin-policy:v1`.
- SIEM config: localStorage key `codename:siem:v1`.
- Secrets: OS keychain via Rust `src-tauri/src/secrets.rs`, but exposed to webview through `secret_get`.

External provider/model/tool integrations:

- Local Ollama: browser fetch to `/api/chat` and `/api/tags` in `src/lib/llm.ts`.
- LM Studio/OpenAI-compatible: browser fetch to `/v1/chat/completions` and `/v1/models`.
- Cloud model proxy: Rust `model_stream` and `model_list` in `src-tauri/src/model.rs`.
- Gemini: frontend `@google/genai` path in `src/lib/llm.ts`, using a resolved key in webview memory.
- Sidecar: Rust-supervised A2A path through `src-tauri/src/sidecar.rs`.
- Browser Harness: Python CDP helper in `sidecar/agent_sidecar.py`, invoked by `sidecar_browser_open`.
- SIEM: frontend `fetch()` in `src/lib/siem.ts`.

Build/dev/test pipeline:

- Scripts in `package.json`: `dev`, `build`, `preview`, `lint`, `test`, `audit`, `sbom`, `tauri`, `desktop`, `desktop:build`, `e2e`, `e2e:install`.
- CI exists in `.github/workflows/ci.yml` for lint, unit tests, web build, Playwright e2e, and Rust tests.
- Security workflow exists in `.github/workflows/security.yml` for npm audit, cargo audit, CodeQL, SBOM.
- Release workflow exists in `.github/workflows/release.yml`.

Important directories and roles:

- `src/`: React frontend, state, auth, config, KG, protocol shims.
- `src-tauri/src/`: trusted desktop shell commands.
- `sidecar/`: Python agent sidecar.
- `docs/`: product docs, phase notes, contracts, integration notes.
- `e2e/`: Playwright journey test.
- `src/legacy/`: old 2D React Flow graph kept for reference.
- `dist/`, `node_modules/`, `src-tauri/target/`, `sidecar/__pycache__/`: generated or dependency artifacts present inside the audit tree.

## 4. Implementation Status Matrix

| Area / Feature | Evidence | Current Status | What Works Now | What Is Missing | Risk Level | Recommended Action |
|---|---|---:|---|---|---:|---|
| Tauri desktop shell | `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json` | Partial | App shell registers many commands and bundles sidecar | CSP is `null`; command auth is broad; no Rust tests | High | Harden command permissions and add Rust command tests |
| React app shell | `src/App.tsx`, `src/main.tsx` | Complete | Main UI composes auth, app state, two panes, drawer, settings, onboarding | Some encoding/mojibake in visible strings | Medium | Keep, but clean encoding and UX truthfulness |
| Mission Control pane | `src/components/left/MissionControl.tsx` | Partial | 3D graph, archive, telemetry, query, dropzone render | Archive is static; GraphRAG label is overstated | Medium | Wire archive to real store counts/entities |
| Execution Canvas | `src/components/right/ExecutionCanvas.tsx` | Partial | Header, tools bar, activity, ingestion, A2UI, audit, chat | Several panels depend on in-memory task state | Medium | Persist task/chat state before expanding |
| Knowledge graph persistence | `src/kg/store.ts` | Partial | IndexedDB stores nodes, edges, audit, chunks, vectors | No migrations beyond IDB upgrade; no encryption; no backend DB | High | Define storage contract and migration/encryption plan |
| KG mutation chokepoint | `commit()` in `src/state/AppState.tsx`, `src/kg/commit.ts` | Partial | Gate-denied writes are audited for filesystem gate denials | Viewer-role denials return before audit; before/after omitted | High | Make all denials auditable and include snapshots/hashes |
| Audit hash chain | `hashAuditRecord()`, `verifyAuditChain()` | Broken | Verify button can run over audit records | Hash canonicalization ignores nested fields; timestamp ordering can break | Critical | Replace canonical hash implementation and add tamper tests |
| Hybrid retrieval | `src/kg/retrieve.ts`, `src/kg/vector.ts` | Partial | BM25-lite plus RRF with vector retriever exists | Vector is `stubEmbed()` character-bigram hash, not semantic embedding | Medium | Rename claims or introduce real embedding backend |
| GraphRAG/community detection | `src/kg/communities.ts`, `sidecar_communities` | Partial | Local label propagation and sidecar endpoint exist | Durable GraphRAG index missing; summaries rely on ADK/stub fallback | Medium | Treat as community detection until GraphRAG is real |
| 3D graph | `src/components/left/graph3d/*` | Partial | R3F scene, LOD, clusters, node details | Layout persistence on drag is not implemented | Medium | Persist node positions through audited write path |
| File ingestion | `Dropzone`, `ingestFiles()` | Partial | Text files hashed/truncated/indexed; conflicts handled | Text capped at 4000 chars; binary only placeholder; no chunking | Medium | Add chunk store and explicit file-type policy |
| OCR | `GraphQueryInput.tsx`, `tesseract.js` | Partial | OCR button ingests recognized image text | OCR network/offline assets not explicitly controlled by Network gate | Medium | Bundle OCR assets or gate/network-label it |
| Model routing | `src/lib/llm.ts`, `src/config/defaults.ts` | Partial | Local and cloud endpoint families are modeled | Cloud paths mix frontend secret access and Rust proxy; TLS support uncertain | High | Consolidate provider calls behind trusted Rust broker |
| Synthetic fallback | `syntheticStream()` in `src/lib/llm.ts` | Complete | App responds when endpoints fail | Can mask broken real provider paths | Medium | Keep, but visibly mark fallback in status/telemetry |
| Sidecar supervision | `src-tauri/src/sidecar.rs` | Partial | Rust spawns, restarts, shuts down sidecar; token held in Rust | Some sidecar commands lack gate checks; no Rust tests | Critical | Enforce gates in every command and test them |
| Python sidecar | `sidecar/agent_sidecar.py` | Partial | Loopback A2A server, ADK optional, tool proxy, embed, communities, CDP | ADK absent falls back to echo stub; no request body limits; default cloud model | Critical | Add explicit runtime mode, limits, and network gate contract |
| WebMCP | `src/lib/webmcp.ts`, tools in `AppState.tsx` | Partial | Local shim registers graph/search/note/get/link/ingest/ui/browser tools | Guard checks only tools role/gate broadly; tool schemas not validated | High | Add per-tool policy and schema validation |
| Browser Harness | `browser.open`, `sidecar_browser_open`, `_cdp_open()` | Partial | Can talk to Chrome CDP if manually launched | No Rust-side network gate; no URL policy; pool handle not used | Critical | Disable or redesign behind backend policy |
| A2UI | `A2UIRenderer.tsx`, `bus.ts`, `AgentUIPanel.tsx` | Partial | Trusted catalog, per-task payloads, interactive textfields/buttons | Actions can call tools through same broad WebMCP guard | Medium | Add action policy and audit UI-originated tool calls |
| Capability gates | `SecurityGates.tsx`, `GateState`, `set_gates` | Broken/Partial | UI and some Rust paths read gates | Backend command coverage incomplete; `set_gates` trusts webview | Critical | Make Rust authoritative and webview advisory |
| RBAC/local accounts | `src/auth/*` | Partial | Admin/editor/viewer helpers, sign-in UI, default admin | PIN stored plaintext; auth is not backend enforced | High | Reframe as convenience UI or move auth decisions backend-side |
| Secrets | `src-tauri/src/secrets.rs`, `src/lib/secrets.ts` | Broken/Partial | OS keychain CRUD exists | `secret_get` exposes secret values to webview; env fallback uses `VITE_` | Critical | Stop returning raw secrets to frontend |
| Workspaces | `src/auth/workspace.ts`, `initWorkspaceStore()` | Partial | Per-workspace IndexedDB name for graph data | Config/accounts/policy/SIEM not per-workspace; delete does not clear DB | High | Define workspace isolation boundaries and deletion semantics |
| Backups/export | `src/lib/backup.ts`, StealthDrawer data section | Partial | AES-GCM export/import, JSON/CSV exports | Import re-appends audit records through `appendAudit`, recalculates chain, may SIEM-forward imported records | High | Add import mode that preserves data without side effects |
| SIEM | `src/lib/siem.ts` | Partial | Optional frontend POST of audit events, network-gate check | No URL validation, retries, batching, auth, or backend enforcement | High | Move SIEM forwarding to trusted broker |
| Logging/crash reports | `logging.rs`, `crash.rs`, `StealthDrawer.tsx` | Partial | Local logs and opt-in crash files exist | Crash report content can include sensitive stack/message text | Medium | Add redaction and retention controls |
| CI and release | `.github/workflows/*.yml` | Partial | Workflows exist for CI/security/release | This folder is not a git repo; branch protection external; release signing optional | Medium | Initialize/restore VCS and verify workflows in real remote |
| Tests | `src/**/*.test.ts`, `e2e/journey.spec.ts` | Partial | 76 unit tests pass; e2e file exists | No Rust tests; e2e not run in audit; security tests incomplete | High | Add backend gate/security tests first |
| Repo hygiene | root folders | Broken/Partial | Project can typecheck | `node_modules`, `dist`, `src-tauri/target`, `__pycache__` present; no `.git` | Medium | Clean generated artifacts after VCS baseline is restored |

## 5. Intended-but-Disconnected Findings

1. `src-tauri/src/sidecar.rs` `filesystem_open()`
   - Intended: Rust-side filesystem gate.
   - Currently connected to: compiled method only; cargo warns it is never used.
   - Missing: enforcement in file/write-capable commands.
   - Action: build. This is required before calling gates "hard".

2. `src-tauri/src/sidecar.rs` `sidecar_browser_open()`
   - Intended: trusted shell broker for browser harness.
   - Currently connected to: forwards any URL to `/a2a/browser_open`.
   - Missing: Tools gate, Network gate, URL/scheme validation, local/internal target policy, pool handle binding.
   - Action: redesign before production use.

3. `sidecar/agent_sidecar.py` `_pool_contexts`
   - Intended: real isolated sidecar contexts for browser/agent pools.
   - Currently connected to: `/a2a/pool/create` and `/a2a/pool/release` only.
   - Missing: `browser_open` does not receive or use a context handle; ADK sessions are still created per run.
   - Action: build or simplify. Do not advertise real isolation until bound.

4. `sidecar/agent_sidecar.py` `_harness_write()`
   - Intended: sandboxed harness file-write containment.
   - Currently connected to: no observed caller in sidecar source.
   - Missing: actual write paths and filesystem gate integration.
   - Action: defer or remove until browser harness writes files.

5. `src/components/left/ArchiveIndex.tsx`
   - Intended: visual index of KG, vectors, GraphRAG, ingest log.
   - Currently connected to: static `ARCHIVE` constant.
   - Missing: live counts, stored chunks, communities, ingestion history.
   - Action: build later; label static until real.

6. `src/auth/workspace.ts` workspace config isolation
   - Intended: comment says each workspace has separate graph store and separate localStorage config key.
   - Currently connected to: graph DB name only through `initWorkspaceStore(getActiveWorkspace().dbName)`.
   - Missing: workspace-scoped config, policy, SIEM, accounts, backup boundaries.
   - Action: build in persistence phase.

7. `src/legacy/GraphCanvas.tsx` and `src/legacy/CustomNodes.tsx`
   - Intended: kept for reference.
   - Currently connected to: only each other and `NodeDetailsPanel`; not used by app shell.
   - Missing: none if intentionally archived.
   - Action: defer or delete later after confirming no need.

8. `src/components/config/SlidersStub.tsx`
   - Intended by name: stub.
   - Currently connected to: real controls in `StealthDrawer` and `SettingsScreen`.
   - Missing: rename only.
   - Action: rename later for hygiene.

9. `docs/BLUEPRINT.md`
   - Intended: master plan.
   - Currently connected to: docs only.
   - Missing: current-state reconciliation; it contains stale claims like "no automated tests" and older sidecar-token warnings.
   - Action: update docs after runtime audit decisions.

10. `src-tauri/src/model.rs` cloud proxy
    - Intended: backend cloud model broker.
    - Currently connected to: `model_stream`, `model_list`, `src/lib/llm.ts`.
    - Missing: explicit Network gate on `model_list`, TLS feature verification for HTTPS, provider-specific request contracts.
    - Action: build/harden.

## 6. Mock / Stub / Placeholder Inventory

Critical or high severity:

- `src/kg/vector.ts` `stubEmbed()` is a deterministic character-bigram hash, not a semantic embedding model. UI/docs call this a Vector store and GraphRAG-capable retrieval.
- `sidecar/agent_sidecar.py` `run_agent()` returns `[SIDECAR:STUB] google-adk not installed... Echo:` if ADK is absent.
- `src/lib/llm.ts` `syntheticStream()` fabricates a local reply when endpoints fail. Useful fallback, but it can hide broken provider paths.
- `src/store.ts` seeds demo intelligence data (`OPERATION COBALT`, `PROJECT NIGHTFALL`, `BLACKWALL FINANCIALS`, etc.) as initial graph content.
- `ArchiveIndex.tsx` hardcodes `KNOWLEDGE_GRAPH`, `VECTOR_STORE`, `GRAPHRAG_INDEX`, and `INGEST_LOG` rather than reading real store metadata.

Medium severity:

- `src/components/config/SlidersStub.tsx` is misnamed even though it is functional.
- `src/legacy/*` contains old 2D graph code intentionally retained.
- `src/components/settings/SettingsScreen.tsx` hardcodes `APP_VERSION = '0.0.0'` while `src-tauri/Cargo.toml` and `tauri.conf.json` use `0.1.0`.
- `src/lib/selfcheck.ts` marks `model` as OK because "synthetic offline fallback present", which is not evidence of a working real model.
- `sidecar/agent_sidecar.py` `AGENT_CARD` is a hand-rolled A2A-shaped document, not evidence of SDK compliance.

Low severity:

- The onboarding and docs contain "GraphRAG query" copy before GraphRAG is production-real.
- Several docs contain mojibake characters (`â€”`, `Â·`, etc.), including `README.md` and many docs.

No TODO/FIXME/HACK inventory was found by the targeted source search, but the repo uses phase comments heavily as future-intent markers.

## 7. Security and Trust-Boundary Audit

Issue: keychain secrets are exposed to the webview.

- Evidence: `src-tauri/src/secrets.rs` defines `secret_get(name) -> Option<String>`; `src/lib/secrets.ts` returns that string to frontend callers; `src/lib/llm.ts` `resolveKey()` uses `getSecret()`.
- Why it matters: any XSS, compromised dependency, or malicious renderer path can ask Tauri for raw API keys. The docs claim keys are "only ever read inside the Rust shell", but source disproves that.
- Severity: Critical.
- Required fix: replace `secret_get` with backend-only operations. Frontend may ask "is key present" or "set/delete key"; provider requests must be signed/executed in Rust without returning the secret.

Issue: env fallback deliberately exposes cloud keys to frontend.

- Evidence: `.env.example` requires `VITE_GEMINI_API_KEY` and `VITE_OLLAMA_API_KEY`; `src/lib/llm.ts` `env()` reads Vite env vars; `streamGemini()` constructs `GoogleGenAI` in the frontend.
- Why it matters: Vite `VITE_` values are client-exposed by design. This is incompatible with strong secret handling.
- Severity: Critical.
- Required fix: remove frontend cloud provider execution and route all cloud calls through Rust.

Issue: backend gates are incomplete.

- Evidence: `sidecar_send()` and `sidecar_stream()` only check `gates.tools_open()`; `sidecar_browser_open()`, `sidecar_embed()`, `sidecar_communities()`, `sidecar_pool_create()`, and `sidecar_pool_release()` do not check gates; cargo warns `filesystem_open()` is unused.
- Why it matters: the UI calls them through guarded paths, but the trust boundary is the Tauri command layer, not React state.
- Severity: Critical.
- Required fix: define per-command required capabilities and enforce in Rust before forwarding to sidecar.

Issue: Network gate does not cover sidecar model execution.

- Evidence: Python sidecar default model is `gemini-2.5-flash` in `sidecar/agent_sidecar.py`; Rust `sidecar_send()` and `sidecar_stream()` do not check `network_open()`.
- Why it matters: selecting the local A2A sidecar can result in cloud model use if ADK is installed/configured, even when the user thinks Network is closed.
- Severity: Critical.
- Required fix: sidecar calls must carry an explicit "network allowed" policy, and sidecar must refuse cloud models/tools when closed.

Issue: browser harness can access arbitrary URLs without backend URL policy.

- Evidence: `browser.open` forwards a URL to `sidecarBrowserOpen(url)`; Rust `sidecar_browser_open()` forwards to `/a2a/browser_open`; Python `_cdp_open(url)` navigates Chrome to the supplied URL.
- Why it matters: this can reach intranet, localhost admin panels, file-like schemes if Chrome accepts them, or sensitive pages in a debug-enabled Chrome session.
- Severity: Critical.
- Required fix: URL scheme/host policy, Network gate enforcement, user approval, and per-context isolation before enabling.

Issue: `set_gates` trusts the webview.

- Evidence: `src-tauri/src/sidecar.rs` `set_gates(filesystem, network, tools)` stores booleans; role checks happen only in React `toggleGate()`.
- Why it matters: a compromised webview can reopen gates by invoking `set_gates` directly.
- Severity: High.
- Required fix: Rust should own policy and accept only authorized transitions, or treat webview gate state as requested state subject to backend policy.

Issue: local auth is not a security boundary.

- Evidence: `src/auth/accountStore.ts` stores optional `pin` in localStorage; `AuthContext.signIn()` compares plaintext equality; docs say OS is the trust boundary.
- Why it matters: UI roles are useful ergonomics but not secure enforcement against a local attacker or compromised renderer.
- Severity: High.
- Required fix: present local roles as convenience only, or implement backend authorization rooted in OS/user identity.

Issue: audit hash chain is not cryptographically meaningful enough.

- Evidence: `hashAuditRecord()` uses `JSON.stringify(r, Object.keys(r).sort() as never[])`. A replacer array built from top-level keys excludes nested fields like `actor.kind`, `target.kind`, and `decision.allowed`.
- Why it matters: nested audit record tampering may not change the hash.
- Severity: Critical.
- Required fix: implement recursive canonical serialization and test nested mutations.

Issue: viewer-role write denials are not audited.

- Evidence: `commit()` in `src/state/AppState.tsx` returns false immediately when `!canWrite(currentUser?.role)` before calling `kgStore.appendAudit()`.
- Why it matters: docs promise denied writes are recorded; viewer denial attempts disappear.
- Severity: High.
- Required fix: audit all denials before returning, including RBAC denials.

Issue: CSP is disabled.

- Evidence: `src-tauri/tauri.conf.json` has `"csp": null`.
- Why it matters: XSS impact is severe because the webview can invoke privileged Tauri commands and currently retrieve secrets.
- Severity: Critical.
- Required fix: set a restrictive CSP and remove raw secret-returning commands.

Issue: SIEM forwarding is frontend-only.

- Evidence: `src/lib/siem.ts` uses browser `fetch(_config.url, ...)`.
- Why it matters: arbitrary URL config, no retry/batching/auth, and no backend policy enforcement. It can also leak imported audit records because `applyWorkspace()` re-appends audit through `appendAudit()`.
- Severity: High.
- Required fix: move SIEM to Rust broker with validation, auth config, queueing, redaction, and import-safe mode.

## 8. Data and Persistence Audit

What persistence exists:

- IndexedDB: nodes, edges, audit, chunks, vectors in `src/kg/store.ts`.
- localStorage: config, accounts, active user, workspaces, active workspace, admin policy, SIEM config, language, onboarding flag.
- OS keychain: secrets through `src-tauri/src/secrets.rs`.
- Local log files: Rust logs and crash files in platform app log dir.
- Browser downloads: encrypted `.codename` backups and JSON/CSV exports.

What is only in memory:

- Task tabs, chat transcripts, activity feed, `runningModel`, quarantine list, pool leases, A2UI payloads, current graph query.
- Python sidecar ADK session service is `InMemorySessionService`.
- Sidecar pool contexts live in `_pool_contexts` only.

What is mocked or stubbed:

- Embeddings use `stubEmbed()` unless sidecar embed returns a vector. Sidecar embed also uses `_stub_embed()`.
- Community summaries fall back to ADK/stub behavior; no durable GraphRAG index exists.
- Initial graph is seeded fake/demo data in `src/store.ts`.

Data models:

- Main TypeScript contracts in `src/types.ts`: `AppNode`, `NodeData`, `Endpoint`, `SecurityGates`, `ConfigProfile`, `WorkTask`, `AuditRecord`, `SidecarHandshake`, `SystemConfig`.
- Auth contracts in `src/auth/types.ts`.
- A2UI contracts in `src/components/right/a2ui/types.ts`.
- Rust model request shape in `src-tauri/src/model.rs` `ModelReq`.

Schema/migration layer:

- IndexedDB has versioned object-store creation in `src/kg/store.ts`, but no explicit data migrations, validation, or rollback.
- No SQLite schema exists despite docs referencing future SQLite/SQLCipher.
- No generated typed IPC bindings were found; Tauri command payloads are hand-shaped.

What should be persisted next:

- Task/chat/activity state, at least per workspace, if the product is a persistent agent workspace.
- Node positions after user movement.
- Ingestion chunks and source metadata beyond 4000-character text snippets.
- Provider status history and model selection audit.
- Gate/policy changes as audit records.

What should not be persisted yet:

- Raw model prompts/responses to audit or logs until privacy policy and redaction are implemented.
- Browser-harness page text or screenshots until URL policy and data classification exist.
- Raw secrets in any frontend-accessible store.

## 9. Frontend / UX Reality Check

UI features that work:

- Two-pane shell with resizable split.
- Settings dialog and stealth drawer.
- Endpoint/profile/model selection controls.
- Graph visualization, node details, graph query filtering.
- Drag/drop ingestion and conflict resolution.
- Chat composer with stop button.
- WebMCP tool list.
- Audit ledger expansion and verify action.
- Onboarding wizard.
- Language switch between English and Spanish.

UI features that are cosmetic or overstated:

- `ArchiveIndex` is static and not a live index.
- "GraphRAG Query" is currently hybrid lexical plus stub-vector retrieval, not production GraphRAG.
- "Vector store" exists structurally, but vectors are generated by stub hashing.
- "Hard gates" are not uniformly hard at the backend.
- The browser pool usage display is not proof of browser context isolation.

UI features that imply missing backend functionality:

- Workspaces imply all data/config isolation; only the KG DB name is isolated.
- Admin policy implies trusted enforcement; policy is stored in localStorage and mirrored from frontend.
- SIEM implies security-grade forwarding; it is best-effort frontend fetch.
- Secrets panel implies secrets never enter frontend; `secret_get` returns raw values.
- Browser harness implies safe web access; no URL policy is present.

Broken or confusing states:

- `SettingsScreen` displays version `0.0.0`, while Tauri/Cargo use `0.1.0`.
- `SlidersStub` name misleads contributors.
- README/docs contain mojibake, which makes the product look less controlled.
- `npm run clean` uses `rm -rf`, which is not native PowerShell on Windows.
- If Vitest runs inside the sandbox, config loading fails with `Error: spawn EPERM`; outside the sandbox it passes.

Missing loading/error/empty states:

- Some exist via `StateBlock`, but provider/cloud failures can be swallowed into synthetic fallback.
- SIEM failures only `console.warn`.
- Keychain save failures return false but are not surfaced strongly in all UI paths.

State synchronization issues:

- `gatesRef.current` is policy-applied, but Rust receives raw `gates` from the effect, not `applyPolicy(adminPolicy, gates)`. If a policy lock changes without changing `gates`, the backend mirror can drift.
- `AppStateProvider` calls `initWorkspaceStore()` during render based on active workspace, but config is not workspace-scoped.
- `sendMessage()` dependency array uses `tasks`, so fast task changes while streaming are risky.

Navigation gaps:

- Settings duplicates stealth drawer controls rather than replacing them.
- Docs are displayed as file paths but not linked/opened from the app.
- Sign-in/user management is reachable mainly through sign-out flow and onboarding assumptions.

## 10. Backend / Runtime Reality Check

Existing commands/routes/services:

- Tauri sidecar commands: `sidecar_info`, `sidecar_restart`, `sidecar_send`, `sidecar_stream`, `set_gates`, `sidecar_cancel`, `sidecar_tool_result`, `sidecar_embed`, `sidecar_communities`, `sidecar_browser_open`, `sidecar_pool_create`, `sidecar_pool_release`, `sidecar_health`.
- Tauri model commands: `model_list`, `model_stream`.
- Tauri secret commands: `secret_get`, `secret_set`, `secret_delete`.
- Tauri log/crash commands: `get_log_dir`, `open_log_dir`, `set_crash_consent`, `get_crash_consent`, `append_js_crash_log`, `get_crash_reports`, `clear_crash_reports`, `open_crash_folder`.
- Python sidecar routes: `/health`, `/.well-known/agent-card.json`, `/a2a`, `/a2a/tool_result`, `/a2a/embed`, `/a2a/communities`, `/a2a/pool/create`, `/a2a/pool/release`, `/a2a/browser_open`.

Actual execution path:

- Rust starts sidecar in setup, reads first stdout line as handshake, stores token in `SidecarInfo`.
- Webview asks Rust for sidecar calls. Token is not serialized in live `SidecarInfo`.
- Rust forwards loopback HTTP to sidecar with `Authorization: Bearer <token>`.
- Sidecar runs ADK when import succeeds; otherwise returns echo/error stub.
- Sidecar tool proxy emits tool call event; frontend executes WebMCP tool and posts result back.

Missing brokers/controllers:

- No central Rust authorization broker for commands.
- No typed IPC contract generator.
- No unified provider broker for all model calls.
- No durable job/cancellation manager.
- No workspace-aware config broker.

Missing validation:

- Sidecar request sizes are not limited.
- Tool arguments are not schema-validated at runtime.
- SIEM URL is not validated.
- Browser URL is not validated.
- Secret names are arbitrary strings.
- Endpoint base URLs for custom endpoints are user-controlled and can be marked local.

Missing cancellation/error handling:

- `sidecar_cancel` sets a Rust flag checked while Rust reads chunks, but the Python ADK worker thread may continue.
- Sidecar tool calls wait up to 30 seconds, but no user-facing per-tool cancellation exists.
- Fire-and-forget operations (`kgStore.appendAudit`, SIEM, pool create/release) often swallow failures.

Missing typed contracts:

- Tauri commands use ad hoc argument shapes from frontend.
- A2A shape is hand-rolled in Python/Rust/TS.
- WebMCP tool schemas are metadata only; `executeTool()` accepts arbitrary args.

Dangerous backend capability:

- `secret_get` returns raw secrets to webview.
- `open_log_dir` and `open_crash_folder` open OS file manager from webview commands.
- `sidecar_browser_open` can drive a debug Chrome session to arbitrary URLs.
- `model_stream` can call arbitrary endpoint base URLs when configured.

## 11. Build, Test, and Quality Audit

Commands inspected:

- `package.json` scripts: `dev`, `build`, `preview`, `clean`, `lint`, `test`, `test:watch`, `audit`, `sbom`, `tauri`, `desktop`, `desktop:build`, `e2e`, `e2e:install`.
- `.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/workflows/release.yml`.

Commands run:

- `git status --short --branch`
- `npm run lint`
- `npm test` inside sandbox, then outside sandbox after `spawn EPERM`
- `cargo test --all-features --locked` in `src-tauri`

Results:

- `git status --short --branch`: failed with `fatal: not a git repository (or any of the parent directories): .git`.
- `npm run lint`: passed. `tsc --noEmit` completed successfully.
- `npm test` inside sandbox: failed to load `vitest.config.ts` with `Error: spawn EPERM` from esbuild.
- `npm test` outside sandbox: passed. 9 test files, 76 tests.
- `cargo test --all-features --locked`: passed compilation and ran zero tests. Warning: method `filesystem_open` is never used in `src/sidecar.rs`.

Commands intentionally not run:

- `npm run build`: skipped because it rewrites `dist/`, and this audit was read-only except for this report.
- `npm run e2e`: skipped because it starts a dev server and may create Playwright reports/artifacts.
- `npm run audit`: skipped because it is network-dependent.
- `npm run sbom`: skipped because it uses `npx --yes` and would generate artifacts.
- `npm run desktop` / `tauri dev`: skipped because launching the desktop app was not required for source audit and may start processes.

Type errors:

- None from `npm run lint`.

Test failures:

- No unit test failures after escalation. Initial sandbox failure was environment-related: `Error: spawn EPERM`.

Lint failures:

- None.

Build blockers:

- Web build not run due read-only constraints.
- Unit tests require esbuild child process; sandbox blocks it.
- Rust has no test coverage despite compiling.

Dependency/config risks:

- `package.json` has duplicate `vite` in dependencies and devDependencies.
- `npm run clean` uses Unix `rm -rf`, not Windows-native PowerShell.
- `src-tauri/Cargo.toml` uses `reqwest = { default-features = false, features = ["json", "stream"] }` while `model.rs` calls HTTPS cloud endpoints. This needs runtime verification or TLS feature correction.
- `node_modules`, `dist`, and `src-tauri/target` are present in the local audit tree.

## 12. Gap Analysis

| Gap name | Evidence | Why it matters | Blocking dependencies | Complexity | Risk if ignored | Recommended next action |
|---|---|---|---|---:|---|---|
| Backend gate authority | `set_gates` trusts frontend; incomplete command checks | "Hard gates" are not hard | Command policy design | Large | Critical bypasses | Define per-command gate matrix in Rust |
| Secret exposure | `secret_get` returns raw keychain values | Frontend compromise leaks cloud keys | Provider broker design | Medium | Credential theft | Replace raw get with backend-only use |
| Network gate sidecar bypass | Sidecar defaults Gemini; Rust only checks tools | Network-off can still mean cloud-capable sidecar | Sidecar model policy | Medium | Privacy violation | Pass/enforce network policy into sidecar |
| Browser harness URL policy | CDP navigates arbitrary URL | SSRF/local target and data exfil risk | Browser tool policy | Medium | Critical trust breach | Disable or restrict browser.open |
| Audit hash flaw | Top-level replacer in `hashAuditRecord()` | Tamper evidence is weak | Canonical serializer | Small | False integrity claims | Implement recursive canonicalization |
| Viewer-denial audit gap | `commit()` returns before audit | Denied attempts disappear | Audit schema update | Small | Governance blind spot | Audit RBAC denials |
| Workspace isolation gap | Single `codename:config:v1` | Settings bleed across workspaces | Config storage migration | Medium | Cross-project leakage | Namespace config/policy/SIEM per workspace |
| Import side effects | `applyWorkspace()` re-appends audits | Chain changes and SIEM leakage | Store import mode | Medium | Corrupt audit semantics | Add raw bulk import without forwarding |
| Real embeddings/GraphRAG gap | `stubEmbed()`, label propagation | Product claims overstate capability | Embedding provider decision | Large | Misleading UX | Rename now, build real later |
| Rust test gap | cargo runs zero tests | Critical backend untested | Test harness setup | Medium | Regressions in trust boundary | Add Rust unit/integration tests |
| VCS baseline missing | `git status` fatal | Cannot distinguish dirty/generated/source | Repo initialization/source control | Small | Unsafe development | Restore `.git` or initialize repository |
| Cloud HTTPS uncertainty | `reqwest` no TLS features | Cloud endpoints may fail at runtime | Dependency decision | Small | Broken cloud support | Verify and add TLS feature if needed |

## 13. Master Build Blueprint

### Phase 0 - Stabilize the Foundation

Goal: make the repo truthful, testable, and safe to modify.

Required tasks:

- Restore or initialize Git so audits can distinguish source from generated artifacts.
- Reconcile docs with source reality. Update `docs/BLUEPRINT.md`, `README.md`, `docs/USER_GUIDE.md`, and `docs/ADMIN_GUIDE.md` where they overstate GraphRAG, gates, secrets, or tests.
- Fix mojibake/encoding in README/docs and visible UI strings.
- Rename misleading files like `SlidersStub.tsx`.
- Fix Windows-hostile `npm run clean`.
- Decide whether generated folders (`dist`, `src-tauri/target`, `node_modules`, `__pycache__`) belong in the repo tree.

Files/modules likely involved:

- `README.md`, `docs/*.md`, `package.json`, `src/components/config/SlidersStub.tsx`, imports in `StealthDrawer.tsx` and `SettingsScreen.tsx`.

Acceptance criteria:

- `git status --short --branch` works.
- `npm run lint` passes.
- `npm test` passes in the intended local environment.
- Docs accurately distinguish real vs stubbed capabilities.

Do-not-build-yet items:

- New agents, new browser automation features, SSO, auto-update.

Risks:

- Cleaning generated artifacts without VCS baseline can delete useful local state. Establish baseline first.

### Phase 1 - Make the Core Loop Real

Goal: deliver one honest end-to-end loop: ingest text, persist graph node, retrieve it, chat through a selected local model or explicit synthetic fallback, and audit all writes/denials.

Required tasks:

- Persist node position edits through the audited write path.
- Add chunking for ingested text instead of storing only 4000 characters in `description`.
- Make query naming truthful: "Search" unless a real GraphRAG path is active.
- Add explicit fallback banners when synthetic model or stub sidecar is used.
- Audit all KG write denials, including viewer-role denials.

Files/modules likely involved:

- `src/state/AppState.tsx`, `src/kg/store.ts`, `src/kg/commit.ts`, `src/kg/retrieve.ts`, `src/components/left/GraphQueryInput.tsx`, `src/components/right/ChatThread.tsx`.

Acceptance criteria:

- Ingest -> retrieve -> chat -> audit works using only local/browser paths.
- Viewer write denial appears in Audit Ledger.
- Synthetic fallback is visibly identified.

Do-not-build-yet items:

- Browser harness expansion, sidecar cloud agent autonomy, SSO.

Risks:

- Adding persistence before audit fix can lock in bad chain semantics.

### Phase 2 - Persistence, Contracts, and State

Goal: make data durable, isolated, migrated, and contract-validated.

Required tasks:

- Implement workspace-scoped config/policy/SIEM storage.
- Add explicit IndexedDB migrations and validation for store version upgrades.
- Repair backup import so it preserves audit records without re-chaining or forwarding to SIEM.
- Add a typed IPC contract layer or schema validation for Tauri commands.
- Decide whether SQLite/SQLCipher is required now or later.

Files/modules likely involved:

- `src/kg/store.ts`, `src/config/persist.ts`, `src/auth/workspace.ts`, `src/lib/backup.ts`, `src-tauri/src/*.rs`.

Acceptance criteria:

- Two workspaces have separate graph, config, policy, SIEM, and model route state.
- Import/export roundtrip preserves audit chain verification.
- Invalid command payloads are rejected predictably.

Do-not-build-yet items:

- Enterprise SSO and retention controls until storage boundary is stable.

Risks:

- Migration mistakes can strand existing IndexedDB data.

### Phase 3 - Governance, Safety, and Observability

Goal: make the advertised security model true at the backend boundary.

Required tasks:

- Replace `secret_get` raw-value access with key presence plus backend-only provider calls.
- Move Gemini and cloud model execution out of frontend.
- Enforce a per-command gate matrix in Rust.
- Apply Network gate to sidecar model execution and browser harness.
- Add URL policy for browser harness.
- Repair audit hash canonicalization and add nested tamper tests.
- Add Rust tests for gate refusals and token containment.
- Add redaction for logs/crash reports/SIEM.

Files/modules likely involved:

- `src-tauri/src/secrets.rs`, `src-tauri/src/model.rs`, `src-tauri/src/sidecar.rs`, `src-tauri/src/lib.rs`, `src/lib/llm.ts`, `src/lib/secrets.ts`, `src/lib/siem.ts`, `sidecar/agent_sidecar.py`, `src/kg/commit.ts`.

Acceptance criteria:

- Closing Network blocks all cloud/provider/browser outward behavior from Rust.
- Closing Tools blocks all sidecar/tool calls from Rust.
- Filesystem gate is enforced for all backend file-writing surfaces.
- No frontend API returns raw secret values.
- Audit chain fails when nested audit fields are tampered.

Do-not-build-yet items:

- More tools, richer A2UI actions, autonomous browser workflows.

Risks:

- Breaking current cloud provider behavior while moving broker responsibilities. Do it behind tests.

### Phase 4 - Feature Completion

Goal: build intended features that remain worth keeping after safety boundaries are real.

Required tasks:

- Implement real embeddings with a chosen local/provider backend.
- Build durable GraphRAG/community index and summaries.
- Bind browser pool handles to actual CDP contexts.
- Expand WebMCP tools only after per-tool schemas and policies exist.
- Make Archive Index live.
- Improve onboarding to verify real model readiness, not just fallback readiness.

Files/modules likely involved:

- `src/kg/vector.ts`, `src/kg/retrieve.ts`, `src/kg/communities.ts`, `sidecar/agent_sidecar.py`, `src/lib/pools.ts`, `src/state/AppState.tsx`, `src/components/left/ArchiveIndex.tsx`.

Acceptance criteria:

- Retrieval can prove semantic behavior beyond character overlap.
- Browser contexts are isolated by real handle.
- Tools have schema validation and audit records.

Do-not-build-yet items:

- Auto-update, SSO, compliance packs.

Risks:

- Feature work will multiply unsafe paths if Phase 3 is skipped.

### Phase 5 - Hardening and Release Readiness

Goal: prepare a trustworthy installable product.

Required tasks:

- Run and stabilize Playwright e2e.
- Add Rust integration tests.
- Run web build and desktop build in a clean VCS baseline.
- Enable CSP and verify Tauri capabilities.
- Add dependency scanning/SBOM in CI with real remote repo.
- Create threat model and release checklist.
- Verify signing/updater plan.

Files/modules likely involved:

- `.github/workflows/*.yml`, `playwright.config.ts`, `e2e/*`, `src-tauri/tauri.conf.json`, `docs/security/*`, `docs/RELEASE.md`.

Acceptance criteria:

- `npm run lint`, `npm test`, `npm run build`, `npm run e2e`, `cargo test`, and `npm run desktop:build` pass from a clean checkout.
- CSP is restrictive.
- High/critical dependency advisories are resolved or documented.

Do-not-build-yet items:

- Compliance claims before threat model and pen-test findings.

Risks:

- Release workflow exists, but this local folder is not a Git repo, so CI/release reality cannot be proven here.

## 14. Exact Next 10 Build Tasks

1. Task name: Restore repository baseline
   - Why this comes now: `git status` fails, so no future audit can distinguish source changes from generated files.
   - Files likely touched: none if restoring `.git`; otherwise repository metadata only.
   - Implementation notes: restore original `.git` or initialize a new repo after deciding whether generated folders are tracked.
   - Acceptance criteria: `git status --short --branch` works.
   - Suggested verification command: `git status --short --branch`

2. Task name: Backend gate coverage inventory and command policy table
   - Why this comes now: security changes need an explicit command-to-capability matrix.
   - Files likely touched: `docs/security/command-gate-matrix.md` or existing docs.
   - Implementation notes: list every Tauri command and required gates/roles; identify sidecar sub-actions.
   - Acceptance criteria: every command in `src-tauri/src/lib.rs` has declared policy.
   - Suggested verification command: `rg -n "generate_handler|#\\[tauri::command\\]" src-tauri/src`

3. Task name: Stop returning raw keychain secrets to frontend
   - Why this comes now: secret exposure is the highest-impact trust-boundary bug.
   - Files likely touched: `src-tauri/src/secrets.rs`, `src/lib/secrets.ts`, `src/lib/llm.ts`, `src/components/config/SecretsPanel.tsx`.
   - Implementation notes: replace `secret_get` with `secret_present`; route cloud provider calls through Rust.
   - Acceptance criteria: no frontend code can receive an API key string from keychain.
   - Suggested verification command: `rg -n "secret_get|getSecret\\(|VITE_.*API_KEY|fallbackKey" src src-tauri`

4. Task name: Enforce Rust gates for all sidecar commands
   - Why this comes now: current sidecar/backend surfaces bypass UI expectations.
   - Files likely touched: `src-tauri/src/sidecar.rs`, `src/state/AppState.tsx`, Rust tests.
   - Implementation notes: check Tools for sidecar calls/tools, Network for browser/cloud-capable sidecar actions, Filesystem for sidecar file writes.
   - Acceptance criteria: closed gates cause Rust command errors before sidecar HTTP calls.
   - Suggested verification command: `cargo test --all-features --locked`

5. Task name: Fix audit hash canonicalization
   - Why this comes now: current tamper evidence is likely false confidence.
   - Files likely touched: `src/kg/commit.ts`, `src/kg/commit.test.ts`.
   - Implementation notes: recursive stable serialization; tests mutate nested `actor`, `target`, and `decision`.
   - Acceptance criteria: nested audit tampering breaks verification.
   - Suggested verification command: `npm test -- src/kg/commit.test.ts`

6. Task name: Audit RBAC denials
   - Why this comes now: docs promise denied writes are recorded, but viewer denials are dropped.
   - Files likely touched: `src/state/AppState.tsx`, `src/kg/commit.test.ts` or component-level test.
   - Implementation notes: produce denied `AuditRecord` before returning for `!canWrite`.
   - Acceptance criteria: viewer write attempt appears in Audit Ledger with denied decision.
   - Suggested verification command: `npm test`

7. Task name: Workspace-scope config and policy
   - Why this comes now: workspace isolation is incomplete and affects all later persistence.
   - Files likely touched: `src/config/persist.ts`, `src/auth/workspace.ts`, `src/lib/siem.ts`, `src/auth/policy.ts`.
   - Implementation notes: namespace config/policy/SIEM keys by workspace ID or store workspace ID in structured config.
   - Acceptance criteria: switching workspace changes endpoint/profile/gate/policy/SIEM state independently.
   - Suggested verification command: `npm run lint && npm test`

8. Task name: Backup import without audit side effects
   - Why this comes now: current import can recalculate chain and forward imported records to SIEM.
   - Files likely touched: `src/lib/backup.ts`, `src/kg/store.ts`.
   - Implementation notes: add raw bulk import mode that writes audit records exactly as provided and suppresses SIEM forwarding.
   - Acceptance criteria: export/import/verify preserves the same audit chain.
   - Suggested verification command: `npm test`

9. Task name: Make GraphRAG/vector wording truthful
   - Why this comes now: the UI/docs overpromise core capability.
   - Files likely touched: `src/components/left/GraphQueryInput.tsx`, `docs/USER_GUIDE.md`, `docs/ADMIN_GUIDE.md`, `README.md`, `docs/BLUEPRINT.md`.
   - Implementation notes: call current behavior "hybrid local search" or clearly label stub vectors until real embeddings exist.
   - Acceptance criteria: no user-facing current-state doc claims production GraphRAG unless source proves it.
   - Suggested verification command: `rg -n "GraphRAG|Vector store|semantic|meaning" README.md docs src`

10. Task name: Add Rust security tests
    - Why this comes now: Rust is the trust boundary and currently has zero tests.
    - Files likely touched: `src-tauri/src/sidecar.rs`, `src-tauri/tests/*` or module tests.
    - Implementation notes: test gate defaults, closed-gate refusals, token non-serialization, URL policy once added.
    - Acceptance criteria: `cargo test` runs meaningful tests, not zero tests.
    - Suggested verification command: `cargo test --all-features --locked`

## 15. Decisions Required From Project Owner

Decision: What is the real trust boundary?

- Options: OS user only; local app roles with backend enforcement; enterprise identity/SSO.
- Recommended choice: OS user plus backend-enforced gates/policies for runtime actions. Treat local PIN roles as convenience until SSO exists.
- Reason: current localStorage PIN auth cannot protect against local or renderer compromise.
- Consequence if deferred: the app will continue presenting governance stronger than it can enforce.

Decision: Should cloud providers ever run from frontend code?

- Options: keep frontend fallback; Rust-only provider broker; disable cloud until broker exists.
- Recommended choice: Rust-only provider broker.
- Reason: `VITE_` keys and frontend `secret_get` contradict secret-safety claims.
- Consequence if deferred: API keys remain exposed to webview risk.

Decision: What should "Network gate closed" mean for the sidecar?

- Options: block only explicit cloud endpoints; block all sidecar ADK cloud models/tools; block all sidecar calls except health.
- Recommended choice: block all network-capable sidecar actions and require explicit local-only sidecar mode.
- Reason: ADK default model is Gemini and sidecar behavior is not intrinsically local.
- Consequence if deferred: privacy/offline promises remain unreliable.

Decision: Is CODE NAME 2 allowed to drive a user-run Chrome instance?

- Options: remove browser harness for now; read-only allowlist; full browser automation with approvals.
- Recommended choice: remove/disable by default until read-only allowlist and audit exist.
- Reason: CDP access is powerful and current URL policy is absent.
- Consequence if deferred: browser.open is a critical trust-boundary risk.

Decision: Persistence target for production

- Options: keep IndexedDB; move to SQLite; move to encrypted SQLite/SQLCipher-like layer.
- Recommended choice: keep IndexedDB for prototype; design migration path to encrypted backend before production.
- Reason: IndexedDB is working but weak for enterprise claims.
- Consequence if deferred: backup, migration, encryption, and workspace isolation will remain ad hoc.

Decision: Is the current GraphRAG claim acceptable?

- Options: rename current behavior; implement real GraphRAG now; hide GraphRAG UI until ready.
- Recommended choice: rename current behavior now, implement real GraphRAG later.
- Reason: `stubEmbed()` and label propagation are useful but not production GraphRAG.
- Consequence if deferred: users and future implementers will overestimate what exists.

Decision: Generated artifacts policy

- Options: keep generated folders in repo; ignore/delete later; split release artifacts elsewhere.
- Recommended choice: ignore/delete generated artifacts after Git baseline is restored.
- Reason: `node_modules`, `dist`, and `src-tauri/target` make audits noisy and version control risky.
- Consequence if deferred: future diffs and security scans will be unreliable.

## 16. Recommended Repo Hygiene Changes

Files to keep:

- `src/`, `src-tauri/src/`, `sidecar/agent_sidecar.py`, `docs/contracts/*`, `docs/integration-notes/*`, `e2e/*`, `.github/workflows/*`, `package-lock.json`, `src-tauri/Cargo.lock`.

Files/folders to delete later after VCS baseline:

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `sidecar/__pycache__/`
- Root ad hoc assets if not product assets: `ChatGPT Image Jun 6, 2026, 06_22_24 AM.png`, `codename_harness_ux_blueprint.pdf`, `briefing.txt`, `assets/New Text Document.txt`

Files to rename:

- `src/components/config/SlidersStub.tsx` -> `TuningControls.tsx` or `ModelTuningControls.tsx`.
- Consider renaming `GraphQueryInput.tsx` UI copy from "GraphRAG Query" to "Graph Search" until real GraphRAG lands.

Docs to update:

- `README.md`: fix encoding and current-state truth.
- `docs/BLUEPRINT.md`: mark old "Where we are today" as historical or refresh it.
- `docs/USER_GUIDE.md`: qualify GraphRAG/vector claims.
- `docs/ADMIN_GUIDE.md`: qualify hard gate and secrets claims.
- `docs/contracts/sidecar.md`: update "TS client carries token" wording because current source keeps token in Rust.

Dead code to remove or label:

- `src/legacy/*` is already labeled. Delete later if no longer needed.
- `_harness_write()` in `sidecar/agent_sidecar.py` should be wired or explicitly marked reserved.
- `streamA2A()` in `src/lib/sidecar.ts` appears retained for tests/direct token shape; current app path uses Rust `sidecar_stream`. Keep only if intentionally public.

Mocks to label clearly:

- `stubEmbed()` in `src/kg/vector.ts`.
- Sidecar ADK echo fallback in `sidecar/agent_sidecar.py`.
- Synthetic fallback in `src/lib/llm.ts`.
- Seed graph in `src/store.ts`.
- Static `ArchiveIndex`.

Tests to add:

- Rust gate enforcement tests.
- Secret non-exposure tests.
- Audit nested tamper tests.
- Viewer denial audit test.
- Workspace isolation tests for config/policy/SIEM.
- Backup import/export audit-chain test.
- Browser URL policy tests before enabling browser harness.

Folder structure improvements:

- Add `docs/security/` for threat model, gate matrix, and command policy.
- Split generated/release artifacts from source tree.
- Consider `src/runtime/` or `src/ipc/` for typed Tauri command wrappers.

## 17. Final Verdict

Is the project coherent? Yes. The repo has a coherent product direction: a local-first desktop agent harness with governed knowledge memory, model routing, tool calls, and enterprise controls.

Is the architecture salvageable? Yes, but only if security and persistence boundaries are corrected before more feature work. The current shape has enough real structure to keep, especially the Tauri shell, sidecar supervisor, KG store interface, and React shell.

What is the biggest trap? Mistaking frontend gates, localStorage roles, stub embeddings, and synthetic fallbacks for production-grade runtime guarantees. The app looks more complete than its trust boundaries are.

What should be built next? Backend-owned security enforcement: secrets must stop crossing into the webview, every Tauri command needs a gate policy, Network must govern sidecar/cloud/browser paths, and audit integrity must be fixed.

What should not be built yet? More autonomous browser features, new agent tools, SSO, auto-update, compliance claims, or richer GraphRAG UI. Those would increase blast radius before the foundation is safe.

What would make this project meaningfully stronger within one focused development cycle? A tight security-foundation cycle: restore Git baseline, remove frontend raw-secret access, implement Rust gate matrix, fix audit hash canonicalization, audit all denials, add Rust tests, and update docs/UI labels to match actual runtime behavior.
