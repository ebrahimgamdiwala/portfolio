"use client";

/**
 * Touch input for explore mode.
 *
 * A plain mutable object rather than React state: `ExploreCamera` reads this
 * every frame, and routing a joystick through a re-render sixty times a second
 * would cost more than the park it is steering.
 *
 * `look` accumulates deltas and is drained by whoever consumes it, so a frame
 * that runs late still gets the whole gesture rather than only its last event.
 */
export const touch = {
  /** Joystick axes, -1..1. `y` is forward-positive. */
  moveX: 0,
  moveY: 0,
  /** Undrained look delta, in pixels. */
  lookX: 0,
  lookY: 0,
  /** True while a joystick or look drag is live. */
  active: false,
};

export function drainLook() {
  const x = touch.lookX;
  const y = touch.lookY;
  touch.lookX = 0;
  touch.lookY = 0;
  return { x, y };
}

/** Touch-capable and small enough that the on-screen controls belong. */
export function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return (
    ("ontouchstart" in window || navigator.maxTouchPoints > 0) &&
    window.matchMedia("(pointer: coarse)").matches
  );
}
