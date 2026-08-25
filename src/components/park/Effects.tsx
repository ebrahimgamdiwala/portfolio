"use client";

import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  Noise,
  SMAA,
  Vignette,
} from "@react-three/postprocessing";
import {
  BlendFunction,
  type DepthOfFieldEffect,
  type EffectComposer as EffectComposerImpl,
} from "postprocessing";
import { Source, Vector2, Vector3, type WebGLRenderTarget } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { isTouchDevice } from "@/lib/explore/touch";
import { useExplore } from "@/lib/explore/store";
import { useParkCtx } from "./ParkContext";
import { useQuality } from "./Quality";

/**
 * Works around a depth-buffer bug in `postprocessing` (6.39.4).
 *
 * The composer keeps a third, "stable" depth target beside its two ping-pong
 * buffers and blits depth into it once a frame, specifically so that no pass
 * ever reads the same depth image it is writing. It builds that third texture
 * with `DepthTexture.clone()` — and a cloned three texture *shares the source
 * object it was cloned from*, while three allocates its GL textures per source.
 * So all three "separate" depth textures are one texture on the GPU, and the
 * blit reads and writes the same image: an INVALID_OPERATION every frame,
 * hundreds a second, with the driver validating and rejecting each one.
 *
 * Giving the stable texture a source of its own is enough to make them genuinely
 * separate. The texture object itself is left alone — passes are handed that
 * reference when they are added, so replacing it would leave them pointing at
 * the old one.
 */
interface ComposerBuffers {
  /** Private in the typings, but the whole point of the workaround. */
  depthRenderTarget?: WebGLRenderTarget | null;
  inputBuffer?: WebGLRenderTarget | null;
}

function unshareDepthTexture(composer: EffectComposerImpl | null): boolean {
  const internals = composer as unknown as ComposerBuffers | null;
  const target = internals?.depthRenderTarget;
  const stable = target?.depthTexture;
  const input = internals?.inputBuffer?.depthTexture;
  if (!target || !stable || !input || stable.source !== input.source) return false;

  stable.source = new Source({ width: target.width, height: target.height, depth: 1 });
  stable.needsUpdate = true;
  // drop the framebuffer so three rebuilds it against the new attachment
  target.dispose();
  return true;
}

/**
 * The lens.
 *
 * Bloom is doing the heavy lifting — a fairground is thousands of small bright
 * points, and it is the halation around them that makes a night shot look
 * photographed. Everything else here is restraint: a whisper of aberration and
 * grain so the frame has some texture, and a vignette to keep the eye centred.
 *
 * On High quality, Depth of Field dynamically tracks camera targets across
 * coaster maneuvers, overview orbits, and explore mode for a dramatic
 * cinematic bokeh and tilt-shift aesthetic.
 */
export function Effects() {
  const q = useQuality();
  const { ride } = useParkCtx();
  const { mode, riding } = useExplore();
  const { camera } = useThree();

  const aberration = useMemo(() => new Vector2(0.00045, 0.0007), []);
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(isTouchDevice()), []);

  const composer = useRef<EffectComposerImpl>(null);
  const dofRef = useRef<DepthOfFieldEffect>(null);

  const currentFocus = useRef({ distance: 120, range: 80, bokeh: 2.8 });
  const fwdVec = useMemo(() => new Vector3(), []);
  const camPos = useMemo(() => new Vector3(), []);
  const targetPos = useMemo(() => new Vector3(), []);

  useFrame((state, dt) => {
    unshareDepthTexture(composer.current);

    if (!q.depthOfField || !dofRef.current) return;

    camera.getWorldPosition(camPos);
    camera.getWorldDirection(fwdVec);

    let targetDist = 120;
    let targetRange = 140;
    let targetBokeh = 2.4;

    if (mode === "ride") {
      const r = ride.current;
      const blend = r.blend; // 0 = orbit landing plate, 1 = onboard ride

      if (blend < 0.35) {
        // Landing plate / Overview: keep the entire fairground crystal sharp,
        // pushing the soft tilt-shift blur far out to the distant horizon
        targetPos.set(0, 15, 0);
        targetDist = camPos.distanceTo(targetPos);
        targetRange = 460;
        targetBokeh = 2.6;
      } else {
        // Coaster ride & cinematic shots:
        const rig = r.rig;
        if (rig === "onboard") {
          // Look well down the track ahead (45m out) with a deep in-focus zone (140m+)
          // so the cockpit, rails, and all oncoming scenery stay razor-sharp
          targetPos.copy(r.pos).addScaledVector(fwdVec, 45);
          targetDist = camPos.distanceTo(targetPos);
          targetRange = 140 + r.rush * 60;
          targetBokeh = 2.2 + r.rush * 0.8;
        } else if (rig === "pyro") {
          // Fireworks camera: focus deep into the sky where fireworks pop
          targetPos.copy(r.pos).addScaledVector(fwdVec, 120);
          targetDist = camPos.distanceTo(targetPos);
          targetRange = 260;
          targetBokeh = 3.2;
        } else {
          // Chase, Flank, Drone, Crane: train and its surrounding grounds stay sharp
          targetDist = camPos.distanceTo(r.pos) + 25;
          targetRange = 160;
          targetBokeh = 2.4;
        }
      }
    } else {
      // Explore mode:
      if (riding) {
        targetDist = 35;
        targetRange = 90;
        targetBokeh = 2.2;
      } else {
        // Walking first person: broad depth zone keeps the midway and stalls sharp
        targetDist = 60;
        targetRange = 130;
        targetBokeh = 2.2;
      }
    }

    // Smoothly lerp focus distance, depth range, and bokeh scale
    const lerpRate = Math.min(1, dt * 5.0);
    currentFocus.current.distance += (targetDist - currentFocus.current.distance) * lerpRate;
    currentFocus.current.range += (targetRange - currentFocus.current.range) * lerpRate;
    currentFocus.current.bokeh += (targetBokeh - currentFocus.current.bokeh) * lerpRate;

    const coc = dofRef.current.cocMaterial;
    if (coc) {
      coc.focusDistance = currentFocus.current.distance;
      coc.focusRange = currentFocus.current.range;
    }
    dofRef.current.bokehScale = currentFocus.current.bokeh;
  });

  return (
    <EffectComposer ref={composer} multisampling={0} enableNormalPass={false}>
      <Bloom
        intensity={1.15}
        luminanceThreshold={0.42}
        luminanceSmoothing={0.28}
        mipmapBlur={!touch}
        radius={0.78}
        height={q.bloomResolution}
      />

      {q.depthOfField ? (
        <DepthOfField
          ref={dofRef}
          focusDistance={currentFocus.current.distance}
          focusRange={currentFocus.current.range}
          bokehScale={currentFocus.current.bokeh}
          resolutionScale={0.75}
        />
      ) : (
        <></>
      )}

      <ChromaticAberration
        offset={aberration}
        radialModulation
        modulationOffset={0.42}
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette offset={0.24} darkness={0.72} eskil={false} />
      <Noise premultiply opacity={0.035} blendFunction={BlendFunction.OVERLAY} />
      <SMAA />
    </EffectComposer>
  );
}
