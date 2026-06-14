# CODE NAME: | — Strategic Understanding

_Compiled from the collaborative brainstorming session · 2026-06-06_

This document records the shared decisions reached so far. It is a living
reference, not a spec. Ground rule for all of it: **do not build from memory —
open the current repos and confirm the real API before wiring anything.**

---

## 0. What CODE NAME is

A Tauri v2 **local-first, model-agnostic agent harness** built around a
**self-growing knowledge ecosystem** (Knowledge Graph + GraphRAG + Vector
store) — conceived as a single, growing, self-improving entity rather than a
collection of one-off chats.

Shell: Tauri v2 (Rust). Frontend: React 19 + TypeScript + Vite + Tailwind v4.
Layout: two-pane governed workspace — **Mission Control** (left, knowledge +
context) and **Execution Canvas** (right, live model work) — with a stealth
config drawer, hard capability gates, and a gated drag-drop ingestion pipeline.

---

## 1. The knowledge graph: 3D and interactive — DECIDED

Replace the flat 2D `@xyflow/react` canvas with a **3D spatial graph**. Nodes
float and connect in depth like a neural network's topology, but each node is a
real **document/entity card** (DOC, ORG, SUBJECT, EVID, CLUSTER) with its labels
and metadata — not a decorative starfield of glowing dots. Orbit / pan / zoom;
click to focus and inspect; depth is a meaningful axis.

**Library: React Three Fiber / Three.js.**

**Level-of-detail (LOD) ladder:**
- **Close-up** -> full, readable card.
- **Medium distance** -> small label (typed, named).
- **Far away** -> simple dot / icon.
- **Huge graph** -> cluster / group node.

_Still to determine at build time:_ exact distance/zoom thresholds for each LOD
tier and the clustering method for the "huge graph" tier.

---

## 2. Intended integrations (the seams)

Roles agreed; exact APIs to be pulled from the live repos at implementation
(several post-date reliable memory — see the ground rule above).

| Seam | Repo | Role in CODE NAME |
| --- | --- | --- |
| **ADK Python** | github.com/google/adk-python | The agent runtime / orchestration brain. Runs as a supervised Python sidecar. Where "agents" actually live. |
| **A2A** | github.com/a2aproject/A2A | The wire between agents: CODE NAME <-> external/opaque agents, and Tauri-TS <-> the ADK sidecar. |
| **WebMCP** | github.com/webmachinelearning/webmcp | Tool exposure *inside* the webview: the frontend publishes MCP tools the model can call. |
| **A2UI** | github.com/a2ui-project/a2ui | Agent -> UI channel: lets agents render/drive interface into the right pane. |
| **Browser Harness** | github.com/browser-use/browser-harness | Self-healing web-task capability for agents. |

**Adjacent / supporting repos:** A2A Python SDK
(github.com/a2aproject/a2a-python), A2A JavaScript SDK
(github.com/a2aproject/a2a-js), ADK Samples (github.com/google/adk-samples),
Browser Harness JS (github.com/browser-use/browser-harness-js).

---

## 3. The three strategic implications (resolved)

### 3.1 Process / language split + sidecar — DECIDED
ADK, A2A-Python, and Browser Harness are Python; the shell is Rust + TS. We run
a **managed Python sidecar**.

- **Transport: A2A over localhost HTTP.** The Python sidecar runs as a local
  loopback service; the Tauri/Rust app talks to it over localhost.
- **Supervision: Rust/Tauri owns the lifecycle.** The main app starts, watches,
  restarts, and cleanly shuts down the sidecar.
- **Gates have teeth at the process level.** The hard capability gates
  (fs / network / tools) enforce against the sidecar process and its loopback
  port — not just the UI.

Trade-offs we accepted (eyes open): complexity is the real tax (two runtimes to
ship/bundle/babysit, Python packaging, cross-language debugging); +hundreds of
MB bundle; latency is mostly the small kind (~1-5 ms per localhost round trip vs.
seconds of inference) — the one that hurts is **cold start**, mitigated by
launching once and keeping the sidecar warm; the loopback port is a security
surface the gates must cover. We accept this because it buys the Python agent
ecosystem, which has no equal in Rust/TS today.

### 3.2 Right-pane ownership map — DECIDED
The protocols converge in the Execution Canvas, so authority is explicit:

| Layer | May do | Constraint |
| --- | --- | --- |
| **Tauri / native UI** | — | **Final authority over the right pane.** |
| **A2UI** | render agent-generated UI components | subordinate to native UI |
| **WebMCP** | expose / call tools | **actions must pass through the gates** |
| **A2A** | coordinate agent messages / sessions | **may not directly control UI** |
| **Browser Harness** | act on the web | **only when the tab has browser/tool permission** |
| **Knowledge Graph writes** | mutate shared memory | **always gated and audited** |

### 3.3 Tabs, pools, and shared memory — DECIDED
**Shared runtime pools with per-tab isolated sessions.**

- **Shared (supervised pools):** Browser Harness and the agent runtime are
  pooled and supervised — N tabs do **not** spawn N browsers/runtimes.
- **Per-tab isolation:** each tab gets its own task context, browser
  context/profile, gate scope, and lifecycle state.
- **Rule:** tabs may share *infrastructure*, but **not unapproved state**.
- **Knowledge graph = permission-aware shared memory:** global ground under all
  tabs, but every read/write is permission-checked and audited.
- Bind protocol *sessions* to tabs, not protocol *processes*; tabs declare needs,
  the central supervisor satisfies them from the pools.

### 3.4 Local-first degradation — REQUIRED
Each integration must degrade gracefully to loopback / offline, preserving the
local-first promise. Verified per integration as we implement.

---

## 4. Still to determine at build time
- LOD exact distance/zoom thresholds and the "huge graph" clustering method.
- Localhost A2A specifics: port selection, and auth/handshake so only the shell
  can reach the sidecar.
- Pool sizing and eviction for Browser Harness contexts and agent runtimes.
- The audit format / surfacing for gated KG writes.
- Exact, current APIs for all five repos — pulled from source, never assumed.
