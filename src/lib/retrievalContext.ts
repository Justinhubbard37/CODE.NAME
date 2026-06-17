import type { KbRetrievalMode, KbSearchResult } from './kb';

export const RETRIEVAL_RESULT_LIMIT = 6;
export const RETRIEVAL_CHAT_RESULT_LIMIT = 4;
export const RETRIEVAL_CHAT_CHARS_PER_CHUNK = 700;
export const RETRIEVAL_CHAT_MAX_CHARS = 3200;

export type RetrievedContextState = {
  query: string;
  results: KbSearchResult[];
  selectedChunkIds: string[];
  attachEnabled: boolean;
  mode: KbRetrievalMode;
};

function clipText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const bodyLimit = Math.max(0, maxChars - 3);
  const clipped = text.slice(0, bodyLimit).trimEnd();
  const boundary = clipped.lastIndexOf(' ');
  const wordSafe =
    boundary >= Math.floor(bodyLimit * 0.6)
      ? clipped.slice(0, boundary).trimEnd()
      : clipped;
  return `${wordSafe}...`;
}

export function retrievalSource(result: KbSearchResult): string {
  return result.sourceUri?.trim() || result.documentTitle || result.chunk.documentId;
}

export function retrievalCitationLabel(result: KbSearchResult, index: number): string {
  return `KB${index + 1}`;
}

export function retrievalSnippet(result: KbSearchResult, maxChars = 180): string {
  const text = result.chunk.text.replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return clipText(text, maxChars);
}

export function retrievalScoreLabel(score: number): string {
  if (!Number.isFinite(score)) return 'n/a';
  return score.toFixed(2);
}

export function retrievalModeLabel(mode: KbRetrievalMode): string {
  if (mode === 'semantic') return 'semantic';
  if (mode === 'hybrid') return 'hybrid';
  return 'lexical';
}

export function retrievalMatchKindLabel(result: KbSearchResult): string {
  return result.matchKind ?? result.retrievalKind ?? 'lexical';
}

export function filterRetrievalResultsForDeletedDocument(
  results: KbSearchResult[],
  documentId: string,
): KbSearchResult[] {
  return results.filter((result) => result.chunk.documentId !== documentId);
}

export function defaultSelectedChunkIds(
  results: KbSearchResult[],
  maxResults = RETRIEVAL_CHAT_RESULT_LIMIT,
): string[] {
  return limitedRetrievalResults(results, maxResults).map((result) => result.chunk.id);
}

export function selectedRetrievalResults(
  results: KbSearchResult[],
  selectedChunkIds: string[],
  maxResults = RETRIEVAL_CHAT_RESULT_LIMIT,
): KbSearchResult[] {
  const selected = new Set(selectedChunkIds);
  return limitedRetrievalResults(
    results.filter((result) => selected.has(result.chunk.id)),
    maxResults,
  );
}

export function filterSelectedChunkIdsForResults(
  selectedChunkIds: string[],
  results: KbSearchResult[],
): string[] {
  const activeIds = new Set(results.map((result) => result.chunk.id));
  return selectedChunkIds.filter((chunkId) => activeIds.has(chunkId));
}

export function clearRetrievedContextState(mode: KbRetrievalMode = 'lexical'): RetrievedContextState {
  return { query: '', results: [], selectedChunkIds: [], attachEnabled: false, mode };
}

export function retrievedContextAfterSearch(
  query: string,
  results: KbSearchResult[],
  mode: KbRetrievalMode = 'lexical',
): RetrievedContextState {
  return {
    query,
    results,
    selectedChunkIds: defaultSelectedChunkIds(results),
    attachEnabled: false,
    mode,
  };
}

export function retrievedContextAfterDocumentDelete(
  state: RetrievedContextState,
  documentId: string,
): RetrievedContextState {
  const results = filterRetrievalResultsForDeletedDocument(state.results, documentId);
  if (results.length === 0) return clearRetrievedContextState(state.mode);
  const selectedChunkIds = filterSelectedChunkIdsForResults(state.selectedChunkIds, results);
  return {
    ...state,
    results,
    selectedChunkIds,
    attachEnabled: state.attachEnabled && selectedChunkIds.length > 0,
  };
}

export function limitedRetrievalResults(
  results: KbSearchResult[],
  maxResults = RETRIEVAL_CHAT_RESULT_LIMIT,
): KbSearchResult[] {
  return results.slice(0, Math.max(0, maxResults));
}

export function formatRetrievedContextBlock(
  results: KbSearchResult[],
  options: {
    maxResults?: number;
    charsPerChunk?: number;
    maxTotalChars?: number;
  } = {},
): string {
  const maxResults = options.maxResults ?? RETRIEVAL_CHAT_RESULT_LIMIT;
  const charsPerChunk = options.charsPerChunk ?? RETRIEVAL_CHAT_CHARS_PER_CHUNK;
  const maxTotalChars = options.maxTotalChars ?? RETRIEVAL_CHAT_MAX_CHARS;
  const blocks: string[] = [];

  for (const [index, result] of limitedRetrievalResults(results, maxResults).entries()) {
    const label = retrievalCitationLabel(result, index);
    const source = retrievalSource(result);
    const chunk = result.chunk.text.replace(/\s+/g, ' ').trim();
    const clipped = clipText(chunk, charsPerChunk);
    const metadata = [
      result.matchKind ? `match: ${result.matchKind}` : '',
      Number.isFinite(result.lexicalScore) ? `lexical: ${retrievalScoreLabel(result.lexicalScore!)}` : '',
      Number.isFinite(result.semanticScore) ? `semantic: ${retrievalScoreLabel(result.semanticScore!)}` : '',
      Number.isFinite(result.combinedScore) ? `combined: ${retrievalScoreLabel(result.combinedScore!)}` : '',
    ].filter(Boolean);
    const metadataText = metadata.length ? ` | ${metadata.join(' | ')}` : '';
    blocks.push(
      `[${label}] Document: ${result.documentTitle} | chunk ${result.chunk.ordinal + 1} | source: ${source}${metadataText}\n${clipped}`,
    );
  }

  const joined = blocks.join('\n\n');
  if (joined.length <= maxTotalChars) return joined;
  return clipText(joined, maxTotalChars);
}

export function buildChatPromptWithRetrievedContext(
  userQuestion: string,
  results: KbSearchResult[],
  mode: KbRetrievalMode = 'lexical',
): string {
  const context = formatRetrievedContextBlock(results);
  if (!context) return userQuestion;
  return `Local SQLite KB context - ${retrievalModeLabel(mode)}:\n${context}\n\nUser question:\n${userQuestion}`;
}

export function buildOptionalChatPromptWithRetrievedContext(
  userQuestion: string,
  results: KbSearchResult[],
  attachEnabled: boolean,
  mode: KbRetrievalMode = 'lexical',
): string {
  if (!attachEnabled) return userQuestion;
  return buildChatPromptWithRetrievedContext(userQuestion, results, mode);
}
