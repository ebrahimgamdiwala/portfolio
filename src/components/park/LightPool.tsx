"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { PointLight } from "three";
import type { LightSource } from "@/lib/park/lights";
import { useParkCtx } from "./ParkContext";
import { useQuality } from "./Quality";

/**
 * A fixed pool of real point lights, reassigned every frame to whichever of the
 * park's ~80 practical light positions are nearest the camera.
 *
 * Each light three has to shade costs every fragment in the scene, so the count
 * is a hard budget rather than a preference. Keeping it small and moving them
 * about is invisible in practice — you cannot tell that the wheel two hundred
 * metres behind you stopped casting light, but you would certainly notice the
 * frame rate if it hadn't.
 *
 * The size of the pool is fixed for the session (`lightPool` in Quality.tsx)
 * rather than following the live tier: the count is part of three's shader
 * program cache key, so changing it recompiles every material in the park.
 */
export function LightPool({ sources }: { sources: LightSource[] }) {
  const { camera } = useThree();
  const q = useQuality();
  const { sky } = useParkCtx();
  const lights = useRef<(PointLight | null)[]>([]);
  const count = q.lightPool;

  // scratch, reused: an allocation per frame here would be per-light garbage
  const order = useMemo(
    () => sources.map((_, i) => ({ i, d: 0 })),
    [sources],
  );

  useFrame(() => {
    const cam = camera.position;
    for (const o of order) {
      const p = sources[o.i].pos;
      const dx = p.x - cam.x;
      const dy = p.y - cam.y;
      const dz = p.z - cam.z;
      o.d = dx * dx + dy * dy + dz * dz;
    }
    order.sort((a, b) => a.d - b.d);

    // the park's practicals come up as the sun goes down
    const gain = 0.25 + sky.current.neon * 0.85;

    for (let k = 0; k < count; k++) {
      const light = lights.current[k];
      if (!light) continue;
      const src = sources[order[k]?.i];
      if (!src) {
        light.intensity = 0;
        continue;
      }
      light.position.copy(src.pos);
      light.color.copy(src.color);
      light.distance = src.distance;
      light.intensity = src.intensity * gain;
    }
  });

  return (
    <group>
      {Array.from({ length: count }, (_, k) => (
        <pointLight
          key={k}
          ref={(el) => void (lights.current[k] = el)}
          intensity={0}
          decay={2}
          castShadow={false}
        />
      ))}
    </group>
  );
}
