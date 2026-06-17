import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  kbEmbedMissing,
  kbEmbeddingStatus,
  kbDeleteDocument,
  kbGraphRagSearch,
  kbGraphProjection,
  kbHybridSearch,
  kbIngestText,
  kbListDocuments,
  kbSearch,
  kbSemanticSearch,
  kbStats,
} from './kb';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../auth/workspace', () => ({
  getActiveWorkspace: () => ({
    id: 'default',
    name: 'Default',
    createdAt: 0,
    dbName: 'codename-kg',
  }),
}));

import { invoke } from '@tauri-apps/api/core';

const mockedInvoke = vi.mocked(invoke);

describe('SQLite KB wrapper', () => {
  afterEach(() => {
    mockedInvoke.mockReset();
    vi.unstubAllGlobals();
  });

  it('returns safe stats fallback in browser mode', async () => {
    await expect(kbStats()).resolves.toEqual({
      initialized: false,
      schemaVersion: 0,
      documentCount: 0,
      deletedDocumentCount: 0,
      chunkCount: 0,
      entityCount: 0,
      relationshipCount: 0,
      retrievalEventCount: 0,
      ftsAvailable: false,
    });
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('calls kb_ingest_text with active workspace when desktop is available', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue({
      documentId: 'doc_default_hash',
      chunkCount: 1,
      contentHash: 'fnv1a64:test',
    });

    await kbIngestText({ title: 'Note', text: 'hello sqlite' });

    expect(mockedInvoke).toHaveBeenCalledWith('kb_ingest_text', {
      workspaceId: 'default',
      title: 'Note',
      text: 'hello sqlite',
      sourceUri: undefined,
      sourceKind: undefined,
      mimeType: undefined,
    });
  });

  it('calls kb_search and returns desktop results', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue([
      {
        chunk: {
          id: 'chunk-1',
          documentId: 'doc-1',
          workspaceId: 'default',
          ordinal: 0,
          text: 'sqlite result',
          charStart: 0,
          charEnd: 13,
          tokenEstimate: 4,
          contentHash: 'fnv1a64:test',
        },
        documentTitle: 'Doc',
        score: 1,
      },
    ]);

    const results = await kbSearch({ query: 'sqlite', limit: 3 });

    expect(mockedInvoke).toHaveBeenCalledWith('kb_search', {
      workspaceId: 'default',
      query: 'sqlite',
      limit: 3,
    });
    expect(results[0].chunk.text).toBe('sqlite result');
  });

  it('returns empty search results in browser mode without invoking desktop', async () => {
    await expect(kbSearch({ query: 'sqlite', limit: 3 })).resolves.toEqual([]);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('preserves explicit limits for semantic search requests', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue([
      {
        chunk: {
          id: 'chunk-1',
          documentId: 'doc-1',
          workspaceId: 'default',
          ordinal: 0,
          text: 'semantic result',
          charStart: 0,
          charEnd: 15,
          tokenEstimate: 4,
          contentHash: 'fnv1a64:test',
        },
        documentTitle: 'Doc',
        score: 0.91,
        retrievalKind: 'semantic',
      },
    ]);

    const results = await kbSemanticSearch({ query: 'spacecraft docking', limit: 2 });

    expect(mockedInvoke).toHaveBeenCalledWith('kb_semantic_search', {
      workspaceId: 'default',
      query: 'spacecraft docking',
      limit: 2,
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://127.0.0.1:11434',
    });
    expect(results[0].retrievalKind).toBe('semantic');
  });

  it('preserves explicit limits for hybrid search requests', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue([
      {
        chunk: {
          id: 'chunk-1',
          documentId: 'doc-1',
          workspaceId: 'default',
          ordinal: 0,
          text: 'hybrid result',
          charStart: 0,
          charEnd: 13,
          tokenEstimate: 4,
          contentHash: 'fnv1a64:test',
        },
        documentTitle: 'Doc',
        score: 0.03,
        retrievalKind: 'hybrid',
        lexicalScore: -1.2,
        semanticScore: 0.88,
        combinedScore: 0.03,
        matchKind: 'both',
      },
    ]);

    const results = await kbHybridSearch({ query: 'spacecraft docking', limit: 2 });

    expect(mockedInvoke).toHaveBeenCalledWith('kb_hybrid_search', {
      workspaceId: 'default',
      query: 'spacecraft docking',
      limit: 2,
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://127.0.0.1:11434',
    });
    expect(results[0].retrievalKind).toBe('hybrid');
    expect(results[0].matchKind).toBe('both');
  });

  it('calls kb_graphrag_search with local Ollama defaults and one-hop depth', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue([
      {
        chunk: {
          id: 'chunk-1',
          documentId: 'doc-1',
          workspaceId: 'default',
          ordinal: 0,
          text: 'graph seed result',
          charStart: 0,
          charEnd: 17,
          tokenEstimate: 5,
          contentHash: 'fnv1a64:test',
        },
        documentTitle: 'Doc',
        score: 0.03,
        retrievalKind: 'graph',
        seedRetrievalKind: 'hybrid',
        graphRole: 'seed',
        expansionType: 'seed',
        traversalDepth: 0,
        graphReason: 'Seed evidence from Hybrid retrieval rank 1',
      },
    ]);

    const results = await kbGraphRagSearch({ query: 'SeedGraphMarker2101 orbital docking', limit: 2 });

    expect(mockedInvoke).toHaveBeenCalledWith('kb_graphrag_search', {
      workspaceId: 'default',
      query: 'SeedGraphMarker2101 orbital docking',
      limit: 2,
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://127.0.0.1:11434',
      maxDepth: 1,
    });
    expect(results[0].retrievalKind).toBe('graph');
    expect(results[0].graphRole).toBe('seed');
  });

  it('returns safe semantic fallbacks in browser mode without claiming readiness', async () => {
    await expect(kbSemanticSearch({ query: 'spacecraft docking', limit: 2 })).resolves.toEqual([]);
    await expect(kbHybridSearch({ query: 'spacecraft docking', limit: 2 })).resolves.toEqual([]);
    await expect(kbGraphRagSearch({ query: 'spacecraft docking', limit: 2 })).resolves.toEqual([]);
    await expect(kbEmbeddingStatus()).resolves.toMatchObject({
      provider: 'ollama',
      model: 'nomic-embed-text',
      ready: false,
      state: 'unavailable',
      activeChunkCount: 0,
      embeddedActiveChunkCount: 0,
      missingActiveChunkCount: 0,
    });
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('calls semantic index status and build commands with local Ollama defaults', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke
      .mockResolvedValueOnce({
        provider: 'ollama',
        model: 'nomic-embed-text',
        activeChunkCount: 2,
        embeddedActiveChunkCount: 1,
        missingActiveChunkCount: 1,
        dimension: 768,
        ready: false,
        state: 'partial',
      })
      .mockResolvedValueOnce({
        provider: 'ollama',
        model: 'nomic-embed-text',
        embeddedCount: 1,
        skippedCount: 1,
        failedCount: 0,
        dimension: 768,
      });

    await kbEmbeddingStatus();
    await kbEmbedMissing();

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, 'kb_embedding_status', {
      workspaceId: 'default',
      provider: 'ollama',
      model: 'nomic-embed-text',
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, 'kb_embed_missing', {
      workspaceId: 'default',
      provider: 'ollama',
      model: 'nomic-embed-text',
      baseUrl: 'http://127.0.0.1:11434',
    });
  });

  it('keeps semantic KB wrappers disconnected from legacy stub embeddings', () => {
    const source = readFileSync(new URL('./kb.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(/stubEmbed|sidecarEmbed|sidecar_embed/);
  });

  it('calls kb_graph_projection for the active workspace and document', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue({
      nodes: [
        {
          id: 'doc-1',
          nodeType: 'document',
          label: 'KB_DOC_NOTE',
          title: 'Note',
        },
      ],
      edges: [],
    });

    const projection = await kbGraphProjection({ documentId: 'doc-1' });

    expect(mockedInvoke).toHaveBeenCalledWith('kb_graph_projection', {
      workspaceId: 'default',
      documentId: 'doc-1',
    });
    expect(projection.nodes[0].nodeType).toBe('document');
  });

  it('calls kb_list_documents for the active workspace', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue([
      {
        id: 'doc-1',
        workspaceId: 'default',
        title: 'Doc',
        sourceKind: 'file',
        mimeType: 'text/plain',
        contentHash: 'fnv1a64:test',
        byteLength: 10,
        createdAt: 1,
        updatedAt: 1,
        chunkCount: 1,
      },
    ]);

    const docs = await kbListDocuments();

    expect(mockedInvoke).toHaveBeenCalledWith('kb_list_documents', {
      workspaceId: 'default',
    });
    expect(docs[0].title).toBe('Doc');
  });

  it('calls kb_delete_document in soft mode', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    mockedInvoke.mockResolvedValue({
      documentId: 'doc-1',
      deleted: true,
      deletedAt: 123,
    });

    const result = await kbDeleteDocument({ documentId: 'doc-1' });

    expect(mockedInvoke).toHaveBeenCalledWith('kb_delete_document', {
      documentId: 'doc-1',
      mode: 'soft',
    });
    expect(result.deleted).toBe(true);
  });
});
