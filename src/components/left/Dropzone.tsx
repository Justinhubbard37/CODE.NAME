import { useState, type ReactNode, type DragEvent } from 'react';
import { DownloadCloud, ShieldAlert } from 'lucide-react';
import { useApp } from '../../state/AppState';

export function Dropzone({ children }: { children: ReactNode }) {
  const { ingestFiles, gates } = useApp();
  const [over, setOver] = useState(false);
  const [depth, setDepth] = useState(0);

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDepth((d) => d + 1);
    setOver(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDepth((d) => {
      const next = d - 1;
      if (next <= 0) setOver(false);
      return Math.max(0, next);
    });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    setDepth(0);
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length) ingestFiles(files);
  };

  return (
    <div
      className="absolute inset-0"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
      {over && (
        <div
          className={`absolute inset-0 z-40 pointer-events-none flex items-center justify-center backdrop-blur-[1px] ${
            gates.filesystem ? 'bg-emerald-500/5' : 'bg-red-500/5'
          }`}
        >
          <div
            className={`absolute inset-3 border-2 border-dashed ${
              gates.filesystem ? 'border-emerald-500/60' : 'border-red-500/60'
            }`}
          />
          <div
            className={`flex flex-col items-center gap-2 font-mono type-body px-6 py-4 border bg-neutral-950/90 ${
              gates.filesystem
                ? 'border-emerald-500/50 text-emerald-300'
                : 'border-red-500/50 text-red-300'
            }`}
          >
            {gates.filesystem ? (
              <>
                <DownloadCloud className="w-6 h-6" />
                <span className="tracking-widest uppercase">Release to quarantine + index</span>
                <span className="type-meta text-neutral-500">hash · structure check · gated ingest</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-6 h-6" />
                <span className="tracking-widest uppercase">Filesystem gate closed</span>
                <span className="type-meta text-neutral-500">re-open the FS gate to ingest</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
