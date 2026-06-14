# Phase 0 — Closeout & Decisions

_2026-06-06 · all exit criteria met. tsc clean off-mount._

## Delivered
- **Repo spike** -> `docs/integration-notes/` (one note per seam + index).
- **Sidecar bind/auth contract** -> `docs/contracts/sidecar.md` + `SidecarHandshake`/`SidecarStatus` types.
- **Gated KG-write audit schema** -> `docs/contracts/audit.md` + `AuditRecord` & friends.
- **Tunable config** -> `src/config/system.ts` (`SystemConfig`: LOD, pools, sidecar).

## Decisions locked this phase
1. **Sidecar:** 127.0.0.1 + OS-ephemeral port; per-launch bearer token via stdout
   handshake; TS injects it through the A2A JS SDK interceptor; gates enforce at
   the Rust supervisor.
2. **Audit:** single chokepoint, append-only `AuditRecord`, extends per-node
   `history[]`, surfaced later via the existing Ledger Audit panel.
3. **Config defaults:** LOD 140/40 px + community>24 cluster; pools 4 browser
   contexts / 3 agents / 5-min idle evict; sidecar warm-start.

## New findings that change later phases
- **WebMCP is not a shipping browser API.** We will implement/adopt a
  `document.modelContext` **shim** (community polyfill or our own) and bridge tool
  calls to the gate layer. Affects Phase 4 — build to the *shape*, not the platform.
- **A2A spec split:** Python SDK = 1.0, JS SDK stable = 0.3 (1.0 = alpha).
  **Decision:** target **spec 0.3 on both sides** for now (Python runs 0.3 compat),
  revisit 1.0 when the JS SDK stabilizes. Affects Phases 3-4.
- **Browser Harness** needs an external Chrome (remote debugging, Chrome 144+) and
  **writes its own code at runtime** -> must run inside the sandboxed sidecar under
  the tools+fs gates; first-run UX needs a Chrome-connect step. Affects Phase 5.
- **ADK 2.0** breaking vs 1.x -> pin 2.x.

## Carry-over to keep verifying
- Local-first: keep ADK pointed at a local model; cloud secondary.
- Align the A2A spec version before Phase 3 wiring.

## Exit criteria — met
- Integration notes written + versions observed/pinned. ✅
- Sidecar handshake + audit schema typed and documented. ✅
- Config object in place; project typechecks. ✅

**Next:** Phase 1 — persistent KG + Vector + GraphRAG, with all writes routed
through the audited chokepoint.
