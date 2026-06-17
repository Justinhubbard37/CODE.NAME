import { describe, expect, it } from 'vitest';
import {
  buildChatPromptWithRetrievedContext,
  buildOptionalChatPromptWithRetrievedContext,
  clearRetrievedContextState,
  defaultSelectedChunkIds,
  filterRetrievalResultsForDeletedDocument,
  formatRetrievedContextBlock,
  selectedRetrievalResults,
  retrievedContextAfterDocumentDelete,
  retrievedContextAfterSearch,
  retrievalCitationLabel,
  retrievalMatchKindLabel,
  retrievalModeLabel,
  retrievalSnippet,
  retrievalSource,
} from './retrievalContext';
import type { KbSearchResult } from './kb';

function result(id: string, text: string, ordinal = 0): KbSearchResult {
  return {
    chunk: {
      id: `chunk-${id}`,
      documentId: `doc-${id}`,
      workspaceId: 'default',
      ordinal,
      text,
      charStart: 0,
      charEnd: text.length,
      tokenEstimate: Math.ceil(text.length / 4),
      contentHash: `fnv1a64:${id}`,
    },
    documentTitle: `Doc ${id}`,
    sourceUri: `${id}.txt`,
    score: ordinal + 1,
  };
}

function hybridResult(id: string, text: string, matchKind: 'lexical' | 'semantic' | 'both'): KbSearchResult {
  return {
    ...result(id, text),
    score: 0.03,
    retrievalKind: 'hybrid',
    lexicalScore: matchKind === 'semantic' ? undefined : -1.25,
    semanticScore: matchKind === 'lexical' ? undefined : 0.88,
    combinedScore: 0.03,
    matchKind,
  };
}

function graphResult(
  id: string,
  text: string,
  role: 'seed' | 'expanded',
  expansionType: 'seed' | 'shared_entity' | 'relationship_evidence' = role === 'seed' ? 'seed' : 'shared_entity',
): KbSearchResult {
  return {
    ...hybridResult(id, text, 'both'),
    retrievalKind: 'graph',
    seedRetrievalKind: 'hybrid',
    graphRole: role,
    seedResultId: role === 'seed' ? `seed:chunk-${id}` : 'seed:chunk-seed',
    seedChunkId: role === 'seed' ? `chunk-${id}` : 'chunk-seed',
    expansionType,
    traversalDepth: role === 'seed' ? 0 : 1,
    graphReason:
      role === 'seed'
        ? 'Seed evidence from Hybrid retrieval rank 1'
        : 'Shared entity Project Atlas from seed chunk 1',
    graphScore: role === 'seed' ? undefined : 0.4,
    combinedDisplayScore: role === 'seed' ? 0.03 : 0.4,
    graphEntities: role === 'expanded'
      ? [{ id: 'entity-project-atlas', name: 'Project Atlas', kind: 'phrase', confidence: 0.82 }]
      : undefined,
    graphRelationships: expansionType === 'relationship_evidence'
      ? [
          {
            id: 'rel-1',
            kind: 'co_occurrence',
            sourceEntityId: 'entity-aurora',
            sourceName: 'Aurora Bridge',
            targetEntityId: 'entity-northstar',
            targetName: 'Northstar Relay',
            evidenceChunkId: `chunk-${id}`,
            confidence: 0.72,
          },
        ]
      : undefined,
  };
}

