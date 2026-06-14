/**
 * Community detection (Phase 4, Slice 4.4).
 *
 * Prefers `node.data.communityId` when it has been set by the sidecar
 * `/a2a/communities` endpoint (GraphRAG label propagation + LLM summaries).
 * Falls back to a local label-propagation algorithm when no stored IDs exist,
 * giving the 3D cluster tier meaningful depth even before the sidecar runs.
 */
import type { AppNode, Edge } from '../types';

// Seeded deterministic "shuffle" for reproducible convergence across renders.
function hash32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Label-propagation community detection (local fallback).
 * Each node starts with its own label. On each iteration every node (in
 * hash-deterministic random order) adopts the most-common label among its
 * direct neighbours. Converges in ~5–10 passes for typical KG sizes.
 */
function labelPropagation(nodes: AppNode[], edges: Edge[]): Map<string, number> {
  if (!nodes.length) return new Map();

  // Build undirected adjacency
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    }
  }

  // Each node's community label (starts as its own id)
  const labels = new Map<string, string>(nodes.map((n) => [n.id, n.id]));

  const MAX_ITER = 15;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Deterministic random order (Fisher-Yates with hash seed)
    const order = nodes.map((n) => n.id);
    for (let i = order.length - 1; i > 0; i--) {
      const j = hash32(order[i] + String(iter)) % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }

    let changed = false;
    for (const id of order) {
      const nbrs = adj.get(id)!;
      if (!nbrs.size) continue;

      const freq = new Map<string, number>();
      for (const nb of nbrs) {
        const lbl = labels.get(nb)!;
        freq.set(lbl, (freq.get(lbl) ?? 0) + 1);
      }

      // Pick max-frequency label; tie-break by lexicographic minimum
      let best = '';
      let bestCnt = 0;
      for (const [lbl, cnt] of freq) {
        if (cnt > bestCnt || (cnt === bestCnt && (best === '' || lbl < best))) {
          best = lbl;
          bestCnt = cnt;
        }
      }

      if (best && best !== labels.get(id)) {
        labels.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Map string labels → integer community ids
  const rootToInt = new Map<string, number>();
  const out = new Map<string, number>();
  let next = 0;
  for (const n of nodes) {
    const lbl = labels.get(n.id) ?? n.id;
    if (!rootToInt.has(lbl)) rootToInt.set(lbl, next++);
    out.set(n.id, rootToInt.get(lbl)!);
  }
  return out;
}

/**
 * Returns a Map<nodeId, communityIndex> for use by layout3D and LOD logic.
 *
 * Priority:
 * 1. If any node has `communityId` set (from sidecar GraphRAG), map all nodes
 *    using that field — nodes without one each get their own unique community.
 * 2. Otherwise run local label propagation.
 */
export function detectCommunities(nodes: AppNode[], edges: Edge[]): Map<string, number> {
  const hasStoredIds = nodes.some((n) => n.data.communityId !== undefined);

  if (hasStoredIds) {
    const keyToInt = new Map<string, number>();
    const out = new Map<string, number>();
    let next = 0;
    for (const n of nodes) {
      const key = n.data.communityId ?? `__solo__${n.id}`;
      if (!keyToInt.has(key)) keyToInt.set(key, next++);
      out.set(n.id, keyToInt.get(key)!);
    }
    return out;
  }

  return labelPropagation(nodes, edges);
}
