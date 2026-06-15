# CODE NAME: | — THE ROADMAP (Master Blueprint)

_Last updated: 2026-06-07. This is the single plan we follow to take CODE NAME from what it is today to enterprise-grade software._

> Phase 0 stabilization note (2026-06-14): this document is partly historical.
> The current repo has real graph persistence, hybrid retrieval scaffolding,
> automated TypeScript/Vitest tests, and Rust-held sidecar token forwarding.
> Production GraphRAG, real semantic embeddings, complete backend gate
> enforcement, production secret isolation, and release/compliance readiness are
> still planned work unless a later audit says otherwise.

---

## How to read this blueprint

This document is written in plain language on purpose. Anyone on the team should be able to read it and understand what to build next and why.

We build in **phases**. Each phase has a goal. Inside each phase are **slices**. A slice is a small piece of work that one coding agent (or one person) can finish in a single work session. When a slice is done, the app still builds and still runs. We never leave the app broken between slices.

Think of it like building a house. The phases are big stages (foundation, walls, roof, wiring). The slices are the single tasks inside each stage (pour one footing, frame one wall). You can stop after any slice and the house is still standing.

### The rules we never break

1. **The build stays green.** After every slice, `npm run lint` (TypeScript check) passes and the app starts. If a change would break the build, it is not done.
2. **Local-first always works.** The app must run with no internet and no special hardware. Every online feature must "fall back" to a working offline mode.
3. **Security comes before features.** A new feature never gets to skip the capability gates or the audit log.
4. **One change at a time.** Each slice changes as little as possible. Small changes are easy to review and easy to undo.
5. **Every slice has a "Done when" test.** If you cannot check that it works, it is not finished.
6. **Don't rebuild the seams.** The code already has clean "swap points" (interfaces). We fill them in. We do not tear them out.

### What each slice looks like

- **Goal** — one sentence on what we get.
- **Steps** — the work, in order.
- **Files** — the real files to touch.
- **Done when** — how we know it works.
- **Stays safe** — how it still works offline / behind the gates.

---

## Word list (plain-language glossary)

Read this once. It explains the words used all through the plan.

- **Tauri** — the toolkit that turns our web app into a real desktop app with a Rust "shell" around it.
- **Rust shell / supervisor** — the trusted outer program (in the `src-tauri` folder). It owns the window and starts/stops the Python helper.
- **Sidecar** — a small Python program (`sidecar/agent_sidecar.py`) that runs the AI "agent." The shell starts it and watches it.
- **Frontend** — the part you see, written in React (the `src` folder).
- **Knowledge Graph (KG)** — a web of "cards" (documents, people, groups) joined by links. This is the app's memory.
- **Planned vector search** — a future production database of embeddings used to find things by meaning, not just by exact words. The current repo uses retrieval scaffolding and stub vectors.
- **Embedding** — a list of numbers that captures the meaning of a piece of text, so we can compare meanings.
- **GraphRAG** — a way to answer questions by walking the knowledge graph and grouping related cards into "communities."
- **Retrieval** — the act of finding the most useful cards for a question.
- **A2A** — "Agent to Agent." The shared language our app uses to talk to the sidecar agent over the local network.
- **WebMCP** — a way for the web page to offer "tools" the model can call (search the graph, make a note, open a page).
- **A2UI** — "Agent to UI." A safe way for the agent to draw simple screens into the right pane.
- **Gate** — an on/off switch the user controls for File System, Network, and Tools. Off means "cut the wire."
- **Audit log / ledger** — an append-only history of every change to the knowledge graph. You can read it but never edit it.
- **Ollama / LM Studio** — programs that run AI models on your own computer. Ollama can also run **cloud** models (see Phase 2).
- **Browser Harness** — a tool that lets the agent control a real web browser to do web tasks.
- **RBAC** — "Role-Based Access Control." Different users get different powers (admin, editor, viewer).
- **SIEM** — security software companies use to collect logs and watch for threats.
- **SBOM** — "Software Bill of Materials." A list of every outside package we ship, used for security.
- **CDP** — "Chrome DevTools Protocol." The wire used to control a Chrome browser.
- **Keychain / secret store** — the operating system's safe for passwords and API keys.

---

## Where we are today (the starting line)

CODE NAME already has a lot built and working:

- A polished two-pane desktop window (Mission Control on the left, Execution Canvas on the right).
- Chat that streams from real local models (Ollama, LM Studio, OpenAI-style) and from Gemini, with an offline "synthetic" reply when nothing is connected.
- A knowledge graph that saves to the browser database (IndexedDB) and survives restarts.
- One safe "front door" for all graph changes, and an audit log that records every change.
- A 3D graph view you can orbit and zoom, with cards that shrink to dots when far away.
- Drag-and-drop file intake with hashing, duplicate checks, and OCR (reading text from images).
- A tool system (WebMCP), an agent-UI renderer (A2UI), per-tab permissions, and a pool counter.
- A Rust shell that starts and watches a Python sidecar, and the sidecar speaks the A2A language.

But several big pieces are only "pretend" for now, and the plan below turns them real:

- The agent and sidecar paths are partially wired, with synthetic fallback behavior
  when no real provider is available.
- The vector and GraphRAG surfaces are **not production-real yet**. Current
  retrieval uses local graph/search scaffolding and stub-vector behavior.
- Capability gates exist and are partially mirrored into Rust, but backend
  enforcement is incomplete. The sidecar token is now held by Rust in the current
  app path, but command-policy coverage still needs hardening.
- Browser harness work exists as scaffolding and notes; it still needs backend URL
  policy and safety hardening before production use.
- Automated tests exist, but installer/release hardening and several cleanup
  items remain.

The phases below fix all of this and then push far past it.

---

## The map of phases

