# ADK Python — integration note

- **Install:** `pip install google-adk` (optional: `google-adk[extensions]`). Python **3.11+**.
- **Version:** ADK **2.0** (breaking changes from 1.x — use 2.0 docs only). ~bi-weekly releases.
- **Role:** the agent runtime / orchestration brain inside our Python sidecar.
- **API we need:**
  - `from google.adk import Agent` — `Agent(name, model="gemini-2.5-flash"|local, instruction=...)`.
  - `from google.adk import Workflow` — graph execution: `Workflow(name, edges=[("START", a, b)])`; supports routing, fan-out/in, loops, retry, state, human-in-the-loop, nested workflows.
  - **Task API** — structured agent-to-agent delegation (multi-turn + single-turn), pairs with A2A.
  - Local run: `adk run path/to/agent` (CLI), `adk web path/to/agents_dir` (debug UI). We will host programmatically, not via `adk web`.
- **Offline/local-first:** runs as a local process; the network dependency is the model. Point `model` at a local engine (Ollama/LM Studio) to stay local-first; cloud secondary.
- **Docs:** google.github.io/adk-docs · Samples: github.com/google/adk-samples
- **Risk:** 2.0 session schema differs from 1.x; pin the major version.
