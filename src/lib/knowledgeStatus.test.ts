import { describe, expect, it } from 'vitest';
import { emptyKbEmbeddingStatus, emptyKbStats, type KbEmbeddingStatus, type KbStats } from './kb';
import { knowledgeStatusSummary } from './knowledgeStatus';

const stats: KbStats = {
  ...emptyKbStats,
  initialized: true,
  schemaVersion: 1,
  documentCount: 2,
  chunkCount: 2,
};

const semanticReady: KbEmbeddingStatus = {
  provider: 'ollama',
  model: 'nomic-embed-text',
  activeChunkCount: 2,
  embeddedActiveChunkCount: 2,
  missingActiveChunkCount: 0,
  dimension: 768,
  ready: true,
  state: 'ready',
};

describe('knowledge status summary', () => {
  it('shows no active documents before ingestion', () => {
    expect(knowledgeStatusSummary({
      kbStats: emptyKbStats,
      semanticStatus: emptyKbEmbeddingStatus,
      semanticIndexing: false,
    })).toMatchObject({
      label: 'No active documents',
      tone: 'empty',
    });
  });

  it('shows knowledge ready when semantic index is ready', () => {
    expect(knowledgeStatusSummary({
      kbStats: stats,
      semanticStatus: semanticReady,
      semanticIndexing: false,
    })).toMatchObject({
      label: 'Knowledge Ready',
      tone: 'ready',
    });
  });

  it('shows semantic index needed for missing active embeddings', () => {
    expect(knowledgeStatusSummary({
      kbStats: stats,
      semanticStatus: {
        ...semanticReady,
        ready: false,
        state: 'not-ready',
        embeddedActiveChunkCount: 1,
        missingActiveChunkCount: 1,
      },
      semanticIndexing: false,
    })).toMatchObject({
      label: 'Semantic index needed',
      tone: 'warning',
    });
  });

  it('shows Needs Ollama for local embedding errors', () => {
    expect(knowledgeStatusSummary({
      kbStats: stats,
      semanticStatus: {
        ...semanticReady,
        ready: false,
        state: 'unavailable',
        lastError: 'local Ollama embed unavailable: connection refused',
      },
      semanticIndexing: false,
    })).toMatchObject({
      label: 'Needs Ollama',
      tone: 'unavailable',
    });
  });

  it('shows indexing while manual Build / Refresh is running', () => {
    expect(knowledgeStatusSummary({
      kbStats: stats,
      semanticStatus: {
        ...semanticReady,
        ready: false,
        embeddedActiveChunkCount: 1,
        missingActiveChunkCount: 1,
      },
      semanticIndexing: true,
    })).toMatchObject({
      label: 'Indexing',
      tone: 'working',
    });
  });
});
