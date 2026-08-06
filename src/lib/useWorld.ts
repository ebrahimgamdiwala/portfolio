"use client";

import { useEffect, useState } from "react";
import { WORLD } from "./world/layout";
import { buildTerrain, type TerrainData } from "./world/terrain";
import { buildScatter, type ScatterData } from "./world/scatter";
import { buildTrack, type TrackData } from "./world/track";

export interface World {
  terrain: TerrainData;
  scatter: ScatterData;
  track: TrackData;
}

let cache: World | null = null;

/**
 * Generates the island once, off the first paint so the loader can render.
 * The result is cached at module scope — remounts (fast refresh, route changes)
 * reuse the same world instead of regenerating ~30k columns.
 */
export function useWorld() {
  const [world, setWorld] = useState<World | null>(cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      const terrain = buildTerrain(WORLD.seed);
      // the track is laid before anything grows, so towers and canopy can be
      // kept out of its way
      const track = buildTrack(terrain);
      const scatter = buildScatter(terrain, WORLD.seed, track.corridor);
      cache = { terrain, scatter, track };
      if (!cancelled) setWorld(cache);
    }, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  return world;
}
