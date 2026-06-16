## Active Product Milestone

# Milestone 5 - Retrieval MVP

Goal: query SQLite chunks, show source snippets, and optionally attach retrieved local context to chat.

Status: IMPLEMENTED - OWNER MANUAL VERIFICATION REQUIRED

Definition of done:

- [x] query SQLite chunks
- [x] rank local KB search results
- [x] show source snippets and chunk labels
- [x] show active retrieved context near chat
- [x] allow clearing retrieved context
- [x] optionally attach retrieved chunks to chat context
- [x] preserve deleted-document exclusion
- [x] keep retrieval local-first without embeddings or GraphRAG
- [x] tests cover retrieval helpers/wrappers and local search limit
- [x] manual verification steps are documented
- [x] commit created
- [ ] owner manual verification accepted

Target commit:

`feat: add retrieval mvp context panel` (exact hash reported in final response)

---

## Next Slice

## Phase 2F - Chat With Knowledge Base

Status: READY AFTER PHASE 2E OWNER REVIEW

Required visible result:

user asks a question -> app retrieves relevant chunks -> model receives retrieved context -> answer shows source snippets

Do not start full Chat With KB polish until Retrieval MVP owner verification passes.

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

### Milestone 3 - Knowledge Base Document Manager

Status: ACCEPTED

- [x] list SQLite KB documents in UI
- [x] soft-delete KB documents by default
- [x] exclude deleted documents from search
- [x] exclude deleted documents from graph projection
- [x] clean projected graph nodes/edges after deletion
- [x] preserve IndexedDB and audit history

### Milestone 4 - Stable Graph Layout and Orphan Cleanup

Status: ACCEPTED AFTER CORRECTION

- [x] deterministic clustered KB document layout
- [x] preserve existing node positions during normal projection updates
- [x] preserve active KB node positions after delete
- [x] keep re-cluster/recenter behavior manual through Stabilize
- [x] remove stale KB-projected orphan nodes and edges
- [x] keep unrelated graph nodes intact
- [x] add manual graph stabilize control

### Milestone 5 - Retrieval MVP

- [x] query SQLite chunks
- [x] rank search results
- [x] show source snippets
- [x] explicitly attach retrieval results to chat context

### Milestone 6 - Chat With Knowledge Base

- [ ] user asks a question
- [ ] app retrieves relevant chunks
- [ ] model receives retrieved context
- [ ] answer shows source snippets
- [ ] works with local model route or synthetic fallback

### Milestone 7 - Real GraphRAG

- [ ] combine text retrieval with graph traversal
- [ ] retrieve chunks by document relevance
- [ ] retrieve related entities/relationships
- [ ] generate grounded answers from both
- [ ] show source evidence

### Milestone 8 - Product Polish

- [ ] improve ingestion UX
- [ ] improve KB search UX
- [ ] graph readability polish: edge-density filtering, long-edge reduction, focus mode, selected-document view, and improved cluster spacing
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

- [x] Accepted
- [ ] Needs fixes
- [ ] Rejected

### Slice: Phase 2C - Knowledge Base Document Manager

Date: 2026-06-16

Commit: `feat: add knowledge base document manager` (exact hash reported in final response)

What changed in the app:

- Added active SQLite KB document listing.
- Added safe soft-delete for KB documents.
- Added deleted-document count to KB stats.
- Excluded soft-deleted documents from SQLite search and graph projection.
- Added a visible remove action in the SQLite KB panel.
- Reconciled projected graph nodes and edges after deletion while preserving unrelated graph records.

How to verify it:

1. Launch the app with `npm run desktop`.
2. Ingest a test text file.
3. Confirm it appears in the SQLite KB document list.
4. Search for a term from the file.
5. Confirm a SQLite KB chunk result appears.
6. Click the remove button for that document and confirm the action.
7. Confirm active document count decreases or deleted count increases.
8. Search the same term and confirm that file no longer appears.
9. Confirm projected graph nodes and edges for that file disappear.
10. Confirm unrelated graph nodes remain.

What works now:

