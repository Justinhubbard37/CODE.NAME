import { afterEach, describe, expect, it, vi } from 'vitest';
import { kbIngestText, kbSearch, kbStats } from './kb';

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
});
