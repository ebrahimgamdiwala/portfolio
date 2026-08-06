"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  DoubleSide,
  InstancedBufferAttribute,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from "three";
import type { PropSet } from "@/lib/park/props";
import { crowdSheet, paintedSteel } from "@/lib/park/textures";
import { Pieces } from "./primitives/Pieces";
import { useQuality } from "./Quality";

/**
 * The dressing: bulb runs, lamp posts, the tree line, queue barriers and the
 * crowd. All of it instanced, all of it seeded from `lib/park/props.ts`.
 *
 * The catenaries of bulbs are the single most valuable thing in this file. A
 * sagging line of warm points is read as "fairground" before any other cue
 * lands, and with bloom on they carry the whole night.
 */

const m4 = new Matrix4();
const v3 = new Vector3();
const q4 = new Quaternion();
const one = new Vector3(1, 1, 1);
const scale = new Vector3();
const UP = new Vector3(0, 1, 0);

/* ── bulb runs ────────────────────────────────────────────────────────────── */

function Bulbs({ set }: { set: PropSet }) {
  const mesh = useRef<InstancedMesh>(null);
  const count = set.bulbs.length / 3;

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < count; i++) {
      v3.fromArray(set.bulbs, i * 3);
      m.setMatrixAt(i, m4.compose(v3, q4, one));
    }
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor = new InstancedBufferAttribute(set.bulbColors, 3);
    m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [set, count]);

  useFrame((state) => {
    // a slow uneven breath across the whole park, like mains hum
    const m = mesh.current;
    if (!m) return;
    m.scale.setScalar(0.94 + Math.sin(state.clock.elapsedTime * 1.7) * 0.06);
  });

  if (!count) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[0.26, 6, 5]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/* ── lamp posts ───────────────────────────────────────────────────────────── */

