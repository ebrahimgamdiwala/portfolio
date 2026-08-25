"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  FogExp2,
  WebGLRenderTarget,
  type AmbientLight,
  type DirectionalLight,
  type HemisphereLight,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import { PARK } from "@/lib/park/layout";
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
  /** Frames drawn since the warm-up finished; null once the loader is released. */
  const settle = useRef<number | null>(null);

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
    let cancelled = false;

    const id = window.setTimeout(async () => {
      const s = shareMaterials(scene);
      if (process.env.NODE_ENV === "development") {
        console.log(`[PROFILE] shareMaterials ${s.before} -> ${s.after} over ${s.meshes} meshes`);
      }

      // 1. Upload every texture. Compiling a program does not touch the maps it
      //    samples: a canvas texture is uploaded and mipmapped the first time
      //    something actually draws with it, which without this is somewhere out
      //    on the track.
      const seen = new Set<Texture>();
      scene.traverse((o) => {
        const m = (o as Mesh).material;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
          for (const v of Object.values(mat)) {
            const tex = v as Texture | null;
            if (tex?.isTexture && !seen.has(tex)) {
              seen.add(tex);
              gl.initTexture(tex);
            }
          }
        }
      });

      // 2. Compile every program — and *wait* for it. `compile()` only starts
      //    the work: with KHR_parallel_shader_compile the driver links on its
      //    own threads and returns immediately, so the loader would lift while
      //    programs were still linking and the first draw needing one would
      //    block. `compileAsync` resolves only once they all report ready.
      //
      //    Two details decide whether the programs built here are the ones the
      //    ride actually uses:
      //
      //    · Colour space. Three keys a program on the colour space it is
      //      writing into, and that comes from the bound render target, not the
      //      canvas. `Effects` is always mounted, so the park is always drawn
      //      into the composer's target in linear space — compiling against the
      //      canvas would build a set of sRGB programs nothing ever draws with,
      //      and every material would still compile for real on first sight.
      //      Binding any target puts the compiler in the same space the
      //      composer renders in.
      //
      //    · Shadows. The sun stops casting once it drops under the horizon
      //      (see the frame loop below), about a quarter of the way in, and the
      //      count of shadow-casting lights is in that key too — so that single
      //      flip asks every material in the park for a fresh program, mid-ride.
      //      Building both states now turns it into a cache hit.
      //
      //    `compileAsync` reads the scene synchronously before it starts
      //    awaiting, so each pass is set up immediately before its call: frames
      //    keep running in between and put these back as they were.
      const light = sun.current;
      const warmTarget = new WebGLRenderTarget(1, 1);
      gl.setRenderTarget(warmTarget);

      for (const casting of [true, false]) {
        if (light) light.castShadow = casting;
        await gl.compileAsync(scene, camera);
        if (cancelled) {
          gl.setRenderTarget(null);
          warmTarget.dispose();
          return;
        }
      }

      // 3. Build the shadow *depth* programs too. Those are a separate set the
      //    shadow pass compiles lazily, and the shadow box travels with the
      //    rider — so fresh casters entering it compile mid-ride. One pass with
      //    the box opened out over the whole park builds them all now, under
      //    the loader, which is opaque.
      //
      //    The shadow pass only draws what it can see, so anything hidden right
      //    now is shown for this one frame — chiefly the train, which is parked
      //    and invisible until the ride starts and would otherwise compile a
      //    depth program per car material on the first scroll.
      const hidden: Object3D[] = [];
      scene.traverse((o) => {
        if (!o.visible) hidden.push(o);
      });
      for (const o of hidden) o.visible = true;

      if (light) {
        light.castShadow = true;

        const cam = light.shadow.camera;
        const keep = {
          left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom,
          near: cam.near, far: cam.far,
        };
        const r = PARK.fenceRadius + 40;
        cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
        cam.near = 1; cam.far = 1600;
        cam.updateProjectionMatrix();
        gl.shadowMap.needsUpdate = true;
        gl.render(scene, camera);

        cam.left = keep.left; cam.right = keep.right;
        cam.top = keep.top; cam.bottom = keep.bottom;
        cam.near = keep.near; cam.far = keep.far;
        cam.updateProjectionMatrix();
        gl.shadowMap.needsUpdate = true;
      }

      // hand the renderer back to the frame loop, which owns it from here
      for (const o of hidden) o.visible = false;
      gl.setRenderTarget(null);
      warmTarget.dispose();

      // 4. Let the real thing draw a few frames before lifting the loader.
      //    Everything above compiles against a stand-in target; the composer
      //    has its own, and the handful of programs that only its exact setup
      //    asks for are cheaper to pay for here, under the loader, than one
      //    second later with the park already on screen.
      settle.current = 0;
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
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

    // A few real composer frames under the loader, then release it.
    if (settle.current !== null && ++settle.current > 3) {
      settle.current = null;
      boot.compiled();
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
