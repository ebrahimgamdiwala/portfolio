"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { Box } from "@/lib/world/scatter";
import type { TrackPiece } from "@/lib/world/track";

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();

interface VoxelBatchProps {
  boxes: Box[];
  /** Multiplies every box scale — handy for LOD experiments. */
  castShadow?: boolean;
  receiveShadow?: boolean;
  flatShading?: boolean;
  roughness?: number;
  metalness?: number;
}

/**
 * Renders an arbitrary pile of axis-aligned voxel boxes as ONE instanced draw
 * call, with per-instance colour. This is how every tree, rock, cactus and
 * building detail in the world gets on screen.
 */
export function VoxelBatch({
  boxes,
  castShadow = true,
  receiveShadow = true,
  roughness = 1,
  metalness = 0,
}: VoxelBatchProps) {
  const ref = useRef<InstancedMesh>(null);
  const count = boxes.length;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || count === 0) return;
    for (let i = 0; i < count; i++) {
      const b = boxes[i];
      _p.set(b.x, b.y, b.z);
      _q.identity();
      _s.set(b.sx, b.sy, b.sz);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setHex(b.c));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes, count]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, count]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={roughness} metalness={metalness} flatShading />
    </instancedMesh>
  );
}

/** Same idea, but for oriented pieces (rails, ties) that carry a quaternion. */
export function PieceBatch({
  pieces,
  emissive = 0,
  emissiveIntensity = 0,
}: {
  pieces: TrackPiece[];
  emissive?: number;
  emissiveIntensity?: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const count = pieces.length;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || count === 0) return;
    for (let i = 0; i < count; i++) {
      const b = pieces[i];
      _p.set(b.p[0], b.p[1], b.p[2]);
      _q.set(b.q[0], b.q[1], b.q[2], b.q[3]);
      _s.set(b.s[0], b.s[1], b.s[2]);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setHex(b.c));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pieces, count]);

  const mat = useMemo(() => ({ emissive: new Color(emissive) }), [emissive]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        roughness={0.85}
        metalness={0.15}
        emissive={mat.emissive}
        emissiveIntensity={emissiveIntensity}
        flatShading
      />
    </instancedMesh>
  );
}
