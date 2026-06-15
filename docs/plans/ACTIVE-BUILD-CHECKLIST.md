# CODE NAME 2 Active Build Checklist

## Current Build Rule

Every approved slice must produce visible product behavior.

A slice is not complete unless it includes:

- [ ] User-visible feature
- [ ] Clear UI path
- [ ] Backend test coverage
- [ ] Frontend/typecheck verification
- [ ] Manual verification steps
- [ ] Commit hash
- [ ] "How to see it working" notes

---

## Completed Foundation

- [x] Phase 0 - Stabilization
  - Commit: `a0eedd7`
  - Result: repo baseline, docs cleanup, Windows-safe clean script

- [x] Phase 1.1 - Rust Policy Core
  - Commit: `e3fcf6eea099c5c7ebe9121d99a30496bf766416`
  - Result: Rust command policy registry and tests

- [x] Phase 1.2 - Rust-Effective Gate State
  - Commit: `f4767d0432538929862496e729831c9d2838115c`
  - Result: Rust owns effective runtime gate state

- [x] Phase 1.3 - Remove Raw Secret Reads
  - Commit: `a16865e71c917daeba40ce64c9d77345c2ad6f3c`
  - Result: frontend can no longer read raw secrets

- [x] Phase 1.4 - Provider Classification and Network Gate
  - Commit: `e2aba98dba6465035f6b642a1b7d9ebc6482810b`
  - Result: Rust blocks cloud-capable model paths when Network is closed

---

## Active Product Milestone

# Milestone 1 - SQLite Knowledge Base MVP

Goal: make CODE NAME 2 store, search, and display real local knowledge from SQLite.

Definition of done:

- [x] Rust-owned SQLite database exists
- [x] database lives in app-local data directory
- [x] schema migrations exist
- [x] `documents` table exists
- [x] `chunks` table exists
- [x] `entities` table exists
- [x] `relationships` table exists
- [x] `chunk_entities` table exists
- [x] `retrieval_events` table exists
- [x] text ingestion writes to SQLite
- [x] deterministic chunking works
- [x] SQLite search returns matching chunks
- [x] UI shows live document count
- [x] UI shows live chunk count
- [x] UI shows live entity count
- [x] UI shows live relationship count
- [x] UI has visible KB search or search-result path
- [x] manual verification steps are documented
- [x] `cargo test --all-features --locked` passes
- [x] `npm run lint` passes
- [x] `npm test` passes or known sandbox `spawn EPERM` is elevated-rerun verified
- [x] commit created

Target commit:

`feat: add sqlite knowledge base foundation`

---

## Next Slice

## Phase 2A - SQLite Knowledge Base Foundation

Status: COMPLETED

Required visible result:

ingest text -> SQLite stores documents/chunks -> search finds chunks -> UI shows live KB stats

No more security-only slices until this is complete.

---

## Product Roadmap

### Milestone 1 - SQLite Knowledge Base MVP

- [x] Durable SQLite KB
- [x] text ingestion
- [x] chunk storage
- [x] search
- [x] live stats UI

### Milestone 2 - Retrieval MVP

- [ ] query SQLite chunks
- [ ] rank search results
- [ ] show source snippets
- [ ] connect retrieval results to chat context

### Milestone 3 - Chat With Knowledge Base

- [ ] user asks a question
- [ ] app retrieves relevant chunks
- [ ] model receives retrieved context
- [ ] answer shows source snippets
- [ ] works with local model route or synthetic fallback

### Milestone 4 - Knowledge Graph Extraction

- [ ] extract entities from ingested text
- [ ] store entities in SQLite
- [ ] store relationships in SQLite
- [ ] show entities/relationships in graph UI
- [ ] link graph nodes back to chunks/documents

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

## Deferred Until After SQLite KB MVP

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

Commit: `feat: add sqlite knowledge base foundation` (exact hash recorded in final owner-review response)

What changed in the app:

- Added Rust-owned SQLite storage in the app-local data directory.
- Added versioned schema migration for documents, chunks, entities, relationships, chunk_entities, retrieval_events, and optional FTS5 chunk search.
- Dual-wired existing file/OCR text ingestion into SQLite while preserving IndexedDB graph compatibility.
- Added live SQLite KB stats and SQLite chunk search results to the left-side UI.

How I verified it:

- `cargo test --all-features --locked`
- `npm run lint`
- `npm test` hit known sandbox `Error: spawn EPERM`
- Elevated `npm test`
- Required SQLite/IndexedDB and GraphRAG/embedding search checks

Manual verification steps:

1. Run the desktop app.
2. Drop a `.txt` or `.md` file onto the left pane.
3. Confirm the Archive Index `SQLite KB` panel shows initialized `v1`.
4. Confirm document and chunk counts increase.
5. Type a word from the ingested file into the Graph Search field and press Enter.
6. Confirm `SQLite KB chunks` results appear under the search field and in the Archive Index result area.

What works now:

- Text ingestion writes documents and deterministic chunks to Rust-owned SQLite.
- Search reads matching chunks from SQLite and records retrieval events.
- The UI shows live document, chunk, entity, relationship, and retrieval counts.
- IndexedDB graph storage remains available as transitional compatibility.

What still does not work:

- This is not full GraphRAG.
- Real embeddings are not implemented.
- Entity and relationship extraction are schema-ready but not populated by this slice.

Decision:

- [ ] Accepted
- [ ] Needs fixes
- [ ] Rejected
