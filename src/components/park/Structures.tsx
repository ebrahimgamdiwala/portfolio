"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  DoubleSide,
  Matrix4,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type MeshBasicMaterial,
} from "three";
import { meta, park, stations } from "@/lib/content";
import { beam, box } from "@/lib/park/build";
import type { CoasterData, Piece } from "@/lib/park/coaster";
import { LANDMARKS, PARK } from "@/lib/park/layout";
import { neonText, panel } from "@/lib/park/sign";
import { concrete, paintedSteel } from "@/lib/park/textures";
import { Pieces } from "./primitives/Pieces";

/**
 * The park's civic architecture: the entrance arch, the boarding station, the
 * lit gantry the ride ducks under in The Works, and the perimeter fence that
 * gives the whole place an edge.
 *
 * The station and the gantry are positioned *off the rails* rather than by
 * hand, so they stay aligned if the circuit is ever re-laid.
 */

const pos = new Vector3();
const quat = new Quaternion();
const right = new Vector3();
const up = new Vector3();
const fwd = new Vector3();

const bulbMatrix = new Matrix4();
const bulbScale = new Vector3();
const IDENT_Q = new Quaternion();

/* ── entrance arch ────────────────────────────────────────────────────────── */

function Gate() {
  const bulbs = useRef<InstancedMesh>(null);
  const nameTex = useMemo(() => neonText(park.name, "#e6b06c", { width: 2048, height: 288 }), []);
  const mottoTex = useMemo(
    () => neonText(park.gateMotto, "#8fd8ff", { width: 1024, height: 128, mono: true, weight: "600" }),
    [],
  );

  const W = 62;
  const H = 34;

  const iron = useMemo(() => {
    const out: Piece[] = [];
    for (const sx of [-1, 1]) {
      // towers
      for (const dz of [-4, 4]) {
        out.push(beam(new Vector3(sx * W * 0.5, 0, dz), new Vector3(sx * W * 0.5, H, dz), 1.5));
      }
      for (let i = 0; i <= 6; i++) {
        const y = (i / 6) * H;
        out.push(beam(new Vector3(sx * W * 0.5, y, -4), new Vector3(sx * W * 0.5, y, 4), 0.5));
      }
      out.push(box(sx * W * 0.5, 1, 0, 10, 2, 12));
    }
    // header beam and the arc above it
    out.push(beam(new Vector3(-W * 0.5, H, 0), new Vector3(W * 0.5, H, 0), 2.2, 3.4));
    for (let i = 0; i < 18; i++) {
      const a0 = Math.PI * (i / 18);
      const a1 = Math.PI * ((i + 1) / 18);
      out.push(
        beam(
          new Vector3(-Math.cos(a0) * W * 0.5, H + Math.sin(a0) * 13, 0),
          new Vector3(-Math.cos(a1) * W * 0.5, H + Math.sin(a1) * 13, 0),
          0.8,
        ),
      );
    }
    return out;
  }, []);

  // the bulb run around the arc
  const bulbSlots = useMemo(() => {
    const out: Vector3[] = [];
    for (let i = 0; i <= 42; i++) {
      const a = Math.PI * (i / 42);
      out.push(new Vector3(-Math.cos(a) * W * 0.5, H + Math.sin(a) * 13, 0.9));
    }
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        out.push(new Vector3(sx * W * 0.5, 2 + (i / 9) * (H - 3), 4.4));
      }
    }
    return out;
  }, []);

  useFrame((state) => {
    const m = bulbs.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < bulbSlots.length; i++) {
      // a chase running around the arch, the way every fairground arch does
      const lit = 0.55 + 0.45 * Math.sin(t * 3.2 - i * 0.42);
      bulbScale.setScalar(0.42 + lit * 0.34);
      m.setMatrixAt(i, bulbMatrix.compose(bulbSlots[i], IDENT_Q, bulbScale));
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[LANDMARKS.gate.x, 0, LANDMARKS.gate.z]} rotation={[0, LANDMARKS.gate.rot, 0]}>
      <Pieces pieces={iron} receiveShadow>
        <meshStandardMaterial color="#6b4a3a" roughness={0.62} metalness={0.55} />
      </Pieces>

      <instancedMesh ref={bulbs} args={[undefined, undefined, bulbSlots.length]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#ffdca8" toneMapped={false} />
      </instancedMesh>

      <mesh position={[0, H + 6.5, 1.1]}>
        <planeGeometry args={[W - 6, 9]} />
        <meshBasicMaterial
          map={nameTex}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          opacity={0.65}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, H - 3.2, 1.8]}>
        <planeGeometry args={[W * 0.62, 4]} />
        <meshBasicMaterial
          map={mottoTex}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
                  />
      </mesh>

    </group>
  );
}

