import { useState, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { executionClassLabel, reachesNetwork } from '../../lib/llm';
import {
  resolvedRetrievalKindForDisplay,
  retrievalContextDisplayLabel,
} from '../../lib/retrievalContext';

export function ChatInput() {
  const {
    sendMessage,
    sending,
    abort,
    activeEndpoint,
    activeProfile,
    activeModel,
    activeRuntimeLabel,
    effectiveTemperature,
    effectiveContextWindow,
    canSend,
    cannotSendReason,
    retrievalResults,
    retrievalMode,
    retrievalRouteTrace,
    retrievalSelectedChunkIds,
    retrievalEnabledForChat,
    setRetrievalEnabledForChat,
  } = useApp();
  const [text, setText] = useState('');
  const selectedRetrievalCount = retrievalResults.filter((result) =>
    retrievalSelectedChunkIds.includes(result.chunk.id),
  ).length;
  const retrievalAccentClass =
    resolvedRetrievalKindForDisplay(retrievalMode, retrievalRouteTrace) === 'graph'
      ? 'text-violet-300 hover:text-violet-200'
      : resolvedRetrievalKindForDisplay(retrievalMode, retrievalRouteTrace) === 'semantic'
        ? 'text-cyan-300 hover:text-cyan-200'
        : resolvedRetrievalKindForDisplay(retrievalMode, retrievalRouteTrace) === 'hybrid'
          ? 'text-amber-300 hover:text-amber-200'
          : 'text-emerald-400 hover:text-emerald-300';
  const retrievalContextLabel = retrievalContextDisplayLabel(retrievalMode, retrievalRouteTrace);

  const fire = () => {
    if (!text.trim() || sending || !canSend) return;
    sendMessage(text);
    setText('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      fire();
    }
  };

  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 p-2">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          id="chat-input"
          aria-label="Message the agent"
          placeholder={`Message ${activeModel?.displayName ?? activeRuntimeLabel}... (Enter to send, Shift+Enter newline)`}
          className="flex-1 resize-none bg-neutral-900 border border-neutral-800 focus:border-neutral-600 outline-none type-body text-neutral-200 placeholder-neutral-400 px-3 py-2 font-mono max-h-32"
        />
        {sending ? (
          <button
            onClick={abort}
            aria-label="Stop generation"
            className="h-9 px-3 flex items-center gap-1 bg-red-500/10 border border-red-500/50 text-red-300 hover:bg-red-500/20 type-control font-mono"
            title="Abort generation"
          >
            <Square className="w-3 h-3" aria-hidden="true" /> STOP
          </button>
        ) : (
          <button
            onClick={fire}
            aria-label="Send message"
            title={!canSend ? cannotSendReason : 'Send message'}
            disabled={!text.trim() || !canSend}
            className="h-9 px-3 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed type-control font-mono"
          >
            <Send className="w-3 h-3" aria-hidden="true" /> SEND
          </button>
        )}
      </div>
      <div className="flex justify-between mt-1 type-meta font-mono text-neutral-400">
        <span>
          PROFILE {activeProfile.label} · T{effectiveTemperature} · CTX{effectiveContextWindow}
          {!canSend ? ` · ${cannotSendReason}` : ''}
        </span>
        <div className="flex items-center gap-2">
          {retrievalResults.length > 0 && (
            <button
              onClick={() => setRetrievalEnabledForChat(!retrievalEnabledForChat)}
              disabled={selectedRetrievalCount === 0}
              className={
                retrievalEnabledForChat
                  ? retrievalAccentClass
                  : selectedRetrievalCount === 0
                    ? 'text-neutral-500'
                    : 'text-neutral-400 hover:text-neutral-400'
              }
              title="Attach or detach local KB chunks for the next chat request"
              aria-label="Toggle local KB context"
            >
              {retrievalContextLabel} KB context {retrievalEnabledForChat ? 'ON' : 'OFF'} ({selectedRetrievalCount})
            </button>
          )}
          <span>
            {executionClassLabel(activeModel?.executionClass ?? 'unknown')}
            {reachesNetwork(activeEndpoint, activeModel?.id) ? ' · NETWORK' : ' · LOCAL-FIRST'}
          </span>
        </div>
      </div>
    </div>
  );
}
