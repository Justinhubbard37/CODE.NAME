/**
 * Legacy graph hash-vector utilities.
 *
 * This module creates deterministic character-bigram hash vectors for graph UI
 * compatibility only. It does not produce real semantic embeddings and is not
 * used by Phase 2F SQLite KB semantic retrieval.
 */
import type { AppNode } from '../types';
import type { RetrievalHit, Retriever } from './retrieve';

const DIM = 128;

/** Character-bigram hash into a 128-dim L2-normalised vector (non-semantic). */
export function stubEmbed(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  const s = text.toLowerCase().slice(0, 512);
  for (let i = 0; i < s.length - 1; i++) {
    const a = s.charCodeAt(i);
    const b = s.charCodeAt(i + 1);
    const idx = (((a * 31 + b) * 2654435761) >>> 0) % DIM;
    v[idx] += 1;
  }
  const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Cosine similarity for two pre-normalised legacy hash vectors. */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

function nodeText(n: AppNode): string {
  const d = n.data;
  return [d.label, d.type, d.title, d.description, d.name, d.alias, d.communitySummary]
    .filter(Boolean)
    .join(' ');
}

export class VectorRetriever implements Retriever {
  private vecs: { id: string; vec: number[] }[] = [];

  index(nodes: AppNode[]): void {
    this.vecs = nodes.map((n) => ({ id: n.id, vec: stubEmbed(nodeText(n)) }));
  }

  retrieve(query: string, k = 50): RetrievalHit[] {
    if (!this.vecs.length) return [];
    const qv = stubEmbed(query);
    const scored = this.vecs.map((e) => ({ id: e.id, score: cosineSim(qv, e.vec) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).filter((h) => h.score > 0.01);
  }
}
