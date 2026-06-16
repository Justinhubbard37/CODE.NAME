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

function stableHash(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableOffset(id: string, modulo: number): number {
  return stableHash(id) % modulo;
}

function pointOnRing(
  center: { x: number; y: number },
  radius: number,
  index: number,
  total: number,
  phase = -Math.PI / 2,
) {
  const safeTotal = Math.max(total, 1);
  const angle = phase + (Math.PI * 2 * index) / safeTotal;
  return {
    x: Math.round(center.x + Math.cos(angle) * radius),
    y: Math.round(center.y + Math.sin(angle) * radius),
  };
}

function clusterCenter(documentId: string): { x: number; y: number } {
  const slot = stableOffset(documentId, 48);
  const col = slot % 6;
  const row = Math.floor(slot / 6);
  return {
    x: 900 + col * 520,
    y: 180 + row * 420,
  };
}

const MIN_CLUSTER_DISTANCE = 360;
const CLUSTER_STEP = 520;

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function avoidOccupiedClusterCenter(
  documentId: string,
  occupied: { x: number; y: number }[],
): { x: number; y: number } {
  const base = clusterCenter(documentId);
  if (!occupied.some((point) => distance(point, base) < MIN_CLUSTER_DISTANCE)) return base;

  const phase = (stableHash(documentId) % 360) * (Math.PI / 180);
  for (let attempt = 1; attempt <= 96; attempt += 1) {
    const ring = Math.ceil(attempt / 8);
    const spoke = (attempt - 1) % 8;
    const angle = phase + (Math.PI * 2 * spoke) / 8;
    const candidate = {
      x: Math.round(base.x + Math.cos(angle) * CLUSTER_STEP * ring),
      y: Math.round(base.y + Math.sin(angle) * CLUSTER_STEP * ring),
    };
    if (!occupied.some((point) => distance(point, candidate) < MIN_CLUSTER_DISTANCE)) {
      return candidate;
    }
  }

  return {
    x: base.x + CLUSTER_STEP * 12,
    y: base.y + CLUSTER_STEP * 12,
  };
}

function buildClusterMembership(projection: KbGraphProjection): {
  docForNode: Map<string, string>;
  chunksByDoc: Map<string, string[]>;
  entitiesByDoc: Map<string, string[]>;
} {
  const docIds = new Set(
    projection.nodes.filter((node) => node.nodeType === 'document').map((node) => node.id),
  );
  const chunkIds = new Set(
    projection.nodes.filter((node) => node.nodeType === 'chunk').map((node) => node.id),
  );
  const docForNode = new Map<string, string>();
  const chunksByDoc = new Map<string, string[]>();
  const entitiesByDoc = new Map<string, string[]>();

  for (const edge of projection.edges) {
    if (edge.kind !== 'document_chunk' || !docIds.has(edge.source) || !chunkIds.has(edge.target)) {
      continue;
    }
    docForNode.set(edge.source, edge.source);
    docForNode.set(edge.target, edge.source);
    const chunks = chunksByDoc.get(edge.source) ?? [];
    chunks.push(edge.target);
    chunksByDoc.set(edge.source, chunks);
  }

  for (const edge of projection.edges) {
    if (edge.kind !== 'chunk_entity' || !chunkIds.has(edge.source)) continue;
    const docId = docForNode.get(edge.source);
    if (!docId) continue;
    if (!docForNode.has(edge.target)) docForNode.set(edge.target, docId);
    const entities = entitiesByDoc.get(docId) ?? [];
    if (!entities.includes(edge.target)) entities.push(edge.target);
    entitiesByDoc.set(docId, entities);
  }

  for (const edge of projection.edges) {
    if (edge.kind !== 'document_entity' || !docIds.has(edge.source)) continue;
    if (!docForNode.has(edge.target)) docForNode.set(edge.target, edge.source);
    const entities = entitiesByDoc.get(edge.source) ?? [];
    if (!entities.includes(edge.target)) entities.push(edge.target);
    entitiesByDoc.set(edge.source, entities);
  }

  for (const chunks of chunksByDoc.values()) chunks.sort();
  for (const entities of entitiesByDoc.values()) entities.sort();
  return { docForNode, chunksByDoc, entitiesByDoc };
}

function projectedNodePosition(
  node: KbGraphNode,
  index: number,
  membership: ReturnType<typeof buildClusterMembership>,
  documentCenters: Map<string, { x: number; y: number }>,
): { x: number; y: number } {
  if (node.nodeType === 'document') {
    return documentCenters.get(node.id) ?? clusterCenter(node.id);
  }
  const docId = membership.docForNode.get(node.id);
  if (!docId) {
    return { x: 160 + (index % 4) * 140, y: 900 + Math.floor(index / 4) * 110 };
  }
  const center = documentCenters.get(docId) ?? clusterCenter(docId);
  if (node.nodeType === 'chunk') {
    const chunks = membership.chunksByDoc.get(docId) ?? [node.id];
    const chunkIndex = Math.max(chunks.indexOf(node.id), 0);
    return pointOnRing(center, 150, chunkIndex, chunks.length, -Math.PI / 2);
  }
  const entities = membership.entitiesByDoc.get(docId) ?? [node.id];
  const entityIndex = Math.max(entities.indexOf(node.id), 0);
  const stagger = 24 + stableOffset(node.id, 42);
  return pointOnRing(center, 280 + stagger, entityIndex, entities.length, 0);
}

function graphType(node: KbGraphNode): AppNode['type'] {
  if (node.nodeType === 'document') return 'doc';
  if (node.nodeType === 'chunk') return 'chunk';
  return 'entity';
}

export function kbProjectionToGraph(
  projection: KbGraphProjection,
  options: { existingNodes?: AppNode[]; preserveExistingPositions?: boolean } = {},
): {
  nodes: AppNode[];
  edges: Edge[];
} {
  const existing = new Map((options.existingNodes ?? []).map((node) => [node.id, node]));
  const membership = buildClusterMembership(projection);
  const preserveExistingPositions = options.preserveExistingPositions ?? false;
  const occupied = (options.existingNodes ?? [])
    .filter((node) => preserveExistingPositions || !isKbProjectedNode(node))
    .map((node) => node.position);
  const documentCenters = new Map<string, { x: number; y: number }>();
  for (const node of projection.nodes) {
    if (node.nodeType !== 'document') continue;
    const existingNode = existing.get(node.id);
    const center =
      preserveExistingPositions && existingNode
        ? existingNode.position
        : avoidOccupiedClusterCenter(node.id, occupied);
    documentCenters.set(node.id, center);
    occupied.push(center);
  }
  const nodes = projection.nodes.map((node, index): AppNode => ({
    id: node.id,
    type: graphType(node),
    position:
      preserveExistingPositions && existing.has(node.id)
        ? existing.get(node.id)!.position
        : projectedNodePosition(node, index, membership, documentCenters),
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
  options: { preserveExistingPositions?: boolean } = { preserveExistingPositions: true },
): {
  nodes: AppNode[];
  edges: Edge[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
} {
  const graph = kbProjectionToGraph(projection, {
    existingNodes: currentNodes,
    preserveExistingPositions: options.preserveExistingPositions ?? true,
  });
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

export function upsertKbGraphProjection(
  currentNodes: AppNode[],
  currentEdges: Edge[],
  projection: KbGraphProjection,
): {
  nodes: AppNode[];
  edges: Edge[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
} {
  const graph = kbProjectionToGraph(projection, {
    existingNodes: currentNodes,
    preserveExistingPositions: true,
  });
  const incomingNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingEdges = new Map(graph.edges.map((edge) => [edge.id, edge]));

  const nodes = currentNodes.map((node) => incomingNodes.get(node.id) ?? node);
  const currentNodeIds = new Set(currentNodes.map((node) => node.id));
  for (const node of graph.nodes) {
    if (!currentNodeIds.has(node.id)) nodes.push(node);
  }

  const edges = currentEdges.map((edge) => incomingEdges.get(edge.id) ?? edge);
  const currentEdgeIds = new Set(currentEdges.map((edge) => edge.id));
  for (const edge of graph.edges) {
    if (!currentEdgeIds.has(edge.id)) edges.push(edge);
  }

  return { nodes, edges, removedNodeIds: [], removedEdgeIds: [] };
}
