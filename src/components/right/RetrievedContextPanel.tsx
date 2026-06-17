import { Database, X } from 'lucide-react';
import { useApp } from '../../state/AppState';
import {
  RETRIEVAL_CHAT_RESULT_LIMIT,
  RETRIEVAL_RESULT_LIMIT,
  retrievalMatchKindLabel,
  retrievalSnippet,
  retrievalSource,
  retrievalScoreLabel,
} from '../../lib/retrievalContext';

export function RetrievedContextPanel() {
  const {
    retrievalQuery,
    retrievalResults,
    retrievalMode,
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
  const accent = retrievalMode === 'semantic' ? 'cyan' : retrievalMode === 'hybrid' ? 'amber' : 'emerald';
  const accentText =
    accent === 'cyan' ? 'text-cyan-300' : accent === 'amber' ? 'text-amber-300' : 'text-emerald-300';
  const accentBorder =
    accent === 'cyan' ? 'border-cyan-500/50' : accent === 'amber' ? 'border-amber-500/50' : 'border-emerald-500/50';

  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 px-3 py-2 font-mono">
      <div className="flex items-center gap-2">
        <Database className={`h-3.5 w-3.5 shrink-0 ${accentText}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider">
            <span className={accentText}>
              Local KB context - {retrievalMode}
            </span>
            <span className="text-neutral-600">
              {hasResults ? `${retrievalResults.length} chunk${retrievalResults.length === 1 ? '' : 's'}` : 'no matches'}
            </span>
            {hasResults && (
              <span className="text-neutral-500">
                selected {selectedCount}/{Math.min(retrievalResults.length, RETRIEVAL_CHAT_RESULT_LIMIT)}
              </span>
            )}
          </div>
          {retrievalQuery && (
            <div className="truncate text-[8px] text-neutral-600" title={retrievalQuery}>
              query: {retrievalQuery}
            </div>
          )}
        </div>
        <button
          onClick={() => setRetrievalEnabledForChat(!retrievalEnabledForChat)}
          disabled={!hasResults || selectedCount === 0}
          className={`shrink-0 border px-1.5 py-0.5 text-[8px] uppercase tracking-wider disabled:opacity-40 ${
            retrievalEnabledForChat
              ? `${accentBorder} ${accentText}`
              : 'border-neutral-800 text-neutral-500 hover:text-neutral-300'
          }`}
          title="Attach or detach retrieved chunks for the next chat request"
          aria-label="Toggle retrieved context for chat"
        >
          {retrievalEnabledForChat ? 'Attach on' : 'Attach off'}
        </button>
        <button
          onClick={clearKbRetrieval}
          className="shrink-0 text-neutral-600 hover:text-neutral-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
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
              <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider">
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
                <span className="text-neutral-600">chunk {result.chunk.ordinal + 1}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] uppercase tracking-wider text-neutral-600">
                <span className={accentText}>match {retrievalMatchKindLabel(result)}</span>
                {Number.isFinite(result.lexicalScore) && (
                  <span>lexical {retrievalScoreLabel(result.lexicalScore!)}</span>
                )}
                {Number.isFinite(result.semanticScore) && (
                  <span>semantic {retrievalScoreLabel(result.semanticScore!)}</span>
                )}
                {Number.isFinite(result.combinedScore) ? (
                  <span>combined {retrievalScoreLabel(result.combinedScore!)}</span>
                ) : (
                  <span>score {retrievalScoreLabel(result.score)}</span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[8px] text-neutral-600" title={retrievalSource(result)}>
                source: {retrievalSource(result)}
              </div>
              <div className="mt-1 line-clamp-2 text-[9px] leading-snug text-neutral-400">
                {retrievalSnippet(result, 220)}
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  );
}
