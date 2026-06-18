# CODE NAME 2 User Guide

A practical guide to using CODE NAME 2, a local-first agent harness with a
governed knowledge graph. Cloud models are optional and opt-in.

> Current-state note: this guide describes the early-alpha implementation. Some
> labels and roadmap terms from earlier docs, such as full GraphRAG and vector
> store, are now treated as planned capabilities unless explicitly described as
> current.

## 1. The Workspace At A Glance

The window is split into two panes.

**Left - Mission Control**

- **Knowledge graph (3D):** documents, entities, and links between them.
- **Archive Index:** a tree view of current graph/search stores and planned
  retrieval scaffolds.
- **KB Search box** (bottom): filters the current local graph and runs
  SQLite KB retrieval. Auto is the default mode and chooses Lexical, Hybrid, or
  Graph traversal with deterministic local rules. Manual Lexical, Semantic,
  Hybrid, and Graph modes remain available under Advanced. Graph mode is bounded
  one-hop graph traversal, not full multi-hop GraphRAG reasoning.
- **Drop zone:** drag files onto this pane to ingest them.
- **Task tabs / Environment bar:** isolated work threads and per-tab capabilities.

**Right - Execution Canvas**

- **Agent header + tool bar:** the active model and tools the agent may call.
- **Activity feed:** a live log of routing, tool calls, and system events.
- **Ingestion Ledger:** files being hashed, de-duplicated, and indexed.
- **Audit Ledger:** the append-only history of knowledge-graph writes.
- **Local KB context panel:** review retrieved chunks, select which chunks are
  allowed into chat context, and explicitly turn Attach on or off.
- **Chat thread + composer:** talk to the selected provider/model runtime. Provider
  failures appear as structured error cards instead of synthetic assistant replies.

## 1.1. Readability Calibration

Phase 2J improves readability through typography scale, font weight, and
line-height across existing UI surfaces. No brand colors or theme values
changed, no UI layout, component structure, or interaction design changed, no
retrieval behavior changed, no semantic indexing behavior changed, no database
schema changed, and no graph behavior changed. Graph visual-polish work remains
backlog.

The corrective Phase 2J update adds manual vertical resizing for the expanded
Logic activity and Audit Ledger sections in the existing right pane. Expanded
Logic and Audit Ledger sections automatically reveal the newest activity, and
new entries remain visible as they arrive. The lower-left search surface now
uses a compact `KB Search` header row: `KB Search` remains left aligned, Auto,
Advanced, and OCR remain right aligned on the same row, and Advanced manual
controls appear below that header only while expanded. The redundant visible
search status block was removed to prevent overlap and clutter. Readable
secondary text uses existing brand palette foreground values with corrected
semantic mapping; no palette values changed. Retrieval, indexing, graph,
database, attachment, visual-palette, and interaction behavior did not change.

## 1.2. Phase 3A — Canonical Runtime Control and Provider Truthfulness

Status: `IMPLEMENTED — PENDING OWNER REVIEW`

Phase 3A replaces overlapping provider/model controls with one canonical runtime
path. The top-right header has one provider selector on the far right and one
provider-scoped model selector immediately to its left. Settings is the canonical
Provider Manager for endpoints, credentials, model inventory refresh, persistent
Runtime Profile defaults, and Agent Sidecar Setup.

Ollama appears as one provider. Local models and cloud-tagged Ollama models both
use the configured local Ollama daemon; `:cloud` and `-cloud` model suffixes
mark cloud execution. The app does not auto-pull, auto-download, or preload
models.

Gemini is a real desktop provider integration. Model discovery and streamed
generation run through Rust/Tauri commands, compatible models come from Gemini
discovery results, and the Gemini API key remains in OS-backed secret storage.
The frontend can know only whether the key is present.

The bottom-left Parameter Tray is tuning-only. Temperature and context-window
changes there are temporary per-chat overrides. Persistent Runtime Profile
defaults are edited only in Provider Manager.