/* ── boarding station ─────────────────────────────────────────────────────── */

function Station({ coaster }: { coaster: CoasterData }) {
  const u = coaster.stationU.origin ?? 0;
  const slab = concrete(26);

  const { origin, yaw, iron } = useMemo(() => {
    coaster.sample(u, pos, quat);
    coaster.basis(u, right, up, fwd);
    const o = pos.clone();
    const y = Math.atan2(fwd.x, fwd.z);

    const out: Piece[] = [];
    const L = 46;
    const HGT = 13;
    for (const sx of [-1, 1]) {
      for (let i = 0; i <= 5; i++) {
        const z = -L / 2 + (i / 5) * L;
        out.push(beam(new Vector3(sx * 7.5, 0, z), new Vector3(sx * 7.5, HGT, z), 0.7));
      }
      out.push(beam(new Vector3(sx * 7.5, HGT, -L / 2), new Vector3(sx * 7.5, HGT, L / 2), 0.55));
      // platform edge
      out.push(box(sx * 5.2, 1.5, 0, 3.6, 3, L));
    }
    for (let i = 0; i <= 5; i++) {
      const z = -L / 2 + (i / 5) * L;
      out.push(beam(new Vector3(-7.5, HGT, z), new Vector3(0, HGT + 4.5, z), 0.5));
      out.push(beam(new Vector3(7.5, HGT, z), new Vector3(0, HGT + 4.5, z), 0.5));
    }
    out.push(beam(new Vector3(0, HGT + 4.5, -L / 2), new Vector3(0, HGT + 4.5, L / 2), 0.6));
    return { origin: o, yaw: y, iron: out };
  }, [coaster, u]);

  const marquee = useMemo(() => {
    const s = stations[0];
    return panel(s.marquee, meta.shortName.toUpperCase(), s.accent, { width: 1024, height: 256 });
  }, []);

  return (
    <group position={[origin.x, 0, origin.z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[34, 56]} />
        <meshStandardMaterial
          map={slab.map}
          normalMap={slab.normalMap}
          roughnessMap={slab.roughnessMap}
        />
      </mesh>
      <Pieces pieces={iron} receiveShadow>
        <meshStandardMaterial color="#5c4a3e" roughness={0.65} metalness={0.5} />
      </Pieces>

      {/* the roof, translucent so the lift hill still reads through it */}
      <mesh position={[0, 15.4, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[17, 0.3, 47]} />
        <meshStandardMaterial color="#2a2028" roughness={0.8} />
      </mesh>

      {/* platform strip lights */}
      {[-5.2, 5.2].map((x) => (
        <mesh key={x} position={[x, 3.1, 0]}>
          <boxGeometry args={[3.8, 0.16, 46]} />
          <meshBasicMaterial color="#ffdcae" toneMapped={false} />
        </mesh>
      ))}

      <mesh position={[0, 18.5, -24]}>
        <planeGeometry args={[22, 5.5]} />
        <meshStandardMaterial
          map={marquee}
          emissiveMap={marquee}
          emissive="#ffffff"
          emissiveIntensity={1.2}
                  />
      </mesh>
    </group>
  );
}

/* ── the sponsor gantry ───────────────────────────────────────────────────── */

function Gantry({ coaster }: { coaster: CoasterData }) {
  const station = stations.find((s) => s.id === "experience") ?? stations[0];
  const flick = useRef<MeshBasicMaterial>(null);
  const steel = paintedSteel(6);

  const { origin, yaw, iron, height } = useMemo(() => {
    const u = (coaster.stationU.experience ?? 0.5) - 0.012;
    coaster.sample(u, pos, quat);
    coaster.basis(u, right, up, fwd);
    const o = pos.clone();
    const y = Math.atan2(fwd.x, fwd.z);
    const clear = Math.max(16, o.y + 9);

    const out: Piece[] = [];
    for (const sx of [-1, 1]) {
      for (const dz of [-2.6, 2.6]) {
        out.push(beam(new Vector3(sx * 17, -o.y, dz), new Vector3(sx * 17, clear - o.y, dz), 1.1));
      }
      for (let i = 0; i <= 7; i++) {
        const yy = -o.y + (i / 7) * clear;
        out.push(beam(new Vector3(sx * 17, yy, -2.6), new Vector3(sx * 17, yy, 2.6), 0.34));
      }
      out.push(box(sx * 17, -o.y + 0.6, 0, 7, 1.2, 9));
    }
    for (const dz of [-2.6, 2.6]) {
      out.push(
        beam(new Vector3(-17, clear - o.y, dz), new Vector3(17, clear - o.y, dz), 1.2),
      );
      out.push(
        beam(new Vector3(-17, clear - o.y + 7, dz), new Vector3(17, clear - o.y + 7, dz), 0.7),
      );
    }
    for (let i = 0; i <= 10; i++) {
      const x = -17 + (i / 10) * 34;
      out.push(
        beam(
          new Vector3(x, clear - o.y, 0),
          new Vector3(x, clear - o.y + 7, 0),
          0.3,
        ),
      );
    }
    return { origin: o, yaw: y, iron: out, height: clear };
  }, [coaster]);

  const sign = useMemo(
    () => neonText(station.marquee, station.accent, { width: 1024, height: 200 }),
    [station],
  );

  useFrame((state) => {
    if (flick.current) {
      flick.current.opacity = 0.82 + Math.sin(state.clock.elapsedTime * 7.3) * 0.18;
    }
  });

  return (
    <group position={[origin.x, origin.y, origin.z]} rotation={[0, yaw, 0]}>
      <Pieces pieces={iron} receiveShadow>
        <meshStandardMaterial
          color="#43485a"
          roughness={0.6}
          metalness={0.72}
          map={steel.map}
          normalMap={steel.normalMap}
          roughnessMap={steel.roughnessMap}
        />
      </Pieces>
      <mesh position={[0, height - origin.y + 3.5, 0]}>
        <planeGeometry args={[32, 6.4]} />
        <meshBasicMaterial
          ref={flick}
          map={sign}
          transparent
          opacity={1}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
                  />
      </mesh>
    </group>
  );
}

/* ── perimeter ────────────────────────────────────────────────────────────── */

function Fence() {
  const pieces = useMemo(() => {
    const out: Piece[] = [];
    const R = PARK.fenceRadius;
    const N = 132;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const b = ((i + 1) / N) * Math.PI * 2;
      const p0 = new Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
      const p1 = new Vector3(Math.cos(b) * R, 0, Math.sin(b) * R);
      out.push(box(p0.x, 2.6, p0.z, 0.5, 5.2, 0.5, -a));
      out.push(beam(p0.clone().setY(4.6), p1.clone().setY(4.6), 0.2));
      out.push(beam(p0.clone().setY(1.4), p1.clone().setY(1.4), 0.2));
    }
    return out;
  }, []);

  return (
    <Pieces pieces={pieces} receiveShadow>
      <meshStandardMaterial color="#2b2e36" roughness={0.75} metalness={0.5} />
    </Pieces>
  );
}

export function Structures({ coaster }: { coaster: CoasterData }) {
  return (
    <group>
      <Gate />
      <Station coaster={coaster} />
      <Gantry coaster={coaster} />
      <Fence />
    </group>
  );
}
