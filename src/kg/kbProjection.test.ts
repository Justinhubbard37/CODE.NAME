import { describe, expect, it } from 'vitest';
import { hasConnectedKbProjection, kbProjectionToGraph, reconcileKbGraphProjection } from './kbProjection';
import type { KbGraphProjection } from '../lib/kb';
import type { AppNode, Edge } from '../types';

const projection: KbGraphProjection = {
  nodes: [
    {
      id: 'doc-default',
      nodeType: 'document',
      label: 'KB_DOC_SMOKE',
      title: 'kb-smoke-test.txt',
      description: 'file',
      kind: 'file',
    },
    {
      id: 'chunk-default-0',
      nodeType: 'chunk',
      label: 'KB_CHUNK_1',
      title: 'kb-smoke-test.txt chunk 1',
      description: 'CODE NAME 2 mentions UniqueSearchTerm7391',
      kind: 'chunk',
      ordinal: 0,
    },
    {
      id: 'ent-code-name-2',
      nodeType: 'entity',
      label: 'KB_ENT_CODE_NAME_2',
      title: 'CODE NAME 2',
      description: 'phrase',
      kind: 'phrase',
    },
  ],
  edges: [
    {
      id: 'edge-doc-chunk',
      source: 'doc-default',
      target: 'chunk-default-0',
      kind: 'document_chunk',
      label: 'document -> chunk',
    },
    {
      id: 'edge-chunk-entity',
      source: 'chunk-default-0',
      target: 'ent-code-name-2',
      kind: 'chunk_entity',
      label: 'chunk -> entity',
    },
  ],
};

const twoDocumentProjection: KbGraphProjection = {
  nodes: [
    ...projection.nodes,
    {
      id: 'doc-delete',
      nodeType: 'document',
      label: 'KB_DOC_DELETE',
      title: 'kb-delete-test.txt',
    },
    {
      id: 'chunk-delete-0',
      nodeType: 'chunk',
      label: 'KB_CHUNK_1',
      title: 'kb-delete-test.txt chunk 1',
      ordinal: 0,
    },
    {
      id: 'ent-delete-term',
      nodeType: 'entity',
      label: 'KB_ENT_DELETE_TERM',
      title: 'DeleteTerm',
      kind: 'identifier',
    },
  ],
  edges: [
    ...projection.edges,
    {
      id: 'edge-delete-doc-chunk',
      source: 'doc-delete',
      target: 'chunk-delete-0',
      kind: 'document_chunk',
      label: 'document -> chunk',
    },
    {
      id: 'edge-delete-chunk-entity',
      source: 'chunk-delete-0',
      target: 'ent-delete-term',
      kind: 'chunk_entity',
      label: 'chunk -> entity',
    },
  ],
};

describe('SQLite KB graph projection', () => {
  it('converts KB document, chunk, and entity rows into connected graph records', () => {
    const graph = kbProjectionToGraph(projection);

    expect(graph.nodes.map((node) => node.type)).toEqual(['doc', 'chunk', 'entity']);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[0]).toMatchObject({
      source: 'doc-default',
      target: 'chunk-default-0',
      label: 'document -> chunk',
    });
    expect(graph.edges[1]).toMatchObject({
      source: 'chunk-default-0',
      target: 'ent-code-name-2',
      label: 'chunk -> entity',
    });
    expect(hasConnectedKbProjection(projection)).toBe(true);
  });

  it('preserves stable node ids and creates non-collinear clustered positions', () => {
    const first = kbProjectionToGraph(projection);
    const second = kbProjectionToGraph(projection);

    expect(second.nodes.map((node) => node.id)).toEqual(first.nodes.map((node) => node.id));
    expect(second.edges.map((edge) => edge.id)).toEqual(first.edges.map((edge) => edge.id));

    const positions = first.nodes.map((node) => `${node.position.x},${node.position.y}`);
    expect(new Set(positions).size).toBe(first.nodes.length);
    const xs = new Set(first.nodes.map((node) => node.position.x));
    const ys = new Set(first.nodes.map((node) => node.position.y));
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
  });

  it('preserves existing projected positions during normal reconciliation', () => {
    const existing = kbProjectionToGraph(projection).nodes.map((node) =>
      node.id === 'doc-default'
        ? { ...node, position: { x: 1234, y: 5678 } }
        : node,
    );

    const reconciled = reconcileKbGraphProjection(existing, [], projection);

    expect(reconciled.nodes.find((node) => node.id === 'doc-default')?.position).toEqual({
      x: 1234,
      y: 5678,
    });
  });

  it('removes stale projected KB nodes and edges while preserving unrelated graph content', () => {
    const existing = kbProjectionToGraph(projection);
    const manualNode: AppNode = {
      id: 'manual',
      type: 'doc',
      position: { x: 1, y: 1 },
      data: { label: 'MANUAL', type: 'NOTE', src: 'manual' },
    };
    const manualEdge: Edge = {
      id: 'manual-edge',
      source: 'manual',
      target: 'manual',
    };

    const reconciled = reconcileKbGraphProjection(
      [...existing.nodes, manualNode],
      [...existing.edges, manualEdge],
      { nodes: [], edges: [] },
    );

    expect(reconciled.nodes).toEqual([manualNode]);
    expect(reconciled.edges).toEqual([manualEdge]);
    expect(reconciled.removedNodeIds).toEqual(['doc-default', 'chunk-default-0', 'ent-code-name-2']);
    expect(reconciled.removedEdgeIds).toEqual(['edge-doc-chunk', 'edge-chunk-entity']);
  });

  it('deleting one projected document keeps the remaining KB cluster', () => {
    const before = kbProjectionToGraph(twoDocumentProjection);
    const after = reconcileKbGraphProjection(before.nodes, before.edges, projection, {
      preserveExistingPositions: false,
    });

    expect(after.nodes.some((node) => node.id === 'doc-delete')).toBe(false);
    expect(after.edges.some((edge) => edge.source === 'doc-delete' || edge.target === 'doc-delete')).toBe(false);
    expect(after.nodes.some((node) => node.id === 'doc-default')).toBe(true);
    expect(after.edges.some((edge) => edge.id === 'edge-doc-chunk')).toBe(true);
  });
});