function Lamps({ set }: { set: PropSet }) {
  const heads = useRef<InstancedMesh>(null);
  const halos = useRef<InstancedMesh>(null);
  const steel = paintedSteel(6);

  const posts = useMemo(
    () =>
      set.lamps.map((l) => ({
        p: [l.x, l.h / 2, l.z] as [number, number, number],
        q: [0, 0, 0, 1] as [number, number, number, number],
        s: [0.34, l.h, 0.34] as [number, number, number],
      })),
    [set],
  );

  useLayoutEffect(() => {
    set.lamps.forEach((l, i) => {
      v3.set(l.x, l.h + 0.3, l.z);
      heads.current?.setMatrixAt(i, m4.compose(v3, q4, one));
      halos.current?.setMatrixAt(i, m4.compose(v3, q4, one));
    });
    if (heads.current) heads.current.instanceMatrix.needsUpdate = true;
    if (halos.current) halos.current.instanceMatrix.needsUpdate = true;
  }, [set]);

  return (
    <group>
      <Pieces pieces={posts}>
        <meshStandardMaterial
          color="#33363f"
          roughness={0.7}
          metalness={0.6}
          normalMap={steel.normalMap}
          roughnessMap={steel.roughnessMap}
        />
      </Pieces>
      <instancedMesh ref={heads} args={[undefined, undefined, set.lamps.length]} frustumCulled={false}>
        <sphereGeometry args={[0.85, 10, 8]} />
        <meshBasicMaterial color="#ffe1ae" toneMapped={false} />
      </instancedMesh>
      {/* The cone of light under each head. Kept very faint on purpose — at any
          more than a whisper a park's worth of these stops reading as light in
          the air and starts reading as a field of solid glass cones. */}
      <instancedMesh ref={halos} args={[undefined, undefined, set.lamps.length]} frustumCulled={false}>
        <coneGeometry args={[2.4, 7, 10, 1, true]} />
        <meshBasicMaterial
          color="#ffcf94"
          transparent
          opacity={0.022}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

/* ── tree line ────────────────────────────────────────────────────────────── */

/**
 * Three stacked, shrinking cone layers per tree rather than one. A single cone
 * reads as a traffic bollard; three read as a conifer, for two extra draw calls
 * across the entire tree line.
 */
const TIERS = [
  { at: 0.44, r: 1.0, h: 0.42 },
  { at: 0.66, r: 0.74, h: 0.34 },
  { at: 0.85, r: 0.44, h: 0.26 },
];

function Trees({ set }: { set: PropSet }) {
  const trunks = useRef<InstancedMesh>(null);
  const tiers = useRef<(InstancedMesh | null)[]>([]);
  const n = set.trees.length;

  useLayoutEffect(() => {
    const colors = new Float32Array(n * 3);
    set.trees.forEach((t, i) => {
      q4.setFromAxisAngle(UP, t.rot);

      scale.set(t.r * 0.15, t.h * 0.5, t.r * 0.15);
      v3.set(t.x, t.h * 0.25, t.z);
      trunks.current?.setMatrixAt(i, m4.compose(v3, q4, scale));

      TIERS.forEach((tier, k) => {
        // stagger the tiers so no two trees share a silhouette
        const jitter = 1 + ((t.tint * 7 + k) % 1) * 0.18;
        scale.set(t.r * tier.r * jitter, t.h * tier.h, t.r * tier.r * jitter);
        v3.set(t.x, t.h * tier.at, t.z);
        tiers.current[k]?.setMatrixAt(i, m4.compose(v3, q4, scale));
      });

      // Dark. These are horizon dressing, and a bright tree line at night
      // pulls the eye straight off whatever the ride is passing.
      colors[i * 3] = 0.022 + t.tint * 0.02;
      colors[i * 3 + 1] = 0.042 + t.tint * 0.03;
      colors[i * 3 + 2] = 0.03 + t.tint * 0.014;
    });

    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
    tiers.current.forEach((mesh) => {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor = new InstancedBufferAttribute(colors.slice(), 3);
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [set, n]);

  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, n]} frustumCulled={false}>
        <cylinderGeometry args={[0.7, 1.2, 1, 5]} />
        <meshStandardMaterial color="#1c1613" roughness={0.95} />
      </instancedMesh>
      {TIERS.map((_, k) => (
        <instancedMesh
          key={k}
          ref={(el) => void (tiers.current[k] = el)}
          args={[undefined, undefined, n]}
          frustumCulled={false}
        >
          <coneGeometry args={[1, 1, 7]} />
          <meshStandardMaterial roughness={0.96} />
        </instancedMesh>
      ))}
    </group>
  );
}

/* ── the crowd ────────────────────────────────────────────────────────────── */

const COLUMNS = 8;
const TINTS = [
  "#c9b8a8",
  "#8a94ad",
  "#b08f8f",
  "#7f9c8e",
  "#a99ac0",
  "#c0a06e",
  "#94a6b8",
  "#b57f86",
];

/**
 * Impostors: one plane per person, turned to face the camera. The silhouette
 * sheet has eight builds in it, so the crowd is split into eight instanced
 * meshes — one per column — rather than one mesh of identical clones.
 */
function Crowd({ set }: { set: PropSet }) {
  const q = useQuality();
  const { camera } = useThree();
  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const sheet = useMemo(() => crowdSheet(), []);

  const groups = useMemo(() => {
    const total = Math.floor((set.crowd.length / 4) * q.crowd);
    const buckets: number[][] = Array.from({ length: COLUMNS }, () => []);
    for (let i = 0; i < total; i++) buckets[i % COLUMNS].push(i);
    return buckets;
  }, [set, q.crowd]);

  // one geometry per column of the sheet, UVs remapped
  const geometries = useMemo(
    () =>
      Array.from({ length: COLUMNS }, (_, c) => {
        const g = new PlaneGeometry(1, 1);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
          uv.setX(i, (c + uv.getX(i)) / COLUMNS);
        }
        uv.needsUpdate = true;
        return g;
      }),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    groups.forEach((idxs, c) => {
      const mesh = meshes.current[c];
      if (!mesh) return;
      for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k];
        const x = set.crowd[i * 4];
        const z = set.crowd[i * 4 + 1];
        const h = set.crowd[i * 4 + 2];
        const phase = set.crowd[i * 4 + 3];
        q4.setFromAxisAngle(UP, Math.atan2(camera.position.x - x, camera.position.z - z));
        // a slight sway so the crowd is not a field of statues
        const sway = Math.sin(t * 1.1 + phase) * 0.035;
        scale.set(h * 0.46, h, 1);
        v3.set(x, h * 0.5 + sway, z);
        mesh.setMatrixAt(k, m4.compose(v3, q4, scale));
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <group>
      {groups.map((idxs, c) =>
        idxs.length ? (
          <instancedMesh
            key={c}
            ref={(el) => void (meshes.current[c] = el)}
            args={[geometries[c], undefined, idxs.length]}
            frustumCulled={false}
            castShadow={false}
          >
            <meshStandardMaterial
              map={sheet}
              color={TINTS[c]}
              transparent
              alphaTest={0.5}
              roughness={0.9}
              side={DoubleSide}
            />
          </instancedMesh>
        ) : null,
      )}
    </group>
  );
}

/* ── the lot ──────────────────────────────────────────────────────────────── */

export function Props({ set }: { set: PropSet }) {
  const steel = paintedSteel(6);

  return (
    <group>
      <Pieces pieces={set.poles}>
        <meshStandardMaterial color="#2f3239" roughness={0.75} metalness={0.5} />
      </Pieces>
      <Bulbs set={set} />
      <Lamps set={set} />
      <Trees set={set} />
      <Crowd set={set} />
      <Pieces pieces={set.barriers}>
        <meshStandardMaterial
          color="#5c6270"
          roughness={0.6}
          metalness={0.7}
          normalMap={steel.normalMap}
        />
      </Pieces>
    </group>
  );
}
