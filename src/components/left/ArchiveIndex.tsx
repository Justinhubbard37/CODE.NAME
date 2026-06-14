import { useState } from 'react';
import { ChevronRight, Folder, FolderOpen, Database, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

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
      label: 'VECTOR_STORE',
      children: [{ label: 'EMBEDDINGS' }, { label: 'CHUNKS' }],
    },
    {
      label: 'GRAPHRAG_INDEX',
      children: [{ label: 'COMMUNITIES' }, { label: 'SUMMARIES' }],
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

  return (
    <div className="absolute top-2 left-2 z-20 w-44 pointer-events-auto text-[10px] font-mono">
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
          <Branch node={ARCHIVE} depth={0} />
        </div>
      )}
    </div>
  );
}
