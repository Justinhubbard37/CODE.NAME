# Phase 1 — Closeout & Decisions

_2026-06-06 · tsc clean + vite build green (1918 modules)._

## Delivered
- **Persistent KG store** -> `src/kg/store.ts` (`KnowledgeStore`, IndexedDB +
  in-memory fallback; nodes/edges/audit). Survives restarts; swappable for a
  Tauri-SQLite backend later behind the same interface.
- **Gated + audited write chokepoint** -> `src/kg/commit.ts`
  (`evaluateKgWrite`, `makeAudit`) + the `commit()` path in `AppState`.
  All node creates/updates/deletes and edge links flow through it; every write
  (allowed or denied) appends an `AuditRecord`.
- **Real local retrieval** -> `src/kg/retrieve.ts` (`LexicalRetriever`, BM25-lite)
  now backs the GraphRAG query bar, replacing the substring filter.
- **Community detection** -> `src/kg/communities.ts` (connected-components
  placeholder for the 3D cluster LOD tier).
- **Hydration** -> `AppState` loads the graph from the store on boot and seeds it
  on first run.

## Decisions locked
1. **Persistence backend:** IndexedDB now (works in webview + browser dev, zero
   native deps), behind `KnowledgeStore` so Tauri-SQLite can replace it later.
2. **KG writes are governed by the filesystem gate** (local persistence). Closing
   it denies + audits writes rather than silently dropping them.
3. **Retrieval interface is stable; implementation is swappable.** Lexical now;
   vector + GraphRAG communities arrive with the Phase 3 sidecar.

## Deferred to Phase 3 (correctly)
- Real embeddings / vector search and GraphRAG's community hierarchy (Python
  sidecar). Phase 1 ships the interfaces + a working local stand-in.
- Node-position persistence on drag (view state) — nodes persist their position
  at commit time; transient drags are not yet written.

## Exit criteria — met
- Ingest -> persisted KG (survives reload). ✅
- Query bar returns real retrieval results. ✅
- Every KG write produces an audit record at one chokepoint. ✅
- Project typechecks and builds. ✅

**Next:** Phase 2 (3D graph, R3F) — can run in parallel with Phase 3 (sidecar).
