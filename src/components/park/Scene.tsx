"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { FogExp2, type AmbientLight, type DirectionalLight, type HemisphereLight } from "three";
import { park } from "@/lib/content";
import { useExplore } from "@/lib/explore/store";
import { useScroll } from "@/lib/scroll/ScrollProvider";
import type { ParkWorld } from "@/lib/usePark";
import { EnvRig } from "@/lib/park/env";
import { buildLights } from "@/lib/park/lights";
import { makeRideState } from "@/lib/park/ride";
import { makeSkyState, sampleSky } from "@/lib/park/sky";
import { applyAnisotropy } from "@/lib/park/textures";
import { shareMaterials } from "@/lib/park/materials";
import { boot, useStagedMount } from "@/lib/park/boot";
import { ParkProvider } from "./ParkContext";
import { RideCamera } from "./RideCamera";
import { ExploreCamera } from "./ExploreCamera";
import { Markers } from "./Markers";
import { Sky } from "./Sky";
import { Ground } from "./Ground";
import { Distance } from "./Distance";
import { Coaster } from "./Coaster";
import { SplashTunnel } from "./SplashTunnel";
import { Train } from "./Train";
import { Hoardings } from "./Hoardings";
import { Attractions } from "./Attractions";
import { Funfair } from "./Funfair";
import { Midway } from "./Midway";
import { Structures } from "./Structures";
import { Props } from "./Props";
import { Atmosphere } from "./Atmosphere";
import { Fireworks } from "./Fireworks";
import { LightPool } from "./LightPool";
import { Effects } from "./Effects";
import { useQuality } from "./Quality";

/**
 * Assembly, and the light rig.
 *
 * `RideCamera` is mounted first on purpose: it is the frame's authority on
 * where the train is, and everything downstream reads the state it writes.
 */
