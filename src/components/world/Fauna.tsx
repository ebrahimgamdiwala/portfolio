"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedMesh, Matrix4, Object3D } from "three";
import type { Creature } from "@/lib/world/scatter";

/** A body part in the creature's local space. */
interface Part {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  c: number;
  /** 1 = front legs, 2 = back legs, 3 = wings — parts that animate. */
  anim?: number;
}

const HIDE_BROWN = 0x9a6b43;
const HIDE_LIGHT = 0xc99a6a;
const FOX_ORANGE = 0xd2733a;
const BIRD_DARK = 0x2f3540;

const TEMPLATES: Record<Creature["kind"], Part[]> = {
  deer: [
    { x: 0, y: 1.5, z: 0, sx: 0.8, sy: 0.85, sz: 1.8, c: HIDE_BROWN },
    { x: 0, y: 2.15, z: 1.1, sx: 0.55, sy: 0.6, sz: 0.7, c: HIDE_LIGHT },
    { x: 0, y: 2.6, z: 1.25, sx: 0.28, sy: 0.5, sz: 0.28, c: HIDE_LIGHT },
    { x: -0.3, y: 3.0, z: 1.2, sx: 0.12, sy: 0.7, sz: 0.12, c: 0x6b4a2f },
    { x: 0.3, y: 3.0, z: 1.2, sx: 0.12, sy: 0.7, sz: 0.12, c: 0x6b4a2f },
    { x: -0.3, y: 0.55, z: 0.6, sx: 0.2, sy: 1.1, sz: 0.2, c: HIDE_BROWN, anim: 1 },
    { x: 0.3, y: 0.55, z: 0.6, sx: 0.2, sy: 1.1, sz: 0.2, c: HIDE_BROWN, anim: 2 },
    { x: -0.3, y: 0.55, z: -0.6, sx: 0.2, sy: 1.1, sz: 0.2, c: HIDE_BROWN, anim: 2 },
    { x: 0.3, y: 0.55, z: -0.6, sx: 0.2, sy: 1.1, sz: 0.2, c: HIDE_BROWN, anim: 1 },
    { x: 0, y: 1.8, z: -1.0, sx: 0.25, sy: 0.35, sz: 0.3, c: 0xf0e6d8 },
  ],
  fox: [
    { x: 0, y: 0.9, z: 0, sx: 0.6, sy: 0.6, sz: 1.4, c: FOX_ORANGE },
    { x: 0, y: 1.2, z: 0.85, sx: 0.5, sy: 0.5, sz: 0.55, c: FOX_ORANGE },
    { x: -0.18, y: 1.5, z: 0.85, sx: 0.16, sy: 0.3, sz: 0.16, c: 0x8f4a20 },
    { x: 0.18, y: 1.5, z: 0.85, sx: 0.16, sy: 0.3, sz: 0.16, c: 0x8f4a20 },
    { x: 0, y: 1.05, z: -1.05, sx: 0.4, sy: 0.4, sz: 0.9, c: 0xf2e2d0, anim: 3 },
    { x: -0.22, y: 0.35, z: 0.4, sx: 0.16, sy: 0.7, sz: 0.16, c: 0x4a2c16, anim: 1 },
    { x: 0.22, y: 0.35, z: 0.4, sx: 0.16, sy: 0.7, sz: 0.16, c: 0x4a2c16, anim: 2 },
    { x: -0.22, y: 0.35, z: -0.4, sx: 0.16, sy: 0.7, sz: 0.16, c: 0x4a2c16, anim: 2 },
    { x: 0.22, y: 0.35, z: -0.4, sx: 0.16, sy: 0.7, sz: 0.16, c: 0x4a2c16, anim: 1 },
  ],
  bird: [
    { x: 0, y: 0, z: 0, sx: 0.4, sy: 0.4, sz: 0.9, c: BIRD_DARK },
    { x: 0, y: 0.12, z: 0.55, sx: 0.3, sy: 0.3, sz: 0.35, c: BIRD_DARK },
    { x: -0.9, y: 0.1, z: 0, sx: 1.5, sy: 0.12, sz: 0.6, c: 0x4a5260, anim: 3 },
    { x: 0.9, y: 0.1, z: 0, sx: 1.5, sy: 0.12, sz: 0.6, c: 0x4a5260, anim: 3 },
  ],
  whale: [
    { x: 0, y: 0, z: 0, sx: 2.4, sy: 1.8, sz: 6.5, c: 0x3b4a63 },
    { x: 0, y: -0.5, z: 0.4, sx: 2.0, sy: 0.9, sz: 5.0, c: 0x8fa3bd },
    { x: 0, y: 0.4, z: -3.8, sx: 3.4, sy: 0.35, sz: 1.4, c: 0x3b4a63, anim: 3 },
    { x: 0, y: 1.0, z: 0.4, sx: 0.5, sy: 0.6, sz: 0.5, c: 0x2b3648 },
  ],
};

const _o = new Object3D();
const _m = new Matrix4();
const _c = new Color();
const _pm = new Matrix4();

/** Blocky wildlife. Every creature walks a slow loop around where it spawned. */
export function Fauna({ creatures }: { creatures: Creature[] }) {
  const flat = useMemo(() => {
    const out: { c: Creature; part: Part }[] = [];
    for (const c of creatures) for (const part of TEMPLATES[c.kind]) out.push({ c, part });
    return out;
  }, [creatures]);

  const ref = useRef<InstancedMesh>(null!);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    flat.forEach((f, i) => mesh.setColorAt(i, _c.setHex(f.part.c)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [flat]);

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < flat.length; i++) {
      const { c, part } = flat[i];
      const speed = c.kind === "bird" ? 0.42 : c.kind === "whale" ? 0.1 : 0.16;
      const a = c.phase + t * speed;

      // walk a slow loop around the spawn point
      const wx = c.x + Math.cos(a) * c.roam;
      const wz = c.z + Math.sin(a) * c.roam;
      let wy = c.y;
      if (c.kind === "bird") wy = c.y + 9 + Math.sin(a * 2) * 2.5;
      if (c.kind === "whale") wy = c.y - 0.6 + Math.sin(t * 0.5 + c.phase) * 0.5;

      const heading = a + Math.PI / 2;
      const gait = Math.sin(t * 5 + c.phase);

      _o.position.set(wx, wy, wz);
      _o.rotation.set(0, heading + c.rot * 0.0, 0);
      _o.scale.setScalar(c.scale);
      _o.updateMatrix();

      let px = part.x;
      let py = part.y;
      let pz = part.z;
      let rot = 0;

      if (part.anim === 1) pz += gait * 0.28;
      else if (part.anim === 2) pz -= gait * 0.28;
      else if (part.anim === 3) {
        if (c.kind === "bird") {
          py += Math.sin(t * 9 + c.phase) * 0.34;
          rot = Math.sin(t * 9 + c.phase) * 0.5;
        } else {
          py += Math.sin(t * 2 + c.phase) * 0.25;
        }
      }
      if (c.kind === "deer" || c.kind === "fox") py += Math.abs(gait) * 0.05;

      _pm.makeRotationZ(rot);
      _pm.setPosition(px, py, pz);
      _m.makeScale(part.sx, part.sy, part.sz);
      _pm.multiply(_m);
      _pm.premultiply(_o.matrix);
      mesh.setMatrixAt(i, _pm);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (flat.length === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, flat.length]}
      castShadow
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  );
}
