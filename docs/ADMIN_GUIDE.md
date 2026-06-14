# CODE NAME — Administrator Guide

This guide covers running CODE NAME for a team or in a controlled environment:
accounts and roles, the policy ceiling, identity/SSO, secrets, audit integrity,
SIEM forwarding, logging, and the agent sidecar.

> Security model in one line: **the OS is the trust boundary.** CODE NAME is a
> local‑first desktop app — each install runs under an operating‑system user
> account. The in‑app roles and gates govern what the app *does*; they are not a
> substitute for OS‑level access control on the machine itself.

---

## 1. Accounts & roles (RBAC)

CODE NAME supports multiple local accounts. In single‑user mode a default **admin**
account is created automatically, so a fresh install opens straight into the
workspace with no sign‑in screen. Add accounts from the sign‑in screen ("+ Add
account"); each can have an optional PIN.

There are three roles:

| Role   | Write KG | Use tools | Toggle gates | Set policy | Configure SIEM | Manage workspaces |
|--------|:--------:|:---------:|:------------:|:----------:|:--------------:|:-----------------:|
| admin  | ✔        | ✔         | ✔            | ✔          | ✔              | ✔                 |
| editor | ✔        | ✔         | ✖            | ✖          | ✖              | ✔                 |
| viewer | ✖        | ✖         | ✖            | ✖          | ✖              | ✖                 |

Notes:
- A **viewer** is strictly read‑only: ingestion, tool calls, and graph writes are
  denied (and the denial is audited).
- When no role is configured (single‑user offline), guards default to **admin** so a
  solo user is never locked out.
- The PIN check is a convenience gate, not cryptographic protection — the real
  boundary is the OS user account.

---

## 2. Workspaces

Each workspace has its own isolated knowledge‑graph store (separate IndexedDB
database). Switching workspaces swaps the entire graph, vectors, and audit ledger.
Use separate workspaces to keep unrelated bodies of knowledge — or different
sensitivity levels — fully partitioned. Creating/switching/deleting workspaces
requires a non‑viewer role.

---

## 3. Security gates

Three hard capability switches apply to the whole app:

- **Filesystem** — local persistence + gated ingestion + graph writes.
- **Network** — outbound network access (cloud models, SIEM forwarding).
- **Tools** — WebMCP tool execution + agent‑sidecar bridge.

Gates are enforced in two places: in the UI **and**, in the desktop build, mirrored
into the Rust shell so they're applied at the process level — not just cosmetically.

**Per‑tab capabilities** can only *tighten*, never widen, the global gates. A task tab
may revoke a capability it doesn't need; it can never grant one the global gate denies.

---

## 4. The admin policy ceiling (gate locks)

An admin can force a gate **closed for every user** in the workspace. This is a
ceiling, resolved as:

```
policy ceiling  →  user‑set global gate  →  per‑tab cap  →  effective gate
```

- Setting a policy gate to **locked/false** forces it off regardless of user setting;
  the toggle is disabled with a lock indicator for everyone.
- Leaving it unlocked means users control that gate themselves.

Use this to, e.g., guarantee the app stays fully offline (lock **Network**) or to
forbid tool execution fleet‑wide (lock **Tools**). Policy is set by an admin in the
gates UI and persists locally per workspace.

---

## 5. Identity & SSO

**Current state.** Authentication is **local accounts** (admin/editor/viewer, optional
PIN), scoped to the machine. Because CODE NAME is a desktop, local‑first application,
identity is anchored to the OS user who launched it; there is no app‑hosted login
server.

**Single sign‑on (SSO / SAML / OIDC) is not yet implemented** and is on the roadmap.
For organizations that need centralized identity today, the recommended pattern is to
rely on the platform you already control:
- Provision machines via your MDM/identity provider so the **OS user** is the
  authenticated principal.
- Use **per‑user OS accounts** (and OS disk encryption) as the access boundary.
- Use the **admin policy ceiling** to enforce org‑wide capability limits, and **SIEM
  forwarding** (below) to centralize the audit trail.

When SSO lands it is expected to slot in behind the existing `AuthContext`/roles
surface so the role table above continues to apply.

---

## 6. Secrets (API keys)

Cloud endpoints read their keys from the **OS keychain** via the Rust shell — Windows
Credential Manager, macOS Keychain, or Linux Secret Service. Keys are never written to
config files or logs. Manage them under **Settings → Secrets**, or during the first‑run
wizard. Each cloud endpoint declares the key name it uses (e.g. `OLLAMA_API_KEY`,
`GEMINI_API_KEY`).

---

## 7. Audit ledger & tamper evidence

Every knowledge‑graph write — allowed or denied — produces an append‑only audit
record (actor, action, target, decision, optional diff/provenance, timestamp).
Records are linked into a **tamper‑evident hash chain**: each record stores the
SHA‑256 of the previous one.

- **Verify chain** (Audit Ledger → Verify) recomputes the chain and reports the first
  broken link, if any. An intact chain means no record was altered or removed.
- Denied writes are recorded too, so attempts are visible, not just successes.

---

## 8. SIEM forwarding

CODE NAME can forward each audit record to an external HTTP(S) endpoint for central
collection.

- **Off by default.** Configure it (URL + enable) under settings; an admin role is
  required.
- Records are POSTed as JSON with header `X-Codename-Source: audit`.
- Forwarding **respects the Network gate**: if Network is closed (by the user or by
  policy), nothing is sent.
- Delivery is fire‑and‑forget and best‑effort — failures are logged locally and never
  block the app.

Point the URL at your SIEM's HTTP collector (Splunk HEC, Elastic, a log shipper, etc.)
and you get a centralized, real‑time copy of the audit trail. Pair with the local
hash‑chain verification for end‑to‑end integrity.

---

## 9. Logging & crash reports

- **Structured logs** are written to the platform app‑log directory. Open it from
  **Settings → Logs**, or programmatically via the shell's log commands. The Python
  sidecar logs to the same directory (`CODENAME_LOG_DIR`).
- **Crash reporting** is **consent‑gated**: JS errors and crashes are only recorded
  after the user opts in. Reports stay local unless you choose to share them.

---

## 10. The agent sidecar

The optional Python agent sidecar is supervised by the Rust shell:
- Started on launch, with an **exponential‑backoff auto‑restart** if it exits.
- Spoken to over **loopback A2A** (token‑authenticated; the token never leaves Rust).
- Health‑checked periodically; three failed probes trigger a restart.
- Provides embeddings, GraphRAG community detection, a CDP browser harness, and
  isolated context pools.

It is bundled as an application resource. Running it requires **Python on the host**.
If the sidecar is unavailable the app degrades gracefully — local retrieval, the
synthetic model fallback, and the in‑memory paths keep working offline.

---

## 11. Hardening checklist

- [ ] Decide the offline posture: lock **Network** via policy if cloud must be off.
- [ ] Restrict **Tools** by role (viewers) or policy where tool execution isn't needed.
- [ ] Put each sensitivity level in its own **workspace**.
- [ ] Configure **SIEM forwarding** to a collector you control.
- [ ] Schedule periodic **Verify chain** checks of the audit ledger.
- [ ] Rely on **OS accounts + disk encryption** as the machine boundary.
- [ ] Keep the app updated (signed installers / auto‑update once enabled).
