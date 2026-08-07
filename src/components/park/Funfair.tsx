"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CatmullRomCurve3,
  DoubleSide,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import { beam } from "@/lib/park/build";
import type { Piece } from "@/lib/park/coaster";
import { FURNITURE, type Slot } from "@/lib/park/layout";
import { paintedSteel, stripes } from "@/lib/park/textures";
import { Rng } from "@/lib/park/rand";
import { horseCoat, horseTack } from "@/lib/park/horse";
import { neonText } from "@/lib/park/sign";
import { explore, seats } from "@/lib/explore/store";
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

function Frame({ pieces, color }: { pieces: Piece[]; color: string }) {
  return (
    <Pieces pieces={pieces} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.55} />
    </Pieces>
  );
}

/* ── carousel ─────────────────────────────────────────────────────────────── */

function Carousel({ slot, seed, index }: { slot: Slot; seed: number; index: number }) {
  const spin = useRef<Group>(null);
  const horses = useRef<(Group | null)[]>([]);
  const R = 13;
  const COUNT = 14;
  const canopy = useMemo(() => stripes("#f6f2e8", CANDY[seed % CANDY.length], 18), [seed]);

  useFrame((state, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.42;
    const t = state.clock.elapsedTime;
    horses.current.forEach((h, i) => {
      if (h) h.position.y = 3.1 + Math.sin(t * 2.1 + i * 0.9) * 0.9;
    });

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

        {Array.from({ length: COUNT }, (_, i) => {
          const a = (i / COUNT) * Math.PI * 2;
          const x = Math.cos(a) * R;
          const z = Math.sin(a) * R;
          return (
            <group key={i}>
              <mesh position={[x, 6, z]}>
                <cylinderGeometry args={[0.14, 0.14, 9, 8]} />
                <meshStandardMaterial color="#d9b45a" roughness={0.25} metalness={0.95} />
              </mesh>
              <group
                ref={(el) => void (horses.current[i] = el)}
                position={[x, 3.1, z]}
                rotation={[0, -a, 0]}
              >
                {/* Coat and tack are separate meshes so the mane, saddle and
                    hooves keep their own materials — a single-colour horse
                    reads as a lump whatever shape it is. */}
                <mesh geometry={horseCoat()} castShadow>
                  <meshPhysicalMaterial
                    color={CANDY[(i + seed) % CANDY.length]}
                    roughness={0.34}
                    metalness={0.1}
                    clearcoat={0.6}
                    clearcoatRoughness={0.3}
                  />
                </mesh>
                <mesh geometry={horseTack()} castShadow>
                  <meshStandardMaterial
                    color={i % 2 ? "#f4e7c8" : "#c9a227"}
                    roughness={0.42}
                    metalness={0.55}
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

/* ── swing ride ───────────────────────────────────────────────────────────── */

function SwingRide({ slot, seed, index }: { slot: Slot; seed: number; index: number }) {
  const head = useRef<Group>(null);
  const arms = useRef<Group>(null);
  const H = 34;
  const COUNT = 18;
  const color = CANDY[(seed + 2) % CANDY.length];

  useFrame((state, dt) => {
    if (head.current) head.current.rotation.y += dt * 0.62;
    if (arms.current) {
      // the chains fly out as it winds up, then settle
      const swing = 0.55 + Math.sin(state.clock.elapsedTime * 0.28) * 0.22;
      arms.current.scale.setScalar(swing / 0.55);
    }
    const a = head.current?.rotation.y ?? 0;
    const sScale = arms.current?.scale.x ?? 1;
    const rSeat = 13 * sScale;
    const localX = Math.cos(a) * rSeat;
    const localZ = -Math.sin(a) * rSeat;
    const cosR = Math.cos(slot.rot);
    const sinR = Math.sin(slot.rot);
    const worldDx = localX * cosR + localZ * sinR;
    const worldDz = -localX * sinR + localZ * cosR;
    const key = `swingRide${index}`;
    if (seats[key]) {
      seats[key].pos.set(
        slot.x + worldDx,
        H - 15,
        slot.z + worldDz,
      );
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

        <group ref={arms}>
          {Array.from({ length: COUNT }, (_, i) => {
            const a = (i / COUNT) * Math.PI * 2;
            const rTop = 6.4;
            const rSeat = 13;
            const drop = 12;
            const x0 = Math.cos(a) * rTop;
            const z0 = Math.sin(a) * rTop;
            const x1 = Math.cos(a) * rSeat;
            const z1 = Math.sin(a) * rSeat;
            const mid = new Vector3((x0 + x1) / 2, -drop / 2 - 1, (z0 + z1) / 2);
            const len = Math.hypot(x1 - x0, drop, z1 - z0);
            return (
              <group key={i}>
                <mesh
                  position={mid.toArray()}
                  rotation={[0, -a, Math.atan2(x1 - x0, drop) * 0 + Math.atan2(rSeat - rTop, drop)]}
                >
                  <cylinderGeometry args={[0.06, 0.06, len, 5]} />
                  <meshStandardMaterial color="#aab2c0" roughness={0.4} metalness={0.9} />
                </mesh>
                <mesh position={[x1, -drop - 1, z1]} rotation={[0, -a, 0]} castShadow>
                  <boxGeometry args={[1.5, 0.9, 1.1]} />
                  <meshStandardMaterial
                    color={CANDY[(i + seed) % CANDY.length]}
                    roughness={0.45}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
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

function BumperCars({ slot }: { slot: Slot }) {
  const cars = useRef<(Group | null)[]>([]);
  const W = 34;
  const D = 24;
  const COUNT = 12;

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
    const rng = new Rng(404);
    return Array.from({ length: COUNT }, () => ({
      r: rng.range(3, W / 2 - 4),
      a: rng.range(0, Math.PI * 2),
      s: rng.range(0.5, 1.3) * rng.sign(),
      c: CANDY[rng.int(CANDY.length)],
    }));
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    cars.current.forEach((c, i) => {
      if (!c) return;
      const s = seeds[i];
      const a = s.a + t * s.s * 0.5;
      c.position.set(Math.cos(a) * s.r, 0.8, (Math.sin(a) * s.r * D) / W);
      c.rotation.y = -a + Math.PI / 2;
    });
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
          <mesh castShadow>
            <cylinderGeometry args={[1.5, 1.7, 1.1, 14]} />
            <meshPhysicalMaterial color={s.c} roughness={0.25} metalness={0.3} clearcoat={0.8} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.16, 1.6, 0.16]} />
            <meshStandardMaterial color="#2a2d36" />
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

const FLUME_COLOURS = ["#39d3ff", "#ffcf3f", "#ff5d9e"];

/**
 * A flume tower. Three helices spiral down from the platform into a splash
 * pool, each swept as a tube along a descending spiral. The water surface is a
 * low-roughness plane, so it takes the whole park's neon out of the environment
 * map and lays it back down flat — which is what actually sells it as water.
 */
function WaterSlide({ slot, seed, index }: { slot: Slot; seed: number; index: number }) {
  const H = 42;
  const R_POOL = 26;
  const surface = useRef<Mesh>(null);
  const riders = useRef<(Mesh | null)[]>([]);
  const boardTime = useRef(-1);

  const flumes = useMemo(
    () =>
      FLUME_COLOURS.map((_, k) => {
        const pts: Vector3[] = [];
        const turns = 1.7 + k * 0.35;
        const start = (k / 3) * Math.PI * 2 + seed;
        const rTop = 4.5;
        const rBottom = 15 + k * 3;
        const STEPS = 90;
        for (let i = 0; i <= STEPS; i++) {
          const t = i / STEPS;
          // ease the descent so the last stretch runs out flat into the pool
          const drop = 1 - Math.pow(1 - t, 1.7);
          const a = start + t * turns * Math.PI * 2 * (k % 2 ? -1 : 1);
          const r = rTop + (rBottom - rTop) * Math.pow(t, 0.75);
          pts.push(new Vector3(Math.cos(a) * r, H - 3 - drop * (H - 5), Math.sin(a) * r));
        }
        const curve = new CatmullRomCurve3(pts, false, "catmullrom", 0.5);
        return { curve, colour: FLUME_COLOURS[k] };
      }),
    [seed],
  );

  const tower = useMemo(() => {
    const out: Piece[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const foot = new Vector3(Math.cos(a) * 5, 0, Math.sin(a) * 5);
      const top = new Vector3(Math.cos(a) * 3.4, H, Math.sin(a) * 3.4);
      out.push(beam(foot, top, 0.7));
      for (let b = 1; b <= 7; b++) {
        const y = (b / 8) * H;
        const nb = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;
        const w = 5 - (y / H) * 1.6;
        out.push(
          beam(
            new Vector3(Math.cos(a) * w, y, Math.sin(a) * w),
            new Vector3(Math.cos(nb) * w, y, Math.sin(nb) * w),
            0.26,
          ),
        );
      }
    }
    return out;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // ripples: nudge the normal map around rather than displace the mesh
    const mat = surface.current?.material as MeshStandardMaterial | undefined;
    if (mat?.normalMap) {
      mat.normalMap.offset.set(Math.sin(t * 0.09) * 0.05, t * 0.014);
    }
    // a rider running each flume, forever
    riders.current.forEach((m, k) => {
      if (!m) return;
      const phase = (t * 0.17 + k * 0.37) % 1;
      flumes[k].curve.getPointAt(phase, m.position);
    });

    // Start a boarded rider from the platform, then carry them down the first
    // flume. The live seat is transformed from the ride's local space.
    const riding = explore.state.riding === `waterSlide${index}`;
    if (riding && boardTime.current < 0) boardTime.current = t;
    if (!riding) boardTime.current = -1;
    const phase = riding ? Math.min(((t - boardTime.current) * 0.22) % 1, 0.98) : (t * 0.17) % 1;
    const point = flumes[0].curve.getPointAt(phase);
    const tangent = flumes[0].curve.getTangentAt(Math.min(phase, 0.97));
    const c = Math.cos(slot.rot);
    const s = Math.sin(slot.rot);
    const key = `waterSlide${index}`;
    if (seats[key]) {
      seats[key].pos.set(
        slot.x + c * point.x + s * point.z,
        point.y,
        slot.z - s * point.x + c * point.z,
      );
      seats[key].yaw = Math.atan2(
        c * tangent.x + s * tangent.z,
        -s * tangent.x + c * tangent.z,
      );
    }
  });

  const water = paintedSteel(6);

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      {/* splash pool */}
      <mesh position={[0, 0.3, 0]} receiveShadow>
        <cylinderGeometry args={[R_POOL, R_POOL + 1.5, 0.6, 40]} />
        <meshStandardMaterial color="#cfd6e0" roughness={0.8} />
      </mesh>
      <mesh ref={surface} position={[0, 0.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R_POOL - 1, 48]} />
        <meshStandardMaterial
          color="#0d5f7a"
          roughness={0.045}
          metalness={0.2}
          normalMap={water.normalMap}
          normalScale={[0.32, 0.32]}
          envMapIntensity={2.4}
          transparent
          opacity={0.94}
        />
      </mesh>
      {/* underwater lighting, the thing that makes a pool glow at night */}
      <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R_POOL - 5, R_POOL - 1.4, 40]} />
        <meshBasicMaterial color="#4fe0ff" transparent opacity={0.5} toneMapped={false} />
      </mesh>

      <Frame pieces={tower} color="#6e7686" />

      {/* the flumes */}
      {flumes.map((f, k) => (
        <group key={k}>
          <mesh castShadow>
            <tubeGeometry args={[f.curve, 150, 1.9, 10, false]} />
            <meshPhysicalMaterial
              color={f.colour}
              roughness={0.2}
              metalness={0.05}
              clearcoat={0.9}
              transparent
              opacity={0.72}
              side={DoubleSide}
            />
          </mesh>
          <mesh ref={(el) => void (riders.current[k] = el)}>
            <sphereGeometry args={[1.15, 10, 8]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* platform */}
      <mesh position={[0, H - 1, 0]} castShadow>
        <cylinderGeometry args={[6, 6, 1.2, 16]} />
        <meshStandardMaterial color="#3a4150" roughness={0.7} metalness={0.4} />
      </mesh>
      <mesh position={[0, H + 3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[6, 0.26, 6, 24]} />
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
          <mesh position={[0, 6.4, 0.16]}>
            <planeGeometry args={[6.8, 1.2]} />
            <meshBasicMaterial map={signs[i]} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0, 6.4, 0]}>
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
        <BumperCars key={`b${i}`} slot={s} />
      ))}
      {FURNITURE.bigTop.map((s, i) => (
        <BigTop key={`g${i}`} slot={s} />
      ))}
      {FURNITURE.waterTower.map((s, i) => (
        <WaterTower key={`w${i}`} slot={s} />
      ))}
      {FURNITURE.waterSlide.map((s, i) => (
        <WaterSlide key={`f${i}`} slot={s} seed={i * 2.1} index={i} />
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
