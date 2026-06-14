# WebMCP — integration note

- **What it is:** a browser API **proposal** (webmachinelearning) exposing in-page
  functions/forms as agent "tools" via `document.modelContext`. NOT a shipping API.
- **API shape:**
  - `document.modelContext.registerTool({ name, description, inputSchema (JSON schema), async execute(args) -> { content:[{type:'text',text}] } }, { signal })` — `AbortController.abort()` to unregister.
  - Discovery/run: `modelContext.getTools()` / `executeTool()` (spec TBD).
  - Iframe delegation via Permissions-Policy `allow="tools"`; cross-origin via `exposedTo`.
- **Role in CODE NAME:** the frontend (webview) publishes gated tools the model can call.
- **⚠ Major risk / decision:** the native API will not exist in Tauri's WebView2 /
  WKWebView today. **We implement a shim** that mirrors the `document.modelContext`
  surface (or adopt a community polyfill: MCP-B / mcp-b.ai, MiguelsPizza/WebMCP),
  and bridge tool calls to our gate layer. Build against the *shape*, not the platform.
- **Gate rule:** every `execute` must pass through the capability gates + audit
  before doing anything (per the right-pane ownership map).
- **Offline:** fully local (in-page); no network requirement.

## DECISION (locked)
We ship a small **shim** that implements the `document.modelContext` shape
(`registerTool`/`getTools`/`executeTool`) with an in-memory tool registry, and
route every `execute()` through our capability gates + audit. Build to the WebMCP
*shape*, isolated behind our own adapter, so a native API (or a community
polyfill) can swap in later with minimal change. Low effort, and we own the
security boundary. (Phase 4.)
