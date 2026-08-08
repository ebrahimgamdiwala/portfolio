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
import { BlendFunction } from "postprocessing";
import { Vector2 } from "three";
import { useEffect, useMemo, useState } from "react";
import { isTouchDevice } from "@/lib/explore/touch";
import { useQuality } from "./Quality";

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

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
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
