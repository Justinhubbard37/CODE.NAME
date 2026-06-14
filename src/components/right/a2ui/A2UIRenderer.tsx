import { useRef, useState, type ReactNode } from 'react';
/**
 * A2UI renderer (Phase 4 / Phase 5 Slice 5.2).
 *
 * Maps a declarative A2UI payload to React using a TRUSTED catalog only —
 * the agent can render nothing outside this set ("safe like data").
 *
 * Phase 5 changes:
 *  - textfield is now interactive (controlled input, not readOnly)
 *  - formRef tracks all textfield values keyed by component id
 *  - buttons snapshot formRef on click and pass `values` in A2UIAction
 */
import type { A2UIAction, A2UIComponent, A2UIPayload } from './types';

const TRUSTED = new Set([
  'card', 'column', 'row', 'heading', 'text', 'badge', 'button', 'textfield', 'divider',
]);

function str(v: unknown, d = ''): string {
  return typeof v === 'string' ? v : v == null ? d : String(v);
}

/** Controlled textfield — keeps local display state, syncs to shared formRef. */
function TextField({
  id,
  placeholder,
  initialValue,
  formRef,
}: {
  id: string;
  placeholder: string;
  initialValue: string;
  formRef: React.RefObject<Map<string, string>>;
}) {
  const [val, setVal] = useState(initialValue);
  return (
    <input
      value={val}
      placeholder={placeholder}
      onChange={(e) => {
        setVal(e.target.value);
        formRef.current?.set(id, e.target.value);
      }}
      className="w-full bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs px-2 py-1 font-mono focus:outline-none focus:border-neutral-600"
    />
  );
}

export function A2UIRenderer({
  payload,
  onAction,
}: {
  payload: A2UIPayload;
  onAction?: (action: A2UIAction) => void;
}) {
  // Shared form-value store — keyed by component id, never causes re-renders on keystroke
  const formRef = useRef<Map<string, string>>(new Map());
  const byId = new Map(payload.components.map((c) => [c.id, c]));

  const renderId = (id: string, depth = 0): ReactNode => {
    if (depth > 32) return null;
    const c = byId.get(id);
    if (!c || !TRUSTED.has(c.type)) return null;
    return (
      <Node
        key={id}
        c={c}
        render={(cid) => renderId(cid, depth + 1)}
        onAction={onAction}
        formRef={formRef}
      />
    );
  };

  return <div className="space-y-2">{renderId(payload.root)}</div>;
}

function Node({
  c,
  render,
  onAction,
  formRef,
}: {
  c: A2UIComponent;
  render: (id: string) => ReactNode;
  onAction?: (a: A2UIAction) => void;
  formRef: React.RefObject<Map<string, string>>;
}) {
  const p = c.properties ?? {};
  const kids = (c.children ?? []).map(render);

  switch (c.type) {
    case 'card':
      return (
        <div className="border border-neutral-700 bg-neutral-900/60 p-3 space-y-2">{kids}</div>
      );
    case 'column':
      return <div className="flex flex-col gap-2">{kids}</div>;
    case 'row':
      return <div className="flex flex-row gap-2 items-center flex-wrap">{kids}</div>;
    case 'heading':
      return <div className="text-neutral-100 font-bold text-sm tracking-wide">{str(p.text)}</div>;
    case 'text':
      return <div className="text-neutral-300 text-xs whitespace-pre-wrap">{str(p.text)}</div>;
    case 'badge':
      return (
        <span className="inline-block px-1.5 py-0.5 text-[9px] font-mono border border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
          {str(p.text)}
        </span>
      );
    case 'divider':
      return <div className="border-t border-neutral-800 my-1" />;
    case 'textfield':
      return (
        <TextField
          id={c.id}
          placeholder={str(p.placeholder)}
          initialValue={str(p.value)}
          formRef={formRef}
        />
      );
    case 'button':
      return (
        <button
          onClick={() =>
            onAction?.({
              prompt: p.prompt as string | undefined,
              tool: p.tool as string | undefined,
              toolArgs: p.toolArgs as Record<string, unknown> | undefined,
              values: Object.fromEntries(formRef.current ?? []),
            })
          }
          className="px-2 py-1 text-[10px] font-mono border border-neutral-600 text-neutral-200 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
        >
          {str(p.label, 'Action')}
        </button>
      );
    default:
      return null;
  }
}
