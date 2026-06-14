# Integration Notes — repo spike (Phase 0)

_Confirmed against live repos · 2026-06-06. Pin exact versions at install time;
this is the API surface we actually need, plus offline behavior and risks._

| Seam | Package / install | Observed version | Talks to us via |
| --- | --- | --- | --- |
| ADK Python | `pip install google-adk` (Py 3.11+) | ADK **2.0** | runs inside the sidecar |
| A2A protocol | spec | **v1.0** (0.3 compat) | JSON-RPC 2.0 over HTTP |
| A2A Python SDK | `pip install a2a-sdk` (Py 3.10+) | spec **1.0** | sidecar A2A server |
| A2A JS SDK | `npm i @a2a-js/sdk` | **0.3** stable / 1.0 alpha (`@next`) | **TS side A2A client** |
| WebMCP | browser API proposal | spec draft | `document.modelContext` (⚠ see note) |
| A2UI | format + renderers | **v0.8** preview | JSON UI over A2A/AG-UI |
| Browser Harness | clone repo (Python, CDP) | rolling | CDP websocket to Chrome |

## Cross-cutting risks found (act on these)

1. **WebMCP is not a shipping browser API yet.** It's a draft `document.modelContext`
   proposal (Microsoft/Google). It will **not** exist natively in Tauri's webview
   (WebView2 / WKWebView) today. We must ship a **polyfill/shim** (community impls
   exist: MCP-B / MiguelsPizza/WebMCP) or implement the `registerTool` surface
   ourselves. Treat WebMCP as "our shim implementing the WebMCP shape," not a
   platform feature. Decoupling now avoids a dead end in Phase 4.
2. **A2A JS SDK is v0.3 stable; v1.0 is alpha.** The Python SDK is on spec 1.0.
   Pick one spec version across both sides. Recommended: ride **0.3 on both** for
   stability now (Python SDK runs in 0.3 compat mode), or commit to 1.0 alpha on
   JS if we need 1.0 features. Decide before wiring Phase 3/4.
3. **Browser Harness needs a real external Chrome** with remote debugging (CDP,
   Chrome 144+ per-attach "Allow" popup) — it is **not** the Tauri webview. And it
   **writes its own Python helper/skill files at runtime** ("self-improving"). That
   aligns with our self-growing theme but is also **arbitrary code generation** —
   it MUST run under the tools + fs gates and inside the sandboxed sidecar.
4. **ADK 2.0 has breaking changes from 1.x** — pin 2.x and follow 2.0 docs only.
5. **Local-first:** the protocols themselves are loopback-friendly (all HTTP/CDP
   on localhost). The real network dependency is the **model backend** — keep ADK
   pointed at a local model (Ollama/LM Studio via LiteLLM-style routing) to honor
   local-first; cloud stays secondary.
