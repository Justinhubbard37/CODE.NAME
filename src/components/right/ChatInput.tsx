import { useState, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { reachesNetwork } from '../../lib/llm';

export function ChatInput() {
  const {
    sendMessage,
    sending,
    abort,
    activeEndpoint,
    activeProfile,
    retrievalResults,
    retrievalMode,
    retrievalEnabledForChat,
    setRetrievalEnabledForChat,
  } = useApp();
  const [text, setText] = useState('');

  const fire = () => {
    if (!text.trim() || sending) return;
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
          placeholder={`Message ${activeEndpoint.model}… (Enter to send, Shift+Enter newline)`}
          className="flex-1 resize-none bg-neutral-900 border border-neutral-800 focus:border-neutral-600 outline-none text-xs text-neutral-200 placeholder-neutral-600 px-3 py-2 font-mono max-h-32"
        />
        {sending ? (
          <button
            onClick={abort}
            aria-label="Stop generation"
            className="h-9 px-3 flex items-center gap-1 bg-red-500/10 border border-red-500/50 text-red-300 hover:bg-red-500/20 text-[10px] font-mono"
            title="Abort generation"
          >
            <Square className="w-3 h-3" aria-hidden="true" /> STOP
          </button>
        ) : (
          <button
            onClick={fire}
            disabled={!text.trim()}
            aria-label="Send message"
            className="h-9 px-3 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed text-[10px] font-mono"
          >
            <Send className="w-3 h-3" aria-hidden="true" /> SEND
          </button>
        )}
      </div>
      <div className="flex justify-between mt-1 text-[8px] font-mono text-neutral-600">
        <span>
          PROFILE {activeProfile.name} · T{activeProfile.temperature} · CTX{activeProfile.contextWindow}
        </span>
        <div className="flex items-center gap-2">
          {retrievalResults.length > 0 && (
            <button
              onClick={() => setRetrievalEnabledForChat(!retrievalEnabledForChat)}
              className={
                retrievalEnabledForChat
                  ? retrievalMode === 'semantic'
                    ? 'text-cyan-300 hover:text-cyan-200'
                    : 'text-emerald-400 hover:text-emerald-300'
                  : 'text-neutral-600 hover:text-neutral-400'
              }
              title="Attach or detach local KB chunks for the next chat request"
              aria-label="Toggle local KB context"
            >
              {retrievalMode} KB context {retrievalEnabledForChat ? 'ON' : 'OFF'} ({retrievalResults.length})
            </button>
          )}
          <span>{reachesNetwork(activeEndpoint) ? 'CLOUD-CAPABLE' : 'LOCAL-FIRST'}</span>
        </div>
      </div>
    </div>
  );
}
