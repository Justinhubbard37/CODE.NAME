import { describe, expect, it } from 'vitest';
import { emptyKbEmbeddingStatus, emptyKbStats, type KbEmbeddingStatus, type KbStats } from './kb';
import { routeRetrieval } from './autoRetrievalRouter';

const readySemantic: KbEmbeddingStatus = {
  provider: 'ollama',
  model: 'nomic-embed-text',
  activeChunkCount: 3,
  embeddedActiveChunkCount: 3,
  missingActiveChunkCount: 0,
  dimension: 768,
  ready: true,
  state: 'ready',
};

const notReadySemantic: KbEmbeddingStatus = {
  ...readySemantic,
  embeddedActiveChunkCount: 1,
  missingActiveChunkCount: 2,
  ready: false,
  state: 'not-ready',
};

const activeStats: KbStats = {
  ...emptyKbStats,
  initialized: true,
  schemaVersion: 1,
  documentCount: 3,
  chunkCount: 3,
};

describe('auto retrieval router', () => {
  it('routes exact marker queries to Lexical', () => {
    const trace = routeRetrieval({
      requestedMode: 'auto',
      query: 'LexicalOnlyMarker2I7421',
      kbStats: activeStats,
      semanticStatus: readySemantic,
    });

    expect(trace.resolvedMode).toBe('lexical');
    expect(trace.routeReason).toBe('Exact token or filename-style query; lexical retrieval is safest.');
    expect(trace.localOnly).toBe(true);
  });

  it('routes filename queries to Lexical', () => {
    const trace = routeRetrieval({
      requestedMode: 'auto',
      query: 'phase-2i-lexical-ledger.txt',
      kbStats: activeStats,
      semanticStatus: readySemantic,
    });

    expect(trace.resolvedMode).toBe('lexical');
  });

  it('routes conceptual natural-language queries to Hybrid when semantic index is ready', () => {
    const trace = routeRetrieval({
      requestedMode: 'auto',
      query: 'fruit beverage cold rooms',
      kbStats: activeStats,
      semanticStatus: readySemantic,
    });

    expect(trace.resolvedMode).toBe('hybrid');
    expect(trace.routeReason).toBe('Conceptual query with ready semantic index.');
  });

  it('routes graph relationship queries to Graph when semantic index is ready', () => {
    const trace = routeRetrieval({
      requestedMode: 'auto',
      query: 'what is connected to Project Atlas through Aurora Bridge',
      kbStats: activeStats,
      semanticStatus: readySemantic,
    });

    expect(trace.resolvedMode).toBe('graph');
    expect(trace.graphExpansionAttempted).toBe(true);
    expect(trace.routeReason).toBe('Relationship-style query with ready semantic index.');
  });

  it('falls back to Lexical for graph queries when semantic index is not ready', () => {
    const trace = routeRetrieval({
      requestedMode: 'auto',
      query: 'relationship between Project Atlas and Aurora Bridge',
      kbStats: activeStats,
      semanticStatus: notReadySemantic,
    });

    expect(trace.resolvedMode).toBe('lexical');
    expect(trace.fallbackFrom).toBe('graph');
    expect(trace.warningMessage).toBe('Graph retrieval needs a ready semantic index; using lexical retrieval only.');
  });

  it('falls back to Lexical for conceptual queries when semantic index is not ready', () => {
    const trace = routeRetrieval({
      requestedMode: 'auto',
      query: 'fruit beverage cold rooms',
      kbStats: activeStats,
      semanticStatus: notReadySemantic,
    });

    expect(trace.resolvedMode).toBe('lexical');
    expect(trace.fallbackFrom).toBe('hybrid');
    expect(trace.warningMessage).toBe('Semantic index not ready; using lexical retrieval only.');
  });

  it('skips backend search when there are no active documents', () => {
    const trace = routeRetrieval({
      requestedMode: 'auto',
      query: 'fruit beverage cold rooms',
      kbStats: emptyKbStats,
      semanticStatus: emptyKbEmbeddingStatus,
    });

    expect(trace.resolvedMode).toBe('none');
    expect(trace.warningMessage).toBe('No active documents.');
  });

  it('routes ambiguous single-token queries to Lexical by default', () => {
    const trace = routeRetrieval({
      requestedMode: 'auto',
      query: 'atlas',
      kbStats: activeStats,
      semanticStatus: readySemantic,
    });

    expect(trace.resolvedMode).toBe('lexical');
    expect(trace.routeReason).toBe('No semantic or graph signal detected.');
  });

  it('preserves manual mode decisions without fallback', () => {
    const trace = routeRetrieval({
      requestedMode: 'graph',
      query: 'relationship between Project Atlas and Aurora Bridge',
      kbStats: activeStats,
      semanticStatus: notReadySemantic,
    });

    expect(trace.requestedMode).toBe('graph');
    expect(trace.resolvedMode).toBe('graph');
    expect(trace.fallbackFrom).toBeUndefined();
    expect(trace.routeReason).toBe('Manual graph retrieval selected.');
  });
});