Each user and assistant message keeps safe provider/model provenance for the
runtime snapshot used by that request. Failed provider requests store structured
safe failure metadata and render as error cards; they do not fall through to a
synthetic assistant answer.

## 2. Ingesting Documents

Drag one or more files onto the left pane. Each file is:

1. Staged in the Ingestion Ledger and hashed.
2. Checked for redundancy against what already exists.
3. Indexed into the knowledge graph as a document node, or flagged as a conflict.

If a conflict is found, choose one of:

- **Overwrite:** replace the existing copy and record a new version.
- **Skip:** discard the incoming file.
- **Keep both:** fork it into a new node.

Text files (`.txt`, `.md`, `.json`, `.csv`, code, and similar files) have their
text extracted for search. Other files are recorded as binary assets. The OCR
button beside the search box can scan an image and ingest recognized text through
the same gated path.

Ingestion requires the **Filesystem** gate to be open. If it is closed, drops are
rejected and the reason is shown.

## 3. Searching The Graph And SQLite KB

Type in the **KB Search** box and press **Enter**. The graph view still
uses local graph filtering so matching nodes stay highlighted and non-matches are
dimmed. Clear the box and press Enter to show everything again.

The same search also retrieves SQLite KB chunks. Auto is the default user-facing
mode. It uses deterministic frontend rules, not a model router, to choose one of
the existing local retrieval paths:

- Exact markers, quoted phrases, filenames, identifiers, hashes, or citation
  tokens route to **Lexical**.
- Natural-language conceptual queries route to **Hybrid** when the semantic index
  is ready; otherwise Auto visibly falls back to Lexical.
- Relationship-style queries such as connected, related, through, tied to, or
  relationship between route to **Graph** when the semantic index is ready;
  otherwise Auto visibly falls back to Lexical.

After each Auto search, the Local KB context panel shows a concise route trace:
requested mode, resolved mode, route reason, semantic index state, graph
expansion counts when relevant, fallback reason when relevant, local-only status,
Attach state, and selected result count. The route decision is visible; it is not
hidden or model-routed.

Manual modes remain available under **Advanced**:

- **Lexical:** keyword retrieval over local SQLite chunks.
- **Semantic:** local Ollama query embeddings ranked against persisted SQLite
  chunk embeddings.
- **Hybrid:** real lexical and real semantic SQLite KB retrieval combined into
  one deduplicated result list.
- **Graph:** Hybrid seed retrieval plus bounded one-hop SQLite graph traversal
  through stored entities, chunk-entity links, relationships, active chunks, and
  active documents.

Hybrid SQLite KB retrieval shows why each chunk was selected: lexical score when
present, semantic cosine score when present, combined rank-fusion score, and a
match reason of `lexical`, `semantic`, or `both`. Hybrid requires a ready
semantic index. If the index is empty, stale, missing embeddings, or unavailable,
Hybrid does not fake results and asks you to build or refresh the semantic index.

Graph mode requires the same ready semantic index because it uses Hybrid seed
retrieval. It marks seed evidence separately from graph-expanded evidence. When
expanded evidence exists, result cards show graph role, traversal depth,
expansion type, graph reason, graph score, source document, and chunk number. If
the seed search finds no graph-expanded evidence, the UI says
`Seed-only: no graph-expanded evidence found`; seed evidence may still be
selected and attached, but it remains labelled as seed evidence.

Semantic, Hybrid, and Graph retrieval use local loopback Ollama embeddings only.
The app does not use OpenAI/Gemini/cloud embeddings, does not auto-pull embedding
models, and does not use the legacy graph hash-vector scaffold, sidecar
community summaries, or an external vector DB for SQLite KB retrieval.

Full multi-hop GraphRAG reasoning, durable GraphRAG communities, sidecar
GraphRAG, and external vector DB integration are still not implemented.

Semantic index **Build / Refresh** remains a manual Advanced/fallback action in
this phase. The app does not automatically queue semantic indexing after every
ingestion yet; that is future Phase 2I-B.