- **Phase 0 — Get to a Known-Good Start** (stabilize, clean up, add tests).
- **Phase 1 — Lock the Security Spine** (real gates in Rust, keep the token safe).
- **Phase 2 — Real Models: Ollama Local + Cloud, and Friends** (includes the new Ollama cloud feature).
- **Phase 3 — Give the Agent a Real Brain** (ADK in the sidecar, real tool-calling).
- **Phase 4 — The Real Knowledge Ecosystem** (vectors, embeddings, GraphRAG, stronger storage).
- **Phase 5 — The Right-Pane Protocols, For Real** (live tools, richer agent UI, browser harness).
- **Phase 6 — Tabs as Real Environments** (shared pools wired to real resources).
- **Phase 7 — Data Safety** (encryption, backup, export, tamper-proof audit).
- **Phase 8 — Enterprise Identity & Governance** (sign-in, roles, workspaces, policy, SIEM).
- **Phase 9 — See Everything, Survive Anything** (logging, metrics, crash reports, self-healing).
- **Phase 10 — Performance & Polish** (speed at scale, accessibility, languages, final UX).
- **Phase 11 — Quality Gates** (full testing and automated checks on every change).
- **Phase 12 — Ship It** (installer, signing, auto-update, docs, first-run).
- **Phase 13 — Compliance & Hardening** (threat model, outside testing, audit readiness).

A quick note on order. Phase 0 and Phase 1 come first because they make everything after them safe and steady. Phases 2–6 build the real product. Phases 7–13 make it enterprise-grade. Some phases can overlap once their inputs exist, but the safe default is to go in order.

---

# PHASE 0 — Get to a Known-Good Start

**Goal:** Make sure the app builds, runs end-to-end, and is clean enough to grow. Add a small safety net of tests.

### Slice 0.1 — Prove the desktop app runs
- **Goal:** Confirm the whole app works on the real machine before we change anything.
- **Steps:**
  1. Run `npm install`.
  2. Run `npm run tauri dev`.
  3. Send a chat to the "Agent Sidecar (A2A)" endpoint and watch the echo reply stream in.
  4. Open the stealth drawer, close the **Tools** gate, send again, and confirm the sidecar is blocked.
- **Files:** none changed (this is a check).
- **Done when:** the window opens, the echo reply streams, and closing the Tools gate stops it.
- **Stays safe:** read-only check; no code changes.

### Slice 0.2 — Clean install and lock dependencies
- **Goal:** Remove confusion from the old packages.
- **Steps:**
  1. Delete the leftover `node_modules_old` folder.
  2. Run a fresh `npm install` so `package-lock.json` is correct.
  3. Remove the unused `express` dependency from `package.json` (the app has no server).
- **Files:** `package.json`, `package-lock.json`.
- **Done when:** `npm run lint` and `npm run dev` both work after a clean install.
- **Stays safe:** removing unused packages cannot affect runtime behavior.

### Slice 0.3 — Fix the offline-fonts bug
- **Goal:** Keep our promise that the app works with no internet.
- **Steps:**
  1. Download the two fonts (Space Grotesk, JetBrains Mono) into `src/assets/fonts/`.
  2. Replace the Google Fonts `@import` in `src/index.css` with local `@font-face` rules.
- **Files:** `src/index.css`, new `src/assets/fonts/`.
- **Done when:** the app shows the right fonts with the network turned off.
- **Stays safe:** this removes a network call, so offline gets better.

### Slice 0.4 — Fix small name and config mismatches
- **Goal:** Stop the confusing leftovers from the old "Blackwall" template.
- **Steps:**
  1. Update `metadata.json` name/description to "CODE NAME".
  2. Rename the package in `package.json` from `react-example` to `codename`.
  3. Fix the Gemini key note: document `VITE_GEMINI_API_KEY` in `.env.example` so the key actually reaches the app.
- **Files:** `metadata.json`, `package.json`, `.env.example`.
- **Done when:** names read correctly and a set `VITE_GEMINI_API_KEY` makes the Gemini endpoint show "ready."
- **Stays safe:** text/name changes only.

### Slice 0.5 — Rename the confusing twin panels
- **Goal:** Stop mixing up the two "ledger" panels.
- **Steps:**
  1. Rename `LedgerAudit.tsx` (the file-intake panel) to `IngestionLedger.tsx`.
  2. Keep `AuditLedger.tsx` (the knowledge-graph audit) as is.
  3. Update imports in `ExecutionCanvas.tsx`.
- **Files:** `src/components/right/LedgerAudit.tsx` → `IngestionLedger.tsx`, `ExecutionCanvas.tsx`.
- **Done when:** both panels still show and the names now make sense.
- **Stays safe:** rename only; no logic change.

### Slice 0.6 — Decide on the dead 2D graph
- **Goal:** Remove confusion from unused code.
- **Steps:**
  1. Confirm `GraphCanvas.tsx` and `CustomNodes.tsx` are not imported anywhere.
  2. Move them into a `src/legacy/` folder with a short README that says "kept for reference, not used."
- **Files:** `src/components/left/GraphCanvas.tsx`, `src/components/CustomNodes.tsx`.
- **Done when:** the app builds and the 3D graph still works; the unused files are clearly marked.
- **Stays safe:** moving unused files cannot change behavior.

### Slice 0.7 — Add the test runner
- **Goal:** Create the safety net that all later phases use.
- **Steps:**
  1. Add **Vitest** and a `test` script to `package.json`.
  2. Write the first three tests: the gate decision in `kg/commit.ts`, the per-tab `effectiveGates` in `lib/perms.ts`, and the A2A stream parser in `lib/sidecar.ts`.
- **Files:** `package.json`, new `src/**/*.test.ts`.
- **Done when:** `npm test` runs and the three tests pass.
- **Stays safe:** tests do not ship in the app; they only run during development.

### Slice 0.8 — Save graph layout when nodes move
- **Goal:** Remember where the user dragged nodes (a clearly intended feature that is unfinished).
- **Steps:**
  1. When a node drag ends, write its new position through the existing `commit()` front door.
  2. Make sure this records an audit entry like other writes.
