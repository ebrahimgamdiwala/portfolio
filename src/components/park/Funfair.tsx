"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CatmullRomCurve3,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import { beam } from "@/lib/park/build";
import type { Piece } from "@/lib/park/coaster";
import {
  FLUME,
  SPLASH_RUN,
  flume,
  makePose,
  slidePose,
  type FlumeData,
} from "@/lib/park/flume";
import { FURNITURE, type Slot } from "@/lib/park/layout";
import { paintedSteel, stripes } from "@/lib/park/textures";
import { Rng } from "@/lib/park/rand";
import { horseCoat, horseTack } from "@/lib/park/horse";
import { neonText } from "@/lib/park/sign";
import { explore, seats, userDrive } from "@/lib/explore/store";
import { Pieces } from "./primitives/Pieces";

/**
 * The rest of the funfair — a carousel, swing rides, teacups, a big top, the
 * bumper-car shed and a scatter of food kiosks.
 *
 * None of it carries a word of résumé content, and that is the point. The
 * coaster rings the park, so the whole middle is visible from every seat on the
 * circuit; filling it with things that turn is what makes the place read as a
 * park you are inside rather than a model you are looking at.
 */

const CANDY = ["#ff4d6d", "#ffd23f", "#4dd6ff", "#8f6bff", "#4ade80", "#ff8b3d"];

/** Frame-loop scratch. Allocating a Vector3 per frame per ride is not free. */
const scratchA = new Vector3();
const basis = new Matrix4();

function Frame({ pieces, color }: { pieces: Piece[]; color: string }) {
  return (
    <Pieces pieces={pieces} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.55} />
    </Pieces>
  );
}

/* ── carousel ─────────────────────────────────────────────────────────────── */

const R = 13;
const COUNT = 14;
const hm = new Matrix4();
const hv = new Vector3();
const hq = new Quaternion();
const hOne = new Vector3(1, 1, 1);
const H_UP = new Vector3(0, 1, 0);

