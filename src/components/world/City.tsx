"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { PALETTE } from "@/lib/world/palette";
import type { Building, Box } from "@/lib/world/scatter";
import { VoxelBatch } from "./primitives/VoxelBatch";

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();

/**
 * The one built environment on the island. Towers are stacked voxel slabs with
 * banded glazing; the glazing is a separate emissive batch so the skyline can
 * light up as the ride reaches dusk.
 */
export function City({
  buildings,
  nightFactor,
}: {
  buildings: Building[];
  nightFactor: number;
}) {
  const { structure, windows } = useMemo(() => {
    const structure: Box[] = [];
    const windows: Box[] = [];

    buildings.forEach((b, bi) => {
      const seg = Math.max(1, Math.round(b.h / 16));
      let y = b.y;
      let w = b.w;
      let d = b.d;
      for (let s = 0; s < seg; s++) {
        const sh = b.h / seg;
        structure.push({
          x: b.x,
          y: y + sh / 2,
          z: b.z,
          sx: w,
          sy: sh,
          sz: d,
          c: s % 2 === 0 ? b.color : PALETTE.concreteDark,
        });
        y += sh;
        w *= 0.86;
        d *= 0.86;
      }

      // roof cap
      structure.push({
        x: b.x,
        y: b.y + b.h + 0.25,
        z: b.z,
        sx: w * 1.15,
        sy: 0.5,
        sz: d * 1.15,
        c: PALETTE.concreteDark,
      });

      // glazing bands
      const bands = Math.floor(b.h / 3.2);
      for (let i = 1; i <= bands; i++) {
        const t = i / (bands + 1);
        const taper = 1 - t * 0.14 * (seg - 1);
        // a deterministic scatter of dark floors keeps the skyline from looking uniform
        const on = ((bi * 31 + i * 17) % 11) > 2;
        windows.push({
          x: b.x,
          y: b.y + i * 3.2,
          z: b.z,
          sx: b.w * taper + 0.14,
          sy: 1.1,
          sz: b.d * taper + 0.14,
          c: on ? PALETTE.windowLit : PALETTE.glass,
        });
      }
    });

    return { structure, windows };
  }, [buildings]);

  const winRef = useRef<InstancedMesh>(null!);

  useLayoutEffect(() => {
    const mesh = winRef.current;
    if (!mesh) return;
    windows.forEach((b, i) => {
      _p.set(b.x, b.y, b.z);
      _q.identity();
      _s.set(b.sx, b.sy, b.sz);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setHex(b.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [windows]);

  useLayoutEffect(() => {
    const mat = winRef.current?.material as MeshStandardMaterial | undefined;
    if (mat) mat.emissiveIntensity = 0.15 + nightFactor * 2.4;
  }, [nightFactor]);

  return (
    <group>
      <VoxelBatch boxes={structure} />
      <instancedMesh
        ref={winRef}
        args={[undefined, undefined, Math.max(1, windows.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          emissive={PALETTE.windowLit}
          emissiveIntensity={0.4}
          roughness={0.35}
          metalness={0.25}
          toneMapped={false}
          flatShading
        />
      </instancedMesh>
    </group>
  );
}
