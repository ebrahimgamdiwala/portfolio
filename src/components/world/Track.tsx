"use client";

import type { TrackData } from "@/lib/world/track";
import { PieceBatch } from "./primitives/VoxelBatch";

const RAIL_SEGMENTS = 1600;
const SPINE_SEGMENTS = 1100;

/**
 * The ride, built like a real steel coaster: a square-ish box spine carrying
 * two round running rails, webbed together and stood on lattice towers.
 * Rails are swept tubes (not stacked cubes) so they read as continuous metal
 * from any distance — the one place the voxel rule is deliberately broken.
 */
export function Track({ track }: { track: TrackData }) {
  return (
    <group>
      {/* box spine */}
      <mesh castShadow receiveShadow frustumCulled={false}>
        <tubeGeometry args={[track.spinePath, SPINE_SEGMENTS, 0.42, 4, false]} />
        <meshStandardMaterial color={0x2b3240} roughness={0.55} metalness={0.75} />
      </mesh>

      {/* running rails */}
      {track.railPaths.map((path, i) => (
        <mesh key={i} castShadow receiveShadow frustumCulled={false}>
          <tubeGeometry args={[path, RAIL_SEGMENTS, 0.17, 8, false]} />
          <meshStandardMaterial
            color={0xd6dee8}
            roughness={0.22}
            metalness={0.95}
            emissive={0x9fd0ff}
            emissiveIntensity={0.06}
          />
        </mesh>
      ))}

      {/* webbing between spine and rails */}
      <PieceBatch pieces={track.ties} />

      {/* lattice towers down to the ground */}
      <PieceBatch pieces={track.supports} />
    </group>
  );
}
