"use client";

import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, PCFSoftShadowMap } from "three";
import type { World } from "@/lib/useWorld";
import { Scene } from "./Scene";

/**
 * The fixed, full-viewport WebGL layer. Everything above it in the DOM is
 * plain HTML so the copy stays selectable, accessible and crawlable.
 */
export function WorldCanvas({ world }: { world: World | null }) {
  return (
    <div className="fixed inset-0 z-0 h-[100dvh] w-full bg-void">
      <Canvas
        shadows={{ type: PCFSoftShadowMap }}
        dpr={[1, 1.65]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          alpha: false,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        camera={{ fov: 38, near: 0.5, far: 1400, position: [0, 212, 330] }}
        onCreated={({ gl }) => gl.setClearColor(0x05070a, 1)}
      >
        {world ? <Scene world={world} /> : null}
      </Canvas>
    </div>
  );
}
