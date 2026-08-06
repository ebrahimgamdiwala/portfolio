"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  type Mesh,
  type MeshBasicMaterial,
  type Points,
  type PointsMaterial,
} from "three";
import { glowSprite } from "@/lib/park/textures";
import { Rng } from "@/lib/park/rand";
import { useParkCtx } from "./ParkContext";
import { useQuality } from "./Quality";

/**
 * Air. Dust and embers drifting through the lamp light, and a low bank of fog
 * lying across the ground.
 *
 * Both are anchored to the camera rather than the world, so a park 1.4 km round
 * only ever pays for the couple of hundred metres you can actually see into.
 */

const SPAN = 190;

function Embers() {
  const q = useQuality();
  const { camera } = useThree();
  const { sky } = useParkCtx();
  const points = useRef<Points>(null);
  const mat = useRef<PointsMaterial>(null);
  const count = Math.round(1400 * q.embers);

  const { geometry, drift } = useMemo(() => {
    const rng = new Rng(5150);
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng.spread(SPAN);
      pos[i * 3 + 1] = rng.range(0, 78);
      pos[i * 3 + 2] = rng.spread(SPAN);
      vel[i * 3] = rng.spread(0.9);
      vel[i * 3 + 1] = rng.range(0.4, 2.1);
      vel[i * 3 + 2] = rng.spread(0.9);
      size[i] = rng.range(0.4, 1.5);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    return { geometry: g, drift: vel };
  }, [count]);

  useFrame((_, dt) => {
    const p = points.current;
    if (!p) return;
    const attr = p.geometry.getAttribute("position") as BufferAttribute;
    const arr = attr.array as Float32Array;
    const step = Math.min(dt, 0.05);

    for (let i = 0; i < count; i++) {
      arr[i * 3] += drift[i * 3] * step;
      arr[i * 3 + 1] += drift[i * 3 + 1] * step;
      arr[i * 3 + 2] += drift[i * 3 + 2] * step;
      if (arr[i * 3 + 1] > 82) arr[i * 3 + 1] = 0;
    }
    attr.needsUpdate = true;

    // keep the field wrapped around wherever the rider is
    p.position.set(
      Math.round(camera.position.x / SPAN) * SPAN,
      0,
      Math.round(camera.position.z / SPAN) * SPAN,
    );

    // embers only really show once the sun is off them
    if (mat.current) mat.current.opacity = 0.1 + sky.current.neon * 0.42;
  });

  if (!count) return null;

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        ref={mat}
        map={glowSprite()}
        color="#ffbf7d"
        size={1.5}
        sizeAttenuation
        transparent
        opacity={0.3}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

/** A shallow bank of haze lying on the tarmac. */
function GroundFog() {
  const { camera } = useThree();
  const layers = useRef<(Mesh | null)[]>([]);
  const { sky } = useParkCtx();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    layers.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.position.set(
        camera.position.x + Math.sin(t * 0.05 + i) * 14,
        1.4 + i * 2.4,
        camera.position.z + Math.cos(t * 0.043 + i) * 14,
      );
      mesh.rotation.z = t * 0.012 * (i % 2 ? 1 : -1);
      const m = mesh.material as MeshBasicMaterial;
      m.opacity = (0.035 + sky.current.neon * 0.05) * (1 - i * 0.22);
    });
  });

  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => void (layers.current[i] = el)}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={5}
        >
          <planeGeometry args={[420 - i * 60, 420 - i * 60]} />
          <meshBasicMaterial
            map={glowSprite()}
            color="#9fb0d8"
            transparent
            opacity={0.05}
            depthWrite={false}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function Atmosphere() {
  return (
    <group>
      <Embers />
      <GroundFog />
    </group>
  );
}