## 4. Chatting With A Model

Type in the composer on the right and press **Enter**. Use Shift + Enter for a
newline. While the model streams, **Send** becomes **Stop**.

Retrieved KB chunks are not attached automatically. After a search, Attach is OFF
by default. Use the Local KB context panel to select or deselect visible chunks,
then turn Attach ON when you want selected chunks included in the next chat
request. Deselected chunks are never attached. If a KB document is deleted, its
chunks are removed from both retrieval results and selected context.

Auto route traces are visible in the UI but are not silently injected into chat.
When Attach is ON, the chat prompt labels the selected context with the Auto
resolved mode, such as `auto resolved hybrid` or `auto resolved graph traversal`.

**Choosing a provider and model.** Use the top-right runtime controls:

- The rightmost selector chooses the normal chat provider: Ollama, LM Studio,
  Gemini, or a configured custom OpenAI-compatible provider.
- The selector immediately to its left chooses a model returned by the active
  provider's model inventory.
- Agent Sidecar is not a normal chat provider. Use **Set Up Agent Sidecar** in
  the provider menu or **Settings -> Provider Manager -> Agent Sidecar Setup**.

**Local first.** Local endpoints need no key and no cloud network call.

**Provider readiness.** If a provider is missing a key, offline, or the selected
model is unavailable, Send is disabled or the failed request renders a structured
provider-failure card with a safe reason and next step. Ordinary chat failures do
not become synthetic assistant answers.

## 5. Tools The Agent Can Use

The tool bar lists local tools available to the agent through the app's WebMCP-
shaped shim. Built-ins include graph search, reading/creating notes, linking
nodes, ingesting text, rendering agent UI, and browser-harness scaffolding.

Every tool call should pass a gate and role check before it runs and should be
visible in the activity/audit surfaces where applicable. Current enforcement is
partial: some frontend and Rust paths enforce gates, but complete backend-owned
authorization remains future hardening work.

Tools require the **Tools** gate to be open and a role that permits tool use
(admin/editor). Viewers cannot intentionally run tools.

## 6. The Audit Ledger

Expand the **Audit Ledger** to see knowledge-graph writes: who did it, what
changed, and whether it was allowed or denied. The current ledger includes a hash
chain, but the master audit identifies audit-integrity hardening work still needed
before production use.

## 7. Security Gates

Three capability switches govern what the app may do:

- **Filesystem:** local persistence and ingestion.
- **Network:** outbound calls.
- **Tools:** running tools and reaching the agent sidecar.

They are open by default for a smooth first run. Closing a gate narrows behavior,
but Phase 0 documentation must be explicit: backend enforcement is not complete
for every command yet. Treat gates as important controls in progress, not as a
finished security boundary.

## 8. Settings And Shortcuts

Open **Settings** with **Ctrl/Cmd + ,**. It contains Provider Manager, API keys,
security gates, persistent Runtime Profile defaults, interface language, logs,
and an About panel.

Keyboard shortcuts:

- **Ctrl/Cmd + ,** - open Settings
- **Ctrl/Cmd + K** - focus the chat composer

**Keys:** add cloud API keys under **Settings -> Provider Manager -> Secrets**.
Keys use the OS keychain path. The frontend can set/delete keys and check whether
a key is present, but raw keychain secret reads are denied. Gemini discovery and
generation use backend-only key access.

## 9. Privacy And Local-First Behavior

- Your knowledge graph, retrieval scaffolds, and audit ledger live on your machine.
- With **Network** closed and only local models selected, the intended behavior is
  no outbound provider calls.
- Logs live in the platform app-log directory.

## 10. Getting Help

- **Admin Guide** (`docs/ADMIN_GUIDE.md`) - roles, policy, secrets, SIEM, audit, logs.
- **Troubleshooting** (`docs/TROUBLESHOOTING.md`) - fixes for common issues.
- In-app: Settings -> Logs opens the local log folder for diagnostics.
