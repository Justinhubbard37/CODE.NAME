# CODE NAME 2 Administrator Guide

This guide covers the current administrative surface for CODE NAME 2: local
accounts and roles, workspaces, capability gates, secrets, audit visibility,
SIEM forwarding, logging, and the agent sidecar.

> Current-state note: CODE NAME 2 is an early-alpha local desktop app. Some
> controls are implemented, but several backend enforcement and secret-isolation
> boundaries are still planned hardening work.

## 1. Accounts And Roles

CODE NAME 2 supports multiple local accounts. In single-user mode a default
admin account is created automatically. Add accounts from the sign-in screen;
each can have an optional PIN.

| Role | Write KG | Use tools | Toggle gates | Set policy | Configure SIEM | Manage workspaces |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| admin | yes | yes | yes | yes | yes | yes |
| editor | yes | yes | no | no | no | yes |
| viewer | no | no | no | no | no | no |

Notes:

- A viewer is intended to be read-only.
- When no role is configured in single-user offline mode, guards default to admin
  so a solo user is not locked out.
- The PIN check is a convenience gate, not cryptographic protection. The real
  local boundary is the OS user account and machine controls.

## 2. Workspaces

Each workspace has its own local IndexedDB-backed graph/search state. Switching
workspaces swaps the active graph, retrieval scaffolds, and audit ledger.
Workspace operations require a non-viewer role.

Workspace persistence is useful for local isolation, but it is not a production
database or encrypted multi-user storage layer.

## 3. Capability Gates

Three capability switches apply to the app:

- **Filesystem:** local persistence and ingestion.
- **Network:** outbound network access.
- **Tools:** local tool execution and the sidecar bridge.

Current reality: gates are implemented in the UI and partially mirrored into the
Rust shell, but backend-owned enforcement is not complete for every command. Do
not treat the current gates as a finished hard security boundary until the later
hardening work adds full Rust-side policy coverage and tests.

Per-tab capabilities can only tighten the visible effective permissions; they
must not be treated as a complete backend authorization model yet.

## 4. Admin Policy Ceiling

An admin can force a gate closed for a workspace. The intended resolution order is:

```text
policy ceiling -> user-set global gate -> per-tab cap -> effective gate
```

Use this to express local policy intent, such as keeping Network closed or
forbidding tool execution. Full backend enforcement of every path remains a
hardening requirement.

## 5. Identity And SSO

Current state: authentication is local accounts with optional PINs, scoped to the
machine. CODE NAME 2 does not currently implement SSO, SAML, OIDC, or a hosted
identity server.

Organizations that need centralized identity today should rely on managed OS
accounts, MDM, disk encryption, and local policy controls. SSO is roadmap work,
not a current feature.

## 6. Secrets

Cloud endpoint keys use the OS keychain path through the Rust shell. Keys are not
intended to live in config files or logs.

Important current limitation: the source currently exposes a frontend-accessible
`secret_get` command path. That means docs must not claim that secrets never reach
the frontend. Production-grade secret isolation requires a later redesign where
the frontend can set/delete/check key presence, while provider calls that need
secret values execute in a trusted backend boundary.

## 7. Audit Ledger And Tamper Evidence

Knowledge-graph writes are recorded in a local audit ledger, and the UI exposes
hash-chain verification. This is useful for local review.

Current limitation: the master audit identified audit-integrity and denial
coverage gaps that must be fixed before production use. Treat the current ledger
as a prototype audit trail, not a compliance-grade evidence system.

## 8. SIEM Forwarding

CODE NAME 2 can forward audit records to an external HTTP(S) endpoint when
configured.

- Off by default.
- Requires an admin role to configure.
- Intended to respect the Network gate.
- Best effort: failures are logged locally and should not block the app.

Because Network gate enforcement is still being hardened, SIEM behavior should be
verified again after the backend gate matrix is complete.

## 9. Logging And Crash Reports

Structured logs are written to the platform app-log directory. The Python sidecar
uses the same log directory when launched by the shell. Crash reporting is local
and consent-gated.

Logs should avoid secrets and sensitive prompt bodies. This should be verified
again during the later security hardening phase.

## 10. Agent Sidecar

The optional Python sidecar is supervised by the Rust shell:

- It binds to loopback.
- It uses a per-launch token read and retained by Rust.
- Rust forwards sidecar calls with the bearer token.
- It exposes A2A-shaped routes and local fallback behavior.

Current sidecar capabilities include useful scaffolding for model calls,
embeddings, community detection, browser-harness work, and pools. These are not
all production-complete. Embeddings currently have stub/fallback behavior, durable
GraphRAG is not complete, and browser automation still needs policy hardening.

## 11. Hardening Checklist

- [ ] Restore and maintain a clean Git baseline.
- [ ] Keep generated artifacts out of source control.
- [ ] Lock Network where offline posture is required.
- [ ] Restrict Tools by role and policy where tool execution is not needed.
- [ ] Remove frontend raw-secret return paths.
- [ ] Add Rust-side gate enforcement for every privileged command.
- [ ] Add Rust tests for denied sidecar/browser/secret paths.
- [ ] Verify audit hash-chain and denial coverage.
- [ ] Recheck docs before making production, compliance, or release claims.
