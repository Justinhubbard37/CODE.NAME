import type { KbSearchResult } from './kb';

export const RETRIEVAL_RESULT_LIMIT = 6;
export const RETRIEVAL_CHAT_RESULT_LIMIT = 4;
export const RETRIEVAL_CHAT_CHARS_PER_CHUNK = 700;
export const RETRIEVAL_CHAT_MAX_CHARS = 3200;

export type RetrievedContextState = {
  query: string;
  results: KbSearchResult[];
  attachEnabled: boolean;
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

export function filterRetrievalResultsForDeletedDocument(
  results: KbSearchResult[],
  documentId: string,
): KbSearchResult[] {
  return results.filter((result) => result.chunk.documentId !== documentId);
}

export function clearRetrievedContextState(): RetrievedContextState {
  return { query: '', results: [], attachEnabled: false };
}

export function retrievedContextAfterSearch(
  query: string,
  results: KbSearchResult[],
): RetrievedContextState {
  return { query, results, attachEnabled: false };
}

export function retrievedContextAfterDocumentDelete(
  state: RetrievedContextState,
  documentId: string,
): RetrievedContextState {
  const results = filterRetrievalResultsForDeletedDocument(state.results, documentId);
  if (results.length === 0) return clearRetrievedContextState();
  return { ...state, results };
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
    blocks.push(
      `[${label}] Document: ${result.documentTitle} | chunk ${result.chunk.ordinal + 1} | source: ${source}\n${clipped}`,
    );
  }

  const joined = blocks.join('\n\n');
  if (joined.length <= maxTotalChars) return joined;
  return clipText(joined, maxTotalChars);
}

export function buildChatPromptWithRetrievedContext(
  userQuestion: string,
  results: KbSearchResult[],
): string {
  const context = formatRetrievedContextBlock(results);
  if (!context) return userQuestion;
  return `Local SQLite KB context:\n${context}\n\nUser question:\n${userQuestion}`;
}

export function buildOptionalChatPromptWithRetrievedContext(
  userQuestion: string,
  results: KbSearchResult[],
  attachEnabled: boolean,
): string {
  if (!attachEnabled) return userQuestion;
  return buildChatPromptWithRetrievedContext(userQuestion, results);
}
