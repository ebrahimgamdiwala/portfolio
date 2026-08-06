"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, DoubleSide, type Group, type MeshBasicMaterial } from "three";
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
    return Array.from({ length: 18 }, () => ({
      x: rng.range(-4.6, 4.6),
      y: rng.range(3.2, 6.4),
      s: rng.range(0.45, 0.85),
      c: PRIZE_COLOURS[rng.int(PRIZE_COLOURS.length)],
    }));
  }, [index]);

  useFrame((state) => {
    // one tube in every arcade is on its way out
    if (!flicker.current) return;
    const t = state.clock.elapsedTime * 9 + index * 4;
    flicker.current.opacity = Math.sin(t) > -0.86 ? 1 : 0.25;
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      {/* booth */}
      <mesh position={[0, 3.6, -1.6]} castShadow receiveShadow>
        <boxGeometry args={[11.5, 7.2, 6]} />
        <meshStandardMaterial color="#26222c" roughness={0.8} />
      </mesh>
      {/* back wall, lit, so the prizes read as silhouettes on it */}
      <mesh position={[0, 4.4, -4.5]}>
        <planeGeometry args={[11, 6.4]} />
        <meshBasicMaterial color="#3a1f4a" toneMapped={false} />
      </mesh>

      {prizes.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, -4.2]} scale={p.s}>
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

      <group ref={cup} position={[0, 9.2, 0]}>
        {/* Tiered dark mahogany / marble base block */}
        <mesh position={[0, -2.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.8, 2.4]} />
          <meshStandardMaterial color="#161210" roughness={0.3} metalness={0.2} />
        </mesh>
        <mesh position={[0, -2.05, 0]} castShadow>
          <cylinderGeometry args={[1.5, 1.7, 0.3, 24]} />
          <meshPhysicalMaterial color="#ffcf48" roughness={0.12} metalness={0.95} clearcoat={1} />
        </mesh>

        {/* Sculpted Turned Stem */}
        <mesh position={[0, -1.5, 0]} castShadow>
          <cylinderGeometry args={[0.45, 0.95, 0.8, 24]} />
          <meshPhysicalMaterial color="#ffcf48" roughness={0.12} metalness={0.95} clearcoat={1} />
        </mesh>
        <mesh position={[0, -0.95, 0]} castShadow>
          <sphereGeometry args={[0.7, 20, 16]} />
          <meshPhysicalMaterial color="#ffd700" roughness={0.1} metalness={0.98} clearcoat={1} />
        </mesh>
        <mesh position={[0, -0.45, 0]} castShadow>
          <cylinderGeometry args={[1.1, 0.5, 0.5, 24]} />
          <meshPhysicalMaterial color="#ffcf48" roughness={0.12} metalness={0.95} clearcoat={1} />
        </mesh>

        {/* Main Chalice / Cup Body */}
        {/* Lower Bowl */}
        <mesh position={[0, 0.1, 0]} rotation={[Math.PI, 0, 0]} castShadow>
          <sphereGeometry args={[1.7, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial color="#ffd700" roughness={0.1} metalness={0.98} clearcoat={1} side={DoubleSide} />
        </mesh>
        {/* Upper Flared Cup Wall */}
        <mesh position={[0, 1.45, 0]} castShadow>
          <cylinderGeometry args={[2.2, 1.7, 2.7, 28, 1, true]} />
          <meshPhysicalMaterial color="#ffd700" roughness={0.1} metalness={0.98} clearcoat={1} side={DoubleSide} />
        </mesh>
        {/* Inner Solid Floor */}
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[1.65, 1.65, 0.08, 24]} />
          <meshPhysicalMaterial color="#e6b800" roughness={0.2} metalness={0.9} />
        </mesh>
        {/* Rolled Golden Lip Rim */}
        <mesh position={[0, 2.8, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[2.2, 0.16, 12, 32]} />
          <meshPhysicalMaterial color="#ffe054" roughness={0.08} metalness={1} clearcoat={1} />
        </mesh>

        {/* Sculpted Ornate Handles (Left & Right) */}
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx * 2.1, 1.35, 0]} rotation={[0, 0, sx * -0.2]}>
            <mesh frustumCulled={false} castShadow>
              <torusGeometry args={[0.95, 0.18, 12, 24, Math.PI * 0.95]} />
              <meshPhysicalMaterial color="#ffd700" roughness={0.1} metalness={0.98} clearcoat={1} />
            </mesh>
          </group>
        ))}

        {/* Top Victory Star / Crown Finial */}
        <group position={[0, 3.4, 0]}>
          <mesh castShadow position={[0, 0.35, 0]} rotation={[0, 0, Math.PI / 4]}>
            <octahedronGeometry args={[0.42, 0]} />
            <meshPhysicalMaterial color="#ffffff" emissive="#ffea78" emissiveIntensity={0.6} roughness={0.1} metalness={0.9} />
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
