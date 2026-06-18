import React, { useState, useEffect } from 'react';
import { X, History, Save, RotateCcw, FileText } from 'lucide-react';
import { AppNode, NodeData, NodeVersion } from '../types';

interface Props {
  node: AppNode;
  onClose: () => void;
  onUpdate: (id: string, data: NodeData) => void;
}

export function NodeDetailsPanel({ node, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<'PROPS' | 'HISTORY'>('PROPS');
  const [editData, setEditData] = useState<Partial<NodeData>>(node.data);

  useEffect(() => {
    setEditData(node.data);
  }, [node]);

  // Escape closes the inspector (Slice 10.2).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The inspector floats over the graph; let the user drag it (by its header)
  // out of the way so it never blocks clicking other nodes.
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) =>
      setDrag((dd) => ({ x: dd.x + e.movementX, y: dd.y + e.movementY }));
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging]);

  const handleSave = () => {
    const nextVer = (node.data.currentVersion || 1) + 1;
    const snap = { ...editData };
    const newVersion: NodeVersion = {
      version: nextVer,
      timestamp: Date.now(),
      changes: 'Manual update',
      snap: snap
    };
    
    // Ensure history exists 
    const currentHist = node.data.history || [{
      version: node.data.currentVersion || 1,
      timestamp: Date.now() - 60000,
      changes: 'Initial creation',
      snap: { ...node.data }
    }];

    onUpdate(node.id, {
      ...node.data,
      ...editData,
      currentVersion: nextVer,
      history: [newVersion, ...currentHist]
    });
  };

  const handleRevert = (ver: NodeVersion) => {
    const nextVer = (node.data.currentVersion || 1) + 1;
    const currentHist = node.data.history || [];
    
    onUpdate(node.id, {
      ...node.data,
      ...ver.snap,
      currentVersion: nextVer,
      history: [{
        version: nextVer,
        timestamp: Date.now(),
        changes: `Reverted to v${ver.version}`,
        snap: { ...ver.snap }
      }, ...currentHist]
    });
    setTab('PROPS');
  };

  const handleChange = (field: keyof NodeData, value: string) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const versions = node.data.history || [];

  return (
    <div
      role="dialog"
      aria-label={`Node inspector: ${node.data.label}`}
      className="absolute top-32 right-4 w-72 bg-neutral-900 border border-neutral-700 shadow-2xl z-40 pointer-events-auto flex flex-col max-h-[calc(100vh-10rem)]"
      style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}
    >
      <div
        onPointerDown={() => setDragging(true)}
        title="Drag to move out of the way"
        className="flex justify-between items-center bg-neutral-950 p-3 border-b border-neutral-800 cursor-move select-none"
      >
        <div className="type-section text-neutral-300 flex items-center gap-2">
          {node.data.label} <span className="type-meta text-neutral-400 bg-neutral-800 px-1 rounded">v{node.data.currentVersion || 1}</span>
        </div>
        <button onClick={onClose} aria-label="Close inspector" className="text-neutral-500 hover:text-white transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div role="tablist" aria-label="Inspector sections" className="flex border-b border-neutral-800 type-control">
        <button 
          role="tab"
          aria-selected={tab === 'PROPS'}
          className={`flex-1 py-2 font-bold tracking-widest focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${tab === 'PROPS' ? 'text-neutral-200 border-b-2 border-neutral-400' : 'text-neutral-400 hover:bg-neutral-800'}`}
          onClick={() => setTab('PROPS')}
        >
          PROPERTIES
        </button>
        <button 
          role="tab"
          aria-selected={tab === 'HISTORY'}
          className={`flex-1 py-2 font-bold tracking-widest flex items-center justify-center gap-1 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${tab === 'HISTORY' ? 'text-neutral-200 border-b-2 border-neutral-400' : 'text-neutral-400 hover:bg-neutral-800'}`}
          onClick={() => setTab('HISTORY')}
        >
          <History className="w-3 h-3" aria-hidden="true" /> HISTORY
        </button>
      </div>

      <div className="p-4 overflow-y-auto flex-1 type-body">
        {tab === 'PROPS' ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="type-label text-neutral-400 uppercase tracking-widest">TITLE</label>
              <input 
                type="text" 
                value={editData.title || ''} 
                onChange={(e) => handleChange('title', e.target.value)}
                aria-label="Title"
                className="w-full bg-neutral-950 border border-neutral-800 text-neutral-300 p-2 focus:outline-none focus:border-neutral-500 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="type-label text-neutral-400 uppercase tracking-widest">CLASSIFICATION</label>
              <input 
                type="text" 
                value={editData.class || ''} 
                onChange={(e) => handleChange('class', e.target.value)}
                aria-label="Classification"
                className="w-full bg-neutral-950 border border-neutral-800 text-neutral-300 p-2 focus:outline-none focus:border-neutral-500 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="type-label text-neutral-400 uppercase tracking-widest">CONTENT / EXTRACT</label>
              <textarea 
                value={editData.description || ''} 
                onChange={(e) => handleChange('description', e.target.value)}
                aria-label="Content / extract"
                rows={6}
                className="w-full bg-neutral-950 border border-neutral-800 text-neutral-400 p-2 focus:outline-none focus:border-neutral-500 font-mono type-body"
                placeholder="No extracted content..."
              />
            </div>
            
            <button 
              onClick={handleSave}
              className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 type-control tracking-widest mt-4 flex items-center justify-center gap-2 border border-neutral-600"
            >
              <Save className="w-3 h-3" aria-hidden="true" /> SAVE CHANGES
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {versions.length === 0 ? (
              <div className="text-neutral-400 italic type-meta">No version history found. Save this node to begin tracking versions.</div>
            ) : (
              versions.map((ver, idx) => (
                <div key={idx} className="bg-neutral-950 border border-neutral-800 p-3 relative group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-neutral-300">v{ver.version}</span>
                    <span className="type-meta text-neutral-400 font-mono">{new Date(ver.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="type-meta text-neutral-400 mb-2">{ver.changes}</div>
                  
                  {ver.version !== node.data.currentVersion && (
                    <button 
                      onClick={() => handleRevert(ver)}
                      className="type-control text-neutral-300 bg-neutral-800 px-2 py-1 flex items-center gap-1 hover:bg-neutral-700 transition w-full justify-center"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" /> REVERT TO THIS
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
