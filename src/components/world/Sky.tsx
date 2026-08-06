"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  ShaderMaterial,
} from "three";
import { BIOMES } from "@/lib/world/layout";
import { Atmosphere, makeSkyState, sampleSky, type SkyState } from "@/lib/world/sky";
import { overviewBlend } from "@/lib/scroll/timeline";
import type { TerrainData } from "@/lib/world/terrain";
import { SkyDome } from "./SkyDome";

const SUN_DISTANCE = 640;
const VOID = new Color(0x05070a);

/**
 * Lighting rig, square sun, and the atmosphere.
 *
 * Two things drive the sky: the hour (keyframed against scroll, dawn -> night)
 * and the biome directly under the camera. The landing orbit keeps the pure
 * black void; as the ride drops in, real air fades up around it.
 */
export function Sky({
  progress,
  terrain,
  onState,
}: {
  progress: React.RefObject<number>;
  terrain: TerrainData;
  onState?: (s: SkyState) => void;
}) {
  const state = useMemo(makeSkyState, []);
  const air = useMemo(() => new Atmosphere(), []);
  const dome = useRef<ShaderMaterial | null>(null);

  const dir = useRef<DirectionalLight>(null);
  const amb = useRef<AmbientLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const sunMesh = useRef<Mesh>(null);
  const moonMesh = useRef<Mesh>(null);
  const { scene, camera } = useThree();

  const fog = useMemo(() => new FogExp2(0x0a0e14, 0.002), []);

  useFrame((_, dt) => {
    const p = progress.current ?? 0;
    sampleSky(p, state);

    // the air belongs to whatever is under the rider right now
    const biome = terrain.biomeAt(camera.position.x, camera.position.z);
    air.update(biome, state, Math.min(dt, 0.1));

    const inWorld = overviewBlend(p);

    if (dir.current) {
      dir.current.position.copy(state.sun).multiplyScalar(260);
      dir.current.color.copy(state.sunColor);
      dir.current.intensity = state.sunIntensity;
    }
    if (amb.current) {
      amb.current.color.copy(state.ambient);
      amb.current.intensity = state.ambientIntensity;
    }
    if (hemi.current) {
      hemi.current.color.copy(state.hemiSky);
      hemi.current.groundColor.copy(state.hemiGround);
      hemi.current.intensity = state.hemiIntensity;
    }
    if (sunMesh.current) {
      sunMesh.current.position.copy(state.sun).multiplyScalar(SUN_DISTANCE);
      (sunMesh.current.material as MeshBasicMaterial).color.copy(state.sunColor);
      sunMesh.current.lookAt(camera.position);
      sunMesh.current.visible = state.sun.y > -0.1;
    }
    if (moonMesh.current) {
      moonMesh.current.position.copy(state.sun).multiplyScalar(-SUN_DISTANCE);
      moonMesh.current.lookAt(camera.position);
      moonMesh.current.visible = state.night > 0.25;
    }

    if (dome.current) {
      const u = dome.current.uniforms;
      (u.uTop.value as Color).copy(state.skyTop);
      (u.uHorizon.value as Color).copy(state.skyHorizon);
      (u.uSunColor.value as Color).copy(state.sunColor);
      u.uSunDir.value.copy(state.sun);
      u.uVoidMix.value = 1 - inWorld;
    }

    // fog fades in with the sky so the overview stays crisp and weightless
    fog.color.copy(state.fog).lerp(VOID, 1 - inWorld);
    fog.density = state.fogDensity * inWorld;
    scene.fog = fog;

    onState?.(state);
  });

  const volcano = BIOMES.volcano.center;

  return (
    <group>
      <SkyDome handle={dome} />

      <ambientLight ref={amb} />
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={dir}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-130}
        shadow-camera-right={130}
        shadow-camera-top={130}
        shadow-camera-bottom={-130}
        shadow-camera-near={1}
        shadow-camera-far={620}
        shadow-bias={-0.0012}
        shadow-normalBias={0.6}
      />

      {/* the square sun */}
      <mesh ref={sunMesh} frustumCulled={false}>
        <planeGeometry args={[46, 46]} />
        <meshBasicMaterial toneMapped={false} fog={false} />
      </mesh>

      {/* and its counterpart */}
      <mesh ref={moonMesh} frustumCulled={false}>
        <planeGeometry args={[26, 26]} />
        <meshBasicMaterial color={0xdfe8ff} toneMapped={false} fog={false} />
      </mesh>

      {/* the caldera never goes dark */}
      <VolcanoGlow x={volcano[0]} z={volcano[1]} />
    </group>
  );
}

function VolcanoGlow({ x, z }: { x: number; z: number }) {
  const light = useRef<PointLight>(null);
  useFrame((s) => {
    if (!light.current) return;
    const t = s.clock.elapsedTime;
    light.current.intensity = 900 + Math.sin(t * 1.6) * 260 + Math.sin(t * 4.3) * 90;
  });
  return (
    <pointLight
      ref={light}
      position={[x, 62, z]}
      color={0xff6a1a}
      distance={190}
      decay={1.9}
    />
  );
}
