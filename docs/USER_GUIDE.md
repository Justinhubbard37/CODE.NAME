# CODE NAME — User Guide

A practical guide to using CODE NAME, a local‑first agent harness with a governed
knowledge graph. Everything here works offline by default; cloud models are
optional and opt‑in.

> New here? On first launch a short **setup wizard** walks you through choosing a
> model, adding a key (only if you want cloud), reviewing the security gates, and
> running a self‑check. Every step is skippable and the defaults are safe and
> offline. You can re‑open everything later in **Settings** (Ctrl/Cmd + ,).

---

## 1. The workspace at a glance

The window is split into two panes.

**Left — Mission Control**
- **Knowledge graph (3D):** your documents, entities, and the links between them.
- **Archive Index:** a tree view of the knowledge stores (graph, vectors, GraphRAG index).
- **GraphRAG query box** (bottom): retrieve nodes by meaning, not just keywords.
- **Drop zone:** drag files anywhere onto this pane to ingest them.
- **Task tabs / Environment bar:** isolated work threads and per‑tab capabilities.

**Right — Execution Canvas**
- **Agent header + WebMCP tools bar:** the active model and the tools the agent may call.
- **Activity feed:** a live log of routing, tool calls, and system events.
- **Ingestion Ledger:** files being hashed, de‑duplicated, and indexed.
- **Audit Ledger:** the append‑only, tamper‑evident history of knowledge‑graph writes.
- **Chat thread + composer:** talk to the model; stream replies; stop generation.

---

## 2. Ingesting documents

Drag one or more files onto the **left pane**. Each file is:

1. **Staged** in the Ingestion Ledger and **hashed**.
2. **Checked for redundancy** against what you already have (by content hash or name).
3. **Indexed** into the knowledge graph as a document node, or flagged as a **conflict**.

If a conflict is found you'll be offered three choices:
- **Overwrite** — replace the existing copy (a new version is recorded in its history).
- **Skip** — discard the incoming file.
- **Keep both** — fork it into a new node.

Text files (`.txt`, `.md`, `.json`, `.csv`, code, …) have their text extracted for
search. Other files are recorded as binary assets. You can also scan an image with
the **OCR** button next to the query box — the recognized text is ingested through
the same gated pipeline.

> Ingestion requires the **Filesystem** gate to be open (it is, by default). If it's
> closed, drops are rejected and the reason is shown.

---

## 3. Searching the graph (GraphRAG)

Type in the **GraphRAG query** box and press **Enter**. Retrieval combines:
- **Lexical** ranking (BM25‑style keyword relevance), and
- **Vector** similarity (semantic match),
- fused together (hybrid) so both exact terms and related concepts surface.

Matching nodes stay highlighted in the graph; non‑matches are dimmed. Clear the box
and press Enter to show everything again.

---

## 4. Chatting with a model

Type in the composer on the right and press **Enter** (Shift + Enter for a newline).
While the model streams, the **Send** button becomes **Stop** — press it to abort.

**Choosing a model.** Open **Settings → Models & routing** (or use the wizard):
- **Preset** — a saved bundle of endpoint + temperature + context window.
- **Endpoint** — where the model runs: local Ollama, LM Studio, a custom
  OpenAI‑compatible server, Ollama Cloud, Gemini, or the bundled agent sidecar.
- **Model** — the specific model. Click **Detect installed models** to probe a local
  server for what's actually available.

**Local first.** Local endpoints (Ollama, LM Studio) need no key and no network.
For a fully offline assistant, install [Ollama](https://ollama.com) and pull a model,
e.g. `ollama pull llama3.1`.

**Truth check.** CODE NAME verifies the model the server *actually* ran. If a server
substitutes a different model (common with LM Studio's pre‑loaded model), you'll see a
clear notice rather than a silent swap.

---

## 5. Tools the agent can use

The **WebMCP** bar lists the tools available to the agent. Built‑ins include graph
search, reading/creating notes, linking nodes, ingesting text, rendering agent UI,
and opening a URL through the browser harness. Every tool call:
- passes a **gate + role check** before it runs, and
- is written to the **Activity feed** and, for graph writes, the **Audit Ledger**.

Tools require the **Tools** gate to be open and a role that permits tool use
(admin/editor). Viewers cannot run tools.

---

## 6. The audit ledger

Expand the **Audit Ledger** (right pane) to see every knowledge‑graph write — who did
it, what changed, and whether it was allowed or denied. Each record is chained to the
previous one with a cryptographic hash. Click **Verify** to confirm the chain is
intact (tamper‑evident): if any record was altered, the broken link is reported.

---

## 7. Security gates (quick version)

Three hard switches govern what the app may do:
- **Filesystem** — local persistence and ingestion.
- **Network** — outbound calls (only cloud models need this; local models don't).
- **Tools** — running tools and reaching the agent sidecar.

They're open by default for a smooth start. Close any you don't want. Closing
**Network** severs cloud routing; closing **Tools** disables tool execution; closing
**Filesystem** blocks ingestion. (Admins can lock gates for everyone — see the Admin
Guide.)

---

## 8. Settings & shortcuts

Open **Settings** with **Ctrl/Cmd + ,**. It collects: model routing, API keys, gates,
tuning, interface language, logs, and an About panel.

Keyboard shortcuts:
- **Ctrl/Cmd + ,** — open Settings
- **Ctrl/Cmd + K** — focus the chat composer

**Language:** switch between available languages under Settings → Language. Your
choice persists per profile.

**Keys:** add cloud API keys under Settings → Secrets. Keys are stored in your
operating system's keychain (Windows Credential Manager / macOS Keychain / Linux
Secret Service) — never in plain text.

---

## 9. Privacy & local‑first behavior

- Your knowledge graph, vectors, and audit ledger live **on your machine**.
- With **Network** closed (or using only local models) the app makes **no outbound
  calls**.
- API keys live in the OS keychain. Logs live in your platform's app‑log directory
  (Settings → Logs → open folder).

---

## 10. Getting help

- **Admin Guide** (`docs/ADMIN_GUIDE.md`) — roles, policy, SSO, SIEM, audit, logs.
- **Troubleshooting** (`docs/TROUBLESHOOTING.md`) — fixes for common issues.
- In‑app: the first‑run wizard's final step links to these guides; Settings → Logs
  opens your log folder for diagnostics.