describe('retrieval context helpers', () => {
  it('formats source labels and one-based citation labels', () => {
    const item = result('a', 'alpha chunk', 2);

    expect(retrievalSource(item)).toBe('a.txt');
    expect(retrievalCitationLabel(item, 0)).toBe('KB1');
    expect(retrievalModeLabel('semantic')).toBe('semantic');
    expect(retrievalModeLabel('hybrid')).toBe('hybrid');
    expect(retrievalModeLabel('graph')).toBe('graph traversal');
    expect(retrievalMatchKindLabel(hybridResult('h', 'hybrid chunk', 'both'))).toBe('both');
    expect(retrievalMatchKindLabel(graphResult('g', 'graph chunk', 'expanded'))).toBe('shared entity');
  });

  it('clips retrieval snippets for compact UI display', () => {
    const item = result('a', 'one two three four five six');

    expect(retrievalSnippet(item, 12)).toBe('one two...');
  });

  it('caps chat context result count and includes chunk source labels', () => {
    const items = [
      result('a', 'alpha text'),
      result('b', 'bravo text', 1),
      result('c', 'charlie text', 2),
    ];

    const context = formatRetrievedContextBlock(items, { maxResults: 2 });

    expect(context).toContain('[KB1] Document: Doc a | chunk 1 | source: a.txt');
    expect(context).toContain('[KB2] Document: Doc b | chunk 2 | source: b.txt');
    expect(context).not.toContain('Doc c');
  });

  it('formats hybrid context with match kind and separate score fields', () => {
    const context = formatRetrievedContextBlock([hybridResult('h', 'hybrid evidence', 'both')]);

    expect(context).toContain('match: both');
    expect(context).toContain('lexical: -1.25');
    expect(context).toContain('semantic: 0.88');
    expect(context).toContain('combined: 0.03');
  });

  it('formats graph context with role, depth, expansion, reason, and graph metadata', () => {
    const context = formatRetrievedContextBlock([
      graphResult('seed', 'seed evidence', 'seed'),
      graphResult('expanded', 'expanded evidence', 'expanded', 'relationship_evidence'),
    ]);

    expect(context).toContain('graph role: seed');
    expect(context).toContain('depth: 0');
    expect(context).toContain('expansion: seed');
    expect(context).toContain('graph role: expanded');
    expect(context).toContain('depth: 1');
    expect(context).toContain('expansion: relationship evidence');
    expect(context).toContain('graph reason: Shared entity Project Atlas from seed chunk 1');
    expect(context).toContain('graph score: 0.40');
    expect(context).toContain('graph entities: Project Atlas (phrase)');
    expect(context).toContain('graph relationships: Aurora Bridge -co_occurrence-> Northstar Relay');
  });

  it('clips long chunk text and total context size', () => {
    const context = formatRetrievedContextBlock(
      [result('long', 'x'.repeat(100))],
      { charsPerChunk: 12, maxTotalChars: 80 },
    );

    expect(context.length).toBeLessThanOrEqual(80);
    expect(context).toContain('x');
    expect(context.endsWith('...')).toBe(true);
  });

  it('preserves the user question when building the chat prompt', () => {
    const prompt = buildChatPromptWithRetrievedContext('What mentions alpha?', [
      result('a', 'alpha text'),
    ]);

    expect(prompt).toContain('Local SQLite KB context - lexical:');
    expect(prompt).toContain('User question:\nWhat mentions alpha?');
    expect(prompt).toContain('[KB1]');
  });

  it('does not wrap the prompt when there are no retrieved chunks', () => {
    expect(buildChatPromptWithRetrievedContext('plain question', [])).toBe('plain question');
  });

  it('does not attach retrieved context when explicit attach is off', () => {
    const prompt = buildOptionalChatPromptWithRetrievedContext(
      'What mentions alpha?',
      [result('a', 'alpha text')],
      false,
    );

    expect(prompt).toBe('What mentions alpha?');
    expect(prompt).not.toContain('Local SQLite KB context');
  });

  it('keeps new retrieved context detached until the user explicitly attaches it', () => {
    const state = retrievedContextAfterSearch('alpha', [result('a', 'alpha text')], 'semantic');

    expect(state.query).toBe('alpha');
    expect(state.results).toHaveLength(1);
    expect(state.selectedChunkIds).toEqual(['chunk-a']);
    expect(state.attachEnabled).toBe(false);
    expect(state.mode).toBe('semantic');
  });

  it('defaults selected chunks to top retrieved results up to the chat cap', () => {
    const items = [
      result('a', 'alpha'),
      result('b', 'bravo'),
      result('c', 'charlie'),
      result('d', 'delta'),
      result('e', 'echo'),
    ];

    expect(defaultSelectedChunkIds(items)).toEqual(['chunk-a', 'chunk-b', 'chunk-c', 'chunk-d']);
  });

  it('attaches only selected chunks when attach is on', () => {
    const items = [result('a', 'alpha text'), result('b', 'bravo text')];
    const selected = selectedRetrievalResults(items, ['chunk-b']);
    const prompt = buildOptionalChatPromptWithRetrievedContext(
      'Which selected file?',
      selected,
      true,
      'hybrid',
    );

    expect(prompt).toContain('Local SQLite KB context - hybrid:');
    expect(prompt).toContain('Doc b');
    expect(prompt).not.toContain('Doc a');
  });

  it('attaches only selected graph evidence when attach is on', () => {
    const items = [
      graphResult('seed', 'seed evidence', 'seed'),
      graphResult('expanded', 'expanded evidence', 'expanded'),
    ];
    const selected = selectedRetrievalResults(items, ['chunk-expanded']);
    const prompt = buildOptionalChatPromptWithRetrievedContext(
      'List attached graph sources.',
      selected,
      true,
      'graph',
    );

    expect(prompt).toContain('Local SQLite KB context - graph traversal:');
    expect(prompt).toContain('Doc expanded');
    expect(prompt).toContain('graph role: expanded');
    expect(prompt).toContain('graph reason: Shared entity Project Atlas from seed chunk 1');
    expect(prompt).not.toContain('Doc seed');
  });

  it('sends the raw user message when attach is off even if chunks are selected', () => {
    const selected = selectedRetrievalResults([result('a', 'alpha text')], ['chunk-a']);
    const prompt = buildOptionalChatPromptWithRetrievedContext('Plain question', selected, false, 'hybrid');

    expect(prompt).toBe('Plain question');
  });

  it('resets selected IDs on a new retrieval query', () => {
    const first = retrievedContextAfterSearch('first', [result('a', 'alpha')], 'lexical');
    const second = retrievedContextAfterSearch('second', [result('b', 'bravo')], first.mode);

    expect(first.selectedChunkIds).toEqual(['chunk-a']);
    expect(second.query).toBe('second');
    expect(second.selectedChunkIds).toEqual(['chunk-b']);
    expect(second.selectedChunkIds).not.toContain('chunk-a');
  });

  it('clears selected IDs on retrieval mode change', () => {
    expect(clearRetrievedContextState('hybrid')).toEqual({
      query: '',
      results: [],
      selectedChunkIds: [],
      attachEnabled: false,
      mode: 'hybrid',
    });
  });

  it('clears active retrieval state', () => {
    expect(clearRetrievedContextState()).toEqual({
      query: '',
      results: [],
      selectedChunkIds: [],
      attachEnabled: false,
      mode: 'lexical',
    });
  });

  it('attaches only visible retrieved chunks when explicit attach is on', () => {
    const prompt = buildOptionalChatPromptWithRetrievedContext(
      'What mentions alpha?',
      [result('a', 'alpha text')],
      true,
    );

    expect(prompt).toContain('Local SQLite KB context - lexical:');
    expect(prompt).toContain('[KB1] Document: Doc a | chunk 1 | source: a.txt');
    expect(prompt).toContain('User question:\nWhat mentions alpha?');
  });

  it('filters deleted document results out of active context', () => {
    const items = [result('a', 'alpha'), result('b', 'bravo')];

    expect(filterRetrievalResultsForDeletedDocument(items, 'doc-a')).toEqual([items[1]]);
  });

  it('removes deleted document chunks from attachable retrieval state', () => {
    const state = retrievedContextAfterDocumentDelete(
      {
        query: 'alpha',
        results: [result('a', 'alpha')],
        selectedChunkIds: ['chunk-a'],
        attachEnabled: true,
        mode: 'semantic',
      },
      'doc-a',
    );

    expect(state).toEqual(clearRetrievedContextState('semantic'));
    expect(buildOptionalChatPromptWithRetrievedContext('question', state.results, state.attachEnabled, state.mode))
      .toBe('question');
  });

  it('removes deleted graph results and selected IDs from attachable state', () => {
    const state = retrievedContextAfterDocumentDelete(
      {
        query: 'SeedGraphMarker2101',
        results: [
          graphResult('seed', 'seed evidence', 'seed'),
          graphResult('expanded', 'expanded evidence', 'expanded'),
        ],
        selectedChunkIds: ['chunk-seed', 'chunk-expanded'],
        attachEnabled: true,
        mode: 'graph',
      },
      'doc-expanded',
    );

    expect(state.results.map((item) => item.chunk.id)).toEqual(['chunk-seed']);
    expect(state.selectedChunkIds).toEqual(['chunk-seed']);
    expect(state.attachEnabled).toBe(true);
    expect(buildOptionalChatPromptWithRetrievedContext('question', state.results, state.attachEnabled, state.mode))
      .not.toContain('Doc expanded');
  });

  it('filters selected IDs when a deleted document is removed', () => {
    const state = retrievedContextAfterDocumentDelete(
      {
        query: 'alpha',
        results: [result('a', 'alpha'), result('b', 'bravo')],
        selectedChunkIds: ['chunk-a', 'chunk-b'],
        attachEnabled: true,
        mode: 'hybrid',
      },
      'doc-a',
    );

    expect(state.results.map((item) => item.chunk.id)).toEqual(['chunk-b']);
    expect(state.selectedChunkIds).toEqual(['chunk-b']);
    expect(state.attachEnabled).toBe(true);
  });

  it('turns attach off when deletion removes all selected IDs', () => {
    const state = retrievedContextAfterDocumentDelete(
      {
        query: 'alpha',
        results: [result('a', 'alpha'), result('b', 'bravo')],
        selectedChunkIds: ['chunk-a'],
        attachEnabled: true,
        mode: 'hybrid',
      },
      'doc-a',
    );

    expect(state.results.map((item) => item.chunk.id)).toEqual(['chunk-b']);
    expect(state.selectedChunkIds).toEqual([]);
    expect(state.attachEnabled).toBe(false);
  });

  it('labels semantic context without attaching when explicit attach is off', () => {
    const offPrompt = buildOptionalChatPromptWithRetrievedContext(
      'Which file discusses orbital docking?',
      [result('a', 'orbital docking text')],
      false,
      'semantic',
    );
    const onPrompt = buildOptionalChatPromptWithRetrievedContext(
      'Which file discusses orbital docking?',
      [result('a', 'orbital docking text')],
      true,
      'semantic',
    );

    expect(offPrompt).toBe('Which file discusses orbital docking?');
    expect(onPrompt).toContain('Local SQLite KB context - semantic:');
    expect(onPrompt).toContain('User question:\nWhich file discusses orbital docking?');
  });
});
