import type { Edge, AppNode } from '../types';
import type { KbGraphProjection, KbGraphNode } from '../lib/kb';

const KB_NODE_STYLE = {
  background: 'rgba(2, 6, 23, 0.9)',
  border: '1px solid #334155',
  color: '#d4d4d8',
  borderRadius: '2px',
  fontFamily: 'monospace',
  fontSize: '10px',
  padding: '8px',
  boxShadow: '0 0 10px rgba(16,185,129,0.14)',
};

const KB_EDGE_STYLE = {
  stroke: '#10b981',
  strokeWidth: 1,
};

function stableOffset(id: string, modulo: number): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % modulo;
}

function nodePosition(node: KbGraphNode, index: number): { x: number; y: number } {
  if (node.nodeType === 'document') {
    return { x: 180 + stableOffset(node.id, 80), y: 220 + stableOffset(node.id, 120) };
  }
  if (node.nodeType === 'chunk') {
    const ordinal = node.ordinal ?? index;
    return { x: 480 + (ordinal % 2) * 80, y: 120 + ordinal * 110 };
  }
  return { x: 820 + (index % 3) * 110, y: 110 + Math.floor(index / 3) * 82 };
}

function graphType(node: KbGraphNode): AppNode['type'] {
  if (node.nodeType === 'document') return 'doc';
  if (node.nodeType === 'chunk') return 'chunk';
  return 'entity';
}

export function kbProjectionToGraph(projection: KbGraphProjection): {
  nodes: AppNode[];
  edges: Edge[];
} {
  const nodes = projection.nodes.map((node, index): AppNode => ({
    id: node.id,
    type: graphType(node),
    position: nodePosition(node, index),
    data: {
      label: node.label,
      type: node.nodeType === 'entity' ? `ENTITY:${node.kind ?? 'unknown'}` : node.nodeType.toUpperCase(),
      title: node.title,
      description: node.description,
      class: 'LOCAL_SQLITE',
      name: node.nodeType === 'entity' ? node.title : undefined,
      src: 'SQLite KB',
      currentVersion: 1,
      history: [
        {
          version: 1,
          timestamp: Date.now(),
          changes: 'Projected from SQLite KB',
          snap: { title: node.title, description: node.description },
        },
      ],
    },
    style: {
      ...KB_NODE_STYLE,
      borderColor:
        node.nodeType === 'document' ? '#22c55e' : node.nodeType === 'chunk' ? '#38bdf8' : '#f59e0b',
    },
  }));

  const edges = projection.edges.map((edge): Edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: edge.kind === 'document_chunk' || edge.kind === 'chunk_entity',
    style: KB_EDGE_STYLE,
    labelStyle: { fill: '#a7f3d0', fontSize: 8, fontFamily: 'monospace' },
    labelBgStyle: { fill: '#022c22', fillOpacity: 0.8 },
  }));

  return { nodes, edges };
}

export function hasConnectedKbProjection(projection: KbGraphProjection): boolean {
  const nodeIds = new Set(projection.nodes.map((node) => node.id));
  return projection.edges.some((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
}

export function isKbProjectedNode(node: AppNode): boolean {
  return node.data.src === 'SQLite KB';
}

export function isKbProjectedEdge(edge: Edge): boolean {
  return edge.id.startsWith('kb_edge_') || edge.id.startsWith('rel_');
}

export function reconcileKbGraphProjection(
  currentNodes: AppNode[],
  currentEdges: Edge[],
  projection: KbGraphProjection,
): {
  nodes: AppNode[];
  edges: Edge[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
} {
  const graph = kbProjectionToGraph(projection);
  const incomingNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingEdges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const activeNodeIds = new Set(incomingNodes.keys());

  const removedNodeIds: string[] = [];
  const nodes: AppNode[] = [];
  for (const node of currentNodes) {
    if (isKbProjectedNode(node) && !activeNodeIds.has(node.id)) {
      removedNodeIds.push(node.id);
      continue;
    }
    nodes.push(incomingNodes.get(node.id) ?? node);
  }
  for (const node of graph.nodes) {
    if (!currentNodes.some((existing) => existing.id === node.id)) nodes.push(node);
  }

  const removedNodeSet = new Set(removedNodeIds);
  const removedEdgeIds: string[] = [];
  const edges: Edge[] = [];
  for (const edge of currentEdges) {
    const staleKbEdge = isKbProjectedEdge(edge) && !incomingEdges.has(edge.id);
    const touchesRemovedNode = removedNodeSet.has(edge.source) || removedNodeSet.has(edge.target);
    if (staleKbEdge || touchesRemovedNode) {
      removedEdgeIds.push(edge.id);
      continue;
    }
    edges.push(incomingEdges.get(edge.id) ?? edge);
  }
  for (const edge of graph.edges) {
    if (!currentEdges.some((existing) => existing.id === edge.id)) edges.push(edge);
  }

  return { nodes, edges, removedNodeIds, removedEdgeIds };
}
