"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type MeshBasicMaterial,
} from "three";
import { fbm, makeNoise2D, Rng } from "@/lib/park/rand";
import { verticalFade } from "@/lib/park/textures";
import { useParkCtx } from "./ParkContext";

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
function ridge(radius: number, height: number, seed: number, segments = 520) {
  const n = makeNoise2D(seed);
  const verts = new Float32Array(segments * 2 * 3);
  const norms = new Float32Array(segments * 2 * 3);
  const cols = new Float32Array(segments * 2 * 3);

  // sampled first so neighbouring peaks can be smoothed against each other
  const hs = new Float32Array(segments);
  const rs = new Float32Array(segments);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // broad massifs with a gentler ripple on top; the old high-frequency
    // octave was what made the range read as a row of cardboard triangles
    hs[i] =
      height *
      (0.4 + fbm(n, cx * 1.9 + 5, cz * 1.9, 4) * 0.85) *
      (0.78 + fbm(n, cx * 4.4, cz * 4.4, 2) * 0.42);
    // wobble the radius too, so it is not a perfect circle
    rs[i] = radius * (0.9 + fbm(n, cx * 1.4, cz * 1.4, 2) * 0.24);
  }
  // three smoothing passes, wrapped — a distant range has no hard corners
  for (let pass = 0; pass < 3; pass++) {
    const src = hs.slice();
    for (let i = 0; i < segments; i++) {
      const a = src[(i - 1 + segments) % segments];
      const b = src[(i + 1) % segments];
      hs[i] = (a + src[i] * 2 + b) / 4;
    }
  }

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const h = hs[i];
    const r = rs[i];

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

    // Vertex colours run dark at the base and pale at the summit, so the tops
    // dissolve into the sky instead of stamping a hard silhouette on it. This
    // is the whole trick — real distant ranges lose contrast with altitude.
    cols[v] = 1;
    cols[v + 1] = 1;
    cols[v + 2] = 1;
    // summits lose contrast into the sky; bases stay solid
    const fadeUp = Math.min(1, h / (height * 0.95));
    const pale = 0.72 + fadeUp * 0.85;
    cols[v + 3] = pale;
    cols[v + 4] = pale;
    cols[v + 5] = pale;
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
  g.setAttribute("color", new BufferAttribute(cols, 3));
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

/**
 * Haze banks sitting in front of each range. Real distance is not a silhouette
 * against a sky, it is layer after layer of air — this is what stops the ridges
 * looking like scenery flats.
 */
function Haze({ radius, height, opacity }: { radius: number; height: number; opacity: number }) {
  const { sky } = useParkCtx();
  const mat = useRef<MeshBasicMaterial>(null);

  useFrame(() => {
    if (!mat.current) return;
    // the band takes the sky's own horizon colour, so it can never disagree
    // with what the dome is painting behind it
    mat.current.color.copy(sky.current.haze).lerp(sky.current.fog, 0.45);
    mat.current.opacity = opacity;
  });

  return (
    <mesh position={[0, height * 0.3, 0]} frustumCulled={false} renderOrder={-6}>
      <cylinderGeometry args={[radius, radius, height, 96, 1, true]} />
      {/* ramped, not a flat band — a hard top edge on a haze layer is worse
          than no haze layer at all */}
      <meshBasicMaterial
        ref={mat}
        alphaMap={verticalFade()}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={BackSide}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * Three ranges, brought in close and made tall enough to actually sit on the
 * skyline. A distant range that only occupies four pixels of horizon might as
 * well not be modelled — the park should feel like it is somewhere.
 */
export function Distance() {
  const near = useMemo(() => ridge(850, 300, 4021), []);
  const mid = useMemo(() => ridge(1300, 400, 5563), []);
  const far = useMemo(() => ridge(1800, 520, 9137), []);

  return (
    <group>
      {/* Ridge colours are lifted well off black on purpose. These sit behind
          three stacked haze layers, and a near-black range loses to even a
          little atmosphere — which is exactly how the mountains vanished. */}
      <mesh geometry={far} frustumCulled={false} renderOrder={-9}>
        <meshBasicMaterial color="#4a4b76" vertexColors side={DoubleSide} toneMapped={false} />
      </mesh>
      <Haze radius={1700} height={520} opacity={0.18} />

      <mesh geometry={mid} frustumCulled={false} renderOrder={-8}>
        <meshBasicMaterial color="#3a3a63" vertexColors side={DoubleSide} toneMapped={false} />
      </mesh>
      <City />
      <Haze radius={1220} height={400} opacity={0.14} />

      <mesh geometry={near} frustumCulled={false} renderOrder={-7}>
        <meshBasicMaterial color="#2b2b4d" vertexColors side={DoubleSide} toneMapped={false} />
      </mesh>
      {/* the nearest band stays lightest — it is the one between you and
          everything else, so it doubles every layer behind it */}
      <Haze radius={800} height={300} opacity={0.1} />
    </group>
  );
}