export function Scene({ world }: { world: ParkWorld }) {
  const { coaster, hoardings, props, progressToTau } = world;
  const { eased } = useScroll();
  const { gl, scene, camera } = useThree();
  const q = useQuality();
  const { mode } = useExplore();

  // The park mounts a stage per painted frame — see lib/park/boot.ts.
  const stage = useStagedMount(8);

  const ride = useRef(makeRideState());
  const sky = useRef(makeSkyState());
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const spill = useRef<AmbientLight>(null);

  const fog = useMemo(() => new FogExp2(0x0b0f22, 0.0018), []);
  const envRig = useMemo(() => new EnvRig(gl), [gl]);
  const lights = useMemo(() => buildLights(hoardings), [hoardings]);
  const ctx = useMemo(() => ({ ride, sky, world }), [world]);
  const lastEnv = useRef({ p: -1, at: 0 });

  useEffect(() => {
    scene.fog = fog;
    applyAnisotropy(gl.capabilities.getMaxAnisotropy());
    return () => {
      scene.fog = null;
      envRig.dispose();
    };
  }, [scene, fog, gl, envRig]);

  // Collapse duplicate materials once the tree has mounted. Run after a tick
  // so every child has created its own before we look. Re-run on mode changes,
  // since explore mode mounts markers that were not there before.
  useEffect(() => {
    if (stage < 8) return;
    const id = window.setTimeout(() => {
      const s = shareMaterials(scene);
      if (process.env.NODE_ENV === "development") {
        console.log(`[PROFILE] shareMaterials ${s.before} -> ${s.after} over ${s.meshes} meshes`);
      }
      // Force every program to compile now, while the loader is still up,
      // instead of on the first real draw call each one gets — which for
      // anything outside the boot camera's view would otherwise land on the
      // first scroll. Same reasoning on mode changes: explore mode mounts
      // markers nothing has drawn yet.
      gl.compile(scene, camera);
      boot.compiled();
    }, 0);
    return () => window.clearTimeout(id);
  }, [scene, mode, stage, gl, camera]);

  useFrame((state) => {
    const p = eased.current;
    const s = sampleSky(p, sky.current);

    // Pull the fog toward the sky's own horizon band. Fog that does not match
    // what the dome is painting behind it leaves a hard line where the ground
    // ends, which is the one thing that instantly gives away a finite world.
    fog.color.copy(s.fog).lerp(s.haze, 0.3);
    // Thin: it only has to swallow the last few hundred metres before the
    // ground plane runs out. Any denser and the whole park reads as a dust
    // storm rather than an evening.
    fog.density = 0.00042 + s.neon * 0.00042;
    gl.toneMappingExposure = s.exposure;

    if (sun.current) {
      // keep the shadow box travelling with the rider, or a 1.4 km circuit
      // would spend its entire budget on tarmac nobody is looking at
      sun.current.position.copy(s.dir).multiplyScalar(320).add(ride.current.pos);
      sun.current.target.position.copy(ride.current.pos);
      sun.current.target.updateMatrixWorld();
      sun.current.color.copy(s.sun);
      sun.current.intensity = s.sunI;
      // Shadows only exist while there is a sun to cast them. Once it is under
      // the horizon the map is pure cost, and switching it off buys back the
      // whole depth pass for four fifths of the ride.
      sun.current.castShadow = q.shadows && s.dir.y > 0.015;
    }
    if (hemi.current) {
      hemi.current.color.copy(s.sky);
      hemi.current.groundColor.copy(s.haze);
      hemi.current.intensity = s.ambI;
    }
    if (spill.current) {
      // The park lighting itself up. Eight pooled point lights cannot fill a
      // space this size, and without a warm bed under everything the whole
      // fairground reads as unlit geometry once the sun has gone.
      spill.current.intensity = 0.16 + s.neon * 0.62;
    }

    // Prefiltering is milliseconds, not microseconds. Rebuild only when the sky
    // has genuinely moved, and never more than a couple of times a second.
    const now = state.clock.elapsedTime;
    if (Math.abs(p - lastEnv.current.p) > 0.05 && now - lastEnv.current.at > 0.4) {
      lastEnv.current = { p, at: now };
      scene.environment = envRig.build(s);
      scene.environmentIntensity = 0.8;
    }
  });

  return (
    <ParkProvider value={ctx}>
      {/* Exactly one of these drives the camera. RideCamera stays mounted while
          exploring because it is also what keeps `ride` — and therefore the
          train — up to date; it simply stops touching the lens. */}
      <RideCamera
        coaster={coaster}
        progressToTau={progressToTau}
        ride={ride}
        driving={mode === "ride"}
      />
      {mode === "explore" && <ExploreCamera />}
      <Markers />

      <hemisphereLight ref={hemi} intensity={0.5} />
      <ambientLight ref={spill} color="#ffb98a" intensity={0.2} />
      <directionalLight
        ref={sun}
        castShadow={q.shadows}
        intensity={2}
        shadow-mapSize={[q.shadowMap, q.shadowMap]}
        shadow-camera-near={40}
        shadow-camera-far={620}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
        shadow-bias={-0.0006}
        shadow-normalBias={0.06}
      />
      <LightPool sources={lights} />

      <Sky sky={sky} />
      {stage > 0 && <Ground />}
      {stage > 1 && <Distance />}

      {stage > 2 && (
        <>
          <Coaster coaster={coaster} />
          <SplashTunnel
            coaster={coaster}
            from={(coaster.stationU[park.splash.station] ?? 0.6) + park.splash.offset}
            length={park.splash.length}
          />
          <Train coaster={coaster} ride={ride} />
        </>
      )}

      {stage > 3 && <Structures coaster={coaster} />}
      {stage > 4 && <Attractions />}
      {stage > 5 && <Funfair />}
      {stage > 6 && (
        <>
          <Midway />
          <Hoardings hoardings={hoardings} />
        </>
      )}
      {stage > 7 && (
        <>
          <Props set={props} />
          <Atmosphere />
          <Fireworks />
        </>
      )}

      <Effects />
    </ParkProvider>
  );
}
