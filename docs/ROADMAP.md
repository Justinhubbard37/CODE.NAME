# CODE NAME: | — Multi-Phase Build Plan

_Derived from docs/STRATEGY.md · 2026-06-06_

Sequencing principle: build the **load-bearing contracts and the persistent
knowledge ecosystem first**, then the visual layer, then the agent runtime, then
the protocols and tab environments, then hardening. Each phase has an explicit
**exit criterion** — we don't advance until it's met. Ground rule throughout:
confirm real repo APIs before wiring; every integration must degrade to
loopback/offline.

**Starting point (already built):** Tauri v2 shell + two-pane React UI,
model-agnostic streaming transport, in-memory KG (2D xyflow), in-memory gated
ingestion/quarantine, UI-level capability gates, stealth config drawer, OCR.

---

## Phase 0 — Foundations, contracts & research spike  _(de-risk everything)_

**Goal:** lock the decisions that are cheap now and expensive later; confirm the
external APIs before any wiring.

- **Repo API spike.** Read all five repos (ADK Python, A2A + SDKs, WebMCP, A2UI,
  Browser Harness). Produce a one-page integration note each: entry points, the
  3-5 calls we need, pinned version, offline/loopback behavior. Output:
  `docs/integration-notes/`.
- **Lock the sidecar bind + auth contract** (decide now): sidecar binds
  `127.0.0.1` on an OS-assigned ephemeral port (`port 0`), Rust reads the chosen
  port from the child handshake; per-launch random token handed to the sidecar at
  spawn, required on every A2A call.
- **Lock the gated-KG-write audit schema** (decide now): one mutation chokepoint;
  append-only record of {ts, actor (tab/session/agent), action, target id,
  before->after diff, gate decision + which gate, provenance}. Reuses existing
  per-node `history[]`.
- **Config scaffolding:** central config for LOD thresholds and pool sizes so
  those stay tunable, not hard-coded.

**Exit:** integration notes written + versions pinned; audit schema and
sidecar-handshake contract typed and documented; config object in place.

---

## Phase 1 — Persistent knowledge ecosystem (KG + Vector + GraphRAG)

**Goal:** turn the in-memory graph into the real, persistent, self-growing brain.

- Persistent local KG store (survives restarts) replacing in-memory node/edge
  state.
- Vector-search store + embeddings over ingested content.
- GraphRAG index build, **including its community hierarchy** (reused later for
  the 3D cluster tier — no separate clustering algorithm).
- Replace the client-side query filter with **real GraphRAG/vector retrieval**
  behind the existing query bar.
- Route all writes through the **gated + audited chokepoint** from Phase 0.

**Depends on:** Phase 0 (audit schema).
**Exit:** drop a doc -> persisted KG + vectors + communities; the query bar
returns real retrieval results; every write produces an audit record.

---

## Phase 2 — 3D interactive knowledge graph (React Three Fiber)

**Goal:** replace the flat 2D canvas with the depth-based, card-as-node graph.

- Stand up R3F/Three.js scene; orbit/pan/zoom; click-to-focus + inspect.
- Nodes are real dossier cards (DOC/ORG/SUBJECT/EVID/CLUSTER) with labels.
- **Screen-space LOD ladder:** full card when projected width > ~140px; small
  label ~40-140px; dot/icon < ~40px; **cluster node = a GraphRAG community**.
- Performance budget + LOD tuning via Phase 0 config.

**Depends on:** Phase 1 (persisted graph + communities to render).
**Exit:** 3D graph renders the persisted KG with working LOD and holds target
FPS at realistic node counts.

---

## Phase 3 — Python sidecar + A2A transport + Rust supervision

**Goal:** stand up the agent runtime as a supervised loopback service.

- Package the Python sidecar (ADK runtime) and bundle with the app.
- **Rust/Tauri-owned lifecycle:** spawn, health-watch, restart, clean shutdown;
  launch once and keep warm (mitigate cold start).
- **A2A over localhost HTTP** using the Phase 0 handshake (ephemeral port +
  per-launch token).
- Capability gates enforce at the **process/port** level (network/tools/fs).

**Depends on:** Phase 0 (handshake contract); repo spike (ADK/A2A APIs).
**Exit:** TS <-> sidecar A2A round trip through the supervised lifecycle; closing
the network/tools gate verifiably severs the bridge.

---

## Phase 4 — Protocol layer in the right pane (ownership map)

**Goal:** wire the three protocols under native authority.

- **WebMCP:** expose/call tools — **every action passes through the gates**.
- **A2A:** agent message/session coordination driving the Execution Canvas chat
  (real agent runs replace the synthetic stream where an endpoint/agent exists).
- **A2UI:** render agent-generated UI components, **subordinate to the native
  UI** which stays final authority.
- Activity feed shows real tool/agent/reasoning streams; everything audited.

**Depends on:** Phase 3 (live agents over A2A).
**Exit:** an agent run calls a gated WebMCP tool and renders an A2UI component in
the right pane, all under native authority and recorded in the audit log.

---

## Phase 5 — Tabs as environments: shared pools + per-tab isolation

**Goal:** the tab-environment model with shared infra and isolated state.

- **Shared supervised pools:** one agent-runtime pool, one Browser Harness pool
  (shared browser, isolated contexts) — N tabs do not spawn N browsers.
- **Per-tab isolation:** each tab gets its own task context, browser
  context/profile, gate scope, and lifecycle state.
- **Browser Harness** acts only when the tab holds browser/tool permission.
- **Permission-aware shared memory:** tab agents read/write the global KG only
  through permission checks + audit. Tabs share infrastructure, never unapproved
  state.
- Pool sizing/eviction from config (defaults: ~3-5 browser contexts, ~2-4
  agents, LRU idle eviction).

**Depends on:** Phase 4 (protocols) + Phase 1 (shared KG).
**Exit:** two tabs with distinct gate scopes run off shared pools with isolated
browser contexts; both read/write the KG under permission.

---

## Phase 6 — Hardening, degradation & polish

**Goal:** make it trustworthy, offline-capable, and shippable.

- Verify **local-first degradation** per integration (loopback/offline paths).
- **Surface the audit ledger** (reuse the existing Ledger Audit panel) and the
  global write history.
- Final LOD + pool tuning; error/empty states; perf pass.
- Packaging: signed installer via `tauri build`; first-run checks.

**Depends on:** all prior phases.
**Exit:** full offline run works; audit history is visible; installable build
produced.

---

## Dependency map (quick view)

| Phase | Unlocks | Hard prerequisite |
| --- | --- | --- |
| 0 Contracts + spike | everything | — |
| 1 KG/Vector/GraphRAG | 2, 5 | 0 |
| 2 3D graph | — (UI) | 1 |
| 3 Sidecar + A2A | 4 | 0 + spike |
| 4 Protocol layer | 5 | 3 |
| 5 Tabs/pools | — | 4 + 1 |
| 6 Hardening | ship | all |

**Parallelizable:** Phase 2 (3D UI) can run alongside Phase 3 (sidecar) once
Phase 1 lands — they touch different layers.

## Cross-cutting reuse (don't rebuild)
- GraphRAG **community hierarchy** -> the 3D cluster LOD tier.
- Existing per-node **`history[]`** -> basis for the global audit ledger.
- Existing **Ledger Audit panel** -> audit surfacing in Phase 6.
