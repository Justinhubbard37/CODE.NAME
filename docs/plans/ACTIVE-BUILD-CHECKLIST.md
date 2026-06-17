## Active Product Milestone

# Phase 2G - Hybrid Retrieval + Grounded Context Selection

Goal: combine real lexical SQLite KB retrieval with real local Ollama semantic
SQLite KB retrieval, deduplicate overlapping chunks, show transparent match
reasons and scores, and let the user select which chunks may enter chat context.

Status: ACCEPTED

Definition of done:

- [x] add `Hybrid` retrieval mode beside Lexical and Semantic
- [x] add backend `kb_hybrid_search`
- [x] run lexical and semantic retrieval as real subcomponents
- [x] embed the hybrid query once through local loopback Ollama
- [x] deduplicate hybrid results by `chunk.id`
- [x] preserve raw `lexicalScore` and `semanticScore`
- [x] compute `combinedScore` with Reciprocal Rank Fusion
- [x] show `matchKind`: `lexical`, `semantic`, or `both`
- [x] fail closed when semantic index is unavailable, stale, empty, or not ready
- [x] preserve Lexical and Semantic mode behavior
- [x] add selected-context controls
- [x] keep Attach OFF by default after retrieval
- [x] attach only selected visible chunks when Attach is ON
- [x] remove deleted documents from retrieval and selected context
- [x] document that this is Hybrid SQLite KB retrieval, not GraphRAG
- [x] owner manual verification accepted

Target commit:

`feat: add hybrid kb retrieval selection`

---

## Next Slice

## Owner Review - Phase 2G

Status: ACCEPTED AFTER OWNER MANUAL VERIFICATION

Required visible result:

user searches in Hybrid mode -> app retrieves and deduplicates lexical plus
semantic chunks -> user selects chunks -> Attach ON sends only selected chunks to
chat.

Phase 2G is accepted after owner manual verification.

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

### Milestone 6 - Real Local Embeddings + Vector Retrieval Foundation

- [x] store chunk embeddings in Rust-owned SQLite
- [x] use local loopback Ollama embeddings
- [x] reject non-loopback embedding URLs
- [x] validate embedding vectors
- [x] build or refresh semantic index manually
- [x] run semantic KB retrieval
- [x] show semantic index status in UI
- [x] keep lexical retrieval available
- [x] preserve explicit attach/detach behavior
- [x] exclude deleted documents from semantic retrieval

### Milestone 7 - Chat With Knowledge Base

- [ ] user asks a question
- [ ] app retrieves relevant chunks
- [ ] model receives retrieved context
- [ ] answer shows source snippets
- [ ] works with local model route or synthetic fallback

### Milestone 8 - Real GraphRAG

- [ ] combine text retrieval with graph traversal
- [ ] retrieve chunks by document relevance
- [ ] retrieve related entities/relationships
- [ ] generate grounded answers from both
- [ ] show source evidence

### Milestone 9 - Product Polish

- [ ] improve ingestion UX
- [ ] improve KB search UX
- [ ] graph readability polish: edge-density filtering, long-edge reduction, focus mode, selected-document view, and improved cluster spacing
- [ ] retrieval polish: citations in generated answers, selected-context controls, and better source cards
- [ ] improve chat-with-sources UX
- [ ] add backup/export/import
- [ ] package for release

---

## Deferred Until After Graph Linker MVP

- [ ] Sidecar command gate enforcement
- [ ] Browser harness lockdown
- [ ] Audit hash canonicalization
- [ ] Full GraphRAG
- [ ] Graph traversal retrieval
- [ ] External vector DB integration
- [ ] Cloud embeddings
- [ ] Model auto-pull/download
- [x] Real local SQLite KB embeddings
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

---

### Slice: Phase 2G - Hybrid Retrieval + Grounded Context Selection

Date: 2026-06-17

Commit: `a5717b9 feat: add hybrid kb retrieval selection`

What changed in the app:

