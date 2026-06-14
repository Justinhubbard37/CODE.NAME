# Phase 8 — Enterprise Identity & Governance

Implemented slices: **8.1, 8.2, 8.3, 8.5, 8.6**
Deferred slice: **8.4** (SSO / OIDC / SAML — see rationale below)

---

## Architecture

### Slice 8.1 — Local Accounts + Sign-in

`src/auth/` is a new directory that owns all authentication concerns.

| File | Purpose |
|---|---|
| `src/auth/types.ts` | `LocalUser` interface + `Role` type (`admin \| editor \| viewer`) |
| `src/auth/accountStore.ts` | localStorage CRUD (`codename:accounts:v1`, `codename:active-user`) |
| `src/auth/AuthContext.tsx` | React context; `useAuth()` hook; auto-creates a default admin on first launch |
| `src/auth/SignInScreen.tsx` | Account picker with optional PIN; "Add account" flow |

**Single-user offline mode** is transparent: `ensureDefaultAccount()` creates a
`{ name: 'Local User', role: 'admin' }` account and signs into it automatically,
so the sign-in screen never appears for a fresh single-user install.

**Audit actor wiring:** `AppState.tsx` calls `useAuth()` and threads
`currentUser?.id ?? 'local'` into every `AuditActor` that was previously
hardcoded as `'director'`.

**App.tsx** now wraps the tree: `<AuthProvider> → <AppShell>` renders either
`<SignInScreen>` or `<AppStateProvider><Shell /></AppStateProvider>` depending
on `currentUser` presence.

---

### Slice 8.2 — RBAC

`src/auth/roles.ts` — capability helpers:

```
canWrite(role)           → editor + admin only
canToggleGates(role)     → admin only
canUseTool(role)         → editor + admin only
canManageWorkspaces(role)→ editor + admin only
canConfigureSiem(role)   → admin only
canSetPolicy(role)       → admin only
```

All helpers default to `admin` level when `role` is `undefined`, so single-user
mode is never accidentally locked out.

**Enforcement points:**
- `commit()` in AppState: viewer returns early with `'KG write denied — viewer role'`
- `toggleGate()` in AppState: returns early for non-admin
- `setToolGuard` callback: checks `canUseTool(role)` before gate check
- `SecurityGates.tsx`: toggles visually disabled for non-admin; amber warning banner shown

---

### Slice 8.3 — Separate Workspaces

`src/auth/workspace.ts` — workspace CRUD and persistence:

```
localStorage: codename:workspaces:v1   → Workspace[]
localStorage: codename:active-workspace → workspace id
```

**DB naming:**
- Legacy "Default" workspace → `codename-kg` (no data migration needed)
- New workspaces → `codename-kg:<uuid>`

`store.ts` exports `initWorkspaceStore(dbName)` which updates the mutable
`_dbName` module variable and resets the IDB connection if the name changes.
`AppState.tsx` calls `initWorkspaceStore(getActiveWorkspace().dbName)` at the
top of the component body (synchronous, before any IDB access).

**Switching workspaces** calls `switchWorkspace(id)` then
`window.location.reload()` — the next load starts with a fresh IDB connection
to the new workspace's database.

`StealthDrawer.tsx` has a new **Workspaces** section above the gate controls:
workspace list with active indicator, switch-on-click, create, delete
(cannot delete active workspace), and a sign-out button.

---

### Slice 8.5 — Admin Policy Engine

`src/auth/policy.ts`:

```typescript
interface AdminPolicy {
  filesystem?: boolean; // false = gate locked closed
  network?:    boolean;
  tools?:      boolean;
}

applyPolicy(policy, userGates): SecurityGates
isGateLocked(policy, key): boolean
```

**Three-layer resolution:**

```
policy ceiling  →  user-set gate  →  per-tab cap  →  effective gate
(policy.k ?? true) && userGate[k] && caps[k]
```

`perms.ts` → `effectiveGates(global, caps, policy?)` now accepts an optional
`AdminPolicy` third argument. Existing two-arg call-sites continue to work
(policy defaults to `undefined` = no lock).

