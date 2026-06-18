import { useEffect, useRef } from 'react';
import { useApp } from '../../state/AppState';
import { useT } from '../../i18n';
import { StateBlock } from '../common/StateBlock';
import type { ChatMessage } from '../../types';

interface ToolPayload {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

function ToolBubble({ m }: { m: ChatMessage }) {
  let payload: ToolPayload | null = null;
  try {
    payload = JSON.parse(m.content) as ToolPayload;
  } catch {
    /* fallback to raw */
  }

  const pending = !payload?.result;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] border border-neutral-800 bg-neutral-950/80 type-meta font-mono">
        <div className="flex items-center gap-2 px-2 py-1 border-b border-neutral-800 text-amber-500/80">
          <span className="uppercase tracking-widest type-label">tool</span>
          <span className="text-amber-400">{payload?.name ?? '?'}</span>
          {pending && (
            <span className="ml-auto flex items-center gap-1 text-neutral-600">
              <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" />
              running
            </span>
          )}
        </div>
        {payload?.args && Object.keys(payload.args).length > 0 && (
          <div className="px-2 py-1 text-neutral-500 border-b border-neutral-800/50">
            {Object.entries(payload.args).map(([k, v]) => (
              <div key={k}>
                <span className="text-neutral-600">{k}=</span>
                <span className="text-neutral-400">{JSON.stringify(v)}</span>
              </div>
            ))}
          </div>
        )}
        {payload?.result !== undefined && (
          <div className="px-2 py-1 text-emerald-400/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
            {payload.result || '(empty)'}
          </div>
        )}
        {!payload && (
          <div className="px-2 py-1 text-neutral-500 whitespace-pre-wrap">{m.content}</div>
        )}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === 'tool') return <ToolBubble m={m} />;

  if (m.role === 'system') {
    return (
      <div className="type-meta font-mono text-neutral-600 italic border-l-2 border-neutral-800 pl-2 py-1">
        {m.content}
      </div>
    );
  }
  const user = m.role === 'user';
  return (
    <div className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 type-body whitespace-pre-wrap break-words border ${
          user
            ? 'bg-neutral-800/80 border-neutral-700 text-neutral-100'
            : 'bg-neutral-900/60 border-neutral-800 text-neutral-300 font-mono'
        }`}
      >
        {!user && (
          <div className="type-meta text-emerald-500/70 font-mono uppercase tracking-widest mb-1">
            response
          </div>
        )}
        {m.content}
        {m.streaming && (
          <span className="inline-block w-1.5 h-3 ml-0.5 bg-emerald-400 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

/** Pending indicator for the gap between sending and the first streamed token. */
function ThinkingBubble({ label }: { label: string }) {
  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex items-center gap-2 max-w-[85%] px-3 py-2 type-meta font-mono border border-neutral-800 bg-neutral-900/60 text-neutral-500">
        <span className="flex gap-1" aria-hidden="true">
          <span className="w-1 h-1 rounded-full bg-emerald-400/80 animate-pulse" />
          <span className="w-1 h-1 rounded-full bg-emerald-400/60 animate-pulse [animation-delay:150ms]" />
          <span className="w-1 h-1 rounded-full bg-emerald-400/40 animate-pulse [animation-delay:300ms]" />
        </span>
        {label}
      </div>
    </div>
  );
}

export function ChatThread() {
  const { activeTask, sending } = useApp();
  const t = useT();
  const endRef = useRef<HTMLDivElement>(null);

  const messages = activeTask.messages;
  const isEmpty = messages.length === 0;
  // Show "working" only while sending and nothing is streaming yet.
  const streaming = messages.some((m) => m.streaming);
  const showThinking = sending && !streaming;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, showThinking]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
      {isEmpty && !sending && (
        <StateBlock
          kind="empty"
          title={t('chat.empty.title')}
          hint={t('chat.empty.hint')}
          className="h-full"
        />
      )}
      {messages.map((m) => (
        <Bubble key={m.id} m={m} />
      ))}
      {showThinking && <ThinkingBubble label={t('chat.thinking')} />}
      <div ref={endRef} />
    </div>
  );
}