- **Files:** `src/state/AppState.tsx` (node-change handler), `src/kg/store.ts`.
- **Done when:** you move a node, restart the app, and it stays where you put it.
- **Stays safe:** uses the same gated front door, so the File System gate still controls it.

---

# PHASE 1 — Lock the Security Spine

**Goal:** Make the capability gates real at the Rust level, and stop handing the secret token to the web page. This is the most important phase because every later feature trusts it.

### Slice 1.1 — Move A2A calls behind a Rust command
- **Goal:** Make the Rust shell, not the web page, talk to the sidecar.
- **Steps:**
  1. Add a Rust command `sidecar_send(message)` that forwards a chat to the sidecar and returns the reply.
  2. Keep the bearer token inside Rust only. Do not send it to the web page anymore.
- **Files:** `src-tauri/src/sidecar.rs`, `src-tauri/src/lib.rs`.
- **Done when:** the agent chat still works, but the token no longer appears in the web page.
- **Stays safe:** in plain-browser mode (no Rust), the app falls back to the existing offline reply.

### Slice 1.2 — Stream the agent reply through Rust
- **Goal:** Keep streaming working with the new safe path.
- **Steps:**
  1. Add a Tauri "event" channel so the Rust command can push tokens to the web page as they arrive.
  2. Update `lib/sidecar.ts` `streamA2A` to listen to that channel instead of doing its own `fetch`.
- **Files:** `src-tauri/src/sidecar.rs`, `src/lib/sidecar.ts`.
- **Done when:** the agent reply still streams word by word, with no token in the web page.
- **Stays safe:** if the channel is missing, show the offline message.

### Slice 1.3 — Make the Tools and Network gates cut the wire in Rust
- **Goal:** Closing a gate must stop the sidecar at the Rust layer, not just hide it in the UI.
- **Steps:**
  1. Store the gate state in Rust managed state; let the web page set it through a `set_gates` command.
  2. In `sidecar_send`, refuse the call when the Tools gate is closed.
  3. When the Network gate is closed, refuse any sidecar action that would reach the internet.
- **Files:** `src-tauri/src/sidecar.rs`, `src-tauri/src/lib.rs`, `src/state/AppState.tsx`.
- **Done when:** closing the Tools gate blocks the agent even if someone bypasses the web UI.
- **Stays safe:** the UI gate checks stay too; this adds a second, stronger layer.

### Slice 1.4 — Tell cloud from local correctly
- **Goal:** Make sure "local address but cloud model" is still treated as network use.
- **Steps:**
  1. Add a `usesCloud` flag to endpoints and models (not just `isLocal`).
  2. Update the Network gate checks to block anything with `usesCloud`, even if the base URL is `localhost`.
- **Files:** `src/types.ts`, `src/config/defaults.ts`, `src/state/AppState.tsx`.
- **Done when:** with the Network gate closed, a cloud model is blocked even when it goes through the local Ollama app.
- **Stays safe:** pure local models still work with the network off.

