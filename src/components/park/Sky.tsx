"use client";

import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { applySky, makeSkyMaterial, type SkyState } from "@/lib/park/sky";

/**
 * The dome. Rides with the camera so it can never be reached, and draws first
 * with no depth write so everything else sits in front of it.
 */
export function Sky({ sky }: { sky: MutableRefObject<SkyState> }) {
  const { material, uniforms } = useMemo(() => makeSkyMaterial(), []);
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    applySky(uniforms, sky.current, state.clock.elapsedTime);
    ref.current?.position.copy(state.camera.position);
  });

  return (
    <mesh ref={ref} material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[3400, 48, 32]} />
    </mesh>
  );
}
