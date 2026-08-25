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
import { BlendFunction, type EffectComposer as EffectComposerImpl } from "postprocessing";
import { Source, Vector2, type WebGLRenderTarget } from "three";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { isTouchDevice } from "@/lib/explore/touch";
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
 */
export function Effects() {
  const q = useQuality();
  const aberration = useMemo(() => new Vector2(0.00045, 0.0007), []);
  // Bloom's mip-pyramid downsample/upsample chain rounds oddly against some
  // mobile GPUs' non-power-of-two viewport heights, leaving a hard seam
  // across the frame where two mip levels don't quite line up. The plain
  // (non-mipmap) blur costs a little more but never does that.
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(isTouchDevice()), []);

  // Checked every frame rather than once on mount. The composer builds its
  // depth target lazily — the first time a pass asks for depth — and builds it
  // again whenever the pass list is rebuilt, which happens on every tier
  // change. A one-off patch gets quietly undone by the next rebuild. The guard
  // below is three property reads and a comparison, so this is cheap enough to
  // simply keep true.
  const composer = useRef<EffectComposerImpl>(null);
  useFrame(() => unshareDepthTexture(composer.current));

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
          focusDistance={0.035}
          focalLength={0.09}
          bokehScale={2.6}
          height={480}
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
