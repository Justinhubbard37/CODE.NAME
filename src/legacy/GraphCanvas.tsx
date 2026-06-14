/**
 * LEGACY — kept for reference, NOT used by the running app.
 * The original flat 2D React Flow graph. The live graph is the 3D one in
 * src/components/left/graph3d/ (rendered by MissionControl). This file is not
 * imported anywhere; it stays only as a reference/fallback. Safe to delete.
 */
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useApp } from '../state/AppState';
import {
  DocNode,
  OrgNode,
  SubjectNode,
  AudioNode,
  ClusterNode,
} from './CustomNodes';
import { NodeDetailsPanel } from '../components/NodeDetailsPanel';
import type { AppNode } from '../types';

const nodeTypes = {
  doc: DocNode,
  org: OrgNode,
  subject: SubjectNode,
  audio: AudioNode,
  cluster: ClusterNode,
};

export function GraphCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectedNodeId,
    setSelectedNodeId,
    updateNodeData,
  } = useApp();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="absolute inset-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        nodeTypes={nodeTypes}
        fitView
        className="bg-neutral-950"
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'straight', style: { stroke: '#444' } }}
      >
        <Background gap={24} size={1} color="#222" variant={BackgroundVariant.Dots} />
      </ReactFlow>

      {selectedNode && (
        <NodeDetailsPanel
          node={selectedNode as AppNode}
          onClose={() => setSelectedNodeId(null)}
          onUpdate={updateNodeData}
        />
      )}
    </div>
  );
}

export type { Edge };
