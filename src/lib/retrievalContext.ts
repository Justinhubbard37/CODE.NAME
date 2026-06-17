import type {
  KbResolvedRetrievalMode,
  KbRetrievalKind,
  KbRetrievalMode,
  KbSearchResult,
} from './kb';

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
  routeTrace?: RetrievalRouteTrace;
};

export type RetrievalRouteTrace = {
  requestedMode: KbRetrievalMode;
  resolvedMode: KbResolvedRetrievalMode;
  routeReason: string;
  semanticIndexState: string;
  semanticReady: boolean;
  activeChunkCount: number;
  embeddedActiveChunkCount: number;
  missingActiveChunkCount: number;
  graphExpansionAttempted: boolean;
  graphSeedCount?: number;
  graphExpandedCount?: number;
  fallbackFrom?: KbRetrievalKind;
  fallbackReason?: string;
  warningMessage?: string;
  localOnly: true;
  attachEnabled: boolean;
  selectedResultCount: number;
  resultCount: number;
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

export function retrievalModeLabel(mode: KbRetrievalMode | KbResolvedRetrievalMode): string {
  if (mode === 'auto') return 'auto';
  if (mode === 'none') return 'none';
  if (mode === 'semantic') return 'semantic';
  if (mode === 'hybrid') return 'hybrid';
  if (mode === 'graph') return 'graph traversal';
  return 'lexical';
}

function isResolvedKind(mode: KbResolvedRetrievalMode | KbRetrievalMode | undefined): mode is KbRetrievalKind {
  return mode === 'lexical' || mode === 'semantic' || mode === 'hybrid' || mode === 'graph';
}

export function resolvedRetrievalKindForDisplay(
  mode: KbRetrievalMode,
  routeTrace?: RetrievalRouteTrace,
): KbRetrievalKind {
  if (mode === 'auto' && isResolvedKind(routeTrace?.resolvedMode)) return routeTrace.resolvedMode;
  if (isResolvedKind(mode)) return mode;
  return 'lexical';
}

export function retrievalContextDisplayLabel(
  mode: KbRetrievalMode,
  routeTrace?: RetrievalRouteTrace,
): string {
  if (mode === 'auto' && isResolvedKind(routeTrace?.resolvedMode)) {
    return `auto -> ${retrievalModeLabel(routeTrace.resolvedMode)}`;
  }
  return retrievalModeLabel(mode);
}

export function retrievalPromptModeLabel(
  mode: KbRetrievalMode,
  routeTrace?: RetrievalRouteTrace,
): string {
  if (mode === 'auto' && isResolvedKind(routeTrace?.resolvedMode)) {
    return `auto resolved ${retrievalModeLabel(routeTrace.resolvedMode)}`;
  }
  return retrievalModeLabel(mode);
}

function sentenceFragment(value: string): string {
  return value.trim().replace(/\.$/, '');
}

export function retrievalTraceSummary(trace?: RetrievalRouteTrace): string {
  if (!trace) return '';
  if (trace.warningMessage?.startsWith('Graph seed-only')) {
    return 'Graph seed-only - no graph-expanded evidence found.';
  }
  if (trace.requestedMode === 'auto') {
    if (trace.resolvedMode === 'none') return `Auto skipped retrieval - ${sentenceFragment(trace.routeReason)}.`;
    if (trace.fallbackFrom) {
      return `Auto used Lexical fallback - ${sentenceFragment(trace.fallbackReason ?? trace.routeReason)}.`;
    }
    if (trace.resolvedMode === 'graph' && (trace.graphExpandedCount ?? 0) > 0) {
      return 'Auto chose Graph - relationship query with graph expansion.';
    }
    return `Auto chose ${retrievalModeLabel(trace.resolvedMode)} - ${sentenceFragment(trace.routeReason)}.`;
  }
  if (trace.resolvedMode === 'none') return sentenceFragment(trace.routeReason);
  return `Manual ${retrievalModeLabel(trace.resolvedMode)} retrieval.`;
}

function graphValueLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

export function retrievalMatchKindLabel(result: KbSearchResult): string {
  if (result.graphRole === 'seed') return 'graph seed';
  if (result.graphRole === 'expanded') {
    return result.expansionType ? graphValueLabel(result.expansionType) : 'graph expanded';
  }
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

export function updateRouteTraceCounts(
  routeTrace: RetrievalRouteTrace | undefined,
  results: KbSearchResult[],
  selectedChunkIds: string[],
  attachEnabled: boolean,
): RetrievalRouteTrace | undefined {
  if (!routeTrace) return undefined;
  const selected = new Set(selectedChunkIds);
  const graphSeedCount = results.filter((result) => result.graphRole === 'seed').length;
  const graphExpandedCount = results.filter((result) => result.graphRole === 'expanded').length;
  const graphSeedOnly =
    routeTrace.resolvedMode === 'graph' &&
    routeTrace.graphExpansionAttempted &&
    results.length > 0 &&
    graphExpandedCount === 0;
  return {
    ...routeTrace,
    resultCount: results.length,
    selectedResultCount: results.filter((result) => selected.has(result.chunk.id)).length,
    attachEnabled,
    graphSeedCount: routeTrace.graphExpansionAttempted ? graphSeedCount : routeTrace.graphSeedCount,
    graphExpandedCount: routeTrace.graphExpansionAttempted
      ? graphExpandedCount
      : routeTrace.graphExpandedCount,
    warningMessage: graphSeedOnly
      ? 'Graph seed-only: no graph-expanded evidence found.'
      : routeTrace.warningMessage,
  };
}

export function clearRetrievedContextState(mode: KbRetrievalMode = 'auto'): RetrievedContextState {
  return { query: '', results: [], selectedChunkIds: [], attachEnabled: false, mode };
}

export function retrievedContextAfterSearch(
  query: string,
  results: KbSearchResult[],
  mode: KbRetrievalMode = 'auto',
  routeTrace?: RetrievalRouteTrace,
): RetrievedContextState {
  const selectedChunkIds = defaultSelectedChunkIds(results);
  return {
    query,
    results,
    selectedChunkIds,
    attachEnabled: false,
    mode,
    routeTrace: updateRouteTraceCounts(routeTrace, results, selectedChunkIds, false),
  };
}

export function retrievedContextAfterDocumentDelete(
  state: RetrievedContextState,
  documentId: string,
): RetrievedContextState {
  const results = filterRetrievalResultsForDeletedDocument(state.results, documentId);
  if (results.length === 0) return clearRetrievedContextState(state.mode);
  const selectedChunkIds = filterSelectedChunkIdsForResults(state.selectedChunkIds, results);
  const attachEnabled = state.attachEnabled && selectedChunkIds.length > 0;
  return {
    ...state,
    results,
    selectedChunkIds,
    attachEnabled,
    routeTrace: updateRouteTraceCounts(state.routeTrace, results, selectedChunkIds, attachEnabled),
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
      result.graphRole ? `graph role: ${result.graphRole}` : '',
      Number.isFinite(result.traversalDepth) ? `depth: ${result.traversalDepth}` : '',
      result.expansionType ? `expansion: ${graphValueLabel(result.expansionType)}` : '',
      result.seedChunkId ? `seed chunk: ${result.seedChunkId}` : '',
      result.graphReason ? `graph reason: ${result.graphReason}` : '',
      Number.isFinite(result.graphScore) ? `graph score: ${retrievalScoreLabel(result.graphScore!)}` : '',
      result.matchKind ? `match: ${result.matchKind}` : '',
      Number.isFinite(result.lexicalScore) ? `lexical: ${retrievalScoreLabel(result.lexicalScore!)}` : '',
      Number.isFinite(result.semanticScore) ? `semantic: ${retrievalScoreLabel(result.semanticScore!)}` : '',
      Number.isFinite(result.combinedScore) ? `combined: ${retrievalScoreLabel(result.combinedScore!)}` : '',
      Number.isFinite(result.combinedDisplayScore) ? `display score: ${retrievalScoreLabel(result.combinedDisplayScore!)}` : '',
      result.graphEntities?.length
        ? `graph entities: ${result.graphEntities.map((entity) => `${entity.name} (${entity.kind})`).join(', ')}`
        : '',
      result.graphRelationships?.length
        ? `graph relationships: ${result.graphRelationships
            .map((relationship) => `${relationship.sourceName} -${relationship.kind}-> ${relationship.targetName}`)
            .join('; ')}`
        : '',
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
  mode: KbRetrievalMode = 'auto',
  routeTrace?: RetrievalRouteTrace,
): string {
  const context = formatRetrievedContextBlock(results);
  if (!context) return userQuestion;
  return `Local SQLite KB context - ${retrievalPromptModeLabel(mode, routeTrace)}:\n${context}\n\nUser question:\n${userQuestion}`;
}

export function buildOptionalChatPromptWithRetrievedContext(
  userQuestion: string,
  results: KbSearchResult[],
  attachEnabled: boolean,
  mode: KbRetrievalMode = 'auto',
  routeTrace?: RetrievalRouteTrace,
): string {
  if (!attachEnabled) return userQuestion;
  return buildChatPromptWithRetrievedContext(userQuestion, results, mode, routeTrace);
}
