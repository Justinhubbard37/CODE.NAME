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

- [ ] Rust-owned SQLite database exists
- [ ] database lives in app-local data directory
- [ ] schema migrations exist
- [ ] `documents` table exists
- [ ] `chunks` table exists
- [ ] `entities` table exists
- [ ] `relationships` table exists
- [ ] `chunk_entities` table exists
- [ ] `retrieval_events` table exists
- [ ] text ingestion writes to SQLite
- [ ] deterministic chunking works
- [ ] SQLite search returns matching chunks
- [ ] UI shows live document count
- [ ] UI shows live chunk count
- [ ] UI shows live entity count
- [ ] UI shows live relationship count
- [ ] UI has visible KB search or search-result path
- [ ] manual verification steps are documented
- [ ] `cargo test --all-features --locked` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes or known sandbox `spawn EPERM` is elevated-rerun verified
- [ ] commit created

Target commit:

`feat: add sqlite knowledge base foundation`

---

## Next Slice

## Phase 2A - SQLite Knowledge Base Foundation

Status: READY TO EXECUTE

Required visible result:

ingest text -> SQLite stores documents/chunks -> search finds chunks -> UI shows live KB stats

No more security-only slices until this is complete.

---

## Product Roadmap

### Milestone 1 - SQLite Knowledge Base MVP

- [ ] Durable SQLite KB
- [ ] text ingestion
- [ ] chunk storage
- [ ] search
- [ ] live stats UI

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

### Slice:

Date:

Commit:

What changed in the app:

How I verified it:

What works now:

What still does not work:

Decision:

- [ ] Accepted
- [ ] Needs fixes
- [ ] Rejected