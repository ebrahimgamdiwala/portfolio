"use client";

import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, PCFSoftShadowMap } from "three";
import { PARK } from "@/lib/park/layout";
import type { ParkWorld } from "@/lib/usePark";
import { Quality } from "./Quality";
import { Scene } from "./Scene";

/**
 * The fixed, full-viewport WebGL layer. Everything above it in the DOM is plain
 * HTML, so the copy stays selectable, accessible and crawlable.
 */
export function ParkCanvas({ world }: { world: ParkWorld | null }) {
  return (
    <div className="fixed inset-0 z-0 h-[100dvh] w-full bg-void">
      <Canvas
        shadows={{ type: PCFSoftShadowMap }}
        dpr={[1, 1.6]}
        gl={{
          // SMAA in the post stack handles edges; MSAA on top of it is wasted
          antialias: false,
          powerPreference: "high-performance",
          alpha: false,
          stencil: false,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.02,
        }}
        camera={{ fov: 34, near: 0.6, far: PARK.far, position: [420, 250, 380] }}
        onCreated={({ gl, scene, camera }) => {
          gl.setClearColor(0x05070a, 1);
          // draw calls, triangles and program count, for profiling
          if (process.env.NODE_ENV === "development") {
            Object.assign(window as never, { __gl: gl, __scene: scene, __cam: camera });
          }
        }}
      >
        {world ? (
          <Quality>
            <Scene world={world} />
          </Quality>
        ) : null}
      </Canvas>
    </div>
  );
}
