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
import { retrievalSnippet, retrievalSource, retrievalScoreLabel } from '../../lib/retrievalContext';

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
        onClick={() => hasKids && setOpen((v) => !v)}
        aria-expanded={hasKids ? open : undefined}
        aria-label={hasKids ? `${node.label}, ${open ? 'expanded' : 'collapsed'}` : node.label}
        className="flex items-center gap-1 w-full text-left py-0.5 text-neutral-400 hover:text-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
        style={{ paddingLeft: depth * 10 }}
      >
        {hasKids ? (
          <ChevronRight
            className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          />
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
          {node.children!.map((c) => (
            <Branch key={c.label} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ArchiveIndex() {
  const [collapsed, setCollapsed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const {
    kbStats,
    kbDocuments,
    retrievalResults,
    retrievalMode,
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

  return (
    <div className="absolute top-2 left-2 z-20 w-56 pointer-events-auto text-[10px] font-mono">
      <div className="flex items-center justify-between mb-1 text-neutral-500 font-bold uppercase tracking-wider">
        <span>Archive Index</span>
        <button
          onClick={() => setCollapsed((v) => !v)}
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
            <div className="flex items-center justify-between text-[9px] uppercase tracking-wider">
              <span className="text-neutral-500">SQLite KB</span>
              <span className={kbStats.initialized ? 'text-emerald-400' : 'text-amber-400'}>
                {kbStats.initialized ? `v${kbStats.schemaVersion}` : 'offline'}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] text-neutral-500">
              <span>Documents</span><span className="text-neutral-300 text-right">{kbStats.documentCount}</span>
              <span>Deleted</span><span className="text-neutral-300 text-right">{kbStats.deletedDocumentCount}</span>
              <span>Chunks</span><span className="text-neutral-300 text-right">{kbStats.chunkCount}</span>
              <span>Entities</span><span className="text-neutral-300 text-right">{kbStats.entityCount}</span>
              <span>Relationships</span><span className="text-neutral-300 text-right">{kbStats.relationshipCount}</span>
              <span>Retrievals</span><span className="text-neutral-300 text-right">{kbStats.retrievalEventCount}</span>
            </div>
            <div className="mt-1 text-[8px] text-neutral-600">
              {kbStats.ftsAvailable ? 'FTS5 chunk search' : 'LIKE chunk search fallback'}
            </div>
          </div>
          <div className="mb-2 border border-cyan-500/20 bg-cyan-500/5 p-1.5">
            <div className="flex items-center justify-between text-[9px] uppercase tracking-wider">
              <span className="text-cyan-300/80">Semantic Index</span>
              <span className={semanticStatus.ready ? 'text-cyan-300' : 'text-amber-300'}>
                {semanticStatus.ready ? 'ready' : semanticStatus.state}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] text-neutral-500">
              <span>Provider</span><span className="text-neutral-300 text-right">{semanticStatus.provider}</span>
              <span>Model</span><span className="text-neutral-300 text-right truncate">{semanticStatus.model}</span>
              <span>Active chunks</span><span className="text-neutral-300 text-right">{semanticStatus.activeChunkCount}</span>
              <span>Embedded</span><span className="text-neutral-300 text-right">{semanticStatus.embeddedActiveChunkCount}</span>
              <span>Missing</span><span className="text-neutral-300 text-right">{semanticStatus.missingActiveChunkCount}</span>
              <span>Dimension</span><span className="text-neutral-300 text-right">{semanticStatus.dimension ?? 'n/a'}</span>
            </div>
            {semanticError && (
              <div className="mt-1 text-[8px] text-amber-300 leading-snug">{semanticError}</div>
            )}
            <div className="mt-1 flex gap-1">
              <button
                type="button"
                onClick={buildSemanticIndex}
                disabled={semanticIndexing || semanticStatus.activeChunkCount === 0}
                className="flex-1 border border-cyan-500/30 bg-cyan-500/10 px-1 py-0.5 text-[8px] uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
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
            <div className="mt-1 text-[8px] text-neutral-600">
              Local Ollama only; models are not auto-pulled.
            </div>
          </div>
          {kbDocuments.length > 0 && (
            <div className="mb-2 border border-neutral-800 bg-black/30 p-1.5">
              <div className="text-[9px] uppercase tracking-wider text-neutral-500 mb-1">
                KB Documents
              </div>
              <div className="space-y-1">
                {kbDocuments.slice(0, 6).map((doc) => (
                  <div key={doc.id} className="border border-neutral-900 bg-neutral-950/60 p-1">
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[9px] text-neutral-200">{doc.title}</div>
                        <div className="text-[8px] text-neutral-600">
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
            <div className={`mb-2 border p-1.5 ${
              retrievalMode === 'semantic'
                ? 'border-cyan-500/20 bg-cyan-500/5'
                : 'border-emerald-500/20 bg-emerald-500/5'
            }`}>
              <div className={`text-[9px] uppercase tracking-wider mb-1 ${
                retrievalMode === 'semantic' ? 'text-cyan-300/80' : 'text-emerald-400/80'
              }`}>
                {retrievalMode === 'semantic' ? 'Semantic KB Results' : 'Lexical KB Results'}
              </div>
              <div className="space-y-1">
                {retrievalResults.slice(0, 3).map((r, index) => (
                  <div key={r.chunk.id} className="text-[8px] text-neutral-400 leading-snug">
                    <div className="truncate text-neutral-200">
                      #{index + 1} {r.documentTitle} - chunk {r.chunk.ordinal + 1}
                    </div>
                    <div className="truncate text-neutral-600">
                      score {retrievalScoreLabel(r.score)} - {retrievalSource(r)}
                    </div>
                    <div className="line-clamp-2">{retrievalSnippet(r)}</div>
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
