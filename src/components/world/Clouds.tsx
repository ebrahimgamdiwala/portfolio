"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { ScatterData } from "@/lib/world/scatter";

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();

const TINT = [0xe8eef6, 0xfbfdff, 0x6b6670];
const WRAP = 260;

/** Slow cloud decks. Rain and snow fall from underneath them. */
export function Clouds({ clouds }: { clouds: ScatterData["clouds"] }) {
  const ref = useRef<InstancedMesh>(null!);
  const n = clouds.length;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    clouds.forEach((c, i) => mesh.setColorAt(i, _c.setHex(TINT[c.kind] ?? TINT[0])));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [clouds]);

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const c = clouds[i];
      const drift = c.kind === 2 ? 3.5 : 1.4;
      let x = c.x + t * drift;
      x = ((x + WRAP * 1.5) % WRAP) - WRAP * 0.5;
      _p.set(x, c.y + Math.sin(t * 0.15 + i) * 1.2, c.z);
      _q.identity();
      _s.set(c.sx, 1.5, c.sz);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (n === 0) return null;

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        transparent
        opacity={0.34}
        depthWrite={false}
        roughness={1}
        flatShading
      />
    </instancedMesh>
  );
}
