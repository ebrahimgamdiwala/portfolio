"use client";

import { useEffect, useState } from "react";
import { stations } from "./content";
import { buildCoaster, makeProgressMap, type CoasterData } from "./park/coaster";
import { placeHoardings, type Hoarding } from "./park/signage";
import { buildProps, type PropSet } from "./park/props";
import { FURNITURE, LANDMARKS, SLOTS } from "./park/layout";
import { flume } from "./park/flume";

export interface ParkWorld {
  coaster: CoasterData;
  hoardings: Hoarding[];
  props: PropSet;
  /** Scroll 0..1 -> ride time 0..1. Feed the result to `coaster.uAtTau`. */
  progressToTau: (p: number) => number;
}

let cache: ParkWorld | null = null;

/**
 * Assembles the park once, off the first paint so the loader can render.
 * Cached at module scope — remounts (fast refresh, route changes) reuse the
 * same park instead of re-solving the circuit.
 */
export function usePark() {
  const [world, setWorld] = useState<ParkWorld | null>(cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;

    const id = window.setTimeout(() => {
      const coaster = buildCoaster();
      const hoardings = placeHoardings(coaster);
      const props = buildProps(coaster);
      cache = {
        coaster,
        hoardings,
        props,
        progressToTau: makeProgressMap(stations, coaster.stationTau),
      };
      // The clearance audit runs against the real solved circuit and the real
      // layout tables — duplicating either into the harness is how you end up
      // auditing positions nothing is actually built at.
      if (process.env.NODE_ENV === "development") {
        (window as unknown as { __park?: unknown }).__park = {
          ...cache,
          layout: { SLOTS, FURNITURE, LANDMARKS },
          flume: flume(),
        };
      }
      if (!cancelled) setWorld(cache);
    }, 40);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  return world;
}
