import { describe, it, expect, beforeEach } from 'vitest';
import { kgStore } from './store';
import type { AppNode, Edge } from '../types';

// Runs in the node test env where `indexedDB` is undefined, so the store uses
// its in-memory fallback — exactly the path these paging helpers must support.

function node(id: string): AppNode {
  return { id, type: 'doc', position: { x: 0, y: 0 }, data: { label: id, type: 'doc' } } as AppNode;
}

function makeNodes(n: number): AppNode[] {
  return Array.from({ length: n }, (_, i) => node(`n${String(i).padStart(3, '0')}`));
}

describe('kgStore paged reads (Slice 10.1)', () => {
  beforeEach(async () => {
    await kgStore.clearAll();
  });

  it('countNodes reflects what was stored', async () => {
    expect(await kgStore.countNodes()).toBe(0);
    await kgStore.putNodes(makeNodes(2500));
    expect(await kgStore.countNodes()).toBe(2500);
  });

  it('getNodesPage returns the requested window', async () => {
    await kgStore.putNodes(makeNodes(100));
    const first = await kgStore.getNodesPage(0, 10);
    expect(first.map((n) => n.id)).toEqual(makeNodes(10).map((n) => n.id));
    const mid = await kgStore.getNodesPage(20, 5);
    expect(mid).toHaveLength(5);
    expect(mid[0].id).toBe('n020');
  });

  it('clamps the last page and never exceeds the store size', async () => {
    await kgStore.putNodes(makeNodes(25));
    const tail = await kgStore.getNodesPage(20, 50);
    expect(tail).toHaveLength(5);
    const past = await kgStore.getNodesPage(999, 50);
    expect(past).toHaveLength(0);
  });

  it('a zero limit returns nothing', async () => {
    await kgStore.putNodes(makeNodes(10));
    expect(await kgStore.getNodesPage(0, 0)).toHaveLength(0);
  });

  it('streamNodes covers every node exactly once across pages', async () => {
    await kgStore.putNodes(makeNodes(2500));
    const seen: string[] = [];
    let lastLoaded = 0;
    const total = await kgStore.streamNodes((page, loaded, tot) => {
      expect(tot).toBe(2500);
      expect(loaded).toBeGreaterThan(lastLoaded);
      lastLoaded = loaded;
      for (const n of page) seen.push(n.id);
    }, 1000);
    expect(total).toBe(2500);
    expect(seen).toHaveLength(2500);
    expect(new Set(seen).size).toBe(2500); // no duplicates, no gaps
  });

  it('paged edges work too', async () => {
    const edges: Edge[] = Array.from({ length: 30 }, (_, i) => ({
      id: `e${i}`,
      source: 'a',
      target: 'b',
    }));
    await kgStore.putEdges(edges);
    expect(await kgStore.countEdges()).toBe(30);
    expect(await kgStore.getEdgesPage(10, 10)).toHaveLength(10);
  });
});