function Carousel({ slot, seed, index }: { slot: Slot; seed: number; index: number }) {
  const spin = useRef<Group>(null);
  const coats = useRef<InstancedMesh>(null);
  const tacks = useRef<InstancedMesh>(null);
  const poles = useRef<InstancedMesh>(null);
  const canopy = useMemo(() => stripes("#f6f2e8", CANDY[seed % CANDY.length], 18), [seed]);

  // colours and the static poles, set once
  useLayoutEffect(() => {
    const coat = new Float32Array(COUNT * 3);
    const tack = new Float32Array(COUNT * 3);
    const c = new Color();
    for (let i = 0; i < COUNT; i++) {
      c.set(CANDY[(i + seed) % CANDY.length]).toArray(coat, i * 3);
      c.set(i % 2 ? "#f4e7c8" : "#c9a227").toArray(tack, i * 3);

      const a = (i / COUNT) * Math.PI * 2;
      hv.set(Math.cos(a) * R, 6, Math.sin(a) * R);
      poles.current?.setMatrixAt(i, hm.compose(hv, hq.identity(), hOne));
    }
    if (poles.current) poles.current.instanceMatrix.needsUpdate = true;
    for (const [mesh, colors] of [
      [coats.current, coat],
      [tacks.current, tack],
    ] as const) {
      if (!mesh) continue;
      const attr = new InstancedBufferAttribute(colors, 3);
      attr.needsUpdate = true;
      mesh.instanceColor = attr;
    }
  }, [seed]);

  useFrame((state, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.42;
    const t = state.clock.elapsedTime;

    // each horse rises and falls on its own pole
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2;
      hv.set(Math.cos(a) * R, 3.1 + Math.sin(t * 2.1 + i * 0.9) * 0.9, Math.sin(a) * R);
      hq.setFromAxisAngle(H_UP, -a);
      hm.compose(hv, hq, hOne);
      coats.current?.setMatrixAt(i, hm);
      tacks.current?.setMatrixAt(i, hm);
    }
    if (coats.current) coats.current.instanceMatrix.needsUpdate = true;
    if (tacks.current) tacks.current.instanceMatrix.needsUpdate = true;

    // The first horse is the boarding seat. Its published position follows
    // the rotating platform, so the first-person camera rides with it.
    const a = spin.current?.rotation.y ?? 0;
    const hY = 3.1 + Math.sin(t * 2.1) * 0.9;
    // Three.js Y-rotation: x' = x·cos(a) + z·sin(a), z' = -x·sin(a) + z·cos(a)
    // Horse 0 sits at local (R, 0, 0), so after spin: (R·cos(a), 0, -R·sin(a))
    const localX = Math.cos(a) * R;
    const localZ = -Math.sin(a) * R;
    const cosR = Math.cos(slot.rot);
    const sinR = Math.sin(slot.rot);
    // Apply the outer group's rotation (slot.rot) to get world-space offset
    const worldDx = localX * cosR + localZ * sinR;
    const worldDz = -localX * sinR + localZ * cosR;
    const key = `carousel${index}`;
    if (seats[key]) {
      seats[key].pos.set(
        slot.x + worldDx,
        hY + 1.2,
        slot.z + worldDz,
      );
      // Yaw points radially outward from centre so the rider sees the park.
      seats[key].yaw = Math.atan2(worldDx, worldDz);
    }
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      {/* base */}
      <mesh position={[0, 0.7, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[R + 2.4, R + 3.2, 1.4, 40]} />
        <meshStandardMaterial color="#2b2129" roughness={0.8} />
      </mesh>

      <group ref={spin}>
        <mesh position={[0, 1.6, 0]} receiveShadow>
          <cylinderGeometry args={[R + 1.4, R + 1.4, 0.5, 40]} />
          <meshStandardMaterial color="#e9e2d2" roughness={0.6} />
        </mesh>

        {/* centre column */}
        <mesh position={[0, 6, 0]}>
          <cylinderGeometry args={[1.5, 1.7, 10, 16]} />
          <meshStandardMaterial color="#c8a44a" roughness={0.3} metalness={0.85} />
        </mesh>

        {/* canopy */}
        <mesh position={[0, 12.4, 0]} castShadow>
          <coneGeometry args={[R + 3, 5.4, 20, 1, true]} />
          <meshStandardMaterial map={canopy} roughness={0.6} side={DoubleSide} />
        </mesh>
        <mesh position={[0, 15.6, 0]}>
          <sphereGeometry args={[1.1, 12, 10]} />
          <meshBasicMaterial color="#ffdf9a" toneMapped={false} />
        </mesh>

        {/* rim of bulbs */}
        <mesh position={[0, 9.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R + 2.6, 0.22, 6, 48]} />
          <meshBasicMaterial color="#ffcf8f" toneMapped={false} />
        </mesh>

        {/* Coat, tack and poles are three instanced batches rather than 28
            separate meshes. Fourteen horses each drawn twice with a clearcoat
            shader was 28 draw calls of the most expensive material in the
            park — enough on its own to drag the quality tier down and take
            the fireworks with it. */}
        <instancedMesh
          ref={coats}
          args={[horseCoat(), undefined, COUNT]}
          castShadow
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={0.34} metalness={0.12} />
        </instancedMesh>
        <instancedMesh
          ref={tacks}
          args={[horseTack(), undefined, COUNT]}
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={0.42} metalness={0.55} />
        </instancedMesh>
        <instancedMesh ref={poles} args={[undefined, undefined, COUNT]} frustumCulled={false}>
          <cylinderGeometry args={[0.14, 0.14, 9, 8]} />
          <meshStandardMaterial color="#d9b45a" roughness={0.25} metalness={0.95} />
        </instancedMesh>
      </group>

    </group>
  );
}

/* ── swing ride ───────────────────────────────────────────────────────────── */

/** Where the chains bolt to the canopy, and how long they are. */
const ANCHOR_R = 6.4;
const ANCHOR_Y = -1.7;
const CHAIN_LEN = 13;

function SwingRide({ slot, seed, index }: { slot: Slot; seed: number; index: number }) {
  const head = useRef<Group>(null);
  const chains = useRef<(Group | null)[]>([]);
  const H = 34;
  const COUNT = 18;
  const color = CANDY[(seed + 2) % CANDY.length];

  useFrame((state, dt) => {
    if (head.current) head.current.rotation.y += dt * 0.62;

    // The chairs fly OUT as it winds up. Local +X is radial after the anchor's
    // -a yaw, and a positive Z rotation carries the chain's foot toward +X —
    // negating it swings every chair inward to bunch around the mast instead.
    const fly = 0.62 + Math.sin(state.clock.elapsedTime * 0.28) * 0.26;
    for (const c of chains.current) if (c) c.rotation.z = fly;

    // the seat rides at the end of a chain that is actually hanging there
    const a = head.current?.rotation.y ?? 0;
    const rSeat = ANCHOR_R + Math.sin(fly) * CHAIN_LEN;
    const seatY = H - 2 + ANCHOR_Y - Math.cos(fly) * CHAIN_LEN;
    const localX = Math.cos(a) * rSeat;
    const localZ = -Math.sin(a) * rSeat;
    const cosR = Math.cos(slot.rot);
    const sinR = Math.sin(slot.rot);
    const worldDx = localX * cosR + localZ * sinR;
    const worldDz = -localX * sinR + localZ * cosR;
    const key = `swingRide${index}`;
    if (seats[key]) {
      seats[key].pos.set(slot.x + worldDx, seatY + 0.9, slot.z + worldDz);
      seats[key].yaw = Math.atan2(worldDx, worldDz);
    }
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <mesh position={[0, 0.6, 0]} receiveShadow>
        <cylinderGeometry args={[11, 12, 1.2, 28]} />
        <meshStandardMaterial color="#272430" roughness={0.85} />
      </mesh>
      <mesh position={[0, H / 2, 0]} castShadow>
        <cylinderGeometry args={[1.5, 2.6, H, 14]} />
        <meshStandardMaterial color="#59606f" roughness={0.5} metalness={0.8} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[0, 5 + i * 6.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.1 - i * 0.14, 0.2, 6, 20]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}

      <group ref={head} position={[0, H - 2, 0]}>
        <mesh castShadow>
          <coneGeometry args={[7.5, 4.5, 18]} />
          <meshStandardMaterial color="#e2e6ee" roughness={0.35} metalness={0.4} />
        </mesh>
        <mesh position={[0, -2.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[7, 0.26, 6, 32]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>

        {/* Each chain pivots at its own anchor on the canopy rim, so it stays
            bolted to the ride however far it flies out. The old version
            positioned chains at their midpoints and then scaled the whole
            group to make them swing, which slid every top away from the
            canopy and left them hanging in mid-air. */}
        {Array.from({ length: COUNT }, (_, i) => {
          const a = (i / COUNT) * Math.PI * 2;
          const x0 = Math.cos(a) * ANCHOR_R;
          const z0 = Math.sin(a) * ANCHOR_R;
          return (
            <group key={i} position={[x0, ANCHOR_Y, z0]} rotation={[0, -a, 0]}>
              {/* local +X now points radially outward, so a Z rotation here
                  swings the chair out in the radial/vertical plane */}
              <group ref={(el) => void (chains.current[i] = el)}>
                <mesh position={[0, -CHAIN_LEN / 2, 0]}>
                  <cylinderGeometry args={[0.055, 0.055, CHAIN_LEN, 5]} />
                  <meshStandardMaterial color="#aab2c0" roughness={0.4} metalness={0.9} />
                </mesh>
                {/* the chair, hung square off the bottom of the chain */}
                <mesh position={[0, -CHAIN_LEN - 0.45, 0]} castShadow>
                  <boxGeometry args={[1.2, 0.9, 1.5]} />
                  <meshStandardMaterial
                    color={CANDY[(i + seed) % CANDY.length]}
                    roughness={0.45}
                  />
                </mesh>
                <mesh position={[0, -CHAIN_LEN - 0.05, -0.62]} castShadow>
                  <boxGeometry args={[1.2, 1.1, 0.14]} />
                  <meshStandardMaterial
                    color={CANDY[(i + seed) % CANDY.length]}
                    roughness={0.5}
                  />
                </mesh>
              </group>
            </group>
          );
        })}
      </group>

    </group>
  );
}

/* ── teacups ──────────────────────────────────────────────────────────────── */

function Teacups({ slot, seed, index }: { slot: Slot; seed: number; index: number }) {
  const plate = useRef<Group>(null);
  const cups = useRef<(Group | null)[]>([]);
  const R = 8.5;

  useFrame((_, dt) => {
    if (plate.current) plate.current.rotation.y += dt * 0.5;
    cups.current.forEach((c, i) => {
      if (c) c.rotation.y -= dt * (1.1 + (i % 3) * 0.4);
    });

    const aPlate = plate.current?.rotation.y ?? 0;
    const aCup = cups.current[0]?.rotation.y ?? 0;
    const plateX = Math.cos(aPlate) * R;
    const plateZ = -Math.sin(aPlate) * R;
    const cosR = Math.cos(slot.rot);
    const sinR = Math.sin(slot.rot);
    const worldDx = plateX * cosR + plateZ * sinR;
    const worldDz = -plateX * sinR + plateZ * cosR;
    const key = `teacups${index}`;
    if (seats[key]) {
      seats[key].pos.set(
        slot.x + worldDx,
        2.8,
        slot.z + worldDz,
      );
      seats[key].yaw = Math.atan2(worldDx, worldDz) + aCup;
    }
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <cylinderGeometry args={[R + 4, R + 5, 1, 28]} />
        <meshStandardMaterial color="#241f2b" roughness={0.85} />
      </mesh>
      <group ref={plate} position={[0, 1.2, 0]}>
        <mesh receiveShadow>
          <cylinderGeometry args={[R + 3, R + 3, 0.6, 28]} />
          <meshStandardMaterial color="#f0e8dc" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R + 3, 0.2, 6, 36]} />
          <meshBasicMaterial color={CANDY[seed % CANDY.length]} toneMapped={false} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <group
              key={i}
              ref={(el) => void (cups.current[i] = el)}
              position={[Math.cos(a) * R, 1.6, Math.sin(a) * R]}
            >
              <mesh castShadow>
                <cylinderGeometry args={[2.4, 1.7, 2.6, 18, 1, true]} />
                <meshStandardMaterial
                  color={CANDY[(i * 2 + seed) % CANDY.length]}
                  roughness={0.3}
                  metalness={0.15}
                  side={DoubleSide}
                />
              </mesh>
              <mesh position={[1.8, 0.3, 0]} rotation={[0, 0, -Math.PI / 2]} frustumCulled={false}>
                <torusGeometry args={[0.9, 0.22, 6, 14, Math.PI]} />
                <meshStandardMaterial
                  color={CANDY[(i * 2 + seed) % CANDY.length]}
                  roughness={0.3}
                />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

/* ── bumper cars ──────────────────────────────────────────────────────────── */

function BumperCars({ slot, index }: { slot: Slot; index: number }) {
  const cars = useRef<(Group | null)[]>([]);
  const W = 34;
  const D = 24;
  const COUNT = 5;

  const posts = useMemo(() => {
    const out: Piece[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        out.push(
          beam(new Vector3((sx * W) / 2, 0, (sz * D) / 2), new Vector3((sx * W) / 2, 11, (sz * D) / 2), 0.8),
        );
      }
    }
    out.push(beam(new Vector3(-W / 2, 11, -D / 2), new Vector3(W / 2, 11, -D / 2), 0.5));
    out.push(beam(new Vector3(-W / 2, 11, D / 2), new Vector3(W / 2, 11, D / 2), 0.5));
    out.push(beam(new Vector3(-W / 2, 11, -D / 2), new Vector3(-W / 2, 11, D / 2), 0.5));
    out.push(beam(new Vector3(W / 2, 11, -D / 2), new Vector3(W / 2, 11, D / 2), 0.5));
    return out;
  }, []);

  const seeds = useMemo(() => {
    const rng = new Rng(404 + index);
    return Array.from({ length: COUNT }, (_, i) => {
      const angle = (i / COUNT) * Math.PI * 2;
      const radius = 6 + (i % 2) * 3;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        vx: 0,
        vz: 0,
        yaw: angle + Math.PI / 2,
        c: CANDY[(i * 2 + index) % CANDY.length],
        aiTimer: rng.range(0, 2),
      };
    });
  }, [index]);

  const phys = useRef(seeds);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    const ridingKey = `bumperCars${index}`;
    const isPlayerRiding = explore.state.riding === ridingKey;

    phys.current.forEach((car, i) => {
      if (i === 0 && isPlayerRiding) {
        // Player input controls car 0
        car.yaw += userDrive.turn * step * 3.2;
        if (userDrive.fwd !== 0) {
          const accel = userDrive.fwd * 38 * step;
          car.vx += Math.sin(car.yaw) * accel;
          car.vz += Math.cos(car.yaw) * accel;
        }
      } else {
        // AI cars wander, turn & accelerate
        car.aiTimer -= step;
        if (car.aiTimer <= 0) {
          car.aiTimer = 1.5 + Math.random() * 2.5;
          car.yaw += (Math.random() - 0.5) * 2.5;
        }
        const speed = 12;
        car.vx += Math.sin(car.yaw) * speed * step;
        car.vz += Math.cos(car.yaw) * speed * step;
      }

      // Drag / friction
      car.vx *= Math.pow(0.2, step);
      car.vz *= Math.pow(0.2, step);

      // Integrate position
      car.x += car.vx * step;
      car.z += car.vz * step;

      // Arena walls bounds check
      const boundX = W / 2 - 2.2;
      const boundZ = D / 2 - 2.2;
      if (Math.abs(car.x) > boundX) {
        car.x = Math.sign(car.x) * boundX;
        car.vx = -car.vx * 0.7;
        car.yaw = Math.atan2(-car.vx, car.vz);
      }
      if (Math.abs(car.z) > boundZ) {
        car.z = Math.sign(car.z) * boundZ;
        car.vz = -car.vz * 0.7;
        car.yaw = Math.atan2(car.vx, -car.vz);
      }
    });

    // Car to Car collisions (bumping mechanics!)
    for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        const c1 = phys.current[i];
        const c2 = phys.current[j];
        const dx = c2.x - c1.x;
        const dz = c2.z - c1.z;
        const dist = Math.hypot(dx, dz);
        const minDist = 2.8;
        if (dist < minDist && dist > 0.001) {
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = (minDist - dist) * 0.5;
          c1.x -= nx * overlap;
          c1.z -= nz * overlap;
          c2.x += nx * overlap;
          c2.z += nz * overlap;

          const relVx = c2.vx - c1.vx;
          const relVz = c2.vz - c1.vz;
          const impulse = (relVx * nx + relVz * nz) * 1.3;
          if (impulse < 0) {
            c1.vx += nx * impulse;
            c1.vz += nz * impulse;
            c2.vx -= nx * impulse;
            c2.vz -= nz * impulse;
          }
        }
      }
    }

    // Apply positions & rotations to 3D meshes
    cars.current.forEach((group, i) => {
      if (!group) return;
      const p = phys.current[i];
      group.position.set(p.x, 0.3, p.z);
      group.rotation.y = p.yaw;
    });

    // Publish seat 0 for ExploreCamera
    const lead = phys.current[0];
    if (seats[ridingKey]) {
      const cosR = Math.cos(slot.rot);
      const sinR = Math.sin(slot.rot);
      const worldDx = lead.x * cosR + lead.z * sinR;
      const worldDz = -lead.x * sinR + lead.z * cosR;

      seats[ridingKey].pos.set(slot.x + worldDx, 0.3, slot.z + worldDz);
      seats[ridingKey].yaw = slot.rot + lead.yaw;
    }
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <mesh position={[0, 0.3, 0]} receiveShadow>
        <boxGeometry args={[W + 3, 0.6, D + 3]} />
        <meshStandardMaterial color="#15161d" roughness={0.35} metalness={0.5} />
      </mesh>
      <Frame pieces={posts} color="#4b5160" />
      {/* lit ceiling grid */}
      <mesh position={[0, 10.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshBasicMaterial color="#3a2a55" toneMapped={false} side={DoubleSide} />
      </mesh>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * 10, 10.3, 0]}>
          <boxGeometry args={[0.6, 0.3, D - 2]} />
          <meshBasicMaterial color="#9ad8ff" toneMapped={false} />
        </mesh>
      ))}

      {seeds.map((s, i) => (
        <group key={i} ref={(el) => void (cars.current[i] = el)}>
          {/* Heavy rubber bumper skirt */}
          <mesh position={[0, 0.25, 0]} receiveShadow>
            <boxGeometry args={[2.1, 0.35, 2.9]} />
            <meshStandardMaterial color="#1a1c23" roughness={0.9} />
          </mesh>

          {/* Chrome Bumper Trim */}
          <mesh position={[0, 0.42, 0]}>
            <boxGeometry args={[2.02, 0.08, 2.82]} />
            <meshStandardMaterial color="#e0e6ed" roughness={0.15} metalness={0.95} />
          </mesh>

          {/* Main Fiberglass Car Body */}
          <mesh castShadow position={[0, 0.6, 0]}>
            <boxGeometry args={[1.9, 0.45, 2.7]} />
            <meshPhysicalMaterial color={s.c} roughness={0.2} metalness={0.1} clearcoat={0.9} clearcoatRoughness={0.1} />
          </mesh>

          {/* Sloped Front Hood */}
          <mesh castShadow position={[0, 0.85, 0.55]} rotation={[-0.15, 0, 0]}>
            <boxGeometry args={[1.75, 0.35, 1.2]} />
            <meshPhysicalMaterial color={s.c} roughness={0.2} metalness={0.1} clearcoat={0.9} />
          </mesh>

          {/* Front Grill Panel */}
          <mesh position={[0, 0.65, 1.36]}>
            <boxGeometry args={[1.4, 0.25, 0.05]} />
            <meshStandardMaterial color="#111318" roughness={0.7} />
          </mesh>

          {/* Glowing Twin Headlights */}
          {[-0.55, 0.55].map((hx) => (
            <mesh key={hx} position={[hx, 0.68, 1.38]}>
              <cylinderGeometry args={[0.12, 0.12, 0.06, 10]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
          ))}

          {/* Rear Glowing Taillights */}
          {[-0.55, 0.55].map((tx) => (
            <mesh key={tx} position={[tx, 0.68, -1.36]}>
              <boxGeometry args={[0.28, 0.12, 0.05]} />
              <meshBasicMaterial color="#ff2233" toneMapped={false} />
            </mesh>
          ))}

          {/* Cockpit Floorboard */}
          <mesh position={[0, 0.65, -0.1]}>
            <boxGeometry args={[1.5, 0.2, 1.4]} />
            <meshStandardMaterial color="#252830" roughness={0.8} />
          </mesh>

          {/* Padded Seat Cushion */}
          <mesh position={[0, 0.8, -0.45]} castShadow>
            <boxGeometry args={[1.4, 0.2, 0.7]} />
            <meshStandardMaterial color="#16181d" roughness={0.6} />
          </mesh>

          {/* Backrest */}
          <mesh castShadow position={[0, 1.15, -0.85]} rotation={[-0.1, 0, 0]}>
            <boxGeometry args={[1.4, 0.7, 0.25]} />
            <meshStandardMaterial color="#16181d" roughness={0.6} />
          </mesh>

          {/* Steering Column & Wheel (Angled back towards driver) */}
          <group position={[0, 0.75, 0.35]} rotation={[-0.35, 0, 0]}>
            {/* Steering Shaft */}
            <mesh position={[0, 0.25, 0]} frustumCulled={false}>
              <cylinderGeometry args={[0.035, 0.035, 0.5, 8]} />
              <meshStandardMaterial color="#8a929a" metalness={0.85} roughness={0.2} />
            </mesh>
            {/* Hub & Center Emblem */}
            <mesh position={[0, 0.5, 0]} frustumCulled={false}>
              <cylinderGeometry args={[0.07, 0.07, 0.05, 10]} />
              <meshStandardMaterial color="#111318" />
            </mesh>
            <mesh position={[0, 0.52, 0]} frustumCulled={false}>
              <cylinderGeometry args={[0.035, 0.035, 0.02, 10]} />
              <meshStandardMaterial color="#39d3ff" toneMapped={false} />
            </mesh>
            {/* Steering Wheel Rim */}
            <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
              <torusGeometry args={[0.26, 0.04, 8, 20]} />
              <meshStandardMaterial color="#1b1e24" roughness={0.5} />
            </mesh>
          </group>

          {/* Trolley Pole Base Spring Coil */}
          <mesh position={[0, 1.0, -1.0]}>
            <cylinderGeometry args={[0.12, 0.16, 0.4, 10]} />
            <meshStandardMaterial color="#333" metalness={0.8} roughness={0.4} />
          </mesh>

          {/* Power Pole connecting to ceiling */}
          <mesh position={[0, 5.2, -1.0]}>
            <cylinderGeometry args={[0.035, 0.035, 8.4, 6]} />
            <meshStandardMaterial color="#abb2ba" metalness={0.9} roughness={0.15} />
          </mesh>

          {/* Ceiling Contact Shoe with Spark Glow */}
          <mesh position={[0, 9.4, -1.0]}>
            <boxGeometry args={[0.35, 0.08, 0.5]} />
            <meshStandardMaterial color="#333" metalness={0.9} />
          </mesh>
          <mesh position={[0, 9.42, -1.0]}>
            <boxGeometry args={[0.2, 0.04, 0.3]} />
            <meshBasicMaterial color="#70d6ff" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── big top ──────────────────────────────────────────────────────────────── */

function BigTop({ slot }: { slot: Slot }) {
  const flag = useRef<Group>(null);
  const canvas = useMemo(() => stripes("#f7f3ea", "#d8324b", 22), []);

  useFrame((state) => {
    if (flag.current) flag.current.rotation.y = Math.sin(state.clock.elapsedTime * 1.4) * 0.4;
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <mesh position={[0, 9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[24, 26, 18, 28, 1, true]} />
        <meshStandardMaterial map={canvas} roughness={0.75} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 26, 0]} castShadow>
        <coneGeometry args={[26, 20, 28, 1, true]} />
        <meshStandardMaterial map={canvas} roughness={0.75} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[25, 0.3, 6, 40]} />
        <meshBasicMaterial color="#ffd166" toneMapped={false} />
      </mesh>
      <group ref={flag} position={[0, 37, 0]}>
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 6, 6]} />
          <meshStandardMaterial color="#c8b48a" />
        </mesh>
        <mesh position={[1.8, 3.6, 0]}>
          <planeGeometry args={[3.6, 2]} />
          <meshStandardMaterial color="#ffd166" side={DoubleSide} emissive="#ffb703" emissiveIntensity={0.5} />
        </mesh>
      </group>
      {/* lit entrance */}
      <mesh position={[0, 5, 26]}>
        <planeGeometry args={[9, 10]} />
        <meshBasicMaterial color="#ffb84d" toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── water tower ──────────────────────────────────────────────────────────── */

function WaterTower({ slot }: { slot: Slot }) {
  const legs = useMemo(() => {
    const out: Piece[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const foot = new Vector3(Math.cos(a) * 8, 0, Math.sin(a) * 8);
      const top = new Vector3(Math.cos(a) * 4.5, 26, Math.sin(a) * 4.5);
      out.push(beam(foot, top, 0.7));
      const b = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;
      out.push(
        beam(
          new Vector3(Math.cos(a) * 6.5, 13, Math.sin(a) * 6.5),
          new Vector3(Math.cos(b) * 6.5, 13, Math.sin(b) * 6.5),
          0.3,
        ),
      );
      out.push(
        beam(
          new Vector3(Math.cos(a) * 6.5, 13, Math.sin(a) * 6.5),
          new Vector3(Math.cos(b) * 4.5, 26, Math.sin(b) * 4.5),
          0.22,
        ),
      );
    }
    return out;
  }, []);

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <Frame pieces={legs} color="#54595f" />
      <mesh position={[0, 32, 0]} castShadow>
        <cylinderGeometry args={[7, 7, 12, 20]} />
        <meshStandardMaterial color="#8a9099" roughness={0.62} metalness={0.6} />
      </mesh>
      <mesh position={[0, 39.5, 0]} castShadow>
        <coneGeometry args={[7.4, 4, 20]} />
        <meshStandardMaterial color="#6d737b" roughness={0.6} metalness={0.6} />
      </mesh>
      <mesh position={[0, 42.4, 0]}>
        <sphereGeometry args={[0.8, 10, 8]} />
        <meshBasicMaterial color="#ff3b30" toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── water park ───────────────────────────────────────────────────────────── */

const FLUME_COLOURS = ["#2ec5f6", "#ffc531", "#ff5d8f"];
/** Rider's eye above the trough floor — about a metre, at the park's scale. */
const EYE_IN_TROUGH = 2.05;
/** How long you wallow in the pool before the gate sends you round again. */
const SPLASH_HOLD = 2.6;
/** Yaw of each flume. A third of a turn apart, which is the whole design. */
const FLUME_YAW = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
/**
 * How high above the trough floor the raft sits, along the (banked) up axis.
 * The channel is a circular arc, not a flat gutter, so it narrows fast toward
 * the bottom — a raft has to float high enough up that arc for the channel to
 * actually be wider than the raft, or its rim clips out through the shell
 * wall wherever anyone looks at the slide from outside.
 */
const RAFT_FLOAT = 1.15;
const RAFT_R = 0.85;
const RAFT_TUBE = 0.32;

/**
 * The tower the flumes hang off: columns on a ring, octagonal ring beams
 * between them, a spiral stair up the middle and the cantilever brackets that
 * carry each trough. The stair keeps inside the column ring and the brackets
 * only ever run inward, so nothing here can reach into a flume.
 */
function towerSteel(brackets: FlumeData["brackets"]): Piece[] {
  const { deck, coreR } = FLUME;
  const out: Piece[] = [];
  const RING = 8;

  // columns and their ring beams
  for (let i = 0; i < RING; i++) {
    const a = (i / RING) * Math.PI * 2;
    const b = ((i + 1) / RING) * Math.PI * 2;
    out.push(
      beam(
        new Vector3(Math.cos(a) * coreR, 0, Math.sin(a) * coreR),
        new Vector3(Math.cos(a) * coreR, deck + 1.2, Math.sin(a) * coreR),
        0.52,
      ),
    );
    for (let y = 4.5; y < deck; y += 4.5) {
      out.push(
        beam(
          new Vector3(Math.cos(a) * coreR, y, Math.sin(a) * coreR),
          new Vector3(Math.cos(b) * coreR, y, Math.sin(b) * coreR),
          0.28,
        ),
      );
      // one diagonal per bay, alternating, so the cage reads as braced
      if ((i + Math.round(y)) % 2 === 0) {
        out.push(
          beam(
            new Vector3(Math.cos(a) * coreR, y, Math.sin(a) * coreR),
            new Vector3(Math.cos(b) * coreR, y + 4.5, Math.sin(b) * coreR),
            0.19,
          ),
        );
      }
    }
  }

  // spiral stair up the core, treads stopping short of the columns
  const TREADS = Math.round(deck / 0.5);
  const TURNS = 5.5;
  for (let i = 1; i <= TREADS; i++) {
    const t = i / TREADS;
    const y = t * deck;
    const a = t * TURNS * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push(
      beam(new Vector3(c * 1.0, y, s * 1.0), new Vector3(c * 4.1, y, s * 4.1), 1.0, 0.16),
    );
    if (i % 4 === 0) {
      out.push(
        beam(new Vector3(c * 4.1, y, s * 4.1), new Vector3(c * 4.1, y + 2.2, s * 4.1), 0.13),
      );
      const pa = ((i - 4) / TREADS) * TURNS * Math.PI * 2;
      out.push(
        beam(
          new Vector3(Math.cos(pa) * 4.1, y - 2 + 2.2, Math.sin(pa) * 4.1),
          new Vector3(c * 4.1, y + 2.2, s * 4.1),
          0.11,
        ),
      );
    }
  }
  // the mast the stair winds around
  out.push(beam(new Vector3(0, 0, 0), new Vector3(0, deck + 7, 0), 0.7));

  // deck railings, left open at each flume gate
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const gate = FLUME_YAW.some((g) => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.34);
    if (gate) continue;
    const b = ((i + 1) / 48) * Math.PI * 2;
    const R = 7.6;
    out.push(
      beam(
        new Vector3(Math.cos(a) * R, deck, Math.sin(a) * R),
        new Vector3(Math.cos(a) * R, deck + 2.4, Math.sin(a) * R),
        0.14,
      ),
    );
    out.push(
      beam(
        new Vector3(Math.cos(a) * R, deck + 2.4, Math.sin(a) * R),
        new Vector3(Math.cos(b) * R, deck + 2.4, Math.sin(b) * R),
        0.12,
      ),
    );
  }

  // the trough brackets, once per flume, rotated into place
  for (const yaw of FLUME_YAW) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const spin = (v: Vector3) => new Vector3(c * v.x - s * v.z, v.y, s * v.x + c * v.z);
    for (const b of brackets) out.push(beam(spin(b.from), spin(b.to), 0.24));
  }

  return out;
}

/**
 * A flume tower.
 *
 * One trough geometry, built once for the whole park and hung three times at
 * 120° — see `lib/park/flume` for why that particular arrangement is the only
 * one that keeps the three slides out of each other. The rider is carried by
 * the same banked frame the trough was swept from, at the speed energy
 * conservation says they should be going, so the ride accelerates into the
 * steep middle of the spiral and coasts out across the pool.
 */
function WaterSlide({ slot, index }: { slot: Slot; index: number }) {
  const data = useMemo(() => flume(), []);
  const steel = useMemo(() => towerSteel(data.brackets), [data]);
  const surface = useRef<Mesh>(null);
  const flows = useRef<(Mesh | null)[]>([]);
  const rafts = useRef<(Group | null)[]>([]);
  const pose = useMemo(makePose, []);

  /** Ambient rafts, spread down the three slides. */
  const traffic = useRef([0.08, 0.42, 0.74].map((f) => f * data.length));
  /** The boarded rider: distance down the slide, and the pool timer. */
  const ride = useRef({ s: 0, hold: -1 });

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const step = Math.min(dt, 0.05);

    // Pool ripples: nudge the normal map around rather than displace the mesh.
    const mat = surface.current?.material as MeshStandardMaterial | undefined;
    if (mat?.normalMap) mat.normalMap.offset.set(Math.sin(t * 0.09) * 0.05, t * 0.014);

    // The sheet in each trough runs downhill. The UV's v axis is arc length,
    // so scrolling it is literally the water moving down the slide.
    for (const m of flows.current) {
      const fm = m?.material as MeshStandardMaterial | undefined;
      if (fm?.normalMap) fm.normalMap.offset.y = -t * 0.9;
    }

    // Rafts nobody is in, running the slides on the same physics as the rider.
    for (let k = 0; k < 3; k++) {
      const g = rafts.current[k];
      if (!g) continue;
      slidePose(data, traffic.current[k], pose);
      traffic.current[k] += pose.v * step;
      if (traffic.current[k] > data.length + SPLASH_RUN * 1.4) traffic.current[k] = 0;
      g.position.copy(pose.pos).addScaledVector(pose.up, -FLUME.trough + RAFT_FLOAT);
      basis.makeBasis(scratchA.copy(pose.left).negate(), pose.up, pose.fwd);
      g.quaternion.setFromRotationMatrix(basis);
    }

    /* ── the rider ─────────────────────────────────────────────────────────── */

    const key = `waterSlide${index}`;
    const seat = seats[key];
    if (!seat) return;
    const riding = explore.state.riding === key;

    if (!riding) {
      ride.current.s = 0;
      ride.current.hold = -1;
    } else if (ride.current.hold >= 0) {
      // bobbing in the pool at the bottom
      if (t - ride.current.hold > SPLASH_HOLD) {
        ride.current.hold = -1;
        ride.current.s = 0;
      }
    } else {
      slidePose(data, ride.current.s, pose);
      ride.current.s += pose.v * step;
      if (ride.current.s > data.length + SPLASH_RUN) ride.current.hold = t;
    }

    slidePose(data, ride.current.s, pose);

    // Sit on the trough floor, not on its axis. Riding the centreline is what
    // put the old camera inside the wall.
    scratchA.copy(pose.pos).addScaledVector(pose.up, -FLUME.trough + EYE_IN_TROUGH);
    if (ride.current.hold >= 0) {
      scratchA.y += Math.sin((t - ride.current.hold) * 2.4) * 0.16;
    }

    // Out of the tower's local frame and into the park's.
    const c = Math.cos(slot.rot);
    const s = Math.sin(slot.rot);
    seat.pos.set(
      slot.x + c * scratchA.x + s * scratchA.z,
      scratchA.y,
      slot.z - s * scratchA.x + c * scratchA.z,
    );
    const fx = c * pose.fwd.x + s * pose.fwd.z;
    const fz = -s * pose.fwd.x + c * pose.fwd.z;
    seat.yaw = Math.atan2(fx, fz);
    seat.pitch = Math.asin(Math.max(-1, Math.min(1, pose.fwd.y)));
    seat.roll = pose.bank;
  });

  const steelSkin = paintedSteel(6);
  const pool = paintedSteel(9);

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      {/* deck and coping around the pool */}
      <mesh position={[0, 0.42, 0]} receiveShadow>
        <cylinderGeometry args={[FLUME.poolR + 4.5, FLUME.poolR + 5.5, 0.84, 48]} />
        <meshStandardMaterial color="#b9b2a4" roughness={0.92} map={pool.map} />
      </mesh>
      {/* the basin, sunk below the coping */}
      <mesh position={[0, 0.7, 0]} receiveShadow>
        <cylinderGeometry args={[FLUME.poolR, FLUME.poolR - 1.2, 1.4, 48]} />
        <meshStandardMaterial color="#7fd6ea" roughness={0.5} side={DoubleSide} />
      </mesh>
      <mesh ref={surface} position={[0, FLUME.waterY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[FLUME.poolR - 0.4, 56]} />
        <meshStandardMaterial
          color="#0f6b8c"
          roughness={0.045}
          metalness={0.2}
          normalMap={steelSkin.normalMap}
          normalScale={[0.34, 0.34]}
          envMapIntensity={2.4}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* underwater lighting, the thing that makes a pool glow at night */}
      <mesh position={[0, FLUME.waterY - 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[FLUME.poolR - 5, FLUME.poolR - 1.4, 44]} />
        <meshBasicMaterial color="#4fe0ff" transparent opacity={0.45} toneMapped={false} />
      </mesh>

      <Frame pieces={steel} color="#7c8494" />

      {FLUME_YAW.map((yaw, k) => (
        <group key={k} rotation={[0, yaw, 0]}>
          {/* the trough, plus its rolled rims, in one buffer */}
          <mesh geometry={data.shell} castShadow receiveShadow>
            <meshPhysicalMaterial
              color={FLUME_COLOURS[k]}
              roughness={0.28}
              metalness={0.04}
              clearcoat={0.85}
              clearcoatRoughness={0.2}
              side={DoubleSide}
            />
          </mesh>
          {/* the sheet of water running down it */}
          <mesh geometry={data.water} ref={(el) => void (flows.current[k] = el)}>
            <meshStandardMaterial
              color="#9fe8ff"
              roughness={0.08}
              metalness={0.1}
              normalMap={steelSkin.normalMap}
              normalScale={[0.55, 0.55]}
              envMapIntensity={2.2}
              transparent
              opacity={0.55}
              side={DoubleSide}
            />
          </mesh>

          {/* start tub bridging the deck out to the gate */}
          <mesh position={[FLUME.rTop - 1.6, FLUME.deck - 0.35, 0]} castShadow>
            <boxGeometry args={[6.4, 0.7, 6.2]} />
            <meshStandardMaterial color="#48505f" roughness={0.75} metalness={0.35} />
          </mesh>
          {/* the jet that keeps the slide wet */}
          <mesh position={[FLUME.rTop - 4.4, FLUME.deck + 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.34, 0.34, 2.6, 8]} />
            <meshStandardMaterial color="#c8ced8" roughness={0.4} metalness={0.7} />
          </mesh>

          {/* an unoccupied raft doing laps — sized to the channel width at
              RAFT_FLOAT, not to look right in isolation */}
          <group ref={(el) => void (rafts.current[k] = el)}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[RAFT_R, RAFT_TUBE, 8, 16]} />
              <meshStandardMaterial color="#f7d64a" roughness={0.55} />
            </mesh>
            <mesh position={[0, 0.42, -0.08]}>
              <sphereGeometry args={[0.36, 10, 8]} />
              <meshStandardMaterial color="#e8b48f" roughness={0.8} />
            </mesh>
          </group>
        </group>
      ))}

      {/* platform deck and its canopy */}
      <mesh position={[0, FLUME.deck - 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[7.6, 7.6, 0.8, 24]} />
        <meshStandardMaterial color="#3f4756" roughness={0.72} metalness={0.4} />
      </mesh>
      <mesh position={[0, FLUME.deck + 5.4, 0]} castShadow>
        <coneGeometry args={[9.2, 3.4, 8]} />
        <meshStandardMaterial color="#2f6f86" roughness={0.68} metalness={0.2} />
      </mesh>
      <mesh position={[0, FLUME.deck + 3.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[7.7, 0.22, 6, 28]} />
        <meshBasicMaterial color="#4fe0ff" toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── pirate ship ──────────────────────────────────────────────────────────── */

function PirateShip({ slot, index }: { slot: Slot; index: number }) {
  const arm = useRef<Group>(null);
  const H = 28;

  // Steel/wooden A-frame gantry supporting the central pivot
  const gantry = useMemo(() => {
    const out: Piece[] = [];
    for (const sx of [-6, 6]) {
      out.push(beam(new Vector3(sx, 0, -14), new Vector3(sx, H, 0), 1.2));
      out.push(beam(new Vector3(sx, 0, 14), new Vector3(sx, H, 0), 1.2));
      out.push(beam(new Vector3(sx, 8, -10), new Vector3(sx, 8, 10), 0.7));
      out.push(beam(new Vector3(sx, 16, -6), new Vector3(sx, 16, 6), 0.7));
    }
    out.push(beam(new Vector3(-6.5, H, 0), new Vector3(6.5, H, 0), 1.4));
    return out;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const swingAngle = Math.sin(t * 0.65) * 0.85;
    if (arm.current) {
      arm.current.rotation.x = swingAngle;
    }
    const L = 19;
    // Rotation of (0, -L, 0) about X-axis by swingAngle gives local z = -L * sin(swingAngle)
    const localZ = -Math.sin(swingAngle) * L;
    const localY = H - Math.cos(swingAngle) * L + 2;
    const cosR = Math.cos(slot.rot);
    const sinR = Math.sin(slot.rot);
    const worldDx = localZ * sinR;
    const worldDz = localZ * cosR;
    const key = `pirateShip${index}`;
    if (seats[key]) {
      seats[key].pos.set(
        slot.x + worldDx,
        localY,
        slot.z + worldDz,
      );
      seats[key].yaw = slot.rot + Math.PI;
    }
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      {/* cobbled foundation platform */}
      <mesh position={[0, 0.4, 0]} receiveShadow>
        <cylinderGeometry args={[18, 19, 0.8, 28]} />
        <meshStandardMaterial color="#241f28" roughness={0.85} />
      </mesh>
      {/* wooden gantry frame */}
      <Frame pieces={gantry} color="#4a3525" />

      {/* swinging pendulum arm & galleon ship */}
      <group ref={arm} position={[0, H, 0]}>
        {/* Support arms extending down from top axle to ship hull at ±X */}
        {[-4, 4].map((sx) => (
          <mesh key={sx} position={[sx, -9.5, 0]}>
            <boxGeometry args={[0.4, 19, 0.4]} />
            <meshStandardMaterial color="#362417" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}

        {/* the pirate galleon ship (oriented horizontally along Z axis, length = 21, width = 7.2) */}
        <group position={[0, -19, 0]}>
          {/* Main wooden hull body */}
          <mesh castShadow receiveShadow position={[0, 1.2, 0]}>
            <boxGeometry args={[7.2, 3.6, 21]} />
            <meshStandardMaterial color="#3b2316" roughness={0.65} />
          </mesh>

          {/* Curved keel bottom */}
          <mesh position={[0, -0.6, 0]} castShadow>
            <boxGeometry args={[5.5, 1.6, 19]} />
            <meshStandardMaterial color="#2b180d" roughness={0.75} />
          </mesh>

          {/* Upper deck flooring */}
          <mesh position={[0, 3.1, 0]}>
            <boxGeometry args={[7.4, 0.2, 21.2]} />
            <meshStandardMaterial color="#593724" roughness={0.7} />
          </mesh>

          {/* Gold decorative hull side trim */}
          {[-3.7, 3.7].map((sx) => (
            <mesh key={sx} position={[sx, 3.1, 0]}>
              <boxGeometry args={[0.2, 0.3, 21.4]} />
              <meshStandardMaterial color="#e5b842" roughness={0.3} metalness={0.85} />
            </mesh>
          ))}

          {/* Pointed bow (prow) at +Z */}
          <group position={[0, 2.5, 10.5]} rotation={[-0.35, 0, 0]}>
            <mesh rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[3.2, 6, 4]} />
              <meshStandardMaterial color="#4a2d1d" roughness={0.6} />
            </mesh>
            {/* Golden bowsprit pole & dragon head */}
            <mesh position={[0, 3.5, 0]} rotation={[0.2, 0, 0]}>
              <cylinderGeometry args={[0.2, 0.4, 5, 8]} />
              <meshStandardMaterial color="#d4af37" roughness={0.2} metalness={0.9} />
            </mesh>
            <mesh position={[0, 6, 0]}>
              <sphereGeometry args={[0.6, 10, 8]} />
              <meshStandardMaterial color="#d4af37" roughness={0.2} metalness={0.95} />
            </mesh>
          </group>

          {/* Raised stern cabin (Poop Deck) at -Z */}
          <group position={[0, 4.2, -9.2]}>
            <mesh castShadow>
              <boxGeometry args={[7.2, 4.4, 5]} />
              <meshStandardMaterial color="#382114" roughness={0.65} />
            </mesh>
            {/* Stern windows */}
            {[-2, 0, 2].map((wx) => (
              <mesh key={wx} position={[wx, 0.4, -2.6]}>
                <boxGeometry args={[1.0, 1.5, 0.2]} />
                <meshBasicMaterial color="#ffdf85" toneMapped={false} />
              </mesh>
            ))}
          </group>

          {/* 3 wooden masts with crossyards & white canvas sails */}
          {[
            { z: 5, h: 14, r: 0.32 },
            { z: 0, h: 17, r: 0.38 },
            { z: -5, h: 12, r: 0.3 },
          ].map((m, i) => (
            <group key={i} position={[0, m.h / 2 + 3.1, m.z]}>
              {/* mast pole */}
              <mesh castShadow>
                <cylinderGeometry args={[m.r * 0.7, m.r, m.h, 10]} />
                <meshStandardMaterial color="#2d1b11" roughness={0.7} />
              </mesh>
              {/* yardarm crossbar across X axis */}
              <mesh position={[0, m.h * 0.2, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.15, 0.15, 6.5, 8]} />
                <meshStandardMaterial color="#3b2316" roughness={0.6} />
              </mesh>
              {/* rolled white canvas sail along X axis */}
              <mesh position={[0, m.h * 0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[1.1, 1.1, 5.8, 12]} />
                <meshStandardMaterial color="#f0eae1" roughness={0.8} />
              </mesh>
            </group>
          ))}

          {/* Jolly Roger pirate flag on main mast top */}
          <group position={[0, 20.2, 0]}>
            <mesh position={[1.1, 0, 0]}>
              <boxGeometry args={[2.2, 1.4, 0.06]} />
              <meshStandardMaterial color="#151515" roughness={0.9} />
            </mesh>
            <mesh position={[1.1, 0, 0.04]}>
              <circleGeometry args={[0.4, 10]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
          </group>

          {/* Side cannon port-holes & black metal cannons along ±X sides */}
          {[-6, -3, 0, 3, 6].map((cz) => (
            <group key={cz}>
              {[-3.7, 3.7].map((cx) => (
                <mesh key={cx} position={[cx, 2.2, cz]} rotation={[0, 0, cx > 0 ? -1.57 : 1.57]}>
                  <cylinderGeometry args={[0.2, 0.25, 1.4, 8]} />
                  <meshStandardMaterial color="#1c1f24" roughness={0.3} metalness={0.9} />
                </mesh>
              ))}
            </group>
          ))}

          {/* Wooden deck seats */}
          {[-6, -3, 0, 3, 6].map((sz) => (
            <mesh key={sz} position={[0, 3.5, sz]} castShadow>
              <boxGeometry args={[6.0, 0.6, 1.1]} />
              <meshStandardMaterial color="#2d1b11" roughness={0.8} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/* ── haunted house ────────────────────────────────────────────────────────── */

function HauntedHouse({ slot }: { slot: Slot }) {
  const windows = useRef<(MeshBasicMaterial | null)[]>([]);
  const W = 30;
  const H = 22;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    windows.current.forEach((m, i) => {
      if (m) m.opacity = 0.45 + 0.55 * Math.abs(Math.sin(t * (0.7 + i * 0.23) + i));
    });
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <mesh position={[0, H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, H, 20]} />
        <meshStandardMaterial color="#211c26" roughness={0.9} />
      </mesh>
      {/* crooked roof */}
      <mesh position={[0, H + 4.5, 0]} rotation={[0, Math.PI / 4, 0.06]} castShadow>
        <coneGeometry args={[W * 0.78, 11, 4]} />
        <meshStandardMaterial color="#171319" roughness={0.92} />
      </mesh>
      {/* turrets */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[(sx * W) / 2.4, 0, 8]}>
          <mesh position={[0, H * 0.62, 0]} castShadow>
            <cylinderGeometry args={[3.2, 3.6, H * 1.24, 10]} />
            <meshStandardMaterial color="#1d1922" roughness={0.9} />
          </mesh>
          <mesh position={[0, H * 1.24 + 4, 0]} castShadow>
            <coneGeometry args={[4.2, 8, 10]} />
            <meshStandardMaterial color="#141117" roughness={0.92} />
          </mesh>
        </group>
      ))}
      {/* arched windows, flickering out of sync */}
      {[-9, 0, 9].map((x, i) =>
        [7, 15].map((y, j) => (
          <mesh key={`${x}-${y}`} position={[x, y, 10.15]}>
            <planeGeometry args={[3.6, 5]} />
            <meshBasicMaterial
              ref={(m) => void (windows.current[i * 2 + j] = m)}
              color="#7cff9e"
              transparent
              opacity={0.6}
              toneMapped={false}
            />
          </mesh>
        )),
      )}
      <mesh position={[0, 4.5, 10.2]}>
        <planeGeometry args={[8, 9]} />
        <meshBasicMaterial color="#20301f" toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── kiosks ───────────────────────────────────────────────────────────────── */

const KIOSK_SIGNS = [
  "HOT DOGS",
  "CANDY FLOSS",
  "CHURROS",
  "COLD DRINKS",
  "POPCORN",
  "ICE CREAM",
  "SOFT SERVE",
  "FRESH LIME",
  "CHAI",
  "DONUTS",
  "NACHOS",
  "SLUSH",
];

function Kiosks() {
  const awnings = useMemo(
    () => KIOSK_SIGNS.map((_, i) => stripes("#faf6ee", CANDY[i % CANDY.length], 12)),
    [],
  );
  
  const signs = useMemo(
    () => KIOSK_SIGNS.map((text, i) => neonText(text, CANDY[i % CANDY.length], { width: 512, height: 128, mono: true })),
    []
  );

  return (
    <group>
      {FURNITURE.kiosks.map((slot, i) => (
        <group key={i} position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
          <mesh position={[0, 2.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[7, 4.4, 5]} />
            <meshStandardMaterial color="#efe6d4" roughness={0.72} />
          </mesh>
          {/* counter light — the warm slot every food stand has */}
          <mesh position={[0, 3.1, 2.55]}>
            <planeGeometry args={[6, 1.8]} />
            <meshBasicMaterial color="#ffca7a" toneMapped={false} />
          </mesh>
          <mesh position={[0, 5.1, 1.6]} rotation={[-0.62, 0, 0]} castShadow>
            <boxGeometry args={[8, 0.2, 3.4]} />
            <meshStandardMaterial map={awnings[i]} roughness={0.7} side={DoubleSide} />
          </mesh>
          {/* sign supports */}
          {[-3.2, 3.2].map((px) => (
            <mesh key={px} position={[px, 5.9, 0]} castShadow>
              <cylinderGeometry args={[0.1, 0.1, 3.2]} />
              <meshStandardMaterial color="#1a1512" roughness={0.9} />
            </mesh>
          ))}

          <mesh position={[0, 7.4, 0.16]}>
            <planeGeometry args={[6.8, 1.2]} />
            <meshBasicMaterial map={signs[i]} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0, 7.4, 0]}>
            <boxGeometry args={[7.2, 1.4, 0.3]} />
            <meshStandardMaterial color="#1a1512" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── the lot ──────────────────────────────────────────────────────────────── */

export function Funfair() {
  return (
    <group>
      {FURNITURE.carousel.map((s, i) => (
        <Carousel key={`c${i}`} slot={s} seed={i * 3 + 1} index={i} />
      ))}
      {FURNITURE.swingRide.map((s, i) => (
        <SwingRide key={`s${i}`} slot={s} seed={i * 5 + 2} index={i} />
      ))}
      {FURNITURE.teacups.map((s, i) => (
        <Teacups key={`t${i}`} slot={s} seed={i * 7 + 3} index={i} />
      ))}
      {FURNITURE.bumperCars.map((s, i) => (
        <BumperCars key={`b${i}`} slot={s} index={i} />
      ))}
      {FURNITURE.bigTop.map((s, i) => (
        <BigTop key={`g${i}`} slot={s} />
      ))}
      {FURNITURE.waterTower.map((s, i) => (
        <WaterTower key={`w${i}`} slot={s} />
      ))}
      {FURNITURE.waterSlide.map((s, i) => (
        <WaterSlide key={`f${i}`} slot={s} index={i} />
      ))}
      {FURNITURE.pirateShip.map((s, i) => (
        <PirateShip key={`p${i}`} slot={s} index={i} />
      ))}
      {FURNITURE.hauntedHouse.map((s, i) => (
        <HauntedHouse key={`h${i}`} slot={s} />
      ))}
      <Kiosks />
    </group>
  );
}
