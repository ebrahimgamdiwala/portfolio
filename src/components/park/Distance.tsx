"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from "three";
import { fbm, makeNoise2D, Rng } from "@/lib/park/rand";

/**
 * What is beyond the fence.
 *
 * Without this the ground plane simply stops, and a visible edge is the single
 * fastest way to turn a world back into a model. Two ridge lines and a city on
 * the skyline give the eye somewhere to land at every distance, and the fog
 * does the rest.
 *
 * All of it is silhouette — three draw calls, no shadows, no lighting to speak
 * of. It only has to be *there*.
 */

/**
 * A closed band of terrain around the horizon: a ring of quads whose top edge
 * rides a noise field, skirted down below the ground so no gap can open under
 * it however low the camera gets.
 */
function ridge(radius: number, height: number, seed: number, segments = 220) {
  const n = makeNoise2D(seed);
  const verts = new Float32Array(segments * 2 * 3);
  const norms = new Float32Array(segments * 2 * 3);

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // two octaves: broad massifs with peaks riding on top
    const h =
      height *
      (0.35 + fbm(n, cx * 2.6 + 5, cz * 2.6, 4) * 0.9) *
      (0.6 + fbm(n, cx * 9, cz * 9, 2) * 0.8);
    // wobble the radius too, so the range does not read as a perfect circle
    const r = radius * (0.9 + fbm(n, cx * 1.7, cz * 1.7, 2) * 0.24);

    const v = i * 6;
    verts[v] = cx * r;
    verts[v + 1] = -60;
    verts[v + 2] = cz * r;
    verts[v + 3] = cx * r;
    verts[v + 4] = h;
    verts[v + 5] = cz * r;
    norms[v] = -cx;
    norms[v + 2] = -cz;
    norms[v + 3] = -cx;
    norms[v + 5] = -cz;
  }

  const idx = new Uint32Array(segments * 6);
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = ((i + 1) % segments) * 2;
    idx.set([a, a + 1, b, b, a + 1, b + 1], i * 6);
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(verts, 3));
  g.setAttribute("normal", new BufferAttribute(norms, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

const m4 = new Matrix4();
const v3 = new Vector3();
const q4 = new Quaternion();
const scale = new Vector3();

/** Mumbai on the skyline: towers with lit floors, seen from a long way off. */
function City() {
  const towers = useRef<InstancedMesh>(null);
  const windows = useRef<InstancedMesh>(null);

  const blocks = useMemo(() => {
    const rng = new Rng(88191);
    const out: { x: number; z: number; w: number; h: number; d: number }[] = [];
    // a wedge of skyline off past the entrance, densest at its centre
    for (let i = 0; i < 150; i++) {
      const a = -0.42 + rng.range(-0.72, 0.72);
      const d = rng.range(1080, 1420);
      const centreness = 1 - Math.abs(a + 0.42) / 0.75;
      out.push({
        x: Math.sin(a) * d,
        z: Math.cos(a) * d,
        w: rng.range(16, 42),
        d: rng.range(16, 42),
        h: rng.range(30, 110) * (0.5 + centreness * 0.9),
      });
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const colors = new Float32Array(blocks.length * 3);
    blocks.forEach((b, i) => {
      scale.set(b.w, b.h, b.d);
      v3.set(b.x, b.h / 2, b.z);
      towers.current?.setMatrixAt(i, m4.compose(v3, q4, scale));

      // the lit slab that stands in for a thousand windows
      scale.set(b.w * 0.86, b.h * 0.82, b.d * 0.86);
      v3.set(b.x, b.h * 0.46, b.z);
      windows.current?.setMatrixAt(i, m4.compose(v3, q4, scale));

      const warm = 0.5 + ((i * 37) % 100) / 220;
      colors[i * 3] = 0.42 * warm;
      colors[i * 3 + 1] = 0.3 * warm;
      colors[i * 3 + 2] = 0.19 * warm;
    });
    if (towers.current) towers.current.instanceMatrix.needsUpdate = true;
    if (windows.current) {
      windows.current.instanceMatrix.needsUpdate = true;
      windows.current.instanceColor = new InstancedBufferAttribute(colors, 3);
      windows.current.instanceColor.needsUpdate = true;
      windows.current.computeBoundingSphere();
    }
  }, [blocks]);

  return (
    <group>
      <instancedMesh ref={towers} args={[undefined, undefined, blocks.length]} frustumCulled={false}>
        <boxGeometry />
        <meshStandardMaterial color="#0a0c16" roughness={1} />
      </instancedMesh>
      {/* Slightly inset and unlit, so each tower gets a warm core that bloom
          smears into a haze of windows without drawing a single one. */}
      <instancedMesh
        ref={windows}
        args={[undefined, undefined, blocks.length]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export function Distance() {
  const near = useMemo(() => ridge(1500, 150, 4021), []);
  const far = useMemo(() => ridge(2150, 260, 9137), []);

  return (
    <group>
      <mesh geometry={far} frustumCulled={false} renderOrder={-8}>
        <meshStandardMaterial color="#0d1024" roughness={1} side={DoubleSide} />
      </mesh>
      <City />
      <mesh geometry={near} frustumCulled={false} renderOrder={-7}>
        <meshStandardMaterial color="#090b18" roughness={1} side={DoubleSide} />
      </mesh>
    </group>
  );
}
