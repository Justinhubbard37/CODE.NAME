/**
 * StateBlock (Phase 10, Slice 10.4).
 *
 * A small, presentational empty / loading / error message used across the app
 * so no surface ever renders blank or stuck without explanation. Display only —
 * it holds no state and triggers no behaviour. Variants pick an icon and accent:
 *   - empty   → dashed circle, neutral
 *   - loading → spinner, neutral
 *   - error   → triangle, red
 *
 * Centered column by default; pass `className` to position it (e.g. as an
 * absolute overlay inside a relative container).
 */
import { CircleDashed, Loader2, AlertTriangle } from 'lucide-react';

export type StateKind = 'empty' | 'loading' | 'error';

const ICON = {
  empty: CircleDashed,
  loading: Loader2,
  error: AlertTriangle,
} as const;

const ACCENT = {
  empty: 'text-neutral-600',
  loading: 'text-neutral-500',
  error: 'text-red-400',
} as const;

export function StateBlock({
  kind,
  title,
  hint,
  className,
  compact,
}: {
  kind: StateKind;
  title: string;
  hint?: string;
  className?: string;
  /** Tighter inline layout (row of icon + title) for thin bars. */
  compact?: boolean;
}) {
  const Icon = ICON[kind];
  const accent = ACCENT[kind];
  const role = kind === 'error' ? 'alert' : 'status';
  const live = kind === 'loading' ? 'polite' : undefined;

  if (compact) {
    return (
      <div
        role={role}
        aria-live={live}
        className={`flex items-center gap-2 font-mono text-[9px] text-neutral-600 ${className ?? ''}`}
      >
        <Icon className={`w-3 h-3 shrink-0 ${accent} ${kind === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
        <span className="uppercase tracking-wider">{title}</span>
      </div>
    );
  }

  return (
    <div
      role={role}
      aria-live={live}
      className={`flex flex-col items-center justify-center gap-2 text-center px-6 font-mono ${className ?? ''}`}
    >
      <Icon
        className={`w-6 h-6 ${accent} ${kind === 'loading' ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <div className="text-[11px] uppercase tracking-widest text-neutral-400">{title}</div>
      {hint && <div className="text-[10px] text-neutral-600 max-w-xs leading-relaxed">{hint}</div>}
    </div>
  );
}
