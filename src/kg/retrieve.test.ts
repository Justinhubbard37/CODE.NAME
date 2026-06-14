import { describe, it, expect } from 'vitest';
import {
  LexicalRetriever,
  HybridRetriever,
  retriever,
  type RetrievalHit,
} from './retrieve';
import { VectorRetriever } from './vector';
import type { AppNode, NodeData } from '../types';

// Phase 11, Slice 11.1 — unit coverage for the retrieval stack:
// LexicalRetriever (BM25-lite), VectorRetriever (cosine), and the
// HybridRetriever (Reciprocal Rank Fusion of the two).

function node(id: string, data: Partial<NodeData>): AppNode {
  return {
    id,
    type: 'doc',
    position: { x: 0, y: 0 },
    data: { label: id, type: 'doc', ...data },
  } as AppNode;
}

const ids = (hits: RetrievalHit[]): string[] => hits.map((h) => h.id);

// ── LexicalRetriever (BM25-lite) ─────────────────────────────────────────────

describe('LexicalRetriever (BM25-lite)', () => {
  const corpus: AppNode[] = [
    node('n1', { label: 'Quantum cryptography lattice research' }),
    node('n2', { label: 'Lattice based encryption scheme', description: 'lattice encryption' }),
    node('n3', { label: 'Banana smoothie recipe' }),
  ];

  it('ranks the document with the most query-term matches first', () => {
    const r = new LexicalRetriever();
    r.index(corpus);
    const hits = r.retrieve('lattice encryption');
    expect(hits.length).toBeGreaterThan(0);
    // n2 contains both terms (and repeats them); n1 has only "lattice".
    expect(hits[0].id).toBe('n2');
    expect(ids(hits)).toContain('n1');
    // n3 shares no query terms and must not appear.
    expect(ids(hits)).not.toContain('n3');
  });

  it('returns nothing for an empty or stopword-only query', () => {
    const r = new LexicalRetriever();
    r.index(corpus);
    expect(r.retrieve('')).toEqual([]);
    expect(r.retrieve('the a an of to')).toEqual([]);
  });

  it('returns nothing when the index is empty', () => {
    const r = new LexicalRetriever();
    r.index([]);
    expect(r.retrieve('lattice')).toEqual([]);
  });

  it('respects the k limit', () => {
    const many: AppNode[] = Array.from({ length: 20 }, (_, i) =>
      node(`m${i}`, { label: 'lattice encryption document number ' + i }),
    );
    const r = new LexicalRetriever();
    r.index(many);
    expect(r.retrieve('lattice', 5)).toHaveLength(5);
  });

  it('produces strictly descending scores', () => {
    const r = new LexicalRetriever();
    r.index(corpus);
    const hits = r.retrieve('lattice encryption scheme');
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it('re-indexing replaces the previous corpus', () => {
    const r = new LexicalRetriever();
    r.index(corpus);
    r.index([node('z1', { label: 'photosynthesis chlorophyll' })]);
    expect(r.retrieve('lattice')).toEqual([]);
    expect(ids(r.retrieve('chlorophyll'))).toEqual(['z1']);
  });

  it('rarer terms (higher IDF) outweigh common ones', () => {
    // "common" appears in every doc; "unicorn" appears in only one.
    const docs: AppNode[] = [
      node('a', { label: 'common common common topic' }),
      node('b', { label: 'common unicorn' }),
      node('c', { label: 'common common' }),
    ];
    const r = new LexicalRetriever();
    r.index(docs);
    const hits = r.retrieve('common unicorn');
    expect(hits[0].id).toBe('b');
  });
});

// ── HybridRetriever (Reciprocal Rank Fusion) ─────────────────────────────────

describe('HybridRetriever (RRF over lexical + vector)', () => {
  const corpus: AppNode[] = [
    node('n1', { label: 'Quantum cryptography lattice research' }),
    node('n2', { label: 'Lattice based encryption scheme', description: 'lattice encryption' }),
    node('n3', { label: 'Banana smoothie recipe' }),
  ];

  it('fuses both signals and surfaces the doubly-relevant document first', () => {
    const h = new HybridRetriever();
    h.index(corpus);
    const hits = h.retrieve('lattice encryption');
    expect(hits.length).toBeGreaterThan(0);
    // n2 leads both the lexical and the vector ranking, so RRF puts it on top.
    expect(hits[0].id).toBe('n2');
    const order = ids(hits);
    expect(order.indexOf('n2')).toBeLessThan(order.indexOf('n1'));
  });

  it('accepts injected sub-retrievers and uses them', () => {
    const lex = new LexicalRetriever();
    const vec = new VectorRetriever();
    const h = new HybridRetriever(lex, vec);
    h.index(corpus);
    // Indexing the hybrid must have indexed the injected instances too.
    expect(lex.retrieve('lattice').length).toBeGreaterThan(0);
    expect(vec.retrieve('lattice').length).toBeGreaterThan(0);
    expect(h.retrieve('lattice').length).toBeGreaterThan(0);
  });

  it('returns nothing for an empty index', () => {
    const h = new HybridRetriever();
    h.index([]);
    expect(h.retrieve('lattice')).toEqual([]);
  });

  it('respects the k limit', () => {
    const many: AppNode[] = Array.from({ length: 30 }, (_, i) =>
      node(`m${i}`, { label: 'lattice encryption record ' + i }),
    );
    const h = new HybridRetriever();
    h.index(many);
    expect(h.retrieve('lattice encryption', 7)).toHaveLength(7);
  });

  it('produces non-increasing fused scores', () => {
    const h = new HybridRetriever();
    h.index(corpus);
    const hits = h.retrieve('lattice encryption scheme');
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it('the exported default retriever is a working HybridRetriever', () => {
    retriever.index(corpus);
    expect(ids(retriever.retrieve('encryption'))).toContain('n2');
  });
});
