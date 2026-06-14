# Browser Harness — integration note

- **What it is:** a thin (~1k LOC / 4 files) **CDP** harness — one websocket to a
  real Chrome. The agent writes missing helper code during execution; the harness
  "improves itself every run" (self-generated `agent_helpers.py` + domain skills).
- **Role in CODE NAME:** gives tab agents self-healing web-task capability.
- **Setup reality:**
  - Connects to a **real external Chrome** via remote debugging
    (`chrome://inspect/#remote-debugging`), **Chrome 144+** shows a per-attach
    "Allow" popup. This is **not** the Tauri webview.
  - Python; clone the repo. `BH_DOMAIN_SKILLS=1` enables per-site playbooks
    (`agent-workspace/domain-skills/`, surfaced by domain on `goto_url`).
  - Core package `src/browser_harness/` is protected; `agent-workspace/` is where
    the agent edits.
- **Pooling (Phase 5):** shared supervised browser pool, isolated contexts/profiles
  per tab — never one Chrome per tab.
- **⚠ Risks:**
  - **Runtime code generation:** the harness writes/edits Python at runtime. Must
    run inside the sandboxed sidecar under the **tools + fs gates**; treat its
    self-written files as untrusted and auditable.
  - Requires a user-installed Chrome + manual remote-debugging allow — first-run UX.
  - Optional Browser Use Cloud (3 free concurrent) is a **network** path — off by
    default to honor local-first.
- **Offline:** local CDP automation works offline against local Chrome; cloud is opt-in.
