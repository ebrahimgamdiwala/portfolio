"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from "three";
import type { PropSet } from "@/lib/park/props";
import { paintedSteel } from "@/lib/park/textures";
import { HUMAN_HEIGHT, humanBody, humanSkin } from "@/lib/park/human";
import { Rng } from "@/lib/park/rand";
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

      // A multiplier on the material's own colour, not a colour in its own
      // right — instanceColor multiplies, so putting the darkness here as well
      // just makes every tree black.
      const shade = 0.7 + t.tint * 0.55;
      colors[i * 3] = shade * 0.9;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade * 0.78;
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
          {/* horizon dressing: a bright tree line at night pulls the eye
              straight off whatever the ride is actually passing */}
          <meshStandardMaterial color="#0e1a12" roughness={0.96} />
        </instancedMesh>
      ))}
    </group>
  );
}

/* ── the crowd ────────────────────────────────────────────────────────────── */

const CLOTHES = [
  "#c9443f",
  "#2f5fa8",
  "#e0b23c",
  "#3c8f6a",
  "#8858b8",
  "#d97a2b",
  "#c8c3ba",
  "#2b3140",
  "#a63b6d",
  "#4a8fb5",
];
const SKIN = ["#e8bd97", "#d4a179", "#b3835c", "#8d6142", "#6b452c", "#f0cdaa"];

/**
 * The crowd: actual bodies, instanced.
 *
 * Two draws for four hundred people — one for clothes, one for skin — so each
 * person can have their own shirt and complexion without a third of the frame
 * budget going on them. A quarter of them wander their zone; the rest stand
 * about, shifting their weight, which is what people at a funfair mostly do.
 */
function Crowd({ set }: { set: PropSet }) {
  const q = useQuality();
  const bodies = useRef<InstancedMesh>(null);
  const skins = useRef<InstancedMesh>(null);

  const people = useMemo(() => {
    const total = Math.floor((set.crowd.length / 4) * q.crowd);
    const rng = new Rng(31337);
    return Array.from({ length: total }, (_, i) => ({
      x: set.crowd[i * 4],
      z: set.crowd[i * 4 + 1],
      // Scaled up so visitors read prominently relative to the park's large structures.
      h: (set.crowd[i * 4 + 2] / HUMAN_HEIGHT) * 2.2,
      phase: set.crowd[i * 4 + 3],
      // a quarter of them are going somewhere
      walks: rng.chance(0.26),
      radius: rng.range(4, 16),
      speed: rng.range(0.09, 0.26) * rng.sign(),
      facing: rng.range(0, Math.PI * 2),
      cloth: CLOTHES[rng.int(CLOTHES.length)],
      skin: SKIN[rng.int(SKIN.length)],
    }));
  }, [set, q.crowd]);

  useLayoutEffect(() => {
    const cloth = new Float32Array(people.length * 3);
    const flesh = new Float32Array(people.length * 3);
    const c = new Color();
    people.forEach((p, i) => {
      c.set(p.cloth).toArray(cloth, i * 3);
      c.set(p.skin).toArray(flesh, i * 3);
    });
    if (bodies.current) {
      bodies.current.instanceColor = new InstancedBufferAttribute(cloth, 3);
      bodies.current.instanceColor.needsUpdate = true;
    }
    if (skins.current) {
      skins.current.instanceColor = new InstancedBufferAttribute(flesh, 3);
      skins.current.instanceColor.needsUpdate = true;
    }
  }, [people]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      let x = p.x;
      let z = p.z;
      let face = p.facing;

      if (p.walks) {
        // a slow loop around where they started, facing the way they are going
        const a = p.phase + t * p.speed;
        x += Math.cos(a) * p.radius;
        z += Math.sin(a) * p.radius;
        face = -a + (p.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      }

      // walkers bob on their stride; standers shift their weight
      const bob = p.walks
        ? Math.abs(Math.sin(t * 3.1 + p.phase)) * 0.035
        : Math.sin(t * 0.9 + p.phase) * 0.012;
      const lean = p.walks ? 0 : Math.sin(t * 0.55 + p.phase) * 0.02;

      q4.setFromAxisAngle(UP, face + lean);
      v3.set(x, bob, z);
      scale.setScalar(p.h);
      m4.compose(v3, q4, scale);
      bodies.current?.setMatrixAt(i, m4);
      skins.current?.setMatrixAt(i, m4);
    }
    if (bodies.current) bodies.current.instanceMatrix.needsUpdate = true;
    if (skins.current) skins.current.instanceMatrix.needsUpdate = true;
  });

  if (!people.length) return null;

  return (
    <group>
      <instancedMesh
        ref={bodies}
        args={[humanBody(), undefined, people.length]}
        frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.82} />
      </instancedMesh>
      <instancedMesh
        ref={skins}
        args={[humanSkin(), undefined, people.length]}
        frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.66} />
      </instancedMesh>
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
