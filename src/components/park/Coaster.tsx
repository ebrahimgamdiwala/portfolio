"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshStandardMaterial } from "three";
import type { CoasterData } from "@/lib/park/coaster";
import { RAIL_R, SPINE_R } from "@/lib/park/coaster";
import { paintedSteel } from "@/lib/park/textures";
import { Pieces } from "./primitives/Pieces";
import { useQuality } from "./Quality";

const RAIL_SEGMENTS = 2200;
const SPINE_SEGMENTS = 1500;

/**
 * The ride, built the way steel coasters actually are: a box spine carrying two
 * round running rails, webbed together by an alternating V of struts, standing
 * on lattice towers, with a maintenance catwalk down one side.
 *
 * The rails are the one thing in the park with a truly polished finish — with
 * an environment map behind them they pick up the sky and the neon and draw two
 * bright lines through every shot, which is exactly what you want leading the
 * eye through a ride.
 */
export function Coaster({ coaster }: { coaster: CoasterData }) {
  const q = useQuality();
  const steel = paintedSteel(6);
  const chain = useRef<Mesh>(null);

  // the lift chain crawls under the car all the way up the hill
  useFrame((_, dt) => {
    const mat = chain.current?.material as MeshStandardMaterial | undefined;
    if (mat?.map) mat.map.offset.x -= dt * 0.55;
  });

  return (
    <group>
      {/* box spine */}
      <mesh receiveShadow frustumCulled={false}>
        <tubeGeometry args={[coaster.spinePath, SPINE_SEGMENTS, SPINE_R, 4, true]} />
        <meshStandardMaterial color="#20242e" roughness={0.5} metalness={0.85} />
      </mesh>

      {/* running rails */}
      {coaster.railPaths.map((path, i) => (
        <mesh key={i} receiveShadow frustumCulled={false}>
          <tubeGeometry args={[path, RAIL_SEGMENTS, RAIL_R, 8, true]} />
          <meshStandardMaterial color="#cdd6e2" roughness={0.16} metalness={1} />
        </mesh>
      ))}

      {/* maintenance catwalk */}
      <mesh geometry={coaster.catwalk} receiveShadow frustumCulled={false}>
        <meshStandardMaterial
          color="#3d4350"
          roughness={0.82}
          metalness={0.6}
          side={2}
        />
      </mesh>

      {/* the chain on the lift hill */}
      <mesh ref={chain} geometry={coaster.chain} frustumCulled={false}>
        <meshStandardMaterial color="#8b8f99" roughness={0.4} metalness={1} side={2} />
      </mesh>

      {/* webbing between spine and rails */}
      <Pieces pieces={coaster.ties}>
        <meshStandardMaterial
          color="#2a2f3a"
          roughness={0.55}
          metalness={0.8}
          normalMap={steel.normalMap}
          roughnessMap={steel.roughnessMap}
        />
      </Pieces>

      {/* lattice towers down to the tarmac */}
      <Pieces pieces={coaster.supports} castShadow={q.shadows} receiveShadow>
        <meshStandardMaterial
          color="#8d3f4e"
          roughness={0.62}
          metalness={0.5}
          map={steel.map}
          normalMap={steel.normalMap}
          roughnessMap={steel.roughnessMap}
        />
      </Pieces>
    </group>
  );
}
