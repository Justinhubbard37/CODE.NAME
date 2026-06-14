# A2A (protocol + Python SDK + JS SDK) — integration note

## Protocol
- **Transport:** JSON-RPC 2.0 over HTTP(S); also HTTP+JSON/REST and gRPC.
- **Discovery:** "Agent Cards" at `/.well-known/agent-card.json` (capabilities, URL, skills).
- **Interaction:** sync request/response, **SSE streaming**, async push notifications (webhooks).
- **Spec:** v1.0 (v0.3 widely supported). Linux Foundation / Apache 2.0.
- **Role:** the wire between our agents and between Tauri-TS <-> the ADK sidecar.

## Python SDK (sidecar side)
- **Install:** `pip install a2a-sdk` (Python **3.10+**); extras: `[http-server]` (FastAPI/Starlette), `[grpc]`, `[sql]`, `[encryption]`.
- **Spec:** implements **1.0**, compat mode for 0.3.
- **Use:** expose the ADK agent as an A2A server on `127.0.0.1:<ephemeral>`.

## JS SDK (our TS/Tauri side — the client we use)
- **Install:** `npm i @a2a-js/sdk` (**0.3** stable; `@a2a-js/sdk@next` = 1.0 alpha).
- **Client:** `const c = await new ClientFactory().createFromUrl('http://127.0.0.1:PORT')`.
  - `c.sendMessage({ message:{ messageId, role:'user', parts:[{kind:'text',text}], kind:'message' }})`.
  - `c.sendMessageStream(params)` → **AsyncGenerator** of `task` / `status-update` / `artifact-update` events (SSE) — maps directly onto our streaming chat + activity feed.
  - Per-call `{ signal: AbortSignal.timeout(ms) }` — reuse for our STOP/abort.
  - **`CallInterceptor` / `createAuthenticatingFetchWithRetry`** → inject our per-launch bearer token (P0.2 auth contract) as a header on every call. This is the hook for sidecar auth.
- **Server (optional, TS):** `AgentExecutor` + `DefaultRequestHandler` + Express handlers, if we ever run a TS-side agent.
- **Offline/local-first:** pure localhost HTTP; loopback-friendly by construction.
- **Decision needed:** align spec version across Python (1.0) and JS (0.3 stable vs 1.0 alpha). Default to 0.3 on both for stability now.
