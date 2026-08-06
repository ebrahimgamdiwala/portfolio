"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { Box } from "@/lib/world/scatter";

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();
const _e = new Vector3();

/** Broken crust drifting in the void beneath the island. */
export function Fragments({ fragments }: { fragments: Box[] }) {
  const ref = useRef<InstancedMesh>(null!);
  const n = fragments.length;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < n; i++) {
      const f = fragments[i];
      mesh.setColorAt(i, _c.setHex(f.c));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [fragments, n]);

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const f = fragments[i];
      const ph = i * 0.7;
      _p.set(f.x, f.y + Math.sin(t * 0.25 + ph) * 1.6, f.z);
      _e.set(t * 0.05 + ph, t * 0.07 + ph * 1.3, t * 0.04 + ph * 0.6);
      _q.setFromAxisAngle(new Vector3(0.3, 1, 0.2).normalize(), _e.y);
      _s.set(f.sx, f.sy, f.sz);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  );
}
