"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, CatmullRomCurve3, DoubleSide, Vector3, type Group, type MeshBasicMaterial } from "three";
import { posterOf, stations, type Station, type StationItem } from "@/lib/content";
import { SLOTS, type Slot } from "@/lib/park/layout";
import { neonText, panel } from "@/lib/park/sign";
import { stripes } from "@/lib/park/textures";
import { Rng } from "@/lib/park/rand";

/**
 * The midway and the prize row.
 *
 * Skills are game stalls — one booth per group, sign lit overhead, prizes on
 * the back shelf. Awards are plinths with the trophy spotlit from below. Both
 * come straight out of `park.json`; adding a skill group adds a booth.
 */

const PRIZE_COLOURS = ["#ff5d8f", "#ffd23f", "#5ad2ff", "#a78bfa", "#4ade80", "#ff8b3d"];

function Stall({ item, slot, accent, index }: { item: StationItem; slot: Slot; accent: string; index: number }) {
  const canopy = useMemo(() => stripes("#f7f2e6", accent, 14), [accent]);
  const sign = useMemo(
    () => neonText(item.title.toUpperCase(), accent, { width: 1024, height: 200, mono: true }),
    [item.title, accent],
  );
  const flicker = useRef<MeshBasicMaterial>(null);

  const prizes = useMemo(() => {
    const rng = new Rng(900 + index * 31);
    return Array.from({ length: 18 }, (_, i) => {
      const row = Math.floor(i / 6);
      const shelfY = 3.6 + row * 1.3;
      const s = rng.range(0.35, 0.6); // scale
      return {
        x: -4.0 + (i % 6) * 1.6 + rng.spread(0.2),
        y: shelfY + s,
        z: -4.0 + rng.spread(0.1),
        s,
        c: PRIZE_COLOURS[rng.int(PRIZE_COLOURS.length)],
      };
    });
  }, [index]);

  useFrame((state) => {
    // one tube in every arcade is on its way out
    if (!flicker.current) return;
    const t = state.clock.elapsedTime * 9 + index * 4;
    flicker.current.opacity = Math.sin(t) > -0.86 ? 1 : 0.25;
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      {/* booth (hollowed out to reveal interior) */}
      <group>
        {/* back */}
        <mesh position={[0, 3.6, -4.7]} castShadow receiveShadow>
          <boxGeometry args={[11.5, 7.2, 0.2]} />
          <meshStandardMaterial color="#26222c" roughness={0.8} />
        </mesh>
        {/* left */}
        <mesh position={[-5.65, 3.6, -1.6]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 7.2, 6]} />
          <meshStandardMaterial color="#26222c" roughness={0.8} />
        </mesh>
        {/* right */}
        <mesh position={[5.65, 3.6, -1.6]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 7.2, 6]} />
          <meshStandardMaterial color="#26222c" roughness={0.8} />
        </mesh>
        {/* roof */}
        <mesh position={[0, 7.1, -1.6]} castShadow receiveShadow>
          <boxGeometry args={[11.1, 0.2, 6]} />
          <meshStandardMaterial color="#26222c" roughness={0.8} />
        </mesh>
      </group>
      {/* back wall, lit, so the prizes read as silhouettes on it */}
      <mesh position={[0, 4.4, -4.5]}>
        <planeGeometry args={[11, 6.4]} />
        <meshBasicMaterial color="#3a1f4a" toneMapped={false} />
      </mesh>

      {/* shelves for the prizes to sit on */}
      {[3.6, 4.9, 6.2].map((y) => (
        <mesh key={y} position={[0, y - 0.05, -3.9]} castShadow receiveShadow>
          <boxGeometry args={[11, 0.1, 1.2]} />
          <meshStandardMaterial color="#1a1820" roughness={0.9} />
        </mesh>
      ))}

      {prizes.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} scale={p.s} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color={p.c} roughness={0.85} emissive={p.c} emissiveIntensity={0.22} />
        </mesh>
      ))}

      {/* counter */}
      <mesh position={[0, 1.5, 1.6]} castShadow receiveShadow>
        <boxGeometry args={[12, 3, 1.6]} />
        <meshStandardMaterial color="#d9cfba" roughness={0.7} />
      </mesh>
      <mesh position={[0, 3.05, 1.6]}>
        <boxGeometry args={[12.2, 0.2, 1.8]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>

      {/* striped awning */}
      <mesh position={[0, 7.6, 1.2]} rotation={[-0.5, 0, 0]} castShadow>
        <boxGeometry args={[13, 0.24, 5]} />
        <meshStandardMaterial map={canopy} roughness={0.68} side={DoubleSide} />
      </mesh>

      {/* sign supports */}
      {[-5.0, 5.0].map((x) => (
        <mesh key={x} position={[x, 8.6, 0.2]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 3.6]} />
          <meshStandardMaterial color="#141319" roughness={0.9} />
        </mesh>
      ))}

      {/* the sign */}
      <mesh position={[0, 10.2, 0.6]}>
        <planeGeometry args={[13, 2.6]} />
        <meshBasicMaterial
          ref={flicker}
          map={sign}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 10.2, 0.2]}>
        <boxGeometry args={[13.4, 3.2, 0.3]} />
        <meshStandardMaterial color="#141319" roughness={0.9} />
      </mesh>

    </group>
  );
}

