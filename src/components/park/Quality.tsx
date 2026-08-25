"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useBoot } from "@/lib/park/boot";

export type Tier = "high" | "medium" | "low";

/**
 * How many real point lights the pool carries. Chosen once from the opening
 * tier and then frozen for the session — see `lightPool` below.
 */
const POOL = { high: 8, medium: 6, low: 4 } as const;

export interface QualitySettings {
  tier: Tier;
  /** Screen-space reflections off the wet ground. The first thing to go. */
  reflections: boolean;
  depthOfField: boolean;
  shadows: boolean;
  shadowMap: number;
  bloomResolution: number;
  crowd: number;
  embers: number;
  /**
   * Size of the practical light pool. Deliberately NOT derived from the live
   * tier: three folds the number of point lights into its shader program cache
   * key, so changing the count invalidates the program of every material in the
   * park at once and recompiles all of them mid-ride. Freezing it means a
   * downgrade can shed shadows, depth of field and crowd — none of which
   * recompile anything — while the lighting stays exactly as it was.
   */
  lightPool: number;
  /** Honour the user's reduced-motion preference for shake and pyro. */
  calm: boolean;
}

const SETTINGS: Record<Tier, Omit<QualitySettings, "tier" | "calm" | "lightPool">> = {
  high: {
    reflections: true,
    depthOfField: true,
    shadows: true,
    shadowMap: 2048,
    bloomResolution: 512,
    crowd: 1,
    embers: 1,
  },
  medium: {
    reflections: false,
    depthOfField: false,
    shadows: true,
    shadowMap: 1024,
    bloomResolution: 256,
    crowd: 0.6,
    embers: 0.6,
  },
  low: {
    reflections: false,
    depthOfField: false,
    shadows: false,
    shadowMap: 512,
    bloomResolution: 256,
    crowd: 0.45,
    embers: 0.55,
  },
};

const Ctx = createContext<QualitySettings>({
  tier: "high",
  calm: false,
  ...SETTINGS.high,
  lightPool: POOL.high,
});

export const useQuality = () => useContext(Ctx);

/** `?q=low|medium|high` pins a tier and disables the auto-downgrade with it. */
function forcedTier(): Tier | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("q");
  return q === "low" || q === "medium" || q === "high" ? q : null;
}

/**
 * Whether the GPU is an integrated part.
 *
 * Core count is a poor proxy for graphics: a sixteen-thread laptop with Intel
 * UHD reports as a workstation and takes `high`, then cannot hold it. Asking
 * the driver what it actually is costs one throwaway context and settles it.
 * Getting this right up front matters more than it looks — every later
 * correction is a tier change, and a tier change rebuilds the post chain and
 * the shadow targets in the middle of the ride.
 */
function integratedGpu(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    if (!gl || !info) return false;
    const name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    return /intel|uhd|iris|hd graphics|apple m|mali|adreno|powervr|vivante|llvmpipe|swiftshader/i.test(
      name,
    );
  } catch {
    return false;
  }
}

function initialTier(): Tier {
  if (typeof window === "undefined") return "high";
  const forced = forcedTier();
  if (forced) return forced;

  const cores = navigator.hardwareConcurrency ?? 8;
  const narrow = window.innerWidth < 820;
  if (narrow || cores <= 4) return "low";
  // Integrated graphics are the common case on laptops and they cannot carry
  // the planar reflection pass, so `high` has to be earned.
  if (cores < 12 || integratedGpu()) return "medium";
  return "high";
}

function prefersCalm() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Drops detail when frames start slipping, and never climbs back — hunting
 * between tiers is far more distracting than sitting one notch low.
 */
export function Quality({ children }: { children: ReactNode }) {
  const [startTier] = useState(initialTier);
  const [tier, setTier] = useState<Tier>(startTier);
  const [calm] = useState(prefersCalm);
  const [pinned] = useState(() => forcedTier() !== null);

  /**
   * Boot frames are not evidence.
   *
   * The monitor samples ten averages over 250ms each, so left to itself it
   * fills its whole buffer with frames from the staged mount — where the park
   * is building nine hundred meshes and compiling their shaders — and then
   * declares the machine too slow the moment the loader lifts. That verdict
   * lands exactly on the first scroll, which is the one place its cost is most
   * visible. Only start judging once the park is up and has had a moment to
   * settle into its real frame rate.
   */
  const { compiled } = useBoot();
  const [judging, setJudging] = useState(false);
  useEffect(() => {
    if (!compiled) return;
    const id = window.setTimeout(() => setJudging(true), 1200);
    return () => window.clearTimeout(id);
  }, [compiled]);

  // which tier the park settled on, for diagnosing "where did my fireworks go"
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    (window as unknown as { __tier?: Tier }).__tier = tier;
  }

  return (
    <>
      {!pinned && judging && (
        <PerformanceMonitor
          // Default bounds treat anything under the display's refresh rate as a
          // decline, so a perfectly good 45fps machine gets dropped to the
          // bottom tier and quietly loses shadows, depth of field and half the
          // atmosphere. Only step down when it is genuinely struggling.
          bounds={() => [32, 55]}
          onDecline={() => setTier((t) => (t === "high" ? "medium" : "low"))}
          onFallback={() => setTier("low")}
          flipflops={3}
        />
      )}
      <Ctx.Provider value={{ tier, calm, ...SETTINGS[tier], lightPool: POOL[startTier] }}>
        {children}
      </Ctx.Provider>
    </>
  );
}
