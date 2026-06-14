# A2UI — integration note

- **What it is:** an open format ("agents speak UI") — agents emit declarative
  **JSON** describing UI *intent*; the client renders it with its own **trusted
  component catalog**. "Safe like data, expressive like code."
- **Status:** **v0.8 public preview** — evolving, expect changes.
- **Architecture:** Generation (agent emits A2UI JSON) → Transport (**A2A** or AG-UI)
  → Resolution (our **A2UI Renderer** parses JSON) → Rendering (map abstract
  component types to our React components).
- **Role in CODE NAME:** lets agents render UI into the right pane — **subordinate
  to the native UI**, which stays final authority (ownership map).
- **For our stack (React):** use the AG-UI / CopilotKit React renderer, or port the
  Lit renderer. Flutter path (GenUI SDK) is N/A.
- **Security:** declarative only; agent can render **only** components in our
  pre-approved catalog. We define the catalog = the security boundary. Custom
  "Smart Wrapper" registry can sandbox/iframe untrusted content.
- **Offline:** rendering is local once the JSON payload arrives; no network needed.
- **Risk:** pre-1.0 spec churn — isolate the renderer behind our own adapter.
