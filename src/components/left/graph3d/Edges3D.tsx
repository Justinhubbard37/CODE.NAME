import { useMemo } from 'react';
import * as THREE from 'three';
import type { Edge } from '../../../types';
import type { Vec3 } from './layout';

export function Edges3D({ edges, map }: { edges: Edge[]; map: Map<string, Vec3> }) {
  const { regular, kb } = useMemo(() => {
    const regularPts: number[] = [];
    const kbPts: number[] = [];
    for (const e of edges) {
      const a = map.get(e.source);
      const b = map.get(e.target);
      if (!a || !b) continue;
      const target = typeof e.label === 'string' && e.label.includes('->') ? kbPts : regularPts;
      target.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const regular = new THREE.BufferGeometry();
    regular.setAttribute('position', new THREE.Float32BufferAttribute(regularPts, 3));
    const kb = new THREE.BufferGeometry();
    kb.setAttribute('position', new THREE.Float32BufferAttribute(kbPts, 3));
    return { regular, kb };
  }, [edges, map]);

  return (
    <>
      <lineSegments geometry={regular}>
        <lineBasicMaterial color="#3a3a3a" transparent opacity={0.55} />
      </lineSegments>
      <lineSegments geometry={kb}>
        <lineBasicMaterial color="#10b981" transparent opacity={0.8} />
      </lineSegments>
    </>
  );
}
