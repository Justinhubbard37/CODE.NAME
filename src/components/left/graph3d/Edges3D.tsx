import { useMemo } from 'react';
import * as THREE from 'three';
import type { Edge } from '../../../types';
import type { Vec3 } from './layout';

export function Edges3D({ edges, map }: { edges: Edge[]; map: Map<string, Vec3> }) {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    for (const e of edges) {
      const a = map.get(e.source);
      const b = map.get(e.target);
      if (a && b) pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [edges, map]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#3a3a3a" transparent opacity={0.55} />
    </lineSegments>
  );
}
