import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { useApp } from '../../../state/AppState';
import { systemConfig } from '../../../config/system';
import { layout3D, type Vec3 } from './layout';
import { Node3D, ClusterNode3D } from './Node3D';
import { Edges3D } from './Edges3D';
import { NodeDetailsPanel } from '../../NodeDetailsPanel';
import { StateBlock } from '../../common/StateBlock';
import { useT } from '../../../i18n';
import type { AppNode } from '../../../types';

/**
 * Phase 10 Slice 10.1 — render-window tuning for large graphs.
 *
 * Below CULL_THRESHOLD nodes the whole graph is rendered, exactly as before, so
 * small/medium graphs are untouched. Above it, only the nodes near the camera
 * are mounted: each Node3D runs a per-frame LOD callback, so capping how many
 * exist at once is what keeps thousands-of-node graphs at 60 FPS. The visible
 * window grows as the camera pulls back (so you still see context when zoomed
 * out) but is hard-capped at MAX_RENDERED to bound per-frame cost.
 */
const CULL_THRESHOLD = 400; // render everything at or below this count
const MAX_RENDERED = 800; // hard cap on simultaneously-mounted nodes
const BASE_RADIUS = 40; // world-space window radius when zoomed all the way in
const RADIUS_FACTOR = 1.5; // window grows with camera distance from origin
const CULL_INTERVAL = 0.12; // seconds between cull passes (≈8×/s, off the render path)

/**
 * CameraMonitor: renders nothing but reads camera distance each frame and
 * calls back when the camera crosses a threshold. Used to switch the cluster
 * LOD on/off without polling in the parent (Phase 4, Slice 4.5).
 */
function CameraMonitor({
  threshold,
  onChange,
}: {
  threshold: number;
  onChange: (far: boolean) => void;
}) {
  const prevFarRef = useRef<boolean | null>(null);
  useFrame(({ camera }) => {
    const d = camera.position.length(); // distance from world origin
    const far = d > threshold;
    if (far !== prevFarRef.current) {
      prevFarRef.current = far;
      onChange(far);
    }
  });
  return null;
}

/**
 * ProximityCuller: computes the set of node ids near the camera, throttled to
 * CULL_INTERVAL so it never runs on every frame. Renders nothing; only calls
 * `onChange` when the visible set actually changes (cheap membership diff).
 */