- Users can see active SQLite KB documents in the app.
- Users can soft-delete a KB document without physically purging chunks, entities, relationships, or audit history.
- Deleted documents are excluded from search and graph projection.
- Visible graph projection is cleaned after deletion.
- IndexedDB graph compatibility remains in place.

What still does not work:

- This is not the Retrieval MVP.
- Chat with KB is not implemented.
- Full GraphRAG is not implemented.
- Real embeddings are not implemented.
- Hard purge and restore flows are intentionally deferred.

Decision:

- [x] Accepted
- [ ] Needs fixes
- [ ] Rejected

Status:

- Accepted after owner verification of the Phase 2D persistent layout correction.

### Slice: Phase 2D - Stable Graph Layout and Orphan Cleanup

Date: 2026-06-16

Commit: `fix: stabilize knowledge graph layout` (exact hash reported in final response)

What changed in the app:

- Added deterministic clustered/spiderweb positions for SQLite KB document projections.
- Kept existing projected node positions during normal ingestion updates.
- Re-clustered active KB projections after delete and manual stabilize.
- Cleaned stale SQLite-projected orphan nodes and edges during projection reconciliation.
- Added a visible graph `Stabilize` control.
- Added a thin-layout guard so line-like coordinate sets render with deterministic lateral spread.

How to verify it:

1. Launch the app with `npm run desktop`.
2. Ingest `kb-linker-test.txt`.
3. Ingest `kb-delete-test.txt`.
4. Confirm both appear in the KB document list.
5. Confirm graph shows readable connected clusters.
6. Delete `kb-delete-test.txt`.
7. Confirm its document disappears from the KB list.
8. Confirm its graph cluster disappears.
9. Confirm the `kb-linker-test.txt` graph cluster remains.
10. Confirm graph does not collapse into a line.
11. Confirm search for the deleted document term returns nothing.
12. Confirm search for the remaining document term still works.

What works now:

- KB document, chunk, and entity nodes are positioned as stable clusters.
- Deleting one KB document removes only that projected cluster.
- Remaining KB clusters keep or regain readable layout.
- Unrelated non-KB graph nodes remain intact.
- Stale SQLite-projected orphan nodes are cleaned during active projection reconciliation.

What still does not work:

- This is not the Retrieval MVP.
- Chat with KB is not implemented.
- Full GraphRAG is not implemented.
- Real embeddings are not implemented.
- Owner manual verification failed after the original Phase 2D attempt because normal file drops globally restructured the graph.

Decision:

- [ ] Accepted
- [ ] Needs fixes
- [ ] Rejected

Status:

- Original manual verification failed.
- Correction slice required before Phase 2D can be accepted.

### Slice: Phase 2D Correction - Persistent Graph Layout Stability

Date: 2026-06-16

Commit: `50efab6 fix: preserve graph layout during kb updates`

What changed in the app:

- Added an append-only projection merge for document-scoped SQLite KB projections.
- Prevented partial document projections from cleaning unrelated KB clusters.
- Preserved stored graph node positions during normal KB ingest and delete.
- Preserved rendered 3D coordinates for retained node IDs across normal graph updates.
- Kept graph re-cluster/recenter behavior manual through the Stabilize button.

How to verify it:

1. Launch the app with `npm run desktop`.
2. Ingest `kb-2d-keep.txt`.
3. Confirm a readable keep cluster appears.
4. Ingest `kb-2d-delete.txt`.
5. Confirm a second cluster appears without dramatically moving the keep cluster.
6. Delete `kb-2d-delete.txt` from the KB document list.
7. Confirm only the delete cluster disappears.
8. Confirm the keep cluster remains in roughly the same position.
9. Search `DeleteTerm2DStable` or `DeleteClusterAlpha` and confirm deleted content does not appear.
10. Search `KeepTerm2DStable` or `KeepClusterAlpha` and confirm remaining content still appears.
11. Confirm the graph does not collapse into a line.
12. Click Stabilize manually and confirm any reclustering is intentional.

What works now:

