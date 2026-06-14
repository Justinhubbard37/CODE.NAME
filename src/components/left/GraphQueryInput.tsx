import { useState, type FormEvent, type ChangeEvent } from 'react';
import { ScanLine } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { useApp } from '../../state/AppState';

export function GraphQueryInput() {
  const { graphQuery, setGraphQuery, runGraphQuery, ingestFiles, gates } = useApp();
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

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 w-[min(80%,30rem)] pointer-events-auto text-[10px] font-mono">
      <div className="flex justify-between items-end mb-1">
        <span className="text-neutral-500 uppercase tracking-wider">GraphRAG Query</span>
        <label className="cursor-pointer bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 px-2 py-0.5 flex items-center gap-1 tracking-wider">
          <ScanLine className="w-3 h-3" aria-hidden="true" /> OCR
          <input type="file" accept="image/*" className="hidden" onChange={onOcr} aria-label="Scan an image with OCR and ingest its text" />
        </label>
      </div>
      <form
        onSubmit={submit}
        className="flex items-center bg-neutral-900/90 border border-neutral-800 backdrop-blur-sm px-2 py-1.5"
      >
        <span aria-hidden="true" className="text-emerald-500 mr-2">{'>'}</span>
        <input
          value={graphQuery}
          onChange={(e) => setGraphQuery(e.target.value)}
          aria-label="GraphRAG query"
          placeholder="Graph query active... (enter to retrieve)"
          className="flex-1 bg-transparent outline-none text-neutral-200 placeholder-neutral-600"
        />
        {ocr && <span className="ml-2 text-[8px] text-emerald-400 animate-pulse whitespace-nowrap">{ocr}</span>}
      </form>
    </div>
  );
}