`AppState.tsx` stores `adminPolicy` in state (loaded from
`codename:admin-policy:v1`). `gatesRef.current` is always set to
`applyPolicy(adminPolicy, gates)` so every enforcement path gets the
ceiling-applied value. The context exposes `applyPolicy(adminPolicy, gates)`
as `gates` so all consumers (including SecurityGates) see the effective state.

`SecurityGates.tsx` renders a small 🔒 button beside each gate row:
- **Amber** — gate is policy-locked closed; non-admin sees it as read-only
- **Dim** — no policy lock; admin can click to lock
- Admin clicking the lock icon calls `togglePolicyLock(key)` which persists and
  updates `adminPolicy` state immediately

---

### Slice 8.6 — SIEM Audit Forwarding

`src/lib/siem.ts` — injection-pattern forwarder:

```typescript
configureSiem(config: SiemConfig | null, isNetworkOpen: () => boolean): void
forwardToSiem(record: AuditRecord): void
```

`SiemConfig` = `{ url: string; enabled: boolean }` persisted at
`codename:siem:v1`.

`KnowledgeStore.appendAudit()` calls `forwardToSiem(toStore)` as a
fire-and-forget side-effect after each audit write.  `forwardToSiem` checks
`_isNetworkOpen()` before attempting the fetch — no traffic when the Network
gate is closed.

`AppState.tsx` startup calls `configureSiem(loadSiemConfig(), () => gatesRef.current.network)`.
`setSiemConfig()` action re-calls `configureSiem` immediately so the live
forwarder picks up changes without a reload.

`StealthDrawer.tsx` **SIEM Forwarding** section (admin-only):
- URL text input
- Save & Enable / Disable buttons
- Active/Off status indicator

---

## Deferred: Slice 8.4 — SSO (OIDC / SAML)

**Status: deferred, not blocked by any other Phase 8 work.**

SSO requires infrastructure unavailable in the current codebase:

1. **Tauri v2 custom URL scheme** — the OAuth/OIDC `redirect_uri` must be
   intercepted by the Rust shell.  This requires entries in `tauri.conf.json`
   under `app.macOSPrivateApi` / `allowlist.protocol` and a new Rust event
   handler in `src-tauri/src/main.rs`.

2. **OIDC client library** — no OIDC or OAuth library is currently in
   `package.json`.  `@openid/appauth` or `oidc-client-ts` (+ token storage)
   would need to be added.

3. **SAML** — requires XML parsing and IdP metadata processing not feasible
   without a library (e.g., `node-saml`).

Local accounts (Slice 8.1) remain fully functional as the fallback; the spec
explicitly states "SSO is optional; local accounts still work offline."  A
future Slice 8.4 implementation should stub `src/auth/sso.ts` and add Tauri
protocol handler scaffolding before wiring the actual OIDC flow.

---

## File Change Table

| File | Status | Notes |
|---|---|---|
| `src/auth/types.ts` | **new** | `LocalUser`, `Role` |
| `src/auth/accountStore.ts` | **new** | localStorage account CRUD |
| `src/auth/AuthContext.tsx` | **new** | React context + auto-default user |
| `src/auth/SignInScreen.tsx` | **new** | Sign-in / create-account UI |
| `src/auth/roles.ts` | **new** | RBAC capability helpers |
| `src/auth/workspace.ts` | **new** | Workspace CRUD, DB naming |
| `src/auth/policy.ts` | **new** | AdminPolicy type, `applyPolicy`, `isGateLocked` |
| `src/lib/siem.ts` | **new** | SIEM forwarder with injection pattern |
| `src/App.tsx` | modified | AuthProvider + AppShell wrapper |
| `src/state/AppState.tsx` | modified | Auth, RBAC guards, workspace init, policy, SIEM |
| `src/lib/perms.ts` | modified | Optional `policy` param in `effectiveGates` |
| `src/kg/store.ts` | modified | `initWorkspaceStore`, `forwardToSiem` hook |
| `src/components/config/SecurityGates.tsx` | modified | RBAC disable + policy lock toggles |
| `src/components/config/StealthDrawer.tsx` | modified | Workspace switcher + SIEM config sections |
