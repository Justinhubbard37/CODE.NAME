import { describe, expect, it } from 'vitest';
import {
  buildChatPromptWithRetrievedContext,
  buildOptionalChatPromptWithRetrievedContext,
  clearRetrievedContextState,
  filterRetrievalResultsForDeletedDocument,
  formatRetrievedContextBlock,
  retrievedContextAfterDocumentDelete,
  retrievedContextAfterSearch,
  retrievalCitationLabel,
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

describe('retrieval context helpers', () => {
  it('formats source labels and one-based citation labels', () => {
    const item = result('a', 'alpha chunk', 2);

    expect(retrievalSource(item)).toBe('a.txt');
    expect(retrievalCitationLabel(item, 0)).toBe('KB1');
    expect(retrievalModeLabel('semantic')).toBe('semantic');
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
    expect(state.attachEnabled).toBe(false);
    expect(state.mode).toBe('semantic');
  });

  it('clears active retrieval state', () => {
    expect(clearRetrievedContextState()).toEqual({
      query: '',
      results: [],
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
      { query: 'alpha', results: [result('a', 'alpha')], attachEnabled: true, mode: 'semantic' },
      'doc-a',
    );

    expect(state).toEqual(clearRetrievedContextState('semantic'));
    expect(buildOptionalChatPromptWithRetrievedContext('question', state.results, state.attachEnabled, state.mode))
      .toBe('question');
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
