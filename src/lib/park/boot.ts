"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * STAGED BOOT.
 *
 * Mounting the whole park in one commit blocks the main thread twice: about
 * seven seconds building nine hundred meshes and their materials, then about
 * eight more on the first render while three compiles and uploads every shader
 * it has just been handed. Nothing paints for either, so the loader freezes at
 * whatever number it reached and the page looks hung.
 *
 * Splitting the tree into stages and mounting one per frame costs a little more
 * wall-clock in total, but the browser paints between every stage — so the
 * loader animates, the count reflects real work, and the first pixels of the
 * park arrive in about two seconds instead of nineteen.
 *
 * Nothing is dropped or simplified. Every stage still mounts.
 */

export interface BootState {
  stage: number;
  total: number;
  done: boolean;
  /**
   * True once every mounted material has had its shader program compiled on
   * the GPU. `done` only means the tree is mounted — WebGL still compiles
   * each program lazily on its first real draw call, so without this the
   * park would mount silently behind the loader and then hitch on the first
   * scroll, the moment attractions outside the boot camera's view actually
   * get drawn for the first time.
   */
  compiled: boolean;
}

let state: BootState = { stage: 0, total: 1, done: false, compiled: false };
const listeners = new Set<() => void>();

function set(patch: Partial<BootState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => state;

export function useBoot() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export const boot = {
  get state() {
    return state;
  },
  report(stage: number, total: number) {
    if (state.stage !== stage || state.total !== total) {
      set({ stage, total, done: stage >= total });
    }
  },
  compiled() {
    if (!state.compiled) set({ compiled: true });
  },
  reset() {
    set({ stage: 0, total: 1, done: false, compiled: false });
  },
};

/**
 * Advances one stage per painted frame.
 *
 * Two nested rAFs, not one: the first fires *before* the browser has painted
 * the stage just committed, so advancing there would queue the next batch of
 * work into the same frame and collapse the staging back into one long block.
 */
export function useStagedMount(total: number) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    boot.report(stage, total);
    if (stage >= total) return;

    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setStage((s) => s + 1));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [stage, total]);

  return stage;
}
