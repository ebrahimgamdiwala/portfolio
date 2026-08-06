"use client";

import { useSyncExternalStore } from "react";
import { Vector3 } from "three";

/**
 * Explore mode.
 *
 * Deliberately a module-level store rather than React context: the DOM overlay
 * lives outside the R3F canvas and the markers live inside it, and those are two
 * different reconcilers — a context provider in one cannot be read from the
 * other. An external store is read identically from both.
 */

export type Mode = "ride" | "explore";

export interface ExploreState {
  mode: Mode;
  /** True once the rider has completed a lap and earned the run of the park. */
  unlocked: boolean;
  /** Marker currently opened, if any. */
  selected: string | null;
  /** Attraction the camera is actually strapped into, if any. */
  riding: string | null;
  /** Mouse is captured — FPS look is live. */
  pointerLocked: boolean;
  /** Marker the crosshair is currently on, if any. */
  hovered: string | null;
}

let state: ExploreState = {
  mode: "ride",
  unlocked: false,
  selected: null,
  riding: null,
  pointerLocked: false,
  hovered: null,
};

const listeners = new Set<() => void>();

function set(patch: Partial<ExploreState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const snapshot = () => state;

export function useExplore() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export const explore = {
  get state() {
    return state;
  },
  unlock: () => {
    if (!state.unlocked) set({ unlocked: true });
  },
  enter: () => set({ mode: "explore", selected: null, riding: null, hovered: null }),
  leave: () =>
    set({ mode: "ride", selected: null, riding: null, hovered: null, pointerLocked: false }),
  select: (id: string | null) => set({ selected: id, riding: null }),
  ride: (id: string | null) => set({ riding: id }),
  setLocked: (v: boolean) => {
    if (state.pointerLocked !== v) set({ pointerLocked: v });
  },
  hover: (id: string | null) => {
    if (state.hovered !== id) set({ hovered: id });
  },
};

/**
 * Live seat positions published by the rides that you can actually board.
 *
 * Written every frame by the attraction itself and read by `ExploreCamera` —
 * a ref-style handoff, because routing a moving seat through React state sixty
 * times a second would be absurd.
 */
export const seats: Record<string, { pos: Vector3; yaw: number }> = {
  dropTower: { pos: new Vector3(), yaw: 0 },
  ferrisWheel: { pos: new Vector3(), yaw: 0 },
};
