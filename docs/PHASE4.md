# Phase 4 — The Real Knowledge Ecosystem

**Status:** ✅ Complete (Slices 4.1–4.5). Slice 4.6 (SQLite) deferred.

---

## Slices delivered

| Slice | Title | Status |
|-------|-------|--------|
| 4.1 | Embedding step at intake | ✅ |
| 4.2 | Vector store + VectorRetriever | ✅ |
| 4.3 | Hybrid retriever (BM25 + vector RRF) | ✅ |
| 4.4 | Real GraphRAG communities | ✅ |
| 4.5 | 4th LOD cluster tier in 3D view | ✅ |
| 4.6 | SQLite storage backend | ⏸ Deferred |

---

## Slice 4.1 — Embedding step at intake

**What changed:**
- `sidecar/agent_sidecar.py` — `/a2a/embed` POST endpoint accepting `{text}` or `{texts:[]}`. Returns `{embedding:[]}` or `{embeddings:[[]]}`. Uses `_stub_embed()`: character-bigram hash → 128-dim L2-normalised vector.
- `src-tauri/src/sidecar.rs` — `sidecar_embed` Tauri command: POSTs texts to `/a2a/embed`, returns `Vec<Vec<f64>>`.
- `src-tauri/src/lib.rs` — registered `sidecar_embed` in `invoke_handler`.
- `src/lib/sidecar.ts` — `sidecarEmbed(texts)` async helper; returns `number[][]`.
- `src/kg/store.ts` — `putVectors()` method (writes to `vectors` store).
- `src/state/AppState.tsx` — after `createDocNode()` commits, fires `sidecarEmbed` then `kgStore.putVectors()` (fire-and-forget). Falls back to local `stubEmbed` when sidecar unavailable.

**Decision:** stub-bigram fallback is synchronous and zero-dep, so ingestion never blocks on sidecar availability.

---

## Slice 4.2 — Vector store + VectorRetriever

**What changed:**
- `src/kg/store.ts` — `DB_VERSION` bumped 1 → 2. `onupgradeneeded` creates `chunks` (with `nodeId` index) and `vectors` object stores. Added `VectorRecord`, `ChunkRecord` types and `getVector()`, `getAllVectors()`, `putVectors()`, `putChunks()` methods.
- `src/kg/vector.ts` (new) — `stubEmbed(text)`: character-bigram hash, 128-dim, L2-normalised. `cosineSim(a,b)`: dot product of pre-normalised vectors. `VectorRetriever`: indexes nodes via `stubEmbed(nodeText(n))`, retrieves top-k by cosine similarity (threshold 0.01).

**Decision:** 128-dim keeps IndexedDB entries small (~1 KB each) while providing meaningful separation for KG retrieval. `stubEmbed` is deterministic across JS runtimes.

---

## Slice 4.3 — Hybrid retriever (BM25 + vector, RRF blend)

**What changed:**
- `src/kg/retrieve.ts` — Added `HybridRetriever` class: fuses `LexicalRetriever` (BM25) and `VectorRetriever` (cosine) via **Reciprocal Rank Fusion** (`k=60`). Updated exported `retriever` singleton to `new HybridRetriever()`.
- `src/state/AppState.tsx` — `graph.search` execute handler made `async` (no functional change, prepares for future sidecar-embed query rewriting).

**RRF formula:** `score(d) = Σ 1/(60 + rank_i(d))` across both ranking lists. Standard k=60 suppresses outlier effects from top-heavy BM25 distributions.

---

## Slice 4.4 — Real GraphRAG communities

**What changed:**
- `src/types.ts` — Added `communityId?: string` and `communitySummary?: string` to `NodeData`.
- `src/kg/communities.ts` — Rewrote `detectCommunities()`: if any node has `communityId` set (from sidecar), maps all nodes using that field. Otherwise runs **label propagation** (up to 15 iterations, hash-deterministic shuffle, tie-break by lexicographic min).
- `sidecar/agent_sidecar.py` — `/a2a/communities` POST: builds adjacency from `{nodes,edges}`, runs `_label_propagation()`, calls LLM via `_summarize_community()` per group (falls back gracefully if ADK unavailable). Returns `{communities:[{id,memberIds,summary}]}`.
- `src-tauri/src/sidecar.rs` — `sidecar_communities` Tauri command: POSTs to `/a2a/communities`, returns `serde_json::Value`.
- `src-tauri/src/lib.rs` — registered `sidecar_communities`.
- `src/lib/sidecar.ts` — `sidecarCommunities(nodes,edges)` typed helper.
- `src/state/AppState.tsx` — after ingest loop completes, fires `sidecarCommunities()` and patches `communityId`/`communitySummary` onto each node via `updateNodeData`.

---

## Slice 4.5 — 4th LOD cluster tier in 3D view

**What changed:**
- `src/components/left/graph3d/layout.ts` — `layout3D()` return type extended to `Layout3DResult`: adds `centroids: Map<number, Vec3>` (geometric mean of member positions) and `communitySizes: Map<number, number>`.
- `src/components/left/graph3d/Node3D.tsx` — Added 4th `Tier` value `'cluster'`. `Node3D` accepts `clusterMode?: boolean`; when true (and node not selected), `useFrame` sets tier to `'cluster'` and renders `null`. Added `ClusterNode3D` component: amber wireframe sphere + `Html` label, calls `onExpand(commIdx)` on click.
- `src/components/left/graph3d/Graph3D.tsx` — Added `CameraMonitor` (reads `camera.position.length()` each frame, fires `onChange` on threshold cross). When camera distance > 80 units AND a community exceeds `lod.clusterWhenCommunityGt` members AND that community hasn't been expanded, `Node3D` receives `clusterMode=true` and a `ClusterNode3D` is rendered at the centroid. Expanding a cluster adds its index to `expandedClusters` state.

**LOD ladder (4 tiers):**
```
card   ← px >= fullCardMinPx  (full readable card with all fields)
label  ← px >= labelMinPx     (name-only label pill)
dot    ← px < labelMinPx      (small grey sphere)
cluster← community > threshold AND camera far (amber cluster orb)
```

---

## Key architectural decisions

| Decision | Rationale |
|----------|-----------|
| `stubEmbed` mirrors Python `_stub_embed` exactly | Same bigram-hash algorithm in both runtimes → embeddings are comparable across the bridge |
| Fire-and-forget embed at intake | Ingestion latency unaffected; vectors appear in IndexedDB asynchronously |
| RRF k=60 (standard constant) | Empirically stable; suppresses BM25 top-skew without requiring calibration data |
| Sidecar communities fire after full ingest loop | Batches one LLM call per community rather than one per file |
| `expandedClusters` Set in React state | Expansion is per-session ephemeral; no need to persist across restarts |
| `CameraMonitor` reads camera per-frame | Avoids polling; threshold cross fires exactly once via ref comparison |

---

## Exit criteria

- [x] `npm run lint` (tsc --noEmit) passes with zero errors
- [x] `DB_VERSION` bumped; `chunks` + `vectors` stores added with correct keyPaths/indexes
- [x] `HybridRetriever` exported as `retriever` singleton
- [x] `communityId` / `communitySummary` on `NodeData` type
- [x] `/a2a/embed` and `/a2a/communities` on sidecar; stub fallbacks for no-ADK case
- [x] `sidecar_embed` + `sidecar_communities` Tauri commands registered
- [x] 4th LOD tier renders cluster spheres; clicking expands
- [x] Slice 4.6 (SQLite) explicitly deferred — no Cargo dependency added
