import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AgentHeader } from './AgentHeader';
import { AgentToolsBar } from './AgentToolsBar';
import { AgentUIPanel } from './AgentUIPanel';
import { AuditLedger } from './AuditLedger';
import { ActivityFeed } from './ActivityFeed';
import { IngestionLedger } from './IngestionLedger';
import { ChatThread } from './ChatThread';
import { ChatInput } from './ChatInput';
import { RetrievedContextPanel } from './RetrievedContextPanel';
import { useApp } from '../../state/AppState';

const HEIGHT_STORAGE_KEY = 'codename:right-pane-heights:v1';
const DEFAULT_ACTIVITY_HEIGHT = 128;
const DEFAULT_AUDIT_HEIGHT = 160;
const MIN_ACTIVITY_HEIGHT = 72;
const MIN_AUDIT_HEIGHT = 96;
const MAX_SECTION_HEIGHT = 320;
const MIN_LOWER_WORKSPACE_HEIGHT = 240;

interface PaneHeights {
  activity: number;
  audit: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadPaneHeights(): PaneHeights {
  if (typeof localStorage === 'undefined') {
    return { activity: DEFAULT_ACTIVITY_HEIGHT, audit: DEFAULT_AUDIT_HEIGHT };
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(HEIGHT_STORAGE_KEY) ?? '{}') as Partial<PaneHeights>;
    return {
      activity: clamp(Number(parsed.activity) || DEFAULT_ACTIVITY_HEIGHT, MIN_ACTIVITY_HEIGHT, MAX_SECTION_HEIGHT),
      audit: clamp(Number(parsed.audit) || DEFAULT_AUDIT_HEIGHT, MIN_AUDIT_HEIGHT, MAX_SECTION_HEIGHT),
    };
  } catch {
    return { activity: DEFAULT_ACTIVITY_HEIGHT, audit: DEFAULT_AUDIT_HEIGHT };
  }
}

function ResizeBoundary({
  label,
  onMouseDown,
}: {
  label: string;
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      className="shrink-0 h-1 -my-px cursor-row-resize bg-transparent focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
      onMouseDown={onMouseDown}
    />
  );
}

/**
 * RIGHT PANE — Execution Canvas.
 * Active model generation, the persistent status module, the collapsible
 * logic/activity stream, the gated-ingestion ledger audit, and live chat.
 */
export function ExecutionCanvas() {
  const { showActivity } = useApp();
  const rootRef = useRef<HTMLDivElement>(null);
  const lowerWorkspaceRef = useRef<HTMLDivElement>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [paneHeights, setPaneHeights] = useState<PaneHeights>(() => loadPaneHeights());

  useEffect(() => {
    try {
      localStorage.setItem(HEIGHT_STORAGE_KEY, JSON.stringify(paneHeights));
    } catch {
      /* persistence is best-effort UI state only */
    }
  }, [paneHeights]);

  const beginResize = useCallback(
    (pane: keyof PaneHeights, event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = paneHeights[pane];
      const lowerStartHeight =
        pane === 'audit'
          ? lowerWorkspaceRef.current?.getBoundingClientRect().height ?? MIN_LOWER_WORKSPACE_HEIGHT
          : (() => {
              const root = rootRef.current?.getBoundingClientRect();
              const boundary = event.currentTarget.getBoundingClientRect();
              return root ? Math.max(0, root.bottom - boundary.bottom) : MIN_LOWER_WORKSPACE_HEIGHT;
            })();
      const minHeight = pane === 'activity' ? MIN_ACTIVITY_HEIGHT : MIN_AUDIT_HEIGHT;
      const maxFromLower = startHeight + Math.max(0, lowerStartHeight - MIN_LOWER_WORKSPACE_HEIGHT);

      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      const onMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startY;
        const next = clamp(startHeight + delta, minHeight, Math.min(MAX_SECTION_HEIGHT, maxFromLower));
        setPaneHeights((current) => ({ ...current, [pane]: next }));
      };

      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [paneHeights],
  );

  return (
    <div ref={rootRef} role="main" aria-label="Execution Canvas" className="flex flex-col h-full bg-neutral-950">
      <AgentHeader />
      <AgentToolsBar />
      {showActivity && (
        <>
          <ActivityFeed height={paneHeights.activity} />
          <ResizeBoundary
            label="Resize Logic activity section"
            onMouseDown={(event) => beginResize('activity', event)}
          />
        </>
      )}
      <IngestionLedger />
      <AgentUIPanel />
      <AuditLedger open={auditOpen} onOpenChange={setAuditOpen} height={paneHeights.audit} />
      {auditOpen && (
        <ResizeBoundary
          label="Resize Audit Ledger section"
          onMouseDown={(event) => beginResize('audit', event)}
        />
      )}
      <div ref={lowerWorkspaceRef} className="flex min-h-0 flex-1 flex-col">
        <ChatThread />
        <RetrievedContextPanel />
        <ChatInput />
      </div>
    </div>
  );
}