function ProximityCuller({
  map,
  ids,
  cap,
  selectedId,
  onChange,
}: {
  map: Map<string, Vec3>;
  ids: string[];
  cap: number;
  selectedId: string | null;
  onChange: (ids: Set<string>) => void;
}) {
  const acc = useRef(999); // large so the first frame computes immediately
  const lastRef = useRef<Set<string> | null>(null);

  useFrame(({ camera }, delta) => {
    acc.current += delta;
    if (acc.current < CULL_INTERVAL) return;
    acc.current = 0;

    const cam = camera.position;
    const radius = Math.max(BASE_RADIUS, cam.length() * RADIUS_FACTOR);
    const r2 = radius * radius;

    const near: [string, number][] = [];
    for (const id of ids) {
      const p = map.get(id);
      if (!p) continue;
      const dx = cam.x - p[0];
      const dy = cam.y - p[1];
      const dz = cam.z - p[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= r2) near.push([id, d2]);
    }

    let chosen: [string, number][];
    if (near.length > cap) {
      near.sort((a, b) => a[1] - b[1]);
      chosen = near.slice(0, cap);
    } else {
      chosen = near;
    }

    const set = new Set<string>(chosen.map((x) => x[0]));
    if (selectedId) set.add(selectedId); // keep the inspected node alive

    // Only push an update when membership actually changed.
    const prev = lastRef.current;
    if (prev && prev.size === set.size) {
      let same = true;
      for (const id of set) {
        if (!prev.has(id)) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    lastRef.current = set;
    onChange(set);
  });

  return null;
}

/**
 * 3D interactive knowledge graph (Phase 2 + Phase 4 Slice 4.5 + Phase 10 10.1).
 * Cards-as-nodes in depth, neural-net style, with four screen-space LOD tiers:
 *   card → label → dot → cluster (collapsed community sphere when camera is far).
 *
 * Display-only empty/no-match overlays (Slice 10.4) keep the canvas from ever
 * reading as a blank void.
 */
export function Graph3D() {
  const {
    nodes,
    edges,
    selectedNodeId,
    setSelectedNodeId,
    updateNodeData,
    graphQuery,
    stabilizeGraphLayout,
  } = useApp();
  const t = useT();
  const { map, communities, centroids, communitySizes } = useMemo(
    () => layout3D(nodes, edges),
    [nodes, edges],
  );
  const selected = (nodes.find((n) => n.id === selectedNodeId) ?? null) as AppNode | null;

  // Set of community indices that the user has manually expanded (override cluster mode).
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set());
  // Whether the camera is "far" enough that cluster mode is active at all.
  const [cameraFar, setCameraFar] = useState(false);

  const threshold = systemConfig.lod.clusterWhenCommunityGt;

  // Build a set of communities large enough to cluster when camera is far.
  const clusterableCommunities = useMemo(() => {
    const s = new Set<number>();
    for (const [idx, size] of communitySizes) {
      if (size > threshold) s.add(idx);
    }
    return s;
  }, [communitySizes, threshold]);

  const handleExpand = (commIdx: number) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      next.add(commIdx);
      return next;
    });
  };

  // Large-graph render windowing (Slice 10.1).
  const cullingActive = nodes.length > CULL_THRESHOLD;
  const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  // null ⇒ render all (small graphs, or the first frame before the culler runs).
  const [visibleIds, setVisibleIds] = useState<Set<string> | null>(null);

  // Display-only state detection (Slice 10.4).
  const isEmpty = nodes.length === 0;
  const queryActive = graphQuery.trim().length > 0;
  const visibleCount = nodes.reduce((acc, n) => (n.hidden ? acc : acc + 1), 0);
  const noMatches = !isEmpty && queryActive && visibleCount === 0;

  return (
    <div className="absolute inset-0">
      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 42], fov: 50, near: 0.1, far: 4000 }}
        style={{ background: 'transparent' }}
        onPointerMissed={(e) => {
          if (e.target instanceof HTMLCanvasElement) setSelectedNodeId(null);
        }}
      >
        <CameraMonitor threshold={80} onChange={setCameraFar} />
        {cullingActive && (
          <ProximityCuller
            map={map}
            ids={nodeIds}
            cap={MAX_RENDERED}
            selectedId={selectedNodeId}
            onChange={setVisibleIds}
          />
        )}
        <Edges3D edges={edges} map={map} />

        {/* Regular nodes — hidden when their community is clustered, or when
            culling is active and the node is outside the camera window. */}
        {nodes.map((n) => {
          if (cullingActive && visibleIds && !visibleIds.has(n.id)) return null;
          const p = map.get(n.id);
          if (!p) return null;
          const commIdx = communities.get(n.id) ?? -1;
          const inCluster =
            cameraFar &&
            clusterableCommunities.has(commIdx) &&
            !expandedClusters.has(commIdx);
          return (
            <Node3D
              key={n.id}
              node={n}
              pos={p}
              selected={n.id === selectedNodeId}
              lod={systemConfig.lod}
              onSelect={setSelectedNodeId}
              clusterMode={inCluster}
            />
          );
        })}

        {/* Cluster nodes — one per large community when camera is far */}
        {cameraFar &&
          Array.from(clusterableCommunities).map((commIdx) => {
            if (expandedClusters.has(commIdx)) return null;
            const centroid = centroids.get(commIdx);
            if (!centroid) return null;
            const size = communitySizes.get(commIdx) ?? 0;
            // Pick the summary from any member node that has one
            const memberNode = nodes.find(
              (n) => communities.get(n.id) === commIdx && n.data.communitySummary,
            );
            return (
              <ClusterNode3D
                key={`cluster-${commIdx}`}
                commIdx={commIdx}
                pos={centroid}
                memberCount={size}
                summary={memberNode?.data.communitySummary}
                onExpand={handleExpand}
              />
            );
          })}

        <OrbitControls makeDefault enablePan enableRotate enableZoom zoomSpeed={0.8} rotateSpeed={0.6} />
      </Canvas>

      {/* Render-window indicator — only while culling is active. */}
      {cullingActive && visibleIds && (
        <div
          role="status"
          aria-live="off"
          className="pointer-events-none absolute bottom-2 right-2 z-20 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-neutral-600 bg-neutral-950/70 border border-neutral-800"
        >
          rendering {Math.min(visibleIds.size, nodes.length)} / {nodes.length}
        </div>
      )}

      {/* Empty / no-match overlays — display only, never block orbit controls. */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <StateBlock kind="empty" title={t('graph.empty.title')} hint={t('graph.empty.hint')} />
        </div>
      )}
      {noMatches && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <StateBlock kind="empty" title={t('graph.noMatch.title')} hint={t('graph.noMatch.hint')} />
        </div>
      )}

      <button
        onClick={() => void stabilizeGraphLayout()}
        className="pointer-events-auto absolute top-2 right-2 z-20 flex items-center gap-1 border border-neutral-800 bg-neutral-950/80 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-neutral-500 backdrop-blur-sm hover:border-emerald-500/50 hover:text-emerald-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
        title="Stabilize SQLite KB graph layout"
        aria-label="Stabilize graph layout"
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        Stabilize
      </button>

      {selected && (
        <NodeDetailsPanel
          node={selected}
          onClose={() => setSelectedNodeId(null)}
          onUpdate={updateNodeData}
        />
      )}
    </div>
  );
}
