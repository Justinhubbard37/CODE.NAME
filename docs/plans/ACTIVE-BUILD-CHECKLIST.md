## Active Product Milestone

# Milestone 2 - Knowledge Graph Linker MVP

Goal: make ingested SQLite documents and chunks create connected graph structure.

Definition of done:

- [ ] SQLite documents project into graph document nodes
- [ ] SQLite chunks project into graph chunk nodes
- [ ] document -> chunk edges exist
- [ ] deterministic entity extraction runs on chunk text
- [ ] extracted entities are stored in SQLite
- [ ] chunk -> entity edges exist
- [ ] document -> entity edges exist
- [ ] entity -> entity co-occurrence edges exist when entities appear in the same chunk
- [ ] graph UI shows connected document/chunk/entity structure
- [ ] clicking or searching shows why nodes are connected
- [ ] tests prove graph projection/linking works
- [ ] manual verification steps are documented
- [ ] commit created

Target commit:

`feat: link sqlite knowledge into graph`

---

## Next Slice

## Phase 2B - Knowledge Graph Linker MVP

Status: READY TO EXECUTE

Required visible result:

ingest text -> SQLite stores documents/chunks -> deterministic entities are extracted -> graph shows connected document/chunk/entity nodes

No more backend-only slices until graph linking is visible.

---

## Product Roadmap

### Milestone 1 - SQLite Knowledge Base MVP

- [x] Durable SQLite KB
- [x] text ingestion
- [x] chunk storage
- [x] search
- [x] live stats UI

### Milestone 2 - Knowledge Graph Linker MVP

- [ ] project SQLite documents into graph nodes
- [ ] project SQLite chunks into graph nodes
- [ ] create document -> chunk edges
- [ ] extract deterministic entities from chunk text
- [ ] store entities in SQLite
- [ ] create chunk -> entity edges
- [ ] create entity co-occurrence edges
- [ ] show connected graph structure in UI

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