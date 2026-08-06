"use client";

import { useEffect, useRef } from "react";
import { useScroll } from "./ScrollProvider";

/**
 * Runs `cb` on every animation frame with the current eased scroll progress.
 * Used by the overlay so scroll-linked styling never round-trips through React
 * state — the callback writes directly to DOM refs.
 */
export function useRafProgress(cb: (p: number, velocity: number) => void) {
  const { eased, velocity } = useScroll();
  const ref = useRef(cb);
  ref.current = cb;

  useEffect(() => {
    let id = 0;
    const loop = () => {
      ref.current(eased.current, velocity.current);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [eased, velocity]);
}
