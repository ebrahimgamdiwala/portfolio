/**
 * Timeline constants shared by the scroll layer and the 3D world.
 *
 * This module has NO imports, by design.
 *
 * `ScrollProvider` ships in the main bundle while the entire renderer is loaded
 * lazily, so anything both sides touch has to sit safely on the boundary. It
 * lives under `scroll/` rather than `world/` because dependencies only ever run
 * world -> scroll (the canvas reads `useScroll`); pointing an import the other
 * way put these constants in the async chunk and left them undefined at the
 * moment the scroll handler needed them.
 *
 * Everything here is a constant or a pure function, so it stays correct even if
 * the bundler duplicates the module across chunks. That is emphatically NOT
 * true of `ScrollProvider` itself, whose React context identity must be unique.
 */

/**
 * Scroll position at which the camera has fully handed over to the track.
 *
 * This is also the wrap point. The coaster is a closed circuit, so the rail
 * under the camera at LAP_END is the same rail as here — which lets the page
 * hand the rider straight back for another lap with no visible cut.
 */
export const RIDE_START = 0.075;

/**
 * Scroll position at which the lap completes — the rider is back on the
 * starting rail here, not at p = 1.
 *
 * The gap matters: Lenis clamps its target at the page bottom, so once you are
 * pinned there it stops reporting movement and a wrap keyed to p = 1 would
 * never fire. Ending the lap just short leaves the rider still travelling when
 * the handoff happens.
 */
export const LAP_END = 0.995;

/** 0 at the very top of the page, 1 once the ride has fully taken over. */
export function overviewBlend(p: number) {
  const t = Math.min(1, Math.max(0, (p - 0.012) / (RIDE_START - 0.012)));
  return t * t * (3 - 2 * t);
}
