import { AgentHeader } from './AgentHeader';
import { AgentToolsBar } from './AgentToolsBar';
import { AgentUIPanel } from './AgentUIPanel';
import { AuditLedger } from './AuditLedger';
import { ActivityFeed } from './ActivityFeed';
import { IngestionLedger } from './IngestionLedger';
import { ChatThread } from './ChatThread';
import { ChatInput } from './ChatInput';

/**
 * RIGHT PANE — Execution Canvas.
 * Active model generation, the persistent status module, the collapsible
 * logic/activity stream, the gated-ingestion ledger audit, and live chat.
 */
export function ExecutionCanvas() {
  return (
    <div role="main" aria-label="Execution Canvas" className="flex flex-col h-full bg-neutral-950">
      <AgentHeader />
      <AgentToolsBar />
      <ActivityFeed />
      <IngestionLedger />
      <AgentUIPanel />
      <AuditLedger />
      <ChatThread />
      <ChatInput />
    </div>
  );
}
