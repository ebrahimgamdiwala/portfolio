"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Quaternion,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
  type Points,
} from "three";
import type { CoasterData } from "@/lib/park/coaster";
import { glowSprite, paintedSteel } from "@/lib/park/textures";
import { neonText } from "@/lib/park/sign";
import { Rng } from "@/lib/park/rand";

/**
 * THE SPLASH RUN.
 *
 * A short stretch where the coaster dives straight into a water flume and comes
 * out the other side. The tube is swept from the ride's own samples over a
 * span of `u`, so it is aligned with the rails by construction — hand-placing
 * a tunnel on a banked spline is a losing game.
 *
 * It is deliberately brief. A few seconds of enclosed roaring dark between two
 * bright portals does more for the ride than a long one, which just becomes a
 * corridor.
 */

const RADIUS = 4.6;
const SPRAY = 420;

const p = new Vector3();
const q = new Quaternion();

export function SplashTunnel({
  coaster,
  from,
  length,
}: {
  coaster: CoasterData;
  from: number;
  length: number;
}) {
  const steel = paintedSteel(6);
  const water = useRef<Mesh>(null);
  const spray = useRef<Points>(null);

  const { curve, entry, exit, entryYaw, exitYaw, mid } = useMemo(() => {
    const N = 64;
    const pts: Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      coaster.sample(from + length * (i / N), p, q);
      pts.push(p.clone());
    }
    const c = new CatmullRomCurve3(pts, false, "catmullrom", 0.5);

    const heading = (a: Vector3, b: Vector3) => Math.atan2(b.x - a.x, b.z - a.z);
    return {
      curve: c,
      entry: pts[0].clone(),
      exit: pts[N].clone(),
      entryYaw: heading(pts[0], pts[2]),
      exitYaw: heading(pts[N - 2], pts[N]),
      mid: pts[Math.floor(N / 2)].clone(),
    };
  }, [coaster, from, length]);

  // the sheet of water running along the floor of the tube
  const floor = useMemo(() => {
    const N = 64;
    const verts = new Float32Array((N + 1) * 2 * 3);
    const uvs = new Float32Array((N + 1) * 2 * 2);
    const norms = new Float32Array((N + 1) * 2 * 3);
    const right = new Vector3();
    const up = new Vector3();
    const fwd = new Vector3();

    for (let i = 0; i <= N; i++) {
      const u = from + length * (i / N);
      coaster.sample(u, p, q);
      coaster.basis(u, right, up, fwd);
      const c = p.clone().addScaledVector(up, -RADIUS * 0.72);
      const v = i * 6;
      const w = RADIUS * 0.66;
      verts[v] = c.x - right.x * w;
      verts[v + 1] = c.y - right.y * w;
      verts[v + 2] = c.z - right.z * w;
      verts[v + 3] = c.x + right.x * w;
      verts[v + 4] = c.y + right.y * w;
      verts[v + 5] = c.z + right.z * w;
      norms[v + 1] = 1;
      norms[v + 4] = 1;
      uvs[i * 4] = 0;
      uvs[i * 4 + 1] = i * 0.5;
      uvs[i * 4 + 2] = 1;
      uvs[i * 4 + 3] = i * 0.5;
    }

    const idx = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const b = (i + 1) * 2;
      idx.set([a, b, a + 1, b, b + 1, a + 1], i * 6);
    }

    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(verts, 3));
    g.setAttribute("normal", new BufferAttribute(norms, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(idx, 1));
    return g;
  }, [coaster, from, length]);

  // a burst of droplets thrown up where the train comes back out
  const sprayGeom = useMemo(() => {
    const rng = new Rng(7788);
    const pos = new Float32Array(SPRAY * 3);
    const vel = new Float32Array(SPRAY * 3);
    for (let i = 0; i < SPRAY; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(2, 13);
      vel[i * 3] = Math.cos(a) * s * 0.5;
      vel[i * 3 + 1] = rng.range(5, 17);
      vel[i * 3 + 2] = Math.sin(a) * s * 0.5;
      pos[i * 3 + 1] = rng.range(0, 3);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    (g as BufferGeometry & { userData: { vel: Float32Array } }).userData = { vel };
    return g;
  }, []);

  const sign = useMemo(() => neonText("SPLASH RUN", "#4fe0ff", { width: 1024, height: 200 }), []);

  /**
   * Legs down to the ground, and the rings inside.
   *
   * A tube hanging unsupported in mid-air is the tell that it is scenery rather
   * than plumbing; the rings are what turn the pass-through from "a dark bit"
   * into something rushing past you.
   */
  const { legs, rings } = useMemo(() => {
    const l: [Vector3, Vector3][] = [];
    const r: { pos: [number, number, number]; quat: [number, number, number, number] }[] = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const u = from + length * (i / N);
      coaster.sample(u, p, q);
      r.push({ pos: [p.x, p.y, p.z], quat: [q.x, q.y, q.z, q.w] });
      if (i % 3 === 0 && p.y > RADIUS + 2) {
        for (const s of [-1, 1]) {
          l.push([
            new Vector3(p.x, p.y - RADIUS * 0.8, p.z),
            new Vector3(p.x + s * (RADIUS + 3.5), 0, p.z + s * 2),
          ]);
        }
      }
    }
    return { legs: l, rings: r };
  }, [coaster, from, length]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const mat = water.current?.material as MeshStandardMaterial | undefined;
    if (mat?.normalMap) mat.normalMap.offset.y = -t * 0.9;

    // fountain the droplets and recycle them, so the exit is always spitting
    const attr = sprayGeom.getAttribute("position") as BufferAttribute;
    const arr = attr.array as Float32Array;
    const vel = (sprayGeom as BufferGeometry & { userData: { vel: Float32Array } }).userData.vel;
    for (let i = 0; i < SPRAY; i++) {
      const life = ((t * 0.9 + i * 0.0031) % 1) * 1.6;
      arr[i * 3] = vel[i * 3] * life;
      arr[i * 3 + 1] = vel[i * 3 + 1] * life - 9.81 * life * life;
      arr[i * 3 + 2] = vel[i * 3 + 2] * life;
    }
    attr.needsUpdate = true;
  });

  const portal = (pos: Vector3, yaw: number, label: boolean) => (
    <group position={pos.toArray()} rotation={[0, yaw, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RADIUS + 0.9, 0.75, 10, 28]} />
        <meshStandardMaterial
          color="#38414f"
          roughness={0.6}
          metalness={0.7}
          normalMap={steel.normalMap}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RADIUS + 0.2, 0.24, 8, 28]} />
        <meshBasicMaterial color="#4fe0ff" toneMapped={false} />
      </mesh>
      {label && (
        <mesh position={[0, RADIUS + 4.4, 0]}>
          <planeGeometry args={[20, 4]} />
          <meshBasicMaterial
            map={sign}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );

  return (
    <group>
      {/* the flume itself, seen from inside as well as out */}
      <mesh frustumCulled={false}>
        <tubeGeometry args={[curve, 96, RADIUS, 20, false]} />
        <meshPhysicalMaterial
          color="#1d9fd6"
          roughness={0.16}
          metalness={0.05}
          clearcoat={1}
          transparent
          opacity={0.42}
          side={DoubleSide}
        />
      </mesh>
      {/* an inner shell so the interior still reads as a tube from the seat */}
      <mesh frustumCulled={false}>
        <tubeGeometry args={[curve, 96, RADIUS - 0.35, 20, false]} />
        <meshStandardMaterial
          color="#0b2f45"
          roughness={0.3}
          metalness={0.1}
          side={BackSide}
          emissive="#0d4f70"
          emissiveIntensity={0.45}
        />
      </mesh>

      <mesh ref={water} geometry={floor} frustumCulled={false}>
        <meshStandardMaterial
          color="#39c8ff"
          roughness={0.08}
          metalness={0.15}
          normalMap={steel.normalMap}
          normalScale={[0.5, 0.5]}
          emissive="#1a7fae"
          emissiveIntensity={0.6}
          side={DoubleSide}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* the rings you rush through */}
      {rings.map((r, i) => (
        <mesh key={i} position={r.pos} quaternion={r.quat}>
          <torusGeometry args={[RADIUS - 0.5, 0.16, 6, 20]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? "#bff4ff" : "#2ea8d8"}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* the plumbing that holds it up */}
      {legs.map(([a, b], i) => {
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = a.distanceTo(b);
        const dir = b.clone().sub(a).normalize();
        return (
          <mesh
            key={i}
            position={mid.toArray()}
            quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir).toArray()}
          >
            <cylinderGeometry args={[0.5, 0.75, len, 8]} />
            <meshStandardMaterial color="#3a4250" roughness={0.7} metalness={0.6} />
          </mesh>
        );
      })}

      {portal(entry, entryYaw, true)}
      {portal(exit, exitYaw, false)}

      {/* a curtain of water falling across the mouth, so you punch through it */}
      <mesh position={[entry.x, entry.y, entry.z]} rotation={[0, entryYaw, 0]}>
        <planeGeometry args={[RADIUS * 2, RADIUS * 2]} />
        <meshBasicMaterial
          color="#8fe6ff"
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* the catch pool the flume runs through */}
      <group position={[mid.x, 0, mid.z]}>
        <mesh position={[0, 0.35, 0]} receiveShadow>
          <cylinderGeometry args={[24, 25.5, 0.7, 36]} />
          <meshStandardMaterial color="#cdd4de" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[23, 44]} />
          <meshStandardMaterial
            color="#0e5f7d"
            roughness={0.05}
            metalness={0.2}
            envMapIntensity={2.4}
            transparent
            opacity={0.93}
          />
        </mesh>
        <mesh position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[18, 22.6, 40]} />
          <meshBasicMaterial color="#4fe0ff" transparent opacity={0.45} toneMapped={false} />
        </mesh>
      </group>

      <points ref={spray} geometry={sprayGeom} position={exit.toArray()} frustumCulled={false}>
        <pointsMaterial
          map={glowSprite()}
          color="#bff0ff"
          size={1.5}
          sizeAttenuation
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}
