import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AppNode, LodConfig } from '../../../types';
import type { Vec3 } from './layout';

/** LOD tiers: card (full detail) → label (name only) → dot (sphere) → cluster (hidden, managed by ClusterNode3D) */
type Tier = 'card' | 'label' | 'dot' | 'cluster';
const CARD_WORLD_H = 1.4; // approx world height a node occupies

function Row({ k, v }: { k: string; v?: string | number }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-neutral-600">{k}</span>
      <span className="text-neutral-300 truncate max-w-[100px]">{v}</span>
    </div>
  );
}

export function Node3D({
  node,
  pos,
  selected,
  lod,
  onSelect,
  clusterMode,
}: {
  node: AppNode;
  pos: Vec3;
  selected: boolean;
  lod: LodConfig;
  onSelect: (id: string) => void;
  /** When true, this node belongs to a large community collapsed into a ClusterNode3D. */
  clusterMode?: boolean;
}) {
  const [tier, setTier] = useState<Tier>('dot');
  const tierRef = useRef<Tier>('dot');
  const v = useRef(new THREE.Vector3(pos[0], pos[1], pos[2])).current;

  useFrame(({ camera, size }) => {
    // If this node is collapsed into a cluster, hide it entirely.
    if (clusterMode && !selected) {
      if (tierRef.current !== 'cluster') {
        tierRef.current = 'cluster';
        setTier('cluster');
      }
      return;
    }
    const d = camera.position.distanceTo(v);
    const fov = ((camera as THREE.PerspectiveCamera).fov ?? 50) * (Math.PI / 180);
    const px = (CARD_WORLD_H * size.height) / (2 * Math.max(d, 0.001) * Math.tan(fov / 2));
    const t: Tier =
      selected || px >= lod.fullCardMinPx ? 'card' : px >= lod.labelMinPx ? 'label' : 'dot';
    if (t !== tierRef.current) {
      tierRef.current = t;
      setTier(t);
    }
  });

  // Hidden when in cluster mode (and not selected)
  if (tier === 'cluster') return null;

  const d = node.data;
  const pick = () => onSelect(node.id);

  return (
    <group position={pos} onClick={(e) => { e.stopPropagation(); pick(); }}>
      {tier === 'card' && (
        <Html center distanceFactor={10} zIndexRange={[20, 0]} style={{ pointerEvents: 'auto' }}>
          <div
            onPointerDown={(e) => { e.stopPropagation(); pick(); }}
            className={`select-none cursor-pointer w-44 bg-neutral-950/95 border p-2 font-mono text-[10px] text-neutral-300 shadow-xl backdrop-blur-sm ${
              selected ? 'border-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.25)]' : 'border-neutral-700'
            }`}
          >
            <div className="text-neutral-100 font-bold tracking-wider mb-1">{d.label}</div>
            <div className="border-t border-neutral-800 pt-1 space-y-0.5">
              <Row k="TYPE" v={d.type} />
              <Row k="TITLE" v={d.title} />
              <Row k="NAME" v={d.name} />
              <Row k="ALIAS" v={d.alias} />
              <Row k="SRC" v={d.src} />
              <Row k="CLASS" v={d.class} />
              <Row k="WHY" v={d.description ? d.description.slice(0, 48) : undefined} />
            </div>
          </div>
        </Html>
      )}

      {tier === 'label' && (
        <Html center distanceFactor={16} style={{ pointerEvents: 'auto' }}>
          <div
            onPointerDown={(e) => { e.stopPropagation(); pick(); }}
            className={`select-none cursor-pointer px-1.5 py-0.5 font-mono text-[9px] whitespace-nowrap border bg-neutral-950/90 ${
              selected ? 'border-emerald-400 text-emerald-300' : 'border-neutral-700 text-neutral-400'
            }`}
          >
            {d.label}
          </div>
        </Html>
      )}

      {tier === 'dot' && (
        <mesh>
          <sphereGeometry args={[0.2, 12, 12]} />
          <meshBasicMaterial color={selected ? '#34d399' : '#6b7280'} />
        </mesh>
      )}
    </group>
  );
}

/**
 * 4th LOD tier: a pulsing sphere representing a collapsed community.
 * Rendered by Graph3D in place of the individual nodes when the community
 * exceeds `lod.clusterWhenCommunityGt` and the camera is far away.
 * Clicking expands the cluster (calls onExpand).
 */
export function ClusterNode3D({
  commIdx,
  pos,
  memberCount,
  summary,
  onExpand,
}: {
  commIdx: number;
  pos: Vec3;
  memberCount: number;
  summary?: string;
  onExpand: (commIdx: number) => void;
}) {
  const radius = 0.35 + Math.sqrt(memberCount) * 0.12;
  const pick = () => onExpand(commIdx);

  return (
    <group position={pos} onClick={(e) => { e.stopPropagation(); pick(); }}>
      <mesh>
        <sphereGeometry args={[radius, 18, 18]} />
        <meshBasicMaterial color="#854d0e" transparent opacity={0.55} />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius + 0.05, 18, 18]} />
        <meshBasicMaterial color="#ca8a04" transparent opacity={0.12} wireframe />
      </mesh>
      <Html center distanceFactor={18} style={{ pointerEvents: 'auto' }}>
        <div
          onPointerDown={(e) => { e.stopPropagation(); pick(); }}
          className="select-none cursor-pointer px-1.5 py-0.5 font-mono text-[8px] whitespace-nowrap border border-amber-800/60 bg-neutral-950/90 text-amber-400/80"
        >
          {summary ? summary.slice(0, 32) : `cluster ×${memberCount}`}
        </div>
      </Html>
    </group>
  );
}
