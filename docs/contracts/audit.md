# Contract — Gated KG-write audit (P0.3, LOCKED)

**Goal:** every knowledge-graph mutation is permission-checked and recorded in an
append-only ledger. Makes the self-growing brain trustworthy and reversible.

## One chokepoint
- All node/edge writes (create/update/delete/link/unlink) go through a single
  function. No component mutates the KG directly.

## Record (`AuditRecord` in `src/types.ts`)
`{ id, ts, actor{kind,id,taskId?,sessionId?}, action, target{kind,id},
   before?, after?, diff?, decision{allowed,gate?,reason?}, provenance? }`

- **actor** — user / agent / system, with originating tab + session.
- **decision** — allow/deny and which gate decided (denied writes are still logged).
- **before/after** — snapshot or content hash; **diff** is the human-readable summary.
- **provenance** — source doc / ingestion id (ties writes back to ingestion).

## Reuse (don't rebuild)
- Extends the existing per-node `history[]` into a **global** ledger.
- Surfaced in Phase 6 by reusing the existing **Ledger Audit** panel.

## Rule
- Append-only. Records are never mutated or deleted — corrections are new records.
