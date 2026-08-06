import { FURNITURE, LANDMARKS, SLOTS } from "@/lib/park/layout";

/**
 * Something you cannot walk through.
 *
 * Circles, not meshes. Real collision against the park's geometry would mean
 * a BVH over a hundred thousand triangles to stop somebody strolling into a
 * tent, and a footprint radius is indistinguishable from it at walking pace.
 */
export interface Blocker {
  x: number;
  z: number;
  r: number;
}

/** Footprint you have to walk around, per structure kind. */
const RADIUS: Record<string, number> = {
  dropTower: 10,
  ferrisWheel: 27,
  machineHall: 34,
  mainStage: 28,
  scoreboard: 12,
  stall: 9,
  plinth: 6,
  carousel: 17,
  swingRide: 13,
  teacups: 14,
  bumperCars: 20,
  bigTop: 26,
  waterTower: 10,
  waterSlide: 26,
  pirateShip: 18,
  hauntedHouse: 20,
  kiosks: 5,
};

let cache: Blocker[] | null = null;

export function blockers(): Blocker[] {
  if (cache) return cache;
  const out: Blocker[] = [];

  for (const [kind, slots] of Object.entries({ ...SLOTS, ...FURNITURE })) {
    const r = RADIUS[kind];
    if (!r) continue;
    for (const s of slots) out.push({ x: s.x, z: s.z, r });
  }

  // The gate is an arch — its towers block, the opening between them does not.
  for (const sx of [-31, 31]) {
    out.push({ x: LANDMARKS.gate.x + sx, z: LANDMARKS.gate.z, r: 7 });
  }
  // the boarding station shed
  out.push({ x: LANDMARKS.station.x, z: LANDMARKS.station.z, r: 17 });

  cache = out;
  return out;
}

/**
 * Pushes a position out of anything it has walked into. Writes into `out` and
 * returns whether it had to move — the caller kills lateral velocity on a hit,
 * so you slide along a wall rather than sticking to it.
 */
export function resolve(x: number, z: number, radius: number, out: { x: number; z: number }) {
  out.x = x;
  out.z = z;
  let hit = false;

  for (const b of blockers()) {
    const dx = out.x - b.x;
    const dz = out.z - b.z;
    const min = b.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    out.x = b.x + (dx / d) * min;
    out.z = b.z + (dz / d) * min;
    hit = true;
  }

  return hit;
}