function Plinth({ item, slot, station }: { item: StationItem; slot: Slot; station: Station }) {
  const poster = posterOf(item, station);
  const cup = useRef<Group>(null);
  const board = useMemo(
    () => panel(poster.headline, poster.sub, station.accent, { width: 512, height: 256 }),
    [poster.headline, poster.sub, station.accent],
  );

  const handleCurve = useMemo(() => {
    return new CatmullRomCurve3([
      new Vector3(2.4, 2.8, 0), // attach securely to upper cup wall
      new Vector3(3.4, 3.0, 0), // swoop wide out and up
      new Vector3(3.8, 1.8, 0), // curve gracefully down
      new Vector3(2.7, -0.1, 0), // curve back in
      new Vector3(1.6, -0.3, 0), // attach deeply into the lower base bowl
    ]);
  }, []);

  useFrame((_, dt) => {
    if (cup.current) cup.current.rotation.y += dt * 0.35;
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      {/* pedestal */}
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <cylinderGeometry args={[3.6, 4.2, 1, 20]} />
        <meshStandardMaterial color="#1e1f26" roughness={0.85} />
      </mesh>
      <mesh position={[0, 3.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.4, 2.9, 5.2, 20]} />
        <meshStandardMaterial color="#2b2d36" roughness={0.5} metalness={0.5} />
      </mesh>

      {/* uplight in the cap — this is what makes a trophy look like a trophy */}
      <mesh position={[0, 6.3, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 0.3, 20]} />
        <meshBasicMaterial color={station.accent} toneMapped={false} />
      </mesh>

      <group ref={cup} position={[0, 9.4, 0]}>
        {/* Dark Marble & Gold Pedestal */}
        <mesh position={[0, -2.6, 0]} frustumCulled={false} castShadow receiveShadow>
          <cylinderGeometry args={[1.8, 2.2, 1.2, 28]} />
          <meshStandardMaterial color="#121217" roughness={0.25} metalness={0.4} />
        </mesh>
        {/* Engraved Plaque */}
        <mesh position={[0, -2.6, 1.95]} frustumCulled={false}>
          <planeGeometry args={[1.8, 0.6]} />
          <meshPhysicalMaterial color="#ffe066" metalness={0.95} roughness={0.15} />
        </mesh>
        <mesh position={[0, -1.9, 0]} frustumCulled={false} castShadow>
          <cylinderGeometry args={[1.3, 1.6, 0.35, 28]} />
          <meshPhysicalMaterial color="#ffc700" roughness={0.1} metalness={0.98} clearcoat={1} />
        </mesh>

        {/* Turned Stem */}
        <mesh position={[0, -1.3, 0]} frustumCulled={false} castShadow>
          <cylinderGeometry args={[0.5, 0.9, 0.9, 24]} />
          <meshPhysicalMaterial color="#ffc700" roughness={0.1} metalness={0.98} clearcoat={1} />
        </mesh>
        <mesh position={[0, -0.75, 0]} frustumCulled={false} castShadow>
          <torusGeometry args={[0.8, 0.22, 12, 28]} />
          <meshPhysicalMaterial color="#ffe054" roughness={0.08} metalness={1} clearcoat={1} />
        </mesh>

        {/* Main Chalice Body */}
        {/* Lower Base Dome */}
        <mesh position={[0, -0.2, 0]} rotation={[Math.PI, 0, 0]} frustumCulled={false} castShadow>
          <sphereGeometry args={[1.5, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial color="#ffd700" roughness={0.08} metalness={0.98} clearcoat={1} side={DoubleSide} />
        </mesh>
        {/* Main Flared Body */}
        <mesh position={[0, 1.4, 0]} frustumCulled={false} castShadow>
          <cylinderGeometry args={[2.5, 1.4, 3.2, 32, 1, true]} />
          <meshPhysicalMaterial color="#ffd700" roughness={0.08} metalness={0.98} clearcoat={1} side={DoubleSide} />
        </mesh>
        {/* Inner Gold Floor */}
        <mesh position={[0, -0.15, 0]} frustumCulled={false}>
          <cylinderGeometry args={[1.45, 1.45, 0.1, 28]} />
          <meshPhysicalMaterial color="#d4a000" roughness={0.2} metalness={0.9} />
        </mesh>
        {/* Thick Gold Lip Rim */}
        <mesh position={[0, 3.0, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false} castShadow>
          <torusGeometry args={[2.5, 0.22, 16, 36]} />
          <meshPhysicalMaterial color="#ffe054" roughness={0.05} metalness={1} clearcoat={1} />
        </mesh>

        {/* Iconic Championship "Big Ear" Handles (Left & Right) */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} scale={[sx, 1, 1]} frustumCulled={false} castShadow>
            <tubeGeometry args={[handleCurve, 24, 0.22, 12, false]} />
            <meshPhysicalMaterial color="#ffe054" roughness={0.05} metalness={1} clearcoat={1} />
          </mesh>
        ))}

        {/* Top Victory Star Emblem Finial */}
        <group position={[0, 4.3, 0]}>
          <mesh frustumCulled={false} castShadow position={[0, 0, 0]} rotation={[0, 0, Math.PI / 4]}>
            <octahedronGeometry args={[0.55, 0]} />
            <meshPhysicalMaterial color="#ffffff" emissive="#ffea78" emissiveIntensity={0.8} roughness={0.05} metalness={0.95} />
          </mesh>
        </group>
      </group>

      <mesh position={[0, 3.9, 2.95]}>
        <planeGeometry args={[4.4, 2.2]} />
        <meshStandardMaterial
          map={board}
          emissiveMap={board}
          emissive="#ffffff"
          emissiveIntensity={1.1}
          roughness={0.5}
        />
      </mesh>

    </group>
  );
}

export function Midway() {
  const stalls = useMemo(() => {
    const out: { item: StationItem; slot: Slot; accent: string }[] = [];
    let i = 0;
    for (const station of stations) {
      for (const item of station.items) {
        if (item.attraction !== "stall") continue;
        const slot = SLOTS.stall[i];
        if (slot) out.push({ item, slot, accent: station.accent });
        i++;
      }
    }
    return out;
  }, []);

  const plinths = useMemo(() => {
    const out: { item: StationItem; slot: Slot; station: Station }[] = [];
    let i = 0;
    for (const station of stations) {
      for (const item of station.items) {
        if (item.attraction !== "plinth") continue;
        const slot = SLOTS.plinth[i];
        if (slot) out.push({ item, slot, station });
        i++;
      }
    }
    return out;
  }, []);

  return (
    <group>
      {stalls.map((s, i) => (
        <Stall key={s.item.title} item={s.item} slot={s.slot} accent={s.accent} index={i} />
      ))}
      {plinths.map((p) => (
        <Plinth key={p.item.title} item={p.item} slot={p.slot} station={p.station} />
      ))}
    </group>
  );
}
