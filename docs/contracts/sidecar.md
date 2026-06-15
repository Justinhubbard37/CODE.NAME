# Contract - Sidecar Bind And Auth

**Goal:** the Tauri shell supervises access to the Python agent sidecar.

## Current Bind

- The sidecar binds to `127.0.0.1` only.
- The port is OS-assigned and ephemeral.
- No fixed port is hard-coded.

## Current Handshake

1. The Rust supervisor spawns the sidecar.
2. The sidecar mints a per-launch random token and binds its port.
3. The sidecar prints a single JSON line on stdout matching the handshake shape
   used by the Rust sidecar supervisor.
4. Rust reads that line, stores the host/port/token in shell state, and does not
   intentionally expose the bearer token to frontend state.

## Current Auth Boundary

- Rust forwards loopback sidecar calls with `Authorization: Bearer <token>`.
- The sidecar rejects requests without the exact token.
- Frontend code should call the Rust commands rather than carrying the sidecar
  bearer token itself.

This updates older notes that said every TypeScript A2A call carries the token.
That is stale for the current app path.

## Known Phase 0 Limitation

Token containment is only one part of the trust boundary. The master audit still
identifies missing backend gate coverage on some sidecar/browser/pool commands.
Full command-policy enforcement and Rust tests are deferred to later security
hardening work.

## Defense In Depth Target

- Loopback-only bind.
- Per-launch token.
- Token retained by Rust.
- Frontend receives capability and status information, not raw sidecar secrets.
- Network and Tools gates enforced by Rust for every privileged sidecar path.
