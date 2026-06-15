## Active Product Milestone

# Milestone 2 - Knowledge Graph Linker MVP

Goal: make ingested SQLite documents and chunks create connected graph structure.

Definition of done:

- [x] SQLite documents project into graph document nodes
- [x] SQLite chunks project into graph chunk nodes
- [x] document -> chunk edges exist
- [x] deterministic entity extraction runs on chunk text
- [x] extracted entities are stored in SQLite
- [x] chunk -> entity edges exist
- [x] document -> entity edges exist
- [x] entity -> entity co-occurrence edges exist when entities appear in the same chunk
- [x] graph UI shows connected document/chunk/entity structure
- [x] clicking or searching shows why nodes are connected
- [x] tests prove graph projection/linking works
- [x] manual verification steps are documented
- [x] commit created

Target commit:

`feat: link sqlite knowledge into graph`

---

## Next Slice

## Phase 2C - Retrieval MVP

Status: READY AFTER PHASE 2B OWNER REVIEW

Required visible result:

query SQLite chunks -> rank local results -> show source snippets -> feed retrieved context into chat

Do not start Chat With KB until retrieval source evidence works.

---

## Product Roadmap

### Milestone 1 - SQLite Knowledge Base MVP

- [x] Durable SQLite KB
- [x] text ingestion
- [x] chunk storage
- [x] search
- [x] live stats UI

### Milestone 2 - Knowledge Graph Linker MVP

- [x] project SQLite documents into graph nodes
- [x] project SQLite chunks into graph nodes
- [x] create document -> chunk edges
- [x] extract deterministic entities from chunk text
- [x] store entities in SQLite
- [x] create chunk -> entity edges
- [x] create entity co-occurrence edges
- [x] show connected graph structure in UI

### Milestone 3 - Retrieval MVP

- [ ] query SQLite chunks
- [ ] rank search results
- [ ] show source snippets
- [ ] connect retrieval results to chat context

### Milestone 4 - Chat With Knowledge Base

- [ ] user asks a question
- [ ] app retrieves relevant chunks
- [ ] model receives retrieved context
- [ ] answer shows source snippets
- [ ] works with local model route or synthetic fallback

### Milestone 5 - Real GraphRAG

- [ ] combine text retrieval with graph traversal
- [ ] retrieve chunks by document relevance
- [ ] retrieve related entities/relationships
- [ ] generate grounded answers from both
- [ ] show source evidence

### Milestone 6 - Product Polish

- [ ] improve ingestion UX
- [ ] improve KB search UX
- [ ] improve chat-with-sources UX
- [ ] add backup/export/import
- [ ] package for release

---

## Deferred Until After Graph Linker MVP

- [ ] Sidecar command gate enforcement
- [ ] Browser harness lockdown
- [ ] Audit hash canonicalization
- [ ] Full GraphRAG
- [ ] Real embeddings
- [ ] SSO
- [ ] Compliance packaging
- [ ] Release hardening

---

## Manual Verification Log

Use this section after every completed slice.

### Slice: Phase 2A - SQLite Knowledge Base Foundation

Date: 2026-06-15

Commit: `fa5c8a351256453d0bb65d6bf41bbb8724ac61de`

What changed in the app:

- Added Rust-owned SQLite storage in the app-local data directory.
- Added versioned schema migration for documents, chunks, entities, relationships, chunk_entities, retrieval_events, and optional FTS5 chunk search.
- Dual-wired existing file/OCR text ingestion into SQLite while preserving IndexedDB graph compatibility.
- Added live SQLite KB stats and SQLite chunk search results to the left-side UI.

How I verified it:

- Dropped `kb-smoke-test.txt` into the app.
- Confirmed SQLite KB showed initialized `v1`.
- Confirmed document count increased to `1`.
- Confirmed chunk count increased to `1`.
- Searched `UniqueSearchTerm7391`.
- Confirmed SQLite KB chunk result appeared in the UI.
- Confirmed DB file exists at `C:\Users\justi\AppData\Roaming\com.codename.harness\knowledge-base.sqlite3`.
- Confirmed DB file size was `118,784` bytes.
- `cargo test --all-features --locked` passed in Codex.
- `npm run lint` passed in Codex.
- Elevated `npm test` passed in Codex after known sandbox `Error: spawn EPERM`.

What works now:

- Text ingestion writes documents and deterministic chunks to Rust-owned SQLite.
- Search reads matching chunks from SQLite and records retrieval events.
- The UI shows live document, chunk, entity, relationship, and retrieval counts.
- IndexedDB graph storage remains available as transitional compatibility.

What still does not work:

- This is not full GraphRAG.
- Real embeddings are not implemented.
- Entity extraction is not implemented yet.
- Relationship extraction is not implemented yet.
- Ingested graph nodes can still appear disconnected until Phase 2B adds graph linking.

Decision:

- [x] Accepted
- [ ] Needs fixes
- [ ] Rejected

### Slice: Phase 2B - Knowledge Graph Linker MVP

Date: 2026-06-15

Commit: `feat: link sqlite knowledge into graph` (exact hash reported in final response)

What changed in the app:

- Added deterministic offline entity extraction during SQLite text ingestion.
- Stored extracted entities in SQLite `entities`.
- Stored chunk/entity links in SQLite `chunk_entities`.
- Stored entity/entity co-occurrence links in SQLite `relationships`.
- Added a SQLite graph projection command that returns document, chunk, entity, and edge records.
- Wired successful file ingestion to project SQLite documents/chunks/entities into the visible graph.
- Rendered SQLite KB graph links as distinct green edges and exposed source/extract context on graph node cards.

How to verify it:

1. Launch the app with `npm run desktop`.
2. Drop a text file containing repeated terms, capitalized phrases, and identifiers.
3. Confirm SQLite KB document and chunk counts increase.
4. Confirm entity count increases.
5. Confirm relationship count increases.
6. Confirm the graph shows a document node connected to chunk node(s).
7. Confirm chunk node(s) connect to extracted entity nodes.
8. Confirm entity nodes have co-occurrence edges when multiple entities appear in the same chunk.
9. Search for a term from the file and confirm SQLite KB chunk results still appear.

What works now:

- Ingested SQLite documents no longer project only as disconnected file artifacts.
- Documents, chunks, entities, and relationships are persisted in SQLite.
- The existing graph store receives connected SQLite projection nodes and edges for rendering.
- Search still reads SQLite chunks and records retrieval events.
- IndexedDB remains as transitional graph compatibility.

What still does not work:

- This is not full GraphRAG.
- Real embeddings are not implemented.
- AI/entity extraction is not implemented.
- Retrieval results are not yet injected into chat context.
- Graph traversal retrieval is still a future slice.

Decision:

- [ ] Accepted
- [ ] Needs fixes
- [ ] Rejected
