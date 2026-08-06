"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import type { Piece } from "@/lib/park/coaster";

const m = new Matrix4();
const p = new Vector3();
const q = new Quaternion();
const s = new Vector3();

/**
 * A pile of boxes drawn in one call. Every strut, tie, barrier and lattice leg
 * in the park is one of these — the geometry is generated as position /
 * rotation / scale triples and handed straight to an InstancedMesh.
 */
export function Pieces({
  pieces,
  children,
  castShadow = false,
  receiveShadow = false,
}: {
  pieces: Piece[];
  children: ReactNode;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      p.fromArray(piece.p);
      q.fromArray(piece.q);
      s.fromArray(piece.s);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pieces]);

  if (!pieces.length) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, pieces.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry />
      {children}
    </instancedMesh>
  );
}
