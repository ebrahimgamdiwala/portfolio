"use client";

import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { createContext, useContext, useState, type ReactNode } from "react";

export type Tier = "high" | "medium" | "low";

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
  /** Honour the user's reduced-motion preference for shake and pyro. */
  calm: boolean;
}

const SETTINGS: Record<Tier, Omit<QualitySettings, "tier" | "calm">> = {
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
    crowd: 0.25,
    embers: 0.3,
  },
};

const Ctx = createContext<QualitySettings>({ tier: "high", calm: false, ...SETTINGS.high });

export const useQuality = () => useContext(Ctx);

/** `?q=low|medium|high` pins a tier and disables the auto-downgrade with it. */
function forcedTier(): Tier | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("q");
  return q === "low" || q === "medium" || q === "high" ? q : null;
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
  if (cores < 12) return "medium";
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
  const [tier, setTier] = useState<Tier>(initialTier);
  const [calm] = useState(prefersCalm);
  const [pinned] = useState(() => forcedTier() !== null);

  return (
    <>
      {!pinned && (
        <PerformanceMonitor
          onDecline={() => setTier((t) => (t === "high" ? "medium" : "low"))}
          onFallback={() => setTier("low")}
          flipflops={3}
        />
      )}
      <AdaptiveDpr pixelated />
      <Ctx.Provider value={{ tier, calm, ...SETTINGS[tier] }}>{children}</Ctx.Provider>
    </>
  );
}