### Slice 1.5 — Put the agent-card check and timeouts in
- **Goal:** Make the bridge sturdy and predictable.
- **Steps:**
  1. On connect, read the sidecar's agent card and confirm it matches what we expect.
  2. Add per-call timeouts and clean cancel (reuse the STOP button's abort).
- **Files:** `src-tauri/src/sidecar.rs`, `src/lib/sidecar.ts`.
- **Done when:** a slow or wrong sidecar fails cleanly with a clear message, and STOP always works.
- **Stays safe:** failures fall back to the offline reply.

### Slice 1.6 — Add a security test set
- **Goal:** Prove the gates work and keep proving it.
- **Steps:**
  1. Add tests that close each gate and confirm the matching action is refused.
  2. Add a test that the token never appears in any web-page-visible state.
- **Files:** new `src-tauri` tests and `src/**/*.test.ts`.
- **Done when:** `npm test` (and `cargo test`) confirm the gates and token rules.
- **Stays safe:** tests only.

---

# PHASE 2 — Real Models: Ollama Local + Cloud, and Friends

**Goal:** Let the user pick and use real models easily — local models **and** Ollama cloud models — with keys kept safe. This phase delivers the new request: support both local and cloud Ollama.

> Background (confirmed from Ollama's docs): Ollama cloud models can be used two ways. **Way A:** through the local Ollama app — you run `ollama signin` once, then use a model name that ends in `-cloud` (for example `gpt-oss:120b-cloud`) at the normal local address `http://localhost:11434/api/chat`. **Way B:** straight to Ollama's cloud — base URL `https://ollama.com`, with a header `Authorization: Bearer <OLLAMA_API_KEY>`. Both use the same chat message shape we already support, so most of our code already fits.

### Slice 2.1 — Add the Ollama Cloud (direct) endpoint
- **Goal:** Let users talk straight to Ollama's cloud with an API key.
- **Steps:**
  1. Add an endpoint in `defaults.ts`: label "Ollama Cloud", kind `ollama`, base URL `https://ollama.com`, `isLocal: false`, `usesCloud: true`, `apiKeyEnv: 'OLLAMA_API_KEY'`.
  2. Update `streamOllama` in `lib/llm.ts` to add the `Authorization: Bearer` header when an API key is set (today only the OpenAI path adds it).
- **Files:** `src/config/defaults.ts`, `src/lib/llm.ts`.
- **Done when:** with `OLLAMA_API_KEY` set, you can chat with a cloud model like `gpt-oss:120b` and it streams.
- **Stays safe:** it is marked cloud, so the Network gate can block it; with no key it shows "no API key."

### Slice 2.2 — Support cloud models through the local Ollama app
- **Goal:** Let users run `-cloud` models with the local Ollama they already have.
- **Steps:**
  1. On the local Ollama endpoint, allow choosing model names that end in `-cloud`.
  2. Mark any `-cloud` model with `usesCloud: true` so the Network gate still applies (Slice 1.4).
  3. If the daemon returns "not signed in," show a friendly hint: "Run `ollama signin` in a terminal."
- **Files:** `src/lib/llm.ts`, `src/state/AppState.tsx`, status UI in `components/right/StatusModule.tsx`.
- **Done when:** after `ollama signin`, a `-cloud` model streams through `localhost:11434`, and the Network gate can block it.
- **Stays safe:** pure-local models still run with no sign-in and no internet.

### Slice 2.3 — Live model picker (local + cloud in one list)
- **Goal:** Let users pick a model from a real list instead of typing names.
- **Steps:**
  1. Fetch local models from `GET http://localhost:11434/api/tags`.
  2. When signed in or keyed, also fetch cloud models from `https://ollama.com/api/tags`.
  3. Show one combined list. Tag each model "LOCAL" or "CLOUD." Add the picker to the stealth drawer.
- **Files:** `src/lib/llm.ts` (a `listModels()` helper), `src/components/config/StealthDrawer.tsx`.
- **Done when:** the drawer shows real models, tagged correctly, and choosing one updates the active profile.
- **Stays safe:** if a list call fails, fall back to the typed model name.

### Slice 2.4 — Keep API keys in the OS secret store
- **Goal:** Stop depending on environment variables for secrets.
- **Steps:**
  1. Add a Tauri command to read/write keys in the OS keychain (use the Tauri keyring/stronghold plugin).
  2. Add a small "Secrets" section in the drawer to set the Ollama and Gemini keys.
  3. Have `lib/llm.ts` ask Rust for the key instead of reading `import.meta.env`.
- **Files:** `src-tauri` (new keychain command + plugin), `src/lib/llm.ts`, `StealthDrawer.tsx`.
- **Done when:** a key saved in the UI works after restart and is never written to disk in plain text.
- **Stays safe:** if the keychain is missing, fall back to the env var and warn.

### Slice 2.5 — Show real connection health and errors
- **Goal:** Make it obvious what is connected and why something failed.
- **Steps:**
  1. Improve the endpoint matrix to show last error, latency, and "needs sign-in / needs key" states.
  2. Add a "Test" button per endpoint.
- **Files:** `src/components/right/StatusModule.tsx`, `src/state/AppState.tsx`.
- **Done when:** each endpoint clearly shows ready, offline, error, or "needs key," with a reason.
- **Stays safe:** read-only checks; nothing changes the chat path.

---

# PHASE 3 — Give the Agent a Real Brain

**Goal:** Replace the echo stub with a real agent runtime (Google ADK) inside the sidecar, and let it actually call our tools.

### Slice 3.1 — Bundle a Python environment plan
- **Goal:** Decide and document how Python and its packages ship.
- **Steps:**
  1. Choose a packaging path (embed a Python runtime, or require Python 3.11+ with a managed virtual environment on first run).
  2. Write the steps in `docs/PACKAGING.md`.
- **Files:** `docs/PACKAGING.md`.
- **Done when:** there is a clear, written plan for getting Python + `google-adk` onto a user's machine.
- **Stays safe:** plan only; no code change.

### Slice 3.2 — Drop ADK into `run_agent` with a safe fallback
- **Goal:** Make the agent actually think.
- **Steps:**
  1. In `sidecar/agent_sidecar.py`, import `google.adk` and build a simple `Agent` pointed at the active local/cloud model.
  2. Use it inside `run_agent(text)`; if ADK or a model is missing, keep the current echo as fallback.
- **Files:** `sidecar/agent_sidecar.py`.
- **Done when:** with ADK and a model present, the agent gives a real answer; without them, it still echoes.
- **Stays safe:** the fallback keeps the app working offline and unconfigured.

### Slice 3.3 — Pass the chosen model and settings to the sidecar
- **Goal:** Let the user's model/profile choice control the agent.
- **Steps:**
  1. Send the active model name, temperature, and context size from the app to the sidecar at call time.
  2. Make sure cloud model choices respect the gates (Phase 1).
- **Files:** `src/state/AppState.tsx`, `src/lib/sidecar.ts`, `src-tauri/src/sidecar.rs`, `sidecar/agent_sidecar.py`.
- **Done when:** changing the model in the drawer changes which model the agent uses.
- **Stays safe:** unknown settings use safe defaults.

### Slice 3.4 — Let the agent call our tools (the loop)
- **Goal:** Connect the agent to the WebMCP tools (search, note, render, browser).
- **Steps:**
  1. When the agent asks to use a tool, send that request from the sidecar to the app.
  2. Run it through the existing WebMCP guard (gates + audit), then send the result back to the agent.
- **Files:** `sidecar/agent_sidecar.py`, `src/lib/webmcp.ts`, `src/state/AppState.tsx`, `src/lib/sidecar.ts`.
- **Done when:** the agent can search the graph or make a note, and the action shows in the audit log.
- **Stays safe:** every tool call still passes the gate guard; a closed gate blocks it.

### Slice 3.5 — Show tool results in the chat
- **Goal:** Make tool use visible to the user (a feature the docs say is deferred).
- **Steps:**
  1. When a tool runs, add a short "tool result" bubble in the chat thread, not only in the activity feed.
- **Files:** `src/components/right/ChatThread.tsx`, `src/state/AppState.tsx`.
- **Done when:** running a tool shows both an activity line and a clear chat result.
- **Stays safe:** display only; no new powers.

### Slice 3.6 — Auto-restart the sidecar with backoff
- **Goal:** Heal the agent if it crashes (a deferred item).
- **Steps:**
  1. In the Rust supervisor, if the sidecar exits unexpectedly, restart it after a short wait, with growing delays.
  2. Show the user a small "agent restarting" note.
- **Files:** `src-tauri/src/sidecar.rs`.
- **Done when:** killing the sidecar makes it come back on its own, and the UI says so.
- **Stays safe:** after repeated failures, stop and show "agent offline" instead of looping forever.

---

# PHASE 4 — The Real Knowledge Ecosystem

**Goal:** Make the planned GraphRAG and vector-search promise true. Add real embeddings, real meaning-based search, and real communities. Move storage to something that scales.

### Slice 4.1 — Add an embeddings step at intake
- **Goal:** Turn ingested text into embeddings.
- **Steps:**
  1. Add an `embed(text)` call in the sidecar using a small local model (with a cloud option later).
  2. When a document is ingested, create embeddings for its chunks.
- **Files:** `sidecar/agent_sidecar.py`, `src/state/AppState.tsx` (ingest path).
- **Done when:** ingesting a file produces stored embeddings for its chunks.
- **Stays safe:** if no embedder is available, skip embeddings and keep keyword search.

### Slice 4.2 — Add a vector store behind the Retriever interface
- **Goal:** Save and search embeddings without breaking the current code.
- **Steps:**
  1. Add a `chunks` + `vectors` store (start in IndexedDB; SQLite comes in Slice 4.6).
  2. Write a `VectorRetriever` that scores by cosine similarity and implements the existing `Retriever` interface.
- **Files:** `src/kg/store.ts`, new `src/kg/vector.ts`, `src/kg/retrieve.ts`.
- **Done when:** a meaning-based search returns the right cards even when the words differ.
- **Stays safe:** the lexical retriever stays as the fallback if vectors are missing.

### Slice 4.3 — Blend keyword + meaning search (hybrid)
- **Goal:** Get the best of both search styles.
- **Steps:**
  1. Combine BM25 (keyword) and vector (meaning) scores into one ranked list.
  2. Put this behind the same query bar and the `graph.search` tool.
- **Files:** `src/kg/retrieve.ts`.
- **Done when:** the query bar returns clearly better results than keyword-only.
- **Stays safe:** if vectors are off, it quietly becomes keyword-only.

### Slice 4.4 — Build real GraphRAG communities
- **Goal:** Replace the placeholder community grouping with a real hierarchy.
- **Steps:**
  1. In the sidecar, build community groupings (for example, the Leiden method) and short LLM summaries per community.
  2. Store community ids and summaries on the nodes.
- **Files:** `sidecar/agent_sidecar.py`, `src/kg/communities.ts`, `src/kg/store.ts`.
- **Done when:** the graph shows meaningful clusters, each with a one-line summary.
- **Stays safe:** if the sidecar is offline, keep the simple connected-components grouping.

### Slice 4.5 — Use communities in the 3D view (4th LOD tier)
- **Goal:** Finish the planned "far away = one cluster card" view.
- **Steps:**
  1. When a community is large and far, draw one cluster node instead of many.
  2. Use the existing `clusterWhenCommunityGt` setting in `config/system.ts`.
- **Files:** `src/components/left/graph3d/Node3D.tsx`, `Graph3D.tsx`, `layout.ts`.
- **Done when:** zooming out collapses big communities into single labeled cluster cards.
- **Stays safe:** rendering only; no data change.

### Slice 4.6 — Move storage to SQLite
- **Goal:** Handle large graphs and prepare for encryption and backup.
- **Steps:**
  1. Add a Tauri-SQLite backend that implements the existing `KnowledgeStore` interface.
  2. Add a one-time import that copies existing IndexedDB data into SQLite.
- **Files:** `src/kg/store.ts`, new `src-tauri` SQLite command/plugin.
- **Done when:** the app reads/writes the graph from SQLite, and old data is migrated.
- **Stays safe:** IndexedDB stays as the fallback for plain-browser mode.

---

# PHASE 5 — The Right-Pane Protocols, For Real

**Goal:** Make the tool layer, the agent UI, and the browser tool truly useful.

### Slice 5.1 — Grow the WebMCP tool set
- **Goal:** Give the agent more safe, gated powers.
- **Steps:**
  1. Add tools like `graph.link` (connect two cards), `graph.get` (read a card), and `ingest.text` (add a note as a document).
  2. Route each through the gate guard and audit.
- **Files:** `src/state/AppState.tsx`, `src/lib/webmcp.ts`.
- **Done when:** the agent can build and read graph structure, all audited.
- **Stays safe:** closed gates block each new tool too.

### Slice 5.2 — Make A2UI forms interactive
- **Goal:** Let agent-drawn screens take real input.
- **Steps:**
  1. Add input binding to `textfield` and wire `button` actions to send values back.
  2. Keep the trusted-catalog rule (no unknown components).
- **Files:** `src/components/right/a2ui/A2UIRenderer.tsx`, `types.ts`, `bus.ts`.
- **Done when:** an agent can show a form, read what the user types, and act on it.
- **Stays safe:** only catalog components render; anything else is ignored.

### Slice 5.3 — Make agent UI per-tab
- **Goal:** Keep each task's agent screen separate (a deferred item).
- **Steps:**
  1. Move the A2UI "bus" from one global value to one per task/tab.
- **Files:** `src/components/right/a2ui/bus.ts`, `AgentUIPanel.tsx`, `AppState.tsx`.
- **Done when:** switching tabs shows that tab's own agent UI.
- **Stays safe:** display only.

### Slice 5.4 — Real Browser Harness (read-only first)
- **Goal:** Let the agent actually open and read web pages, safely.
- **Steps:**
  1. In the sidecar, connect to a user-run Chrome over CDP.
  2. Make `browser.open` navigate and return page text. Read-only to start.
  3. Add a first-run helper that explains how to start Chrome with remote debugging.
- **Files:** `sidecar/agent_sidecar.py`, `src/state/AppState.tsx` (`browser.open`), new first-run UI.
- **Done when:** with Chrome connected, the agent can open a URL and read its text; without Chrome, it says so.
- **Stays safe:** needs the tab's BROWSER permission and an open Tools gate; off by default.

### Slice 5.5 — Sandbox the harness's self-written files
- **Goal:** Contain the browser tool's habit of writing its own helper code.
- **Steps:**
  1. Keep harness-generated files in a sandboxed folder under the File System gate.
  2. Record new/changed helper files in the audit log and treat them as untrusted.
- **Files:** `sidecar/agent_sidecar.py`, audit path in `src/kg/commit.ts`/store.
- **Done when:** any code the harness writes is contained, listed, and audited.
- **Stays safe:** closing the File System or Tools gate stops the harness from writing.

---

# PHASE 6 — Tabs as Real Environments

**Goal:** Make the shared pools control real resources, so many tabs share a few browsers and agents safely.

### Slice 6.1 — Bind a pool lease to a real sidecar resource
- **Goal:** Turn the pool counter into real control.
- **Steps:**
  1. When a tab leases a "browser" or "agent" slot, ask the sidecar to create the real context/runtime and return a handle.
  2. Store that handle with the lease.
- **Files:** `src/lib/pools.ts`, `sidecar/agent_sidecar.py`, `src/lib/sidecar.ts`.
- **Done when:** leasing a slot creates a real isolated context in the sidecar.
- **Stays safe:** if the sidecar is offline, the lease stays a safe placeholder.

### Slice 6.2 — Release real resources when tabs close
- **Goal:** Free memory and browsers cleanly.
- **Steps:**
  1. On tab close and on idle-evict, tell the sidecar to tear down the real resource.
- **Files:** `src/lib/pools.ts`, `src/state/AppState.tsx`, `sidecar/agent_sidecar.py`.
- **Done when:** closing tabs frees the real contexts, and the pool count drops.
- **Stays safe:** if teardown fails, log it and force-evict so we never leak forever.

### Slice 6.3 — Prove isolation between tabs
- **Goal:** Show that one tab cannot see another's state.
- **Steps:**
  1. Add tests/checks that two tabs with different permissions cannot share data or context.
- **Files:** tests; `src/lib/perms.ts`, `pools.ts`.
- **Done when:** a test confirms two tabs stay separate while sharing the pool.
- **Stays safe:** tests only.

---

# PHASE 7 — Data Safety

**Goal:** Protect the knowledge graph and audit log: encrypt them, back them up, export them, and make the audit tamper-proof.

### Slice 7.1 — Encrypt data at rest
- **Goal:** Keep the saved graph unreadable if the disk is stolen.
- **Steps:**
  1. Turn on SQLite encryption (SQLCipher-style) with a key from the OS keychain.
- **Files:** `src-tauri` SQLite layer, keychain command.
- **Done when:** the database file cannot be read without the app and the key.
- **Stays safe:** if encryption is unavailable, warn clearly and keep working unencrypted only with user consent.

### Slice 7.2 — Make the audit log tamper-evident
- **Goal:** Prove the audit history was not changed.
- **Steps:**
  1. Add a "hash chain": each audit record includes a hash of the one before it.
  2. Add a "verify ledger" button that checks the chain.
- **Files:** `src/kg/commit.ts`, `src/types.ts`, `src/components/right/AuditLedger.tsx`.
- **Done when:** editing any past record breaks the chain and the verify button catches it.
- **Stays safe:** append-only rule stays; this only strengthens it.

### Slice 7.3 — Backup and restore
- **Goal:** Let users save and recover their whole workspace.
- **Steps:**
  1. Add "Export workspace" (graph + audit + settings) to a single encrypted file.
  2. Add "Import workspace" with a safety confirm.
- **Files:** new `src/lib/backup.ts`, `src-tauri` file commands, settings UI.
- **Done when:** you can export, wipe, import, and get your graph back.
- **Stays safe:** import asks before overwriting; never silent.

### Slice 7.4 — Export data in open formats
- **Goal:** Avoid lock-in and support reporting.
- **Steps:**
  1. Add export of nodes/edges to JSON and CSV, and the audit log to JSON/CSV.
- **Files:** `src/lib/backup.ts`, audit/store readers.
- **Done when:** users can export the graph and audit to standard files.
- **Stays safe:** export is read-only.

---

# PHASE 8 — Enterprise Identity & Governance

**Goal:** Support real organizations: sign-in, roles, separate workspaces, admin-set rules, and security log sharing.

### Slice 8.1 — Local accounts and sign-in
- **Goal:** Know who is using the app.
- **Steps:**
  1. Add local user accounts with a sign-in screen (offline-capable).
  2. Tie the audit "actor" to the signed-in user instead of the hardcoded "director."
- **Files:** new `src/auth/`, `src/state/AppState.tsx`, audit actor fields.
- **Done when:** the audit log shows the real user who made each change.
- **Stays safe:** a single-user offline mode still works with a default account.

### Slice 8.2 — Roles and permissions (RBAC)
- **Goal:** Give admins, editors, and viewers different powers.
- **Steps:**
  1. Define roles and what each can do (for example, only admins can change gates).
  2. Enforce roles in the gate, tool, and write paths.
- **Files:** `src/auth/roles.ts`, `src/lib/perms.ts`, `src/kg/commit.ts`, `src-tauri` gate command.
- **Done when:** a viewer cannot change the graph or the gates; an admin can.
- **Stays safe:** if no roles are set, default to a safe single-admin setup.

### Slice 8.3 — Separate workspaces
- **Goal:** Keep different projects or teams apart.
- **Steps:**
  1. Add a "workspace" label to graph data, audit, and settings.
  2. Let users switch workspaces; data never crosses between them.
- **Files:** `src/kg/store.ts`, `src/state/AppState.tsx`, workspace UI.
- **Done when:** two workspaces show fully separate graphs and logs.
- **Stays safe:** default workspace holds today's data after migration.

### Slice 8.4 — Single sign-on (SSO) option
- **Goal:** Let companies use their own login.
- **Steps:**
  1. Add optional OIDC/SAML sign-in for organizations.
  2. Map company groups to app roles.
- **Files:** `src/auth/sso.ts`, `src-tauri` callback handling.
- **Done when:** a test org can sign in with SSO and land in the right role.
- **Stays safe:** SSO is optional; local accounts still work offline.

### Slice 8.5 — Admin policy engine for gates
- **Goal:** Let an admin lock the security gates for everyone.
- **Steps:**
  1. Add a policy file/section where an admin sets gate rules users cannot loosen.
  2. Make the effective gates respect admin policy as the top limit.
- **Files:** `src/auth/policy.ts`, `src/lib/perms.ts`, `src-tauri` gate command.
- **Done when:** an admin can force the Network gate closed and users cannot open it.
- **Stays safe:** no policy means today's user-controlled behavior.

### Slice 8.6 — Send the audit log to SIEM
- **Goal:** Fit company security monitoring.
- **Steps:**
  1. Add optional forwarding of audit events to a syslog/HTTP SIEM endpoint.
  2. Keep it gated by Network and off by default.
- **Files:** new `src/lib/siem.ts`, settings UI.
- **Done when:** audit events appear in a test SIEM when turned on.
- **Stays safe:** off by default; closing Network stops forwarding.

---

# PHASE 9 — See Everything, Survive Anything

**Goal:** Add logging, metrics, crash reporting, and self-healing so the app is reliable and supportable.

### Slice 9.1 — Structured logging
- **Goal:** Make problems easy to trace.
- **Steps:**
  1. Add leveled, structured logs in Rust and the sidecar, written to rotating log files.
  2. Add a "view logs" link in settings.
- **Files:** `src-tauri/src/*`, `sidecar/agent_sidecar.py`, settings UI.
- **Done when:** actions produce clear, timestamped logs you can open.
- **Stays safe:** logs avoid secrets and personal data by default.

### Slice 9.2 — Health checks and a watchdog
- **Goal:** Notice trouble before the user does.
- **Steps:**
  1. Poll the sidecar `/health` on a timer; show a status light.
  2. If health fails, trigger the Phase 3 restart-with-backoff.
- **Files:** `src-tauri/src/sidecar.rs`, status UI.
- **Done when:** an unhealthy sidecar is detected and recovered automatically.
- **Stays safe:** if recovery fails, degrade to offline mode with a clear message.

### Slice 9.3 — Crash reporting (opt-in)
- **Goal:** Learn about crashes to fix them.
- **Steps:**
  1. Add opt-in crash reporting (for example, a minidump uploader) with user consent.
- **Files:** `src-tauri` crash handler, consent UI.
- **Done when:** a test crash creates a report only after the user opts in.
- **Stays safe:** off until the user agrees; never sends data silently.

### Slice 9.4 — Local metrics dashboard
- **Goal:** Show real numbers (replace the synthetic "VECTORS" figure).
- **Steps:**
  1. Track real counts: nodes, edges, chunks, embeddings, tool calls, tokens.
  2. Show them in the Telemetry panel.
- **Files:** `src/components/left/TelemetryConsole.tsx`, store readers.
- **Done when:** the panel shows true counts, not estimates.
- **Stays safe:** read-only display.

---

# PHASE 10 — Performance & Polish

**Goal:** Keep the app fast with big data, easy for everyone to use, and visually finished.

### Slice 10.1 — Handle large graphs smoothly
- **Goal:** Stay fast at thousands of nodes.
- **Steps:**
  1. Load graph data in pages; only render what is near the camera.
  2. Cache the 3D layout so it does not recompute every change.
- **Files:** `src/components/left/graph3d/*`, `src/kg/store.ts`.
- **Done when:** the app stays smooth (target 60 FPS) with a large test graph.
- **Stays safe:** small graphs behave exactly as before.

### Slice 10.2 — Accessibility pass (WCAG AA)
- **Goal:** Make the app usable with keyboard and screen readers.
- **Steps:**
  1. Add focus order, labels, contrast checks, and keyboard shortcuts.
- **Files:** across `src/components/**`.
- **Done when:** core flows work with keyboard only and pass a basic a11y audit.
- **Stays safe:** visual/interaction only.

### Slice 10.3 — Multiple languages (i18n)
- **Goal:** Support more than English.
- **Steps:**
  1. Move UI text into message files; add a language switch.
- **Files:** new `src/i18n/`, components.
- **Done when:** switching language changes the UI text.
- **Stays safe:** English is the default fallback.

### Slice 10.4 — Empty, loading, and error states
- **Goal:** Make every screen feel finished.
- **Steps:**
  1. Add clear empty/loading/error states for graph, chat, tools, and intake.
- **Files:** across `src/components/**`.
- **Done when:** no screen ever looks blank or stuck without explanation.
- **Stays safe:** display only.

### Slice 10.5 — Settings and theme polish
- **Goal:** One clear place for all settings.
- **Steps:**
  1. Build a full Settings screen (models, secrets, gates, workspace, logs, about).
  2. Tidy the theme and spacing for a finished look.
- **Files:** new `src/components/settings/`, `index.css`.
- **Done when:** all settings live in one organized place.
- **Stays safe:** display/settings only.

---

# PHASE 11 — Quality Gates

**Goal:** Make automated checks catch problems on every change.

### Slice 11.1 — Unit tests for the core
- **Goal:** Cover the risky logic.
- **Steps:**
  1. Add tests for commit/audit, retrieval (lexical, vector, hybrid), perms, pools, and the A2A parser.
- **Files:** `src/**/*.test.ts`.
- **Done when:** core logic has solid test coverage and `npm test` is green.
- **Stays safe:** tests only.

### Slice 11.2 — End-to-end tests
- **Goal:** Test the app the way a user uses it.
- **Steps:**
  1. Add WebDriver/Playwright tests for ingest → search → chat → tool → audit.
- **Files:** new `e2e/`.
- **Done when:** an automated run completes the main user journey.
- **Stays safe:** tests only.

### Slice 11.3 — Continuous integration (CI)
- **Goal:** Check every change automatically.
- **Steps:**
  1. Add a CI pipeline that runs lint, unit tests, Rust tests, and a build on each push.
- **Files:** new CI config (for example `.github/workflows/`).
- **Done when:** CI must pass before code can merge.
- **Stays safe:** CI only.

### Slice 11.4 — Dependency and code scanning
- **Goal:** Catch known security issues early.
- **Steps:**
  1. Add `npm audit`/`cargo audit` and a static scanner to CI.
  2. Generate an SBOM on each build.
- **Files:** CI config, build scripts.
- **Done when:** CI flags vulnerable packages and produces an SBOM.
- **Stays safe:** CI only.

---

# PHASE 12 — Ship It

**Goal:** Turn the project into a trusted, installable, self-updating product with docs.

### Slice 12.1 — Produce installers
- **Goal:** Make real install files.
- **Steps:**
  1. Run `npm run tauri build` and confirm it produces installers for Windows/macOS/Linux.
  2. Make sure the Python sidecar ships as a bundled resource.
- **Files:** `src-tauri/tauri.conf.json`, build scripts.
- **Done when:** you can install and launch the app from the built file.
- **Stays safe:** packaging only.

### Slice 12.2 — Code signing and notarization
- **Goal:** Stop "unknown publisher" warnings.
- **Steps:**
  1. Add Windows code signing and macOS signing + notarization to the build.
- **Files:** build/release config, secrets in CI.
- **Done when:** installers are signed and open without scary warnings.
- **Stays safe:** build only.

### Slice 12.3 — Auto-update
- **Goal:** Keep users on the latest safe version.
- **Steps:**
  1. Add the Tauri updater with signed update files and an in-app "update available" prompt.
- **Files:** `src-tauri` updater config, small UI.
- **Done when:** an older app finds and installs a newer signed version.
- **Stays safe:** updates are signed; a failed update never bricks the app.

### Slice 12.4 — First-run setup wizard
- **Goal:** Help new users get going.
- **Steps:**
  1. Add a short first-run flow: pick a model, sign in to Ollama (if wanted), set keys, set gates.
  2. Run the self-check and show the results.
- **Files:** new `src/components/onboarding/`.
- **Done when:** a brand-new user reaches a working chat in a few clear steps.
- **Stays safe:** every step can be skipped; defaults are safe and offline.

### Slice 12.5 — User and admin docs
- **Goal:** Make the product learnable.
- **Steps:**
  1. Write a user guide, an admin guide (roles, policy, SSO, SIEM), and a troubleshooting page.
- **Files:** `docs/` (new guides), in-app help links.
- **Done when:** a new user and a new admin can self-serve from the docs.
- **Stays safe:** docs only.

---

# PHASE 13 — Compliance & Hardening

**Goal:** Prove the app is secure and ready for serious, regulated use.

### Slice 13.1 — Write the threat model
- **Goal:** Know what we are defending against.
- **Steps:**
  1. Document trust boundaries (web page, Rust shell, sidecar, network) and the top risks and defenses.
- **Files:** `docs/security/threat-model.md`.
- **Done when:** the threat model is written and reviewed.
- **Stays safe:** docs only.

### Slice 13.2 — Outside security test (pen test)
- **Goal:** Find holes before attackers do.
- **Steps:**
  1. Have an outside tester probe the gates, the sidecar bridge, and update path; fix findings.
- **Files:** fixes across the app as needed.
- **Done when:** high/critical findings are fixed and re-tested.
- **Stays safe:** fixes only strengthen the app.

### Slice 13.3 — Data retention and privacy controls
- **Goal:** Respect privacy laws and company rules.
- **Steps:**
  1. Add retention settings (auto-delete old data), a "delete my data" action, and a privacy notice.
- **Files:** settings, store, audit.
- **Done when:** admins can set retention and users can delete their data.
- **Stays safe:** deletion is confirmed and audited.

### Slice 13.4 — Audit-readiness pack
- **Goal:** Be ready for SOC 2 / ISO-style reviews.
- **Steps:**
  1. Collect evidence: access logs, change history, build/SBOM records, and policy docs.
  2. Write the controls mapping.
- **Files:** `docs/compliance/`.
- **Done when:** there is a clear, organized evidence pack for auditors.
- **Stays safe:** docs/records only.

---

## What "enterprise-grade done" means (final checklist)

When all phases are complete, every box below is checked:

- **Secure:** gates cut the wire in Rust; secrets live in the OS keychain; data is encrypted at rest; the audit log is tamper-evident; an outside pen test passed; admins can lock policy.
- **Capable:** a real agent thinks and uses tools; search blends keywords and meaning; GraphRAG communities work; the agent can read the web safely; many tabs share a few real resources.
- **Model-flexible:** local models and Ollama cloud models both work (two ways), plus Gemini and OpenAI-style endpoints, with a live model picker.
- **Reliable:** the sidecar self-heals; health is watched; crashes are reported (opt-in); the app degrades gracefully offline.
- **Visible:** structured logs, real metrics, and a clear status everywhere.
- **Polished:** fast with large graphs, accessible, translatable, with finished empty/loading/error states and one settings home.
- **Trusted to install:** signed installers, auto-update, and a first-run wizard.
- **Provable:** full tests, CI, dependency scanning, an SBOM, a threat model, retention controls, and an audit-readiness pack.

---

## How to use this with a coding agent (one slice per turn)

For each work session, give the agent one slice and this rule set:

> "Do exactly one slice from `docs/BLUEPRINT.md`. Follow the steps. Keep the build green (`npm run lint`, `npm test`). Keep local-first working. Do not change the security gates' behavior except as the slice says. When finished, show me the 'Done when' check passing, then stop."

Work top to bottom. Finish Phase 0 and Phase 1 before anything else. After that, you can run UI slices (Phase 4 view work, Phase 10) alongside backend slices (Phase 3, Phase 4 storage) because they touch different parts. Always end each turn with a working app.
