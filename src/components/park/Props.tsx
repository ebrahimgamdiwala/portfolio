"use client";

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
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
  type MeshStandardMaterial,
} from "three";
import type { PropSet } from "@/lib/park/props";
import { paintedSteel } from "@/lib/park/textures";
import { applyWalkCycle, HUMAN_HEIGHT, humanBody, humanSkin } from "@/lib/park/human";
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
  const mat = useRef<MeshBasicMaterial>(null);
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
    if (!mat.current) return;
    mat.current.color.setScalar(0.94 + Math.sin(state.clock.elapsedTime * 1.7) * 0.06);
  });

  if (!count) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[0.26, 6, 5]} />
      <meshBasicMaterial ref={mat} toneMapped={false} />
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
      const bulb = l.h + 0.3;
      v3.set(l.x, bulb, l.z);
      heads.current?.setMatrixAt(i, m4.compose(v3, q4, one));

      // A cone's apex sits at +height/2, so centring one on the bulb puts half
      // the beam ABOVE the lamp. Scale a unit cone to the lamp's own height and
      // sit it at half that, and the apex lands exactly on the bulb with the
      // base spread on the ground where it belongs.
      scale.set(3.2, bulb, 3.2);
      v3.set(l.x, bulb / 2, l.z);
      halos.current?.setMatrixAt(i, m4.compose(v3, q4, scale));
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
        {/* unit cone — each instance stretches it to its own lamp's height */}
        <coneGeometry args={[1, 1, 10, 1, true]} />
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
  /** One clock drives both halves, so hands stay with their arms. */
  const clock = useRef({ value: 0 });

  const patchWalk = useCallback((mat: MeshStandardMaterial | null) => {
    if (!mat || mat.userData.walkPatched) return;
    mat.userData.walkPatched = true;
    applyWalkCycle(mat, clock.current);
  }, []);

  const people = useMemo(() => {
    const N = set.crowd.length / 4;
    const total = Math.floor(N * q.crowd);
    const rng = new Rng(31337);
    const step = N / Math.max(1, total);
    return Array.from({ length: total }, (_, i) => {
      const idx = Math.floor(i * step);
      const hx = set.crowd[idx * 4];
      const hz = set.crowd[idx * 4 + 1];
      return {
        /** Where they hang about. */
        homeX: hx,
        homeZ: hz,
        // Scaled up so visitors read prominently relative to the park's large structures.
        h: (set.crowd[idx * 4 + 2] / HUMAN_HEIGHT) * 2.2,
        phase: set.crowd[idx * 4 + 3],
        roam: rng.range(6, 22),
        speed: rng.range(1.9, 3.6),
        /** Live state. */
        x: hx,
        z: hz,
        tx: hx,
        tz: hz,
        heading: rng.range(0, Math.PI * 2),
        gait: 0,
        /** Stand still until this clock time. */
        waitUntil: rng.range(0, 6),
        cloth: CLOTHES[rng.int(CLOTHES.length)],
        skin: SKIN[rng.int(SKIN.length)],
      };
    });
  }, [set, q.crowd]);

  /** Per-instance walk phase and gait, shared by both halves of the body. */
  const gaitAttrs = useMemo(() => {
    const phase = new Float32Array(people.length);
    const gait = new Float32Array(people.length);
    people.forEach((p, i) => (phase[i] = p.phase * 3.7));
    return {
      phase: new InstancedBufferAttribute(phase, 1),
      gait: new InstancedBufferAttribute(gait, 1),
    };
  }, [people]);

  useLayoutEffect(() => {
    const cloth = new Float32Array(people.length * 3);
    const flesh = new Float32Array(people.length * 3);
    const c = new Color();
    people.forEach((p, i) => {
      c.set(p.cloth).toArray(cloth, i * 3);
      c.set(p.skin).toArray(flesh, i * 3);
    });
    for (const [mesh, colors] of [
      [bodies.current, cloth],
      [skins.current, flesh],
    ] as const) {
      if (!mesh) continue;
      mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
      mesh.instanceColor.needsUpdate = true;
      // the same two attributes drive both meshes, so a hand swings with its arm
      mesh.geometry.setAttribute("aPhase", gaitAttrs.phase);
      mesh.geometry.setAttribute("aGait", gaitAttrs.gait);
    }
  }, [people, gaitAttrs]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const step = Math.min(dt, 0.05);
    if (clock.current) clock.current.value = t;

    const gait = gaitAttrs.gait.array as Float32Array;

    for (let i = 0; i < people.length; i++) {
      const p = people[i];

      // Wander: walk to a spot, stand about for a while, pick another. Real
      // people do not orbit a fixed point at a constant rate, which is exactly
      // what a sine-driven crowd looks like it is doing.
      const waiting = t < p.waitUntil;
      let dx = p.tx - p.x;
      let dz = p.tz - p.z;
      let dist = Math.hypot(dx, dz);

      if (!waiting && dist < 0.6) {
        // arrived — loiter, then choose somewhere new within the home patch
        p.waitUntil = t + 2 + ((i * 97) % 11);
        const a = (i * 2.399 + t) % (Math.PI * 2);
        const r = p.roam * (0.35 + (((i * 37) % 100) / 100) * 0.65);
        p.tx = p.homeX + Math.cos(a) * r;
        p.tz = p.homeZ + Math.sin(a) * r;
        dx = p.tx - p.x;
        dz = p.tz - p.z;
        dist = Math.hypot(dx, dz) || 1;
      }

      const moving = !waiting && dist > 0.6;
      if (moving) {
        const k = (p.speed * step) / dist;
        p.x += dx * k;
        p.z += dz * k;
        // ease the turn rather than snapping to the new bearing
        const want = Math.atan2(dx, dz);
        let delta = want - p.heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        p.heading += delta * Math.min(1, step * 4);
      }

      // gait feeds the vertex shader's stride, so it has to ramp, not switch
      p.gait += ((moving ? 1 : 0) - p.gait) * Math.min(1, step * 5);
      gait[i] = p.gait;

      // a small vertical bob locked to the stride the shader is running
      const bob = Math.abs(Math.sin(t * 2.7 + p.phase * 3.7)) * 0.045 * p.gait;
      const sway = Math.sin(t * 0.7 + p.phase) * 0.022 * (1 - p.gait);

      q4.setFromAxisAngle(UP, p.heading + sway);
      v3.set(p.x, bob * p.h, p.z);
      scale.setScalar(p.h);
      m4.compose(v3, q4, scale);
      bodies.current?.setMatrixAt(i, m4);
      skins.current?.setMatrixAt(i, m4);
    }

    gaitAttrs.gait.needsUpdate = true;
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
        <meshStandardMaterial ref={patchWalk} roughness={0.82} />
      </instancedMesh>
      <instancedMesh
        ref={skins}
        args={[humanSkin(), undefined, people.length]}
        frustumCulled={false}
      >
        <meshStandardMaterial ref={patchWalk} roughness={0.66} />
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