- Added real Hybrid SQLite KB retrieval through backend `kb_hybrid_search`.
- Hybrid retrieval combines existing lexical SQLite retrieval with existing local
  Ollama semantic retrieval.
- Hybrid query embedding happens once per hybrid search.
- Hybrid results deduplicate by stable chunk ID.
- Hybrid results expose raw lexical score, semantic cosine score, combined RRF
  score, and match reason.
- Added per-result selected-context controls.
- Attach remains OFF by default after retrieval.
- Attach ON sends only selected visible chunks to chat.
- Deleted documents are removed from retrieval results and selected context.
- Full GraphRAG, graph traversal retrieval, external vector DB integration,
  cloud embeddings, model auto-pull/download, sidecar embedding, and graph polish
  remain unimplemented.

How to verify it:

1. Confirm Ollama is running locally.
2. Confirm `nomic-embed-text` is available locally.
3. Do not auto-pull the model from inside the app.
4. Create `%USERPROFILE%\Desktop\phase-2g-lexical-ledger.txt` with this exact content:

```text
Phase 2G lexical ledger test.

Cabinet inventory clerks counted shelf labels, archive boxes, binder tabs, barcode stickers, and warehouse aisle numbers.
LexicalOnlyMarker7421 appears exactly once for keyword retrieval verification.
This document is intentionally limited to physical records, shelves, labels, cabinets, binders, and inventory counting.
```

5. Create `%USERPROFILE%\Desktop\phase-2g-semantic-orchard.txt` with this exact content:

```text
Phase 2G semantic orchard test.

The harvest crew moved ripe orchard fruit into chilled cellar rooms and tracked fermentation barrels for autumn beverage production.
Crates were sorted by variety, temperature, ripeness, and packing schedule before the produce left the farm.
This document is about orchards, harvested fruit, chilled cellar rooms, barrels, and beverage production.
```

6. Create `%USERPROFILE%\Desktop\phase-2g-hybrid-overlap.txt` with this exact content:

```text
Phase 2G hybrid aerospace test.

HybridOverlapMarker6149 appears in the same chunk as orbital rendezvous, spacecraft docking, thruster alignment, and station approach planning.
This document is about spacecraft operations, docking maneuvers, orbital approach procedures, and vehicle alignment.
```

7. Create `%USERPROFILE%\Desktop\phase-2g-delete-target.txt` with this exact content:

```text
Phase 2G delete exclusion finance test.

DeleteFinanceMarker8891 appears beside quarterly invoicing, revenue recognition, payment reconciliation, purchase orders, and account settlement workflows.
This document is about invoices, revenue, payments, reconciliation, accounting, and finance operations.
```

8. Launch the app with `npm run desktop`.
9. Drop all four files into the app.
10. Confirm all four appear in KB Documents.
11. Build or refresh the semantic index.
12. Confirm semantic index shows provider `ollama`, model `nomic-embed-text`, active chunks `4`, embedded chunks `4`, missing `0`, state `READY`, and non-empty dimension.
13. Select Lexical mode.
14. Query `LexicalOnlyMarker7421`.
15. Confirm `phase-2g-lexical-ledger.txt` appears and Attach is OFF.
16. Select Semantic mode.
17. Query `fruit beverage cold rooms`.
18. Confirm `phase-2g-semantic-orchard.txt` ranks first or clearly above unrelated files.
19. Select Hybrid mode.
20. Query `HybridOverlapMarker6149 spacecraft docking`.
21. Confirm `phase-2g-hybrid-overlap.txt` appears with match reason `both`, lexical score, semantic score, and combined score.
22. Query `LexicalOnlyMarker7421`.
23. Confirm `phase-2g-lexical-ledger.txt` appears with match reason `lexical` or clearly lexical-dominant evidence.
24. Query `fruit beverage cold rooms`.
25. Confirm `phase-2g-semantic-orchard.txt` appears with match reason `semantic` or clearly semantic-dominant evidence.
26. Query `HybridOverlapMarker6149 DeleteFinanceMarker8891 spacecraft invoice`.
27. Deselect `phase-2g-delete-target.txt` and leave `phase-2g-hybrid-overlap.txt` selected.
28. Confirm selected count reflects only selected chunks.
29. Leave Attach OFF and send chat: `Reply exactly: phase 2g detached check complete.`
30. Confirm reply contains no `[KB1]`, no KB filename, and no attached-context behavior.
31. Turn Attach ON.
32. Send chat: `List the attached KB source filenames.`
33. Confirm only selected source filenames are listed.
34. Confirm `phase-2g-delete-target.txt` is not listed if it was deselected.
35. Delete `phase-2g-delete-target.txt` from KB Documents.
36. Query `DeleteFinanceMarker8891` in Lexical mode.
37. Confirm deleted document returns no lexical result.
38. Query `DeleteFinanceMarker8891 invoice reconciliation` in Hybrid mode.
39. Confirm deleted document returns no hybrid result and cannot remain selected or attached.
40. Delete the remaining three Phase 2G test documents from KB Documents.
41. Confirm active KB documents and active chunks return to their pre-test values.
42. Cleanup Desktop files with:

