/**
 * 3D layout for the knowledge graph (Phase 2 + Phase 4 Slice 4.5).
 * x,y come from the existing 2D positions (centered + scaled); z is layered by
 * community so the cloud reads like a neural-net topology with meaningful depth.
 *
 * Phase 4 adds cluster centroids: the geometric mean position of all members of
 * each community, used by ClusterNode3D to place the collapsed cluster sphere.
 *
 * Phase 10 Slice 10.1 adds a structural-signature cache: community detection
 * and centroid math are O(N+E) and were recomputed on *every* graph change,
 * including data-only edits (renaming a label, attaching a community summary)
 * that leave topology and node positions untouched. The cache returns the
 * previous result when the structural signature -- node ids + positions and
 * edge endpoints -- is unchanged, keeping large graphs (thousands of nodes)
 * smooth. Small graphs behave exactly as before; the only difference is that an
 * identical structure is not recomputed.
 */
import type { AppNode, Edge } from '../../../types';
import { detectCommunities } from '../../../kg/communities';

export type Vec3 = [number, number, number];

const SCALE = 90;
const LAYER_GAP = 7;

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface Layout3DResult {
  map: Map<string, Vec3>;
  communities: Map<string, number>;
  communityCount: number;
  /** Geometric centroid of each community index -> Vec3, for ClusterNode3D. */
  centroids: Map<number, Vec3>;
  /** Number of members per community index. */
  communitySizes: Map<number, number>;
}

/**
 * Structural signature: a 32-bit rolling hash over the graph features that
 * actually drive the layout -- node ids, rounded node positions, and edge
 * endpoints. Node *data* (labels, summaries, titles) is intentionally excluded
 * so data-only edits do not invalidate the cache. Positions are quantised to a
 * tenth of a pixel so sub-pixel drift never busts the cache. The node and edge
 * counts are folded in so additions/removals always change the signature.
 */
function structuralSignature(nodes: AppNode[], edges: Edge[]): number {
  let h = 2166136261 >>> 0; // FNV-1a offset basis
  const mix = (x: number) => {
    h ^= x >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  };
  mix(nodes.length);
  mix(edges.length);
  for (const n of nodes) {
    mix(hashId(n.id));
    mix(Math.round(n.position.x * 10));
    mix(Math.round(n.position.y * 10));
    // communityId is the one data field that feeds detectCommunities, so it is
    // structural for layout purposes and must invalidate the cache when it
    // changes. Other data fields (label, summary, title) are excluded.
    if (n.data.communityId) mix(hashId(n.data.communityId));
  }
  for (const e of edges) {
    mix(hashId(e.source));
    mix(hashId(e.target));
  }
  return h >>> 0;
}

// Module-level single-entry cache. The 3D graph has exactly one live layout at
// a time, so a one-slot cache is sufficient and never grows unbounded.
let _cacheSig: number | null = null;
let _cacheResult: Layout3DResult | null = null;

/**
 * Reset the layout cache. Exposed for tests and for callers that change a
 * layout constant at runtime; not needed during normal operation.
 */
export function resetLayout3DCache(): void {
  _cacheSig = null;
  _cacheResult = null;
}

export function layout3D(nodes: AppNode[], edges: Edge[]): Layout3DResult {
  const sig = structuralSignature(nodes, edges);
  if (_cacheResult !== null && _cacheSig === sig) {
    return _cacheResult;
  }
  const result = computeLayout3D(nodes, edges);
  _cacheSig = sig;
  _cacheResult = result;
  return result;
}

function computeLayout3D(nodes: AppNode[], edges: Edge[]): Layout3DResult {
  const communities = detectCommunities(nodes, edges);

  let cx = 0;
  let cy = 0;
  for (const n of nodes) {
    cx += n.position.x;
    cy += n.position.y;
  }
  const N = nodes.length || 1;
  cx /= N;
  cy /= N;

  const commSet = new Set(communities.values());
  const commCount = commSet.size || 1;
  const zCenter = ((commCount - 1) * LAYER_GAP) / 2;

  const map = new Map<string, Vec3>();
  for (const n of nodes) {
    const c = communities.get(n.id) ?? 0;
    const x = (n.position.x - cx) / SCALE;
    const y = -(n.position.y - cy) / SCALE;
    const jitter = ((hashId(n.id) % 100) / 100 - 0.5) * 3;
    const z = c * LAYER_GAP - zCenter + jitter;
    map.set(n.id, [x, y, z]);
  }

  // Compute centroids and sizes per community
  const centroidAcc = new Map<number, { x: number; y: number; z: number; n: number }>();
  for (const [nodeId, commIdx] of communities) {
    const pos = map.get(nodeId);
    if (!pos) continue;
    const acc = centroidAcc.get(commIdx) ?? { x: 0, y: 0, z: 0, n: 0 };
    acc.x += pos[0];
    acc.y += pos[1];
    acc.z += pos[2];
    acc.n += 1;
    centroidAcc.set(commIdx, acc);
  }
  const centroids = new Map<number, Vec3>();
  const communitySizes = new Map<number, number>();
  for (const [idx, acc] of centroidAcc) {
    centroids.set(idx, [acc.x / acc.n, acc.y / acc.n, acc.z / acc.n]);
    communitySizes.set(idx, acc.n);
  }

  return { map, communities, communityCount: commCount, centroids, communitySizes };
}
