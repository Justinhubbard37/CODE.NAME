import { useState, type FormEvent, type ChangeEvent } from 'react';
import { ChevronDown, ScanLine } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { useApp } from '../../state/AppState';
import {
  resolvedRetrievalKindForDisplay,
  retrievalContextDisplayLabel,
  retrievalMatchKindLabel,
  retrievalSnippet,
  retrievalSource,
} from '../../lib/retrievalContext';
import type { KbRetrievalMode } from '../../lib/kb';

const MANUAL_MODES: Exclude<KbRetrievalMode, 'auto'>[] = ['lexical', 'semantic', 'hybrid', 'graph'];

function modeTitle(mode: KbRetrievalMode): string {
  if (mode === 'auto') return 'Auto';
  if (mode === 'graph') return 'Graph';
  return mode[0].toUpperCase() + mode.slice(1);
}

export function GraphQueryInput() {
  const {
    graphQuery,
    setGraphQuery,
    runGraphQuery,
    ingestFiles,
    gates,
    retrievalResults,
    retrievalMode,
    retrievalRouteTrace,
    setRetrievalMode,
  } = useApp();
  const [ocr, setOcr] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
    setOcr('OCR INIT...');
    try {
      const res = await Tesseract.recognize(file, 'eng', {
        logger: (m) =>
          m.status === 'recognizing text'
            ? setOcr(`OCR ${Math.round(m.progress * 100)}%`)
            : setOcr(`OCR ${m.status}...`),
      });
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

  const resolvedMode = resolvedRetrievalKindForDisplay(retrievalMode, retrievalRouteTrace);
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
  const expandedResultCount = retrievalResults.filter((result) => result.graphRole === 'expanded').length;

  return (
    <div className="absolute bottom-2 left-1/2 z-20 w-[min(86%,21.5rem)] -translate-x-1/2 pointer-events-auto type-label font-mono">
      <div className="mb-1 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="type-label text-neutral-400 uppercase tracking-wider">KB Search</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setRetrievalMode('auto')}
              className={`border px-2 py-0.5 type-control uppercase tracking-wider ${
                retrievalMode === 'auto'
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-300'
              }`}
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => setAdvancedOpen((value) => !value)}
              aria-expanded={advancedOpen}
              className="flex items-center gap-1 border border-neutral-700 bg-neutral-900 px-2 py-0.5 type-control uppercase tracking-wider text-neutral-400 hover:text-neutral-300"
            >
              Advanced
              <ChevronDown className={`h-3 w-3 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            <label className="cursor-pointer bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 px-2 py-0.5 flex items-center gap-1 type-control tracking-wider">
              <ScanLine className="w-3 h-3" aria-hidden="true" /> OCR
              <input type="file" accept="image/*" className="hidden" onChange={onOcr} aria-label="Scan an image with OCR and ingest its text" />
            </label>
          </div>
        </div>
        {advancedOpen && (
          <div className="flex flex-wrap justify-end gap-1">
            {MANUAL_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRetrievalMode(mode)}
                className={`border px-2 py-0.5 type-control uppercase tracking-wider ${
                  retrievalMode === mode
                    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-300'
                }`}
              >
                {modeTitle(mode)}
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        onSubmit={submit}
        className="flex items-center bg-neutral-900/90 border border-neutral-800 backdrop-blur-sm px-2 py-1.5"
      >
        <span aria-hidden="true" className="text-emerald-500 mr-2">{'>'}</span>
        <input
          value={graphQuery}
          onChange={(e) => setGraphQuery(e.target.value)}
          aria-label="Knowledge search"
          placeholder={
            retrievalMode === 'auto'
              ? 'Ask or search your knowledge...'
              : retrievalMode === 'graph'
                ? 'Query graph traversal retrieval...'
                : retrievalMode === 'hybrid'
                  ? 'Query hybrid SQLite KB retrieval...'
                  : retrievalMode === 'semantic'
                    ? 'Query semantic KB embeddings...'
                    : 'Query lexical SQLite KB chunks...'
          }
          className="flex-1 bg-transparent outline-none type-control text-neutral-200 placeholder-neutral-400"
        />
        {ocr && <span className="ml-2 type-meta text-emerald-400 animate-pulse whitespace-nowrap">{ocr}</span>}
      </form>
      {retrievalResults.length > 0 && (
        <div className={`mt-1 bg-neutral-950/90 border backdrop-blur-sm p-2 max-h-28 overflow-y-auto ${accentBorder}`}>
          <div className={`type-label uppercase tracking-wider mb-1 ${accentText}`}>
            {retrievalContextDisplayLabel(retrievalMode, retrievalRouteTrace)} KB retrieval
            {resolvedMode === 'graph' && expandedResultCount === 0 ? (
              <span className="block type-meta normal-case tracking-normal text-neutral-400">
                Graph seed-only: no graph-expanded evidence found
              </span>
            ) : null}
          </div>
          <div className="space-y-1">
            {retrievalResults.slice(0, 4).map((result, index) => (
              <div key={result.chunk.id} className="type-meta text-neutral-400">
                <span className={accentText}>#{index + 1}</span>{' '}
                <span className="type-control text-neutral-200">{result.documentTitle}</span>
                <span className="text-neutral-400"> - chunk {result.chunk.ordinal + 1}</span>
                <span className="text-neutral-400"> - match {retrievalMatchKindLabel(result)}</span>
                {result.graphRole && <span className="text-neutral-400"> - role {result.graphRole}</span>}
                <div className="truncate text-neutral-400">source: {retrievalSource(result)}</div>
                {result.graphReason && (
                  <div className="truncate text-violet-300/70">reason: {result.graphReason}</div>
                )}
                <div className="line-clamp-2 type-body break-words">{retrievalSnippet(result)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