```powershell
Remove-Item -LiteralPath "$env:USERPROFILE\Desktop\phase-2g-lexical-ledger.txt","$env:USERPROFILE\Desktop\phase-2g-semantic-orchard.txt","$env:USERPROFILE\Desktop\phase-2g-hybrid-overlap.txt","$env:USERPROFILE\Desktop\phase-2g-delete-target.txt" -ErrorAction SilentlyContinue
```

What works now:

- Hybrid SQLite KB retrieval is implemented.
- Lexical and Semantic modes remain explicit and available.
- Hybrid mode uses real lexical and semantic KB candidates.
- Hybrid mode fails closed when the semantic index is not ready.
- User-controlled selected context is implemented.
- Attach OFF still sends no retrieved context.
- Attach ON sends only selected chunks.
- Deleted documents are excluded from retrieval and selected context.

Owner manual verification results:

- Phase 2G Hybrid Retrieval + Grounded Context Selection is accepted.
- Implementation commit verified: `a5717b9 feat: add hybrid kb retrieval selection`.
- Four exact Desktop files were created:
  - `phase-2g-lexical-ledger.txt`
  - `phase-2g-semantic-orchard.txt`
  - `phase-2g-hybrid-overlap.txt`
  - `phase-2g-delete-target.txt`
- All four files ingested successfully.
- Ingestion ledger showed all four indexed.
- Semantic Index initially showed provider `ollama`, model `nomic-embed-text`, active chunks `4`, embedded `0`, missing `4`, and state `NOT-READY`.
- Semantic index build worked: state changed to `READY`, active chunks `4`, embedded `4`, missing `0`, and dimension `768`.
- Retrieval modes were visible: Lexical, Semantic, and Hybrid.
- Lexical mode still worked: query `LexicalOnlyMarker7421` returned `phase-2g-lexical-ledger.txt`, right panel showed `Local KB context - lexical`, and Attach was OFF by default.
- Semantic mode still worked: query `fruit beverage cold rooms` ranked `phase-2g-semantic-orchard.txt` first, right panel showed `Local KB context - semantic`, and Attach was OFF by default.
- Hybrid overlap retrieval worked: query `HybridOverlapMarker6149 spacecraft docking` ranked `phase-2g-hybrid-overlap.txt` first, right panel showed `Local KB context - hybrid`, result showed match reason `both`, lexical score, semantic score, and combined score, and Attach was OFF by default.
- Hybrid lexical-evidence retrieval worked with caveat: query `LexicalOnlyMarker7421` ranked `phase-2g-lexical-ledger.txt` first, exposed lexical evidence and score, and showed `MATCH BOTH` rather than pure lexical-only because semantic contribution also passed threshold. This was accepted as lexical evidence verification, not a pure lexical-only demonstration.
- Hybrid semantic-dominant retrieval worked: query `fruit beverage cold rooms` ranked `phase-2g-semantic-orchard.txt` first and showed semantic match evidence.
- Selection and deselection worked: query `HybridOverlapMarker6149 DeleteFinanceMarker8891 spacecraft invoice` returned hybrid results, `phase-2g-delete-target.txt` was deselected, `phase-2g-hybrid-overlap.txt` remained selected, selected count dropped to `3/4`, and Attach remained OFF by default.
- Attach OFF behavior worked: sending `Reply exactly: phase 2g detached check complete.` returned exactly `phase 2g detached check complete.` with no `[KB1]`, no filename, and no hidden KB context.
- Attach ON selected-only behavior worked: after Attach was turned ON, sending `List the attached KB source filenames.` listed only selected files: `phase-2g-hybrid-overlap.txt`, `phase-2g-lexical-ledger.txt`, and `phase-2g-semantic-orchard.txt`; it did not list deselected `phase-2g-delete-target.txt`.
- Deleted-document lexical exclusion worked: `phase-2g-delete-target.txt` was deleted from KB Documents, lexical query `DeleteFinanceMarker8891` returned no matches, and the deleted file was not attachable.
- Deleted-document hybrid exclusion worked: hybrid query `DeleteFinanceMarker8891 invoice reconciliation` did not return `phase-2g-delete-target.txt`, the deleted file did not remain selected or attachable, and remaining selected results were non-deleted documents.
- App-side cleanup worked: remaining Phase 2G test docs `phase-2g-lexical-ledger.txt`, `phase-2g-hybrid-overlap.txt`, and `phase-2g-semantic-orchard.txt` were deleted from KB Documents, active KB documents dropped to `0`, active chunks dropped to `0`, and Semantic Index became `EMPTY`.
- Desktop cleanup completed for `phase-2g-lexical-ledger.txt`, `phase-2g-semantic-orchard.txt`, `phase-2g-hybrid-overlap.txt`, and `phase-2g-delete-target.txt`.

