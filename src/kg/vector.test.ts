import { describe, it, expect } from 'vitest';
import { stubEmbed, cosineSim, VectorRetriever } from './vector';
import type { AppNode, NodeData } from '../types';

// Direct coverage for the legacy graph hash-vector primitives that back
// VectorRetriever compatibility behavior. These are not semantic embeddings.

function node(id: string, data: Partial<NodeData>): AppNode {
  return {
    id,
    type: 'doc',
    position: { x: 0, y: 0 },
    data: { label: id, type: 'doc', ...data },
  } as AppNode;
}

describe('stubEmbed (legacy local bigram hash vector)', () => {
  it('always returns a 128-dimension vector', () => {
    expect(stubEmbed('hello world')).toHaveLength(128);
    expect(stubEmbed('')).toHaveLength(128);
  });

  it('produces an L2-normalised unit vector for real text', () => {
    const v = stubEmbed('lattice based encryption');
    const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('is deterministic for the same input', () => {
    expect(stubEmbed('repeatable input')).toEqual(stubEmbed('repeatable input'));
  });

  it('yields a zero vector when there are no bigrams', () => {
    // Strings shorter than two chars never enter the bigram loop.
    expect(stubEmbed('').every((x) => x === 0)).toBe(true);
    expect(stubEmbed('a').every((x) => x === 0)).toBe(true);
  });
});

describe('cosineSim', () => {
  it('returns 1 for identical hash vectors', () => {
    const v = stubEmbed('quantum cryptography');
    expect(cosineSim(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for hash vectors that share no bigrams', () => {
    expect(cosineSim(stubEmbed('aaaa'), stubEmbed('zzzz'))).toBeCloseTo(0, 6);
  });

  it('is symmetric', () => {
    const a = stubEmbed('alpha beta');
    const b = stubEmbed('beta gamma');
    expect(cosineSim(a, b)).toBeCloseTo(cosineSim(b, a), 10);
  });
});

describe('VectorRetriever (legacy hash-vector top-k)', () => {
  const corpus: AppNode[] = [
    node('n1', { label: 'lattice based encryption scheme' }),
    node('n2', { label: 'banana smoothie recipe' }),
  ];

  it('returns nothing when the index is empty', () => {
    const r = new VectorRetriever();
    r.index([]);
    expect(r.retrieve('lattice')).toEqual([]);
  });

  it('ranks the highest hash-vector similarity first', () => {
    const r = new VectorRetriever();
    r.index(corpus);
    const hits = r.retrieve('lattice based encryption');
    expect(hits[0].id).toBe('n1');
  });

  it('filters out near-zero similarity matches', () => {
    const r = new VectorRetriever();
    r.index([node('x', { label: 'aaaa' })]);
    // No shared bigrams with the only document -> score ~0 -> filtered away.
    expect(r.retrieve('zzzz')).toEqual([]);
  });

  it('returns hits sorted by descending score', () => {
    const r = new VectorRetriever();
    r.index(corpus);
    const hits = r.retrieve('lattice encryption banana');
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it('respects the k limit', () => {
    const many: AppNode[] = Array.from({ length: 10 }, (_, i) =>
      node(`m${i}`, { label: 'lattice encryption variant ' + i }),
    );
    const r = new VectorRetriever();
    r.index(many);
    expect(r.retrieve('lattice encryption', 3).length).toBeLessThanOrEqual(3);
  });
});