- Normal KB ingest appends new document clusters without sweeping existing KB clusters.
- Normal KB delete removes stale projected nodes and edges while preserving retained positions.
- The 3D layout keeps a stable render origin across normal append/delete updates.
- Stabilize remains an explicit manual action.
- Functional delete/search verification passed.
- Deleted KB documents are removed from KB Documents.
- Deleted search terms no longer return SQLite KB results.
- Remaining KB documents still return SQLite KB results.
- The graph no longer collapses into the previous broken vertical/line structure after delete.

What still does not work:

- Graph is functionally stable but still visually noisy.
- Graph readability polish is deferred to product polish and does not block Retrieval MVP.
- This is not the Retrieval MVP.
- Chat with KB is not implemented.
- Full GraphRAG is not implemented.
- Real embeddings are not implemented.

Decision:

- [x] Accepted
- [ ] Needs fixes
- [ ] Rejected

Status:

- Accepted by owner manual verification.

### Slice: Phase 2E - Retrieval MVP

Date: 2026-06-16

Commit: `feat: add retrieval mvp context panel` (exact hash reported in final response)

What changed in the app:

- Made SQLite KB retrieval explicit in the graph/KB query surface.
- Added source-labelled retrieved chunk previews with rank, chunk number, score, and snippet.
- Added a right-pane Local KB context panel near chat.
- Added a visible clear action and explicit Attach KB context ON/OFF control.
- Kept retrieved context detached by default after search.
- Attached only the currently visible retrieved chunks to chat requests when explicitly enabled.
- Prevented hidden auto-retrieval or silent KB context injection on chat send.
- Kept retrieval local-first through existing `kb_search`.

How to verify it:

1. Create `%USERPROFILE%\Desktop\phase-2e-retrieval-mvp-smoke.txt` with this exact content:

```text
Phase 2E retrieval smoke test.

RetrievalMvpUniqueTerm4821 appears in this document so SQLite KB retrieval can find it.
The CODE NAME 2 local-first knowledge base should return this chunk as grounded context.
The answer should identify this file as the source and should not require embeddings, GraphRAG, or cloud services.
KeepAliveRetrievalTerm7359 remains available until the document is removed from the KB.
```

2. Launch the app with `npm run desktop`.
3. Drop `phase-2e-retrieval-mvp-smoke.txt` into the app.
4. Confirm the KB document count increases and the document appears in `KB Documents`.
5. Search/query `RetrievalMvpUniqueTerm4821`.
6. Confirm retrieved results show `phase-2e-retrieval-mvp-smoke.txt`, chunk number, snippet, and source label.
7. Confirm the right-pane Local KB context panel shows the same result.
8. Confirm KB context is not silently attached unless the user explicitly enables it.
9. Enable/attach KB context.
10. Ask in chat: `What document mentions RetrievalMvpUniqueTerm4821?`
11. Confirm the UI clearly indicates KB context is attached.
12. Confirm the answer can use the retrieved chunk.
13. Disable/detach KB context.
14. Ask another message and confirm no KB context is attached.
15. Delete `phase-2e-retrieval-mvp-smoke.txt` from the KB Documents list.
16. Search/query `RetrievalMvpUniqueTerm4821` again and confirm no SQLite KB result appears.
17. Search/query `KeepAliveRetrievalTerm7359` again and confirm no result appears after deletion.
18. Cleanup Desktop file with `Remove-Item -LiteralPath "$env:USERPROFILE\Desktop\phase-2e-retrieval-mvp-smoke.txt" -ErrorAction SilentlyContinue`.
19. Confirm the app-side KB test document was removed.

What works now:

- SQLite KB retrieval returns local chunks with visible sources.
- Retrieved context can be cleared or explicitly attached to chat.
- Attached chat context is capped and source-labelled.
- Chat does not auto-retrieve hidden KB context on send.
- Deleted documents remain excluded by local SQLite search and frontend context cleanup.
- Retrieval events continue to be recorded through existing `kb_search`.

What still does not work:

- This is not full Chat With KB polish.
- This is not full GraphRAG.
- Real embeddings are not implemented.
- Graph traversal retrieval is not implemented.
- Formal answer citation rendering is deferred.

Decision:

- [ ] Accepted
- [ ] Needs fixes
- [ ] Rejected

Status:

- Ready for owner review.