What still does not work:

- Full GraphRAG is not implemented.
- Graph traversal retrieval is not implemented.
- External vector DB integration is not implemented.
- Cloud embeddings are not implemented.
- Ollama models are not auto-pulled or downloaded by the app.
- Sidecar/hash-vector semantic fallback is not used for SQLite KB retrieval.
- Graph readability polish remains deferred.

Decision:

- [x] Accepted
- [ ] Needs fixes
- [ ] Rejected

Status:

- Accepted after owner manual verification.

### Slice: Phase 2E - Retrieval MVP

Date: 2026-06-16

Commit: `0b7c9e340f08f3be7b05ee225c056b37f354340b feat: add retrieval mvp context panel`

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

Owner manual verification results:

- Phase 2E Retrieval MVP is accepted.
- Manual verification passed for explicit SQLite KB retrieval.
- Test document `phase-2e-retrieval-mvp-smoke.txt` was ingested and appeared in KB Documents.
- Search for `RetrievalMvpUniqueTerm4821` returned the correct SQLite KB chunk.
- Right-pane Local KB context panel displayed the retrieved chunk with source label.
- Attach was OFF by default.
- Attach ON sent retrieved KB context to chat.
- Chat correctly answered that `RetrievalMvpUniqueTerm4821` was mentioned in `phase-2e-retrieval-mvp-smoke.txt` with `[KB1]`.
- After Attach was turned OFF, chat sent a detached message without using KB context.
- Deleting the test document removed it from KB Documents.
- Searching `RetrievalMvpUniqueTerm4821` after deletion showed no matches.
- Deleted context did not remain attachable.
- Commit verified for Retrieval MVP: `0b7c9e340f08f3be7b05ee225c056b37f354340b`.

What still does not work:

- This is not full Chat With KB polish.
- This is not full GraphRAG.
- Real embeddings are not implemented.
- Vector DB work is not implemented.
- Graph traversal retrieval is not implemented.
- Formal answer citation rendering is deferred.
- Graph readability polish remains non-blocking.
- Future retrieval polish may include citations in generated answers, selected-context controls, and better source cards.

