"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import { posterTexture } from "@/lib/park/poster";
import { BOARD_H, BOARD_W, type Hoarding } from "@/lib/park/signage";
import { beam, box, placer } from "@/lib/park/build";
import type { Piece } from "@/lib/park/coaster";
import { paintedSteel } from "@/lib/park/textures";
import { Pieces } from "./primitives/Pieces";
import { useParkCtx } from "./ParkContext";

/**
 * THE AD HOARDINGS.
 *
 * Each board is a poster painted straight out of `park.json` (see
 * `lib/park/poster.ts`), hung on a real steel gantry beside the rails and lit
 * from below by a rank of floodlights. They are planted on the *approach* to
 * the chapter they advertise, so they swing into frame, hold, and sweep past
 * exactly the way hoardings do from a moving car.
 *
 * All the ironwork across every board is batched into two instanced meshes;
 * only the board faces themselves are individual draws, because each one
 * carries its own texture.
 */

/** Floodlight positions along the bottom rail, in board widths. */
const LAMPS = [-0.32, 0, 0.32];

function structure(h: Hoarding): { frame: Piece[]; lamps: Piece[] } {
  const at = placer(h.position[0], h.position[1], h.position[2], h.rotationY);
  const frame: Piece[] = [];
  const lamps: Piece[] = [];

  const hw = BOARD_W / 2;
  const hh = BOARD_H / 2;
  const ground = -h.position[1];

  // face frame
  frame.push(beam(at(-hw - 0.5, hh + 0.5, 0), at(hw + 0.5, hh + 0.5, 0), 0.85, 0.5));
  frame.push(beam(at(-hw - 0.5, -hh - 0.5, 0), at(hw + 0.5, -hh - 0.5, 0), 0.85, 0.5));
  frame.push(beam(at(-hw - 0.5, -hh, 0), at(-hw - 0.5, hh, 0), 0.6, 0.5));
  frame.push(beam(at(hw + 0.5, -hh, 0), at(hw + 0.5, hh, 0), 0.6, 0.5));

  // back bracing — the lattice you always see behind a real hoarding
  for (const sx of [-1, 1]) {
    frame.push(beam(at(sx * hw * 0.62, -hh, -1.3), at(sx * hw * 0.62, hh, -1.3), 0.4));
    frame.push(beam(at(-hw, -hh * 0.7, -1.3), at(hw, hh * 0.7, -1.3), 0.26));
    frame.push(beam(at(-hw, hh * 0.7, -1.3), at(hw, -hh * 0.7, -1.3), 0.26));
  }
  frame.push(beam(at(-hw, 0, -1.3), at(hw, 0, -1.3), 0.3));

  // legs down to the tarmac, splayed back
  for (const sx of [-1, 1]) {
    const top = at(sx * hw * 0.55, -hh, -0.4);
    const foot = at(sx * hw * 0.62, ground, -3.4);
    frame.push(beam(top, foot, 1.0));
    // kicker brace
    frame.push(beam(at(sx * hw * 0.55, -hh + 2.4, -0.4), at(sx * hw * 0.9, ground, 2.2), 0.42));
    frame.push(box(foot.x, 0.4, foot.z, 3.0, 0.8, 3.0, h.rotationY));
  }
  // cross-tie between the legs
  frame.push(
    beam(at(-hw * 0.58, ground + hh * 0.5, -1.9), at(hw * 0.58, ground + hh * 0.5, -1.9), 0.34),
  );

  // floodlight gantry
  frame.push(beam(at(-hw * 0.5, -hh - 1.9, 2.4), at(hw * 0.5, -hh - 1.9, 2.4), 0.26));
  for (const f of LAMPS) {
    frame.push(beam(at(f * BOARD_W, -hh - 0.4, 0.3), at(f * BOARD_W, -hh - 1.9, 2.4), 0.22));
  }

  return { frame, lamps };
}

/** One board face, plus its lamp heads and the cones of light they throw. */
function Board({ h }: { h: Hoarding }) {
  const tex = useMemo(() => posterTexture(h.poster, h.accent), [h]);
  const face = useRef<MeshStandardMaterial>(null);
  const beams = useRef<(MeshBasicMaterial | null)[]>([]);
  const { sky } = useParkCtx();

  useFrame(() => {
    // lit by the sun at golden hour, by their own floods at night — the
    // crossfade is the park switching on around you
    const neon = sky.current.neon;
    if (face.current) face.current.emissiveIntensity = 0.18 + neon * 1.05;
    for (const m of beams.current) if (m) m.opacity = neon * 0.13;
  });

  const hh = BOARD_H / 2;

  return (
    <group position={h.position} rotation={[0, h.rotationY, 0]}>
      <mesh castShadow receiveShadow>
        <planeGeometry args={[BOARD_W, BOARD_H]} />
        <meshStandardMaterial
          ref={face}
          map={tex}
          emissiveMap={tex}
          emissive="#ffffff"
          emissiveIntensity={0.4}
          roughness={0.62}
          metalness={0.05}
        />
      </mesh>

      {/* The back of the board. Without it the face — a single-sided plane —
          vanishes from behind and the hoarding reads as an empty frame, which
          is exactly what a hoarding approached from the wrong side should not
          do. Real ones are a painted steel tray. */}
      <mesh position={[0, 0, -0.22]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[BOARD_W + 0.6, BOARD_H + 0.6]} />
        <meshStandardMaterial color="#23262e" roughness={0.82} metalness={0.45} />
      </mesh>

      {LAMPS.map((f, i) => (
        <group key={f} position={[f * BOARD_W, -hh - 1.9, 2.4]}>
          {/* lamp head */}
          <mesh rotation={[-1.15, 0, 0]}>
            <cylinderGeometry args={[0.62, 0.34, 0.9, 12, 1, true]} />
            <meshStandardMaterial color="#22262e" roughness={0.6} metalness={0.7} side={2} />
          </mesh>
          <mesh position={[0, 0.28, -0.12]}>
            <sphereGeometry args={[0.34, 10, 8]} />
            <meshBasicMaterial color="#fff0cf" toneMapped={false} />
          </mesh>
          {/* The shaft of light. Narrow, and stopped well short of the face —
              a wide cone aimed at the board punches straight through it, and a
              beam cutting across its own poster is worse than no beam. */}
          <mesh position={[0, 4.6, -0.4]} rotation={[Math.PI - 0.1, 0, 0]}>
            <coneGeometry args={[1.25, 9, 12, 1, true]} />
            <meshBasicMaterial
              ref={(m) => void (beams.current[i] = m)}
              color="#ffe6bb"
              transparent
              opacity={0}
              depthWrite={false}
              blending={AdditiveBlending}
              side={2}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Hoardings({ hoardings }: { hoardings: Hoarding[] }) {
  const steel = paintedSteel(6);
  const frames = useMemo(() => hoardings.flatMap((h) => structure(h).frame), [hoardings]);

  return (
    <group>
      <Pieces pieces={frames} receiveShadow>
        <meshStandardMaterial
          color="#4a4f5c"
          roughness={0.68}
          metalness={0.62}
          map={steel.map}
          normalMap={steel.normalMap}
          roughnessMap={steel.roughnessMap}
        />
      </Pieces>

      {hoardings.map((h) => (
        <Board key={h.key} h={h} />
      ))}
    </group>
  );
}
