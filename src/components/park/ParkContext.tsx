"use client";

import { createContext, useContext, type MutableRefObject } from "react";
import type { RideState } from "@/lib/park/ride";
import type { SkyState } from "@/lib/park/sky";
import type { ParkWorld } from "@/lib/usePark";

export interface ParkCtx {
  ride: MutableRefObject<RideState>;
  sky: MutableRefObject<SkyState>;
  world: ParkWorld;
}

const Ctx = createContext<ParkCtx | null>(null);

/**
 * Shared refs for anything in the park that needs to know where the train is or
 * how far the sun has set. Refs rather than state on purpose — the whole point
 * of the scroll layer is that nothing re-renders while you ride.
 */
export function useParkCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useParkCtx must be used inside <ParkProvider>");
  return ctx;
}

export const ParkProvider = Ctx.Provider;
