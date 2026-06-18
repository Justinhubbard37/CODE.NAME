import { useState } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Database,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../state/AppState';
import { knowledgeStatusSummary } from '../../lib/knowledgeStatus';
import {
  retrievalMatchKindLabel,
  retrievalSnippet,
  retrievalSource,
  retrievalContextDisplayLabel,
  retrievalTraceSummary,
} from '../../lib/retrievalContext';

interface TreeNode {
  label: string;
  children?: TreeNode[];
}

const ARCHIVE: TreeNode = {
  label: 'ROOT',
  children: [
    {
      label: 'KNOWLEDGE_GRAPH',
      children: [
        { label: 'ENTITIES' },
        { label: 'RELATIONS' },
        { label: 'CLUSTERS' },
      ],
    },
    {
      label: 'LEGACY_GRAPH_HASH_INDEX',
      children: [{ label: 'NON_SEMANTIC_HASH_VECTORS' }, { label: 'GRAPH_NODE_COMPAT' }],
    },
    {
      label: 'GRAPH_SEARCH_INDEX',
      children: [{ label: 'COMMUNITIES_SCAFFOLD' }, { label: 'SUMMARIES_PLANNED' }],
    },
    { label: 'INGEST_LOG' },
  ],
};

function Branch({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasKids = !!node.children?.length;
  return (
    <div>
      <button
        onClick={() => hasKids && setOpen((value) => !value)}
        aria-expanded={hasKids ? open : undefined}
        aria-label={hasKids ? `${node.label}, ${open ? 'expanded' : 'collapsed'}` : node.label}
        className="flex items-center gap-1 w-full text-left py-0.5 text-neutral-400 hover:text-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
        style={{ paddingLeft: depth * 10 }}
      >
        {hasKids ? (
          <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {hasKids ? (
          open ? (
            <FolderOpen className="w-3 h-3 text-neutral-500" />
          ) : (
            <Folder className="w-3 h-3 text-neutral-500" />
          )
        ) : (
          <Database className="w-3 h-3 text-neutral-600" />
        )}
        <span className="tracking-wide truncate">{node.label}</span>
      </button>
      {hasKids && open && (
        <div className="border-l border-neutral-800/60 ml-[6px]">
          {node.children!.map((child) => (
            <Branch key={child.label} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ArchiveIndex() {
  const [collapsed, setCollapsed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const {
    kbStats,
    kbDocuments,
    retrievalResults,
    retrievalMode,
    retrievalRouteTrace,
    semanticStatus,
    semanticIndexing,
    semanticError,
    buildSemanticIndex,
    refreshSemanticStatus,
    deleteKbDocument,
  } = useApp();

  const removeDocument = async (id: string, title: string) => {
    if (!window.confirm(`Remove "${title}" from the SQLite KB?`)) return;
    setDeletingId(id);
    try {
      await deleteKbDocument(id);
    } finally {
      setDeletingId(null);
    }
  };

  const status = knowledgeStatusSummary({
    kbStats,
    semanticStatus,
    semanticIndexing,
    semanticError,
  });
  const statusText =
    status.tone === 'ready'
      ? 'text-emerald-300'
      : status.tone === 'working'
        ? 'text-cyan-300'
        : status.tone === 'empty'
          ? 'text-neutral-500'
          : 'text-amber-300';
  const retrievalTitle = `${retrievalContextDisplayLabel(retrievalMode, retrievalRouteTrace)} KB Results`;
  const traceSummary = retrievalTraceSummary(retrievalRouteTrace);

  return (
    <div className="absolute top-2 left-2 z-20 w-56 pointer-events-auto type-label font-mono">
      <div className="flex items-center justify-between mb-1 type-section text-neutral-500 uppercase tracking-wider">
        <span>Archive Index</span>
        <button
          onClick={() => setCollapsed((value) => !value)}
          className="text-neutral-600 hover:text-neutral-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
          title={collapsed ? 'Expand archive index' : 'Collapse archive index'}
          aria-label={collapsed ? 'Expand archive index' : 'Collapse archive index'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen className="w-3.5 h-3.5" aria-hidden="true" /> : <PanelLeftClose className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
      </div>
      {!collapsed && (
        <div className="bg-neutral-950/80 border border-neutral-800 backdrop-blur-sm p-2 max-h-[40vh] overflow-y-auto">
          <div className="mb-2 border border-neutral-800 bg-black/30 p-1.5">
            <div className="flex items-center justify-between type-label uppercase tracking-wider">
              <span className="text-neutral-500">Knowledge</span>
              <span className={statusText}>{status.label}</span>
            </div>
            <div className="mt-1 type-meta text-neutral-500">{status.detail}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 type-meta text-neutral-500">
              <span>Documents</span><span className="text-neutral-300 text-right">{kbStats.documentCount}</span>
              <span>Chunks</span><span className="text-neutral-300 text-right">{kbStats.chunkCount}</span>
            </div>
            {traceSummary && <div className="mt-1 type-meta text-neutral-400">{traceSummary}</div>}
          </div>

          <div className="mb-2 border border-neutral-800 bg-black/30 p-1.5">
            <button
              type="button"
              onClick={() => setAdvancedOpen((value) => !value)}
              className="flex w-full items-center justify-between type-label uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
              aria-expanded={advancedOpen}
            >
              <span>Advanced KB details</span>
              <ChevronRight className={`h-3 w-3 transition-transform ${advancedOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
            </button>
            {advancedOpen && (
              <div className="mt-1">
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 type-meta text-neutral-500">
                  <span>Deleted</span><span className="text-neutral-300 text-right">{kbStats.deletedDocumentCount}</span>
                  <span>Entities</span><span className="text-neutral-300 text-right">{kbStats.entityCount}</span>
                  <span>Relationships</span><span className="text-neutral-300 text-right">{kbStats.relationshipCount}</span>
                  <span>Retrievals</span><span className="text-neutral-300 text-right">{kbStats.retrievalEventCount}</span>
                  <span>Provider</span><span className="text-neutral-300 text-right">{semanticStatus.provider}</span>
                  <span>Model</span><span className="text-neutral-300 text-right truncate">{semanticStatus.model}</span>
                  <span>Embedded</span><span className="text-neutral-300 text-right">{semanticStatus.embeddedActiveChunkCount}</span>
                  <span>Missing</span><span className="text-neutral-300 text-right">{semanticStatus.missingActiveChunkCount}</span>
                  <span>Dimension</span><span className="text-neutral-300 text-right">{semanticStatus.dimension ?? 'n/a'}</span>
                </div>
                {semanticError && (
                  <div className="mt-1 type-meta text-amber-300">{semanticError}</div>
                )}
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    onClick={buildSemanticIndex}
                    disabled={semanticIndexing || semanticStatus.activeChunkCount === 0}
                    className="flex-1 border border-cyan-500/30 bg-cyan-500/10 px-1 py-0.5 type-control uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {semanticIndexing ? 'Indexing...' : 'Build / Refresh'}
                  </button>
                  <button
                    type="button"
                    onClick={refreshSemanticStatus}
                    className="border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-neutral-400 hover:text-neutral-200"
                    title="Refresh semantic index status"
                    aria-label="Refresh semantic index status"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-1 type-meta text-neutral-600">
                  Local Ollama only; models are not auto-pulled.
                </div>
              </div>
            )}
          </div>

          {kbDocuments.length > 0 && (
            <div className="mb-2 border border-neutral-800 bg-black/30 p-1.5">
              <div className="type-label uppercase tracking-wider text-neutral-500 mb-1">
                KB Documents
              </div>
              <div className="space-y-1">
                {kbDocuments.slice(0, 6).map((doc) => (
                  <div key={doc.id} className="border border-neutral-900 bg-neutral-950/60 p-1">
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1">
                        <div className="truncate type-control text-neutral-200">{doc.title}</div>
                        <div className="type-meta text-neutral-600">
                          {doc.chunkCount} chunk{doc.chunkCount === 1 ? '' : 's'} -{' '}
                          {new Date(doc.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => removeDocument(doc.id, doc.title)}
                        disabled={deletingId === doc.id}
                        className="shrink-0 text-neutral-600 hover:text-red-300 disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-red-500"
                        title="Remove document from SQLite KB"
                        aria-label={`Remove ${doc.title} from SQLite KB`}
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {retrievalResults.length > 0 && (
            <div className="mb-2 border border-emerald-500/20 bg-emerald-500/5 p-1.5">
              <div className="type-label uppercase tracking-wider mb-1 text-emerald-300/80">
                {retrievalTitle}
              </div>
              <div className="space-y-1">
                {retrievalResults.slice(0, 3).map((result, index) => (
                  <div key={result.chunk.id} className="type-meta text-neutral-400">
                    <div className="truncate type-control text-neutral-200">
                      #{index + 1} {result.documentTitle} - chunk {result.chunk.ordinal + 1}
                    </div>
                    <div className="truncate text-neutral-600">
                      match {retrievalMatchKindLabel(result)} - {retrievalSource(result)}
                    </div>
                    {result.graphRole && (
                      <div className="truncate text-violet-300/70">
                        {result.graphRole} depth {result.traversalDepth ?? 'n/a'} - {result.graphReason ?? 'graph traversal'}
                      </div>
                    )}
                    <div className="line-clamp-2 type-body break-words">{retrievalSnippet(result)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Branch node={ARCHIVE} depth={0} />
        </div>
      )}
    </div>
  );
}
