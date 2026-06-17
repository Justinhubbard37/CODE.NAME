import { useState, type FormEvent, type ChangeEvent } from 'react';
import { ScanLine } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { useApp } from '../../state/AppState';
import {
  retrievalMatchKindLabel,
  retrievalSnippet,
  retrievalSource,
  retrievalScoreLabel,
} from '../../lib/retrievalContext';

export function GraphQueryInput() {
  const {
    graphQuery,
    setGraphQuery,
    runGraphQuery,
    ingestFiles,
    gates,
    retrievalResults,
    retrievalMode,
    setRetrievalMode,
    semanticStatus,
    semanticError,
  } = useApp();
  const [ocr, setOcr] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    runGraphQuery(graphQuery);
  };

  const onOcr = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!gates.filesystem) {
      setOcr('FS GATE CLOSED');
      setTimeout(() => setOcr(''), 2500);
      return;
    }
    setOcr('OCR INIT…');
    try {
      const res = await Tesseract.recognize(file, 'eng', {
        logger: (m) =>
          m.status === 'recognizing text'
            ? setOcr(`OCR ${Math.round(m.progress * 100)}%`)
            : setOcr(`OCR ${m.status}…`),
      });
      // Route OCR text through the same gated ingestion pipeline.
      const textFile = new File([res.data.text], file.name.replace(/\.[^.]+$/, '') + '.txt', {
        type: 'text/plain',
      });
      await ingestFiles([textFile]);
      setOcr('');
    } catch {
      setOcr('OCR FAILED');
      setTimeout(() => setOcr(''), 2500);
    }
    e.target.value = '';
  };
  const accent =
    retrievalMode === 'graph'
      ? 'violet'
      : retrievalMode === 'semantic'
        ? 'cyan'
        : retrievalMode === 'hybrid'
          ? 'amber'
          : 'emerald';
  const accentText =
    accent === 'violet'
      ? 'text-violet-300/80'
      : accent === 'cyan'
        ? 'text-cyan-300/80'
        : accent === 'amber'
          ? 'text-amber-300/80'
          : 'text-emerald-400/80';
  const accentBorder =
    accent === 'violet'
      ? 'border-violet-500/20'
      : accent === 'cyan'
        ? 'border-cyan-500/20'
        : accent === 'amber'
          ? 'border-amber-500/20'
          : 'border-emerald-500/20';
  const semanticDependentWarning =
    retrievalMode === 'graph' && !semanticStatus.ready
      ? 'Graph retrieval requires a ready semantic index because it uses Hybrid seed retrieval.'
      : retrievalMode === 'hybrid' && !semanticStatus.ready
      ? 'Hybrid retrieval requires a ready semantic index. Build / Refresh semantic index first.'
      : semanticError;
  const expandedResultCount = retrievalResults.filter((result) => result.graphRole === 'expanded').length;

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 w-[min(80%,30rem)] pointer-events-auto text-[10px] font-mono">
      <div className="flex justify-between items-end mb-1">
        <span className="text-neutral-500 uppercase tracking-wider">Graph / KB Search</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRetrievalMode('lexical')}
            className={`border px-2 py-0.5 uppercase tracking-wider ${
              retrievalMode === 'lexical'
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                : 'border-neutral-700 bg-neutral-900 text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Lexical
          </button>
          <button
            type="button"
            onClick={() => setRetrievalMode('semantic')}
            className={`border px-2 py-0.5 uppercase tracking-wider ${
              retrievalMode === 'semantic'
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                : 'border-neutral-700 bg-neutral-900 text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Semantic
          </button>
          <button
            type="button"
            onClick={() => setRetrievalMode('hybrid')}
            className={`border px-2 py-0.5 uppercase tracking-wider ${
              retrievalMode === 'hybrid'
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                : 'border-neutral-700 bg-neutral-900 text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Hybrid
          </button>
          <button
            type="button"
            onClick={() => setRetrievalMode('graph')}
            className={`border px-2 py-0.5 uppercase tracking-wider ${
              retrievalMode === 'graph'
                ? 'border-violet-500/50 bg-violet-500/10 text-violet-200'
                : 'border-neutral-700 bg-neutral-900 text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Graph
          </button>
          <label className="cursor-pointer bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 px-2 py-0.5 flex items-center gap-1 tracking-wider">
            <ScanLine className="w-3 h-3" aria-hidden="true" /> OCR
            <input type="file" accept="image/*" className="hidden" onChange={onOcr} aria-label="Scan an image with OCR and ingest its text" />
          </label>
        </div>
      </div>
      <form
        onSubmit={submit}
        className="flex items-center bg-neutral-900/90 border border-neutral-800 backdrop-blur-sm px-2 py-1.5"
      >
        <span aria-hidden="true" className="text-emerald-500 mr-2">{'>'}</span>
        <input
          value={graphQuery}
          onChange={(e) => setGraphQuery(e.target.value)}
          aria-label="Graph and SQLite KB search"
          placeholder={
            retrievalMode === 'graph'
              ? 'Query graph traversal retrieval...'
              : retrievalMode === 'hybrid'
              ? 'Query hybrid SQLite KB retrieval...'
              : retrievalMode === 'semantic'
              ? 'Query semantic KB embeddings...'
              : 'Query graph + retrieve SQLite KB chunks...'
          }
          className="flex-1 bg-transparent outline-none text-neutral-200 placeholder-neutral-600"
        />
        {ocr && <span className="ml-2 text-[8px] text-emerald-400 animate-pulse whitespace-nowrap">{ocr}</span>}
      </form>
      {(retrievalMode === 'semantic' || retrievalMode === 'hybrid' || retrievalMode === 'graph') && (
        <div className={`mt-1 bg-neutral-950/85 border px-2 py-1 text-[8px] uppercase tracking-wider ${
          retrievalMode === 'graph'
            ? 'border-violet-500/20 text-violet-200/80'
            : retrievalMode === 'hybrid'
              ? 'border-amber-500/20 text-amber-200/80'
              : 'border-cyan-500/20 text-cyan-200/80'
        }`}>
          Semantic index: {semanticStatus.embeddedActiveChunkCount}/{semanticStatus.activeChunkCount} chunks
          {semanticStatus.ready ? ' ready' : ` ${semanticStatus.state}`}
          {semanticDependentWarning ? <span className="block normal-case tracking-normal text-amber-300">{semanticDependentWarning}</span> : null}
        </div>
      )}
      {retrievalResults.length > 0 && (
        <div className={`mt-1 bg-neutral-950/90 border backdrop-blur-sm p-2 max-h-28 overflow-y-auto ${accentBorder}`}>
          <div className={`text-[8px] uppercase tracking-wider mb-1 ${accentText}`}>
            {retrievalMode === 'graph'
              ? 'Graph SQLite KB traversal'
              : retrievalMode === 'hybrid'
                ? 'Hybrid SQLite KB retrieval'
                : retrievalMode === 'semantic'
                ? 'Semantic SQLite KB retrieval'
                : 'Lexical SQLite KB retrieval'}
            {retrievalMode === 'graph' && expandedResultCount === 0 ? (
              <span className="block text-[8px] normal-case tracking-normal text-neutral-500">
                Seed-only: no graph-expanded evidence found
              </span>
            ) : null}
          </div>
          <div className="space-y-1">
            {retrievalResults.slice(0, 4).map((result, index) => (
              <div key={result.chunk.id} className="text-[9px] text-neutral-400 leading-snug">
                <span className={accentText}>#{index + 1}</span>{' '}
                <span className="text-neutral-200">{result.documentTitle}</span>
                <span className="text-neutral-600"> · chunk {result.chunk.ordinal + 1}</span>
                <span className="text-neutral-700"> - match {retrievalMatchKindLabel(result)}</span>
                {result.graphRole && (
                  <span className="text-neutral-700"> - role {result.graphRole}</span>
                )}
                {Number.isFinite(result.combinedScore) ? (
                  <span className="text-neutral-700"> - combined {retrievalScoreLabel(result.combinedScore!)}</span>
                ) : (
                  <span className="text-neutral-700"> - score {retrievalScoreLabel(result.score)}</span>
                )}
                {Number.isFinite(result.graphScore) && (
                  <span className="text-neutral-700"> - graph {retrievalScoreLabel(result.graphScore!)}</span>
                )}
                <div className="truncate text-neutral-600">source: {retrievalSource(result)}</div>
                {result.graphReason && (
                  <div className="truncate text-violet-300/70">reason: {result.graphReason}</div>
                )}
                <div className="truncate">{retrievalSnippet(result)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
