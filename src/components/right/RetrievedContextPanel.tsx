import { Database, X } from 'lucide-react';
import { useApp } from '../../state/AppState';
import {
  RETRIEVAL_CHAT_RESULT_LIMIT,
  RETRIEVAL_RESULT_LIMIT,
  resolvedRetrievalKindForDisplay,
  retrievalContextDisplayLabel,
  retrievalMatchKindLabel,
  retrievalSnippet,
  retrievalSource,
  retrievalScoreLabel,
  retrievalTraceSummary,
} from '../../lib/retrievalContext';

export function RetrievedContextPanel() {
  const {
    retrievalQuery,
    retrievalResults,
    retrievalMode,
    retrievalRouteTrace,
    retrievalSelectedChunkIds,
    setRetrievalChunkSelected,
    retrievalEnabledForChat,
    setRetrievalEnabledForChat,
    clearKbRetrieval,
  } = useApp();

  if (!retrievalQuery && retrievalResults.length === 0) return null;

  const hasResults = retrievalResults.length > 0;
  const selectedSet = new Set(retrievalSelectedChunkIds);
  const selectedCount = retrievalResults.filter((result) => selectedSet.has(result.chunk.id)).length;
  const seedCount = retrievalResults.filter((result) => result.graphRole === 'seed').length;
  const expandedCount = retrievalResults.filter((result) => result.graphRole === 'expanded').length;
  const resolvedMode = resolvedRetrievalKindForDisplay(retrievalMode, retrievalRouteTrace);
  const traceSummary = retrievalTraceSummary(retrievalRouteTrace);
  const accent =
    resolvedMode === 'graph'
      ? 'violet'
      : resolvedMode === 'semantic'
        ? 'cyan'
        : resolvedMode === 'hybrid'
          ? 'amber'
          : 'emerald';
  const accentText =
    accent === 'violet'
      ? 'text-violet-300'
      : accent === 'cyan'
        ? 'text-cyan-300'
        : accent === 'amber'
          ? 'text-amber-300'
          : 'text-emerald-300';
  const accentBorder =
    accent === 'violet'
      ? 'border-violet-500/50'
      : accent === 'cyan'
        ? 'border-cyan-500/50'
        : accent === 'amber'
          ? 'border-amber-500/50'
          : 'border-emerald-500/50';
  const panelLabel = `Local KB context - ${retrievalContextDisplayLabel(retrievalMode, retrievalRouteTrace)}`;

  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 px-3 py-2 font-mono">
      <div className="flex items-center gap-2">
        <Database className={`h-3.5 w-3.5 shrink-0 ${accentText}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 type-label uppercase tracking-wider">
            <span className={accentText}>{panelLabel}</span>
            <span className="text-neutral-400">
              {hasResults ? `${retrievalResults.length} chunk${retrievalResults.length === 1 ? '' : 's'}` : 'no matches'}
            </span>
            {resolvedMode === 'graph' && hasResults && (
              <span className="text-neutral-400">
                seeds {seedCount} expanded {expandedCount}
              </span>
            )}
            {hasResults && (
              <span className="text-neutral-400">
                selected {selectedCount}/{Math.min(retrievalResults.length, RETRIEVAL_CHAT_RESULT_LIMIT)}
              </span>
            )}
          </div>
          {retrievalQuery && (
            <div className="truncate type-meta text-neutral-400" title={retrievalQuery}>
              query: {retrievalQuery}
            </div>
          )}
          {traceSummary && (
            <div className="type-meta break-words text-neutral-400">{traceSummary}</div>
          )}
          {retrievalRouteTrace?.warningMessage && (
            <div className="type-meta break-words text-amber-300">{retrievalRouteTrace.warningMessage}</div>
          )}
          {retrievalRouteTrace && (
            <details className="mt-0.5 type-meta text-neutral-400">
              <summary className="cursor-pointer text-neutral-400 hover:text-neutral-300">Route trace</summary>
              <div className="mt-0.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span>Requested</span><span className="text-neutral-400">{retrievalRouteTrace.requestedMode}</span>
                <span>Resolved</span><span className="text-neutral-400">{retrievalRouteTrace.resolvedMode}</span>
                <span>Reason</span><span className="text-neutral-400">{retrievalRouteTrace.routeReason}</span>
                <span>Semantic</span><span className="text-neutral-400">{retrievalRouteTrace.semanticIndexState}</span>
                <span>Ready</span><span className="text-neutral-400">{retrievalRouteTrace.semanticReady ? 'yes' : 'no'}</span>
                <span>Chunks</span><span className="text-neutral-400">{retrievalRouteTrace.embeddedActiveChunkCount}/{retrievalRouteTrace.activeChunkCount}</span>
                <span>Missing</span><span className="text-neutral-400">{retrievalRouteTrace.missingActiveChunkCount}</span>
                <span>Graph tried</span><span className="text-neutral-400">{retrievalRouteTrace.graphExpansionAttempted ? 'yes' : 'no'}</span>
                <span>Graph counts</span><span className="text-neutral-400">{retrievalRouteTrace.graphSeedCount ?? 0} seed / {retrievalRouteTrace.graphExpandedCount ?? 0} expanded</span>
                <span>Fallback</span><span className="text-neutral-400">{retrievalRouteTrace.fallbackFrom ?? 'none'}</span>
                <span>Local only</span><span className="text-neutral-400">{retrievalRouteTrace.localOnly ? 'yes' : 'no'}</span>
                <span>Attach</span><span className="text-neutral-400">{retrievalRouteTrace.attachEnabled ? 'on' : 'off'}</span>
                <span>Selected</span><span className="text-neutral-400">{retrievalRouteTrace.selectedResultCount}/{retrievalRouteTrace.resultCount}</span>
              </div>
            </details>
          )}
        </div>
        <button
          onClick={() => setRetrievalEnabledForChat(!retrievalEnabledForChat)}
          disabled={!hasResults || selectedCount === 0}
          className={`shrink-0 border px-1.5 py-0.5 type-control uppercase tracking-wider disabled:opacity-40 ${
            retrievalEnabledForChat
              ? `${accentBorder} ${accentText}`
              : 'border-neutral-800 text-neutral-400 hover:text-neutral-300'
          }`}
          title="Attach or detach retrieved chunks for the next chat request"
          aria-label="Toggle retrieved context for chat"
        >
          {retrievalEnabledForChat ? 'Attach on' : 'Attach off'}
        </button>
        <button
          onClick={clearKbRetrieval}
          className="shrink-0 text-neutral-400 hover:text-neutral-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
          title="Clear retrieved context"
          aria-label="Clear retrieved context"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {hasResults && (
        <div className="mt-2 grid gap-1.5">
          {retrievalResults.slice(0, RETRIEVAL_RESULT_LIMIT).map((result, index) => {
            const selected = selectedSet.has(result.chunk.id);
            const selectionDisabled = !selected && selectedCount >= RETRIEVAL_CHAT_RESULT_LIMIT;
            return (
              <div key={result.chunk.id} className="border border-neutral-800 bg-black/30 p-1.5">
                <div className="flex items-center gap-1 type-label uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={selectionDisabled}
                    onChange={(event) => setRetrievalChunkSelected(result.chunk.id, event.currentTarget.checked)}
                    className="h-3 w-3 accent-emerald-500 disabled:opacity-40"
                    aria-label={`${selected ? 'Deselect' : 'Select'} ${result.documentTitle} chunk ${result.chunk.ordinal + 1} for chat context`}
                    title={selectionDisabled ? `Select up to ${RETRIEVAL_CHAT_RESULT_LIMIT} chunks` : 'Select this chunk for chat context'}
                  />
                  <span className={accentText}>KB{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-300">
                    {result.documentTitle}
                  </span>
                  <span className="text-neutral-400">chunk {result.chunk.ordinal + 1}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 type-meta uppercase tracking-wider text-neutral-400">
                  <span className={accentText}>match {retrievalMatchKindLabel(result)}</span>
                  {result.graphRole && <span>role {result.graphRole}</span>}
                  {Number.isFinite(result.traversalDepth) && <span>depth {result.traversalDepth}</span>}
                  {result.expansionType && <span>expansion {result.expansionType.replace(/_/g, ' ')}</span>}
                </div>
                <div className="mt-0.5 truncate type-meta text-neutral-400" title={retrievalSource(result)}>
                  source: {retrievalSource(result)}
                </div>
                {result.graphReason && (
                  <div className="mt-0.5 line-clamp-2 type-meta break-words text-violet-300/75">
                    reason: {result.graphReason}
                  </div>
                )}
                <details className="mt-0.5 type-meta text-neutral-400">
                  <summary className="cursor-pointer hover:text-neutral-300">Scores and graph details</summary>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 uppercase tracking-wider">
                    {Number.isFinite(result.lexicalScore) && <span>lexical {retrievalScoreLabel(result.lexicalScore!)}</span>}
                    {Number.isFinite(result.semanticScore) && <span>semantic {retrievalScoreLabel(result.semanticScore!)}</span>}
                    {Number.isFinite(result.combinedScore) ? (
                      <span>combined {retrievalScoreLabel(result.combinedScore!)}</span>
                    ) : (
                      <span>score {retrievalScoreLabel(result.score)}</span>
                    )}
                    {Number.isFinite(result.graphScore) && <span>graph {retrievalScoreLabel(result.graphScore!)}</span>}
                  </div>
                  {result.graphEntities?.length ? (
                    <div className="mt-0.5 truncate">
                      entities: {result.graphEntities.map((entity) => entity.name).join(', ')}
                    </div>
                  ) : null}
                  {result.graphRelationships?.length ? (
                    <div className="mt-0.5 truncate">
                      relationships:{' '}
                      {result.graphRelationships
                        .map((relationship) => `${relationship.sourceName} -> ${relationship.targetName}`)
                        .join('; ')}
                    </div>
                  ) : null}
                </details>
                <div className="mt-1 line-clamp-2 type-body break-words text-neutral-400">
                  {retrievalSnippet(result, 220)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