Decision:

- [x] Accepted
- [ ] Needs fixes
- [ ] Rejected

Status:

- Accepted by owner manual verification.

### Slice: Phase 2F - Real Local Embeddings + Vector Retrieval Foundation

Date: 2026-06-16

Commit: `be890b0 feat: add local semantic kb retrieval`

What changed in the app:

- Added real local Ollama embedding support for SQLite KB chunks.
- Added additive SQLite `chunk_embeddings` storage tied to chunk id, workspace id, provider, model, dimension, embedding blob, and content hash.
- Added semantic index status, build/refresh, and semantic search commands in Rust.
- Added loopback-only Ollama base URL validation and vector validation.
- Added explicit Lexical/Semantic retrieval mode in the UI.
- Added semantic index status and manual build/refresh controls in the Archive panel.
- Reused Phase 2E explicit attach/detach context behavior for semantic results.
- Relabeled legacy graph hash-vector scaffolds as non-semantic compatibility paths.
- Preserved lexical retrieval, document deletion, graph layout stability, and local-first behavior.

How to verify it:

1. Confirm Ollama is running locally.
2. Confirm `nomic-embed-text` is available locally.
3. Do not auto-pull the model from inside the app.
4. Create `%USERPROFILE%\Desktop\phase-2f-orchard.txt` with this exact content:

```text
Phase 2F semantic orchard test.

The orchard team studied apple harvest logistics, cider fermentation, fruit storage temperatures, refrigerated crates, and seasonal produce handling.
This file is about fruit, orchards, cider, apples, storage, and harvest workflows.
ExactFruitLexicalMarker4821 is included to verify lexical retrieval still works.
```

5. Create `%USERPROFILE%\Desktop\phase-2f-aerospace.txt` with this exact content:

```text
Phase 2F semantic aerospace test.

The aerospace team studied orbital docking procedures, spacecraft rendezvous, satellite attitude control, vacuum-rated fasteners, and thruster alignment.
This file is about spacecraft, orbital operations, docking, satellites, and vacuum hardware.
ExactAerospaceLexicalMarker9137 is included to verify lexical retrieval still works.
```

6. Create `%USERPROFILE%\Desktop\phase-2f-finance.txt` with this exact content:

```text
Phase 2F semantic finance test.

The finance team studied quarterly invoicing, revenue recognition, payment reconciliation, purchase orders, and account settlement workflows.
This file is about invoices, revenue, payments, accounting, reconciliation, and finance operations.
ExactFinanceLexicalMarker6254 is included to verify lexical retrieval still works.
```

7. Launch the app with `npm run desktop`.
8. Drop all three files into the app.
9. Confirm all three appear in KB Documents.
10. Confirm lexical query `ExactFruitLexicalMarker4821` returns `phase-2f-orchard.txt`.
11. Confirm lexical query `ExactAerospaceLexicalMarker9137` returns `phase-2f-aerospace.txt`.
12. Confirm lexical query `ExactFinanceLexicalMarker6254` returns `phase-2f-finance.txt`.
13. Build or refresh the semantic index using the app UI.
14. Confirm semantic index status shows active chunks and embedded chunks.
15. Switch to Semantic retrieval.
16. Query `spacecraft connection in orbit`.
17. Confirm `phase-2f-aerospace.txt` ranks above orchard and finance.
18. Query `apple cider storage`.
19. Confirm `phase-2f-orchard.txt` ranks above aerospace and finance.
20. Query `invoice payment reconciliation`.
21. Confirm `phase-2f-finance.txt` ranks above orchard and aerospace.
22. Attach semantic context.
23. Ask chat: `Which file discusses orbital docking?`
24. Confirm the answer uses semantic KB context and identifies `phase-2f-aerospace.txt`.
25. Detach semantic context.
26. Send a detached message and confirm no semantic context is injected.
27. Delete all three test documents from KB Documents.
28. Query `spacecraft connection in orbit` in Semantic mode.
29. Confirm deleted documents return no semantic results.
30. Query `ExactFruitLexicalMarker4821` in Lexical mode.
31. Confirm deleted documents return no lexical results.
32. Cleanup Desktop files with:

