import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  left: ReactNode;
  right: ReactNode;
}

const SNAP = 0.1; // hard-snap lock points every 10%
const MIN = 0.2;
const MAX = 0.8;

/**
 * Two-pane horizontal workspace. Default 50/50. The center divider drags
 * freely but hard-snaps to the nearest 10% increment on release-tracking,
 * terminating at lock points across the layout.
 */
export function ResizableSplit({ left, right }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(0.5);
  const [dragging, setDragging] = useState(false);

  const onMove = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const raw = (clientX - rect.left) / rect.width;
    const snapped = Math.round(raw / SNAP) * SNAP;
    setRatio(Math.min(MAX, Math.max(MIN, snapped)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => onMove(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, onMove]);

  const pct = Math.round(ratio * 100);

  return (
    <div ref={containerRef} className="flex w-screen h-screen overflow-hidden bg-neutral-950">
      <div style={{ width: `${pct}%` }} className="relative h-full min-w-0">
        {left}
      </div>

      {/* Divider — WAI-ARIA window splitter (Slice 10.2): focusable, with
          arrow-key resize, Home/End to limits, and Enter to reset 50/50. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        aria-valuemin={Math.round(MIN * 100)}
        aria-valuemax={Math.round(MAX * 100)}
        aria-valuenow={pct}
        tabIndex={0}
        onPointerDown={() => setDragging(true)}
        onDoubleClick={() => setRatio(0.5)}
        onKeyDown={(e) => {
          const clamp = (r: number) => Math.min(MAX, Math.max(MIN, r));
          if (e.key === 'ArrowLeft') { e.preventDefault(); setRatio((r) => clamp(+(r - SNAP).toFixed(2))); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); setRatio((r) => clamp(+(r + SNAP).toFixed(2))); }
          else if (e.key === 'Home') { e.preventDefault(); setRatio(MIN); }
          else if (e.key === 'End') { e.preventDefault(); setRatio(MAX); }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRatio(0.5); }
        }}
        className={`group relative w-px h-full shrink-0 cursor-col-resize bg-neutral-800 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${
          dragging ? 'bg-emerald-500/60' : 'hover:bg-neutral-600'
        }`}
        title="Drag to resize · double-click or Enter to reset 50/50 · arrow keys to nudge"
      >
        <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 px-[2px] py-2 rounded-sm border ${
            dragging
              ? 'border-emerald-500/60 bg-neutral-900'
              : 'border-neutral-700 bg-neutral-900 group-hover:border-neutral-500'
          }`}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className="block w-[2px] h-[2px] rounded-full bg-neutral-500" />
          ))}
        </div>
        {dragging && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 type-meta font-mono text-emerald-400 bg-neutral-950 px-1.5 py-0.5 border border-emerald-500/40 whitespace-nowrap">
            {pct} / {100 - pct}
          </div>
        )}
      </div>

      <div style={{ width: `${100 - pct}%` }} className="relative h-full min-w-0">
        {right}
      </div>
    </div>
  );
}
