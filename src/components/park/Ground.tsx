"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { MeshBasicMaterial } from "three";
import { MeshReflectorMaterial } from "@react-three/drei";
import {
  asphalt,
  concrete,
  grass,
  outfieldFade,
  planks,
  radialFade,
  type Surface,
} from "@/lib/park/textures";
import { PARK, ZONES } from "@/lib/park/layout";
import { MAP_SPAN, parkMap } from "@/lib/park/parkMap";
import { useParkCtx } from "./ParkContext";
import { useQuality } from "./Quality";
import { markUnique } from "@/lib/park/materials";

/**
 * The floor of the park, and the single biggest contributor to the whole thing
 * reading as photographed.
 *
 * The tarmac's roughness map has large soft puddles baked into it that fall to
 * near-zero roughness, so every bulb, sign and firework above smears down into
 * the ground. On the top tier that is a genuine planar reflection; below it the
 * environment map alone still gives the puddles a wet sheen.
 */

const SURFACES: Record<string, () => Surface> = {
  asphalt: () => asphalt(300),
  concrete: () => concrete(9),
  grass: () => grass(52),
  planks: () => planks(7),
};

function Patch({ zone }: { zone: (typeof ZONES)[keyof typeof ZONES] }) {
  // the base plane is already tarmac; only the zones that differ need a patch
  if (zone.ground === "asphalt") return null;
  const s = SURFACES[zone.ground]();

  return (
    <mesh
      position={[zone.x, 0.04, zone.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      renderOrder={1}
    >
      <circleGeometry args={[zone.r, 64]} />
      {/* Feathered rather than cut: a hard disc of grass stamped on tarmac is
          the fastest way to make a ground plane look like a texture atlas. */}
      <meshStandardMaterial
        map={s.map}
        normalMap={s.normalMap}
        roughnessMap={s.roughnessMap}
        alphaMap={radialFade()}
        transparent
        depthWrite={false}
        normalScale={[0.55, 0.55]}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

export function Ground() {
  const q = useQuality();
  const tar = asphalt(300);
  const outfield = useRef<MeshBasicMaterial>(null);
  const { sky } = useParkCtx();

  // the far ground takes the sky's own horizon colour, so the fade is invisible
  useFrame(() => {
    if (outfield.current) outfield.current.color.copy(sky.current.fog);
  });
  const size = PARK.extent * 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        {q.reflections ? (
          <MeshReflectorMaterial
            resolution={256}
            mixBlur={1}
            mixStrength={2.2}
            blur={[520, 160]}
            depthScale={1.1}
            minDepthThreshold={0.3}
            maxDepthThreshold={1.3}
            mirror={0.55}
            map={tar.map}
            normalMap={tar.normalMap}
            roughnessMap={tar.roughnessMap}
            normalScale={[0.7, 0.7]}
            metalness={0.35}
          />
        ) : (
          <meshStandardMaterial
            map={tar.map}
            normalMap={tar.normalMap}
            roughnessMap={tar.roughnessMap}
            normalScale={[0.5, 0.5]}
            metalness={0.28}
          />
        )}
      </mesh>

      {Object.values(ZONES).map((z) => (
        <Patch key={z.id} zone={z} />
      ))}

      {/* Everything past the park's edge sinks into the haze. Open ground a
          kilometre out has nothing to say, and asking a tiled surface to hold
          up at that range is what produces the repeating swell. */}
      <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial
          ref={(m) => void (outfield.current = markUnique(m))}
          color="#0a0b16"
          alphaMap={outfieldFade()}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* The park's own surface: one sheet, stretched once, never repeating —
          walkways, pads and macro wear laid over the tiled tarmac. This is what
          stops the ground reading as a texture and starts it reading as a place
          somebody laid out. */}
      <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow renderOrder={2}>
        <planeGeometry args={[MAP_SPAN, MAP_SPAN]} />
        <meshStandardMaterial
          map={parkMap()}
          transparent
          depthWrite={false}
          roughness={0.86}
          metalness={0.06}
          polygonOffset
          polygonOffsetFactor={-4}
        />
      </mesh>
    </group>
  );
}
