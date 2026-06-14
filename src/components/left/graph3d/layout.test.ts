import { describe, it, expect, beforeEach } from 'vitest';
import { layout3D, resetLayout3DCache } from './layout';
import type { AppNode, Edge } from '../../../types';

function node(id: string, x: number, y: number, extra?: Partial<AppNode['data']>): AppNode {
  return {
    id,
    type: 'doc',
    position: { x, y },
    data: { label: id, type: 'doc', ...extra },
  } as AppNode;
}

const baseNodes: AppNode[] = [node('a', 0, 0), node('b', 100, 0), node('c', 0, 100)];
const baseEdges: Edge[] = [
  { id: 'a-b', source: 'a', target: 'b' },
  { id: 'b-c', source: 'b', target: 'c' },
];

describe('layout3D cache (Slice 10.1)', () => {
  beforeEach(() => resetLayout3DCache());

  it('returns the same cached object when called twice with identical structure', () => {
    const r1 = layout3D(baseNodes, baseEdges);
    const r2 = layout3D(baseNodes, baseEdges);
    expect(r2).toBe(r1); // referential equality → no recompute
  });

  it('reuses the cache when only cosmetic node data changes', () => {
    const r1 = layout3D(baseNodes, baseEdges);
    // New array + new node objects, identical ids/positions, different labels.
    const renamed = baseNodes.map((n) => node(n.id, n.position.x, n.position.y, { label: 'X' }));
    const r2 = layout3D(renamed, baseEdges);
    expect(r2).toBe(r1);
  });

  it('recomputes when a node position changes', () => {
    const r1 = layout3D(baseNodes, baseEdges);
    const moved = [node('a', 5, 0), baseNodes[1], baseNodes[2]];
    const r2 = layout3D(moved, baseEdges);
    expect(r2).not.toBe(r1);
  });

  it('recomputes when a node is added', () => {
    const r1 = layout3D(baseNodes, baseEdges);
    const more = [...baseNodes, node('d', 200, 200)];
    const r2 = layout3D(more, baseEdges);
    expect(r2).not.toBe(r1);
    expect(r2.map.has('d')).toBe(true);
  });

  it('recomputes when an edge endpoint changes', () => {
    const r1 = layout3D(baseNodes, baseEdges);
    const rewired: Edge[] = [
      { id: 'a-b', source: 'a', target: 'c' },
      { id: 'b-c', source: 'b', target: 'c' },
    ];
    const r2 = layout3D(baseNodes, rewired);
    expect(r2).not.toBe(r1);
  });

  it('recomputes when communityId changes (it feeds detectCommunities)', () => {
    const r1 = layout3D(baseNodes, baseEdges);
    const tagged = baseNodes.map((n) => node(n.id, n.position.x, n.position.y, { communityId: 'k' }));
    const r2 = layout3D(tagged, baseEdges);
    expect(r2).not.toBe(r1);
  });

  it('produces a correct map for every node', () => {
    const r = layout3D(baseNodes, baseEdges);
    expect(r.map.size).toBe(3);
    for (const n of baseNodes) expect(r.map.has(n.id)).toBe(true);
  });
});
