import { Database, X } from 'lucide-react';
import { useApp } from '../../state/AppState';
import {
  retrievalSnippet,
  retrievalSource,
  retrievalScoreLabel,
} from '../../lib/retrievalContext';

export function RetrievedContextPanel() {
  const {
    retrievalQuery,
    retrievalResults,
    retrievalMode,
    retrievalEnabledForChat,
    setRetrievalEnabledForChat,
    clearKbRetrieval,
  } = useApp();

  if (!retrievalQuery && retrievalResults.length === 0) return null;

  const hasResults = retrievalResults.length > 0;
  const accent = retrievalMode === 'semantic' ? 'cyan' : 'emerald';

  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 px-3 py-2 font-mono">
      <div className="flex items-center gap-2">
        <Database className={`h-3.5 w-3.5 shrink-0 ${accent === 'cyan' ? 'text-cyan-300' : 'text-emerald-400'}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider">
            <span className={accent === 'cyan' ? 'text-cyan-300' : 'text-emerald-300'}>
              Local KB context - {retrievalMode}
            </span>
            <span className="text-neutral-600">
              {hasResults ? `${retrievalResults.length} chunk${retrievalResults.length === 1 ? '' : 's'}` : 'no matches'}
            </span>
          </div>
          {retrievalQuery && (
            <div className="truncate text-[8px] text-neutral-600" title={retrievalQuery}>
              query: {retrievalQuery}
            </div>
          )}
        </div>
        <button
          onClick={() => setRetrievalEnabledForChat(!retrievalEnabledForChat)}
          disabled={!hasResults}
          className={`shrink-0 border px-1.5 py-0.5 text-[8px] uppercase tracking-wider disabled:opacity-40 ${
            retrievalEnabledForChat
              ? accent === 'cyan'
                ? 'border-cyan-500/50 text-cyan-300'
                : 'border-emerald-500/50 text-emerald-300'
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
          {retrievalResults.slice(0, 4).map((result, index) => (
            <div key={result.chunk.id} className="border border-neutral-800 bg-black/30 p-1.5">
              <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider">
                <span className={accent === 'cyan' ? 'text-cyan-300' : 'text-emerald-300'}>KB{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-neutral-300">
                  {result.documentTitle}
                </span>
                <span className="text-neutral-600">chunk {result.chunk.ordinal + 1}</span>
                <span className="text-neutral-700">score {retrievalScoreLabel(result.score)}</span>
              </div>
              <div className="mt-0.5 truncate text-[8px] text-neutral-600" title={retrievalSource(result)}>
                source: {retrievalSource(result)}
              </div>
              <div className="mt-1 line-clamp-2 text-[9px] leading-snug text-neutral-400">
                {retrievalSnippet(result, 220)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