```powershell
Remove-Item -LiteralPath "$env:USERPROFILE\Desktop\phase-2f-orchard.txt","$env:USERPROFILE\Desktop\phase-2f-aerospace.txt","$env:USERPROFILE\Desktop\phase-2f-finance.txt" -ErrorAction SilentlyContinue
```

What works now:

- Semantic KB retrieval uses real local Ollama embeddings, not hash vectors or stubs.
- Chunk embeddings are persisted in Rust-owned SQLite and tied to content hashes.
- Query embeddings are generated locally and cosine-ranked against active chunk embeddings.
- Deleted documents are excluded from semantic and lexical retrieval.
- Semantic context can be explicitly attached to chat only when the user turns attachment on.
- If Ollama or `nomic-embed-text` is unavailable, semantic indexing/search reports unavailable instead of faking results.

Owner manual verification results:

- Phase 2F Real Local Embeddings + Vector Retrieval Foundation is accepted.
- Implementation commit verified: `be890b0 feat: add local semantic kb retrieval`.
- User manually installed local Ollama model `nomic-embed-text`.
- App did not auto-pull or auto-download the embedding model.
- Three exact Desktop files were created: `phase-2f-orchard.txt`, `phase-2f-aerospace.txt`, and `phase-2f-finance.txt`.
- All three files ingested successfully.
- KB stats showed `3` active documents and `3` active chunks after ingestion.
- Semantic Index initially showed provider `ollama`, model `nomic-embed-text`, active chunks `3`, embedded `0`, missing `3`, and state `NOT-READY`.
- Lexical query `ExactFruitLexicalMarker4821` returned `phase-2f-orchard.txt`.
- Local KB context showed lexical mode.
- Attach was OFF by default.
- Semantic index build changed state to `READY`.
- Semantic index status showed active chunks `3`, embedded `3`, missing `0`, and dimension `768`.
- Semantic query `spacecraft connection in orbit` ranked `phase-2f-aerospace.txt` first.
- Semantic query `apple cider storage` ranked `phase-2f-orchard.txt` first.
- Semantic query `invoice payment reconciliation` ranked `phase-2f-finance.txt` first.
- Right panel showed `Local KB context - semantic`.
- Semantic results were source-labeled.
- Semantic Attach was OFF by default.
- After re-running `spacecraft connection in orbit`, turning Attach ON, and asking `Which file discusses orbital docking?`, chat correctly identified `phase-2f-aerospace.txt` and cited `[KB1]`.
- After turning Attach OFF and sending `Reply exactly: semantic detach check complete.`, chat replied exactly `semantic detach check complete.` with no KB file reference, no `[KB1]`, and no hidden context injection.
- Deleted `phase-2f-aerospace.txt`, `phase-2f-orchard.txt`, and `phase-2f-finance.txt` from KB Documents.
- Active KB documents dropped to `0`.
- Active chunks dropped to `0`.
- Semantic Index became unavailable/empty for active chunks.
- Semantic query `spacecraft connection in orbit` returned no matches.
- Lexical query `ExactFruitLexicalMarker4821` returned no matches.
- Attach stayed OFF/disabled with no attachable context.
- Desktop cleanup completed for `phase-2f-orchard.txt`, `phase-2f-aerospace.txt`, and `phase-2f-finance.txt`.

What still does not work:

- This is not full GraphRAG.
- Graph traversal retrieval is not implemented.
- External vector DB integration is not implemented.
- Cloud embeddings are not implemented.
- Ollama models are not auto-pulled or downloaded by the app.
- Graph polish remains deferred.
- Full GraphRAG over graph/community expansion remains deferred.
- Stronger citation rendering in final generated answers remains deferred.
- Selected-context controls remain deferred.

Decision:

- [x] Accepted
- [ ] Needs fixes
- [ ] Rejected

Status:

- Accepted by owner manual verification.
