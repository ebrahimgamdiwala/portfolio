import type { AttractionKind, ZoneId } from "@/lib/content";

/**
 * THE PARK PLAN.
 *
 * Ground is flat — parks are — so every bit of vertical drama belongs to the
 * coaster. Zones sit on a ring, and the ride tours them in the order the
 * stations are listed in `park.json`.
 *
 *                        +Z (front of park)
 *                    plaza ── brakeRun
 *              gardens                 pyro
 *          attractionRow          midway
 *                    works ────────
 */

export interface Zone {
  id: ZoneId;
  x: number;
  z: number;
  /** Rough footprint radius, used for ground patches and prop scatter. */
  r: number;
  ground: "asphalt" | "concrete" | "grass" | "planks";
}

export const ZONES: Record<ZoneId, Zone> = {
  plaza: { id: "plaza", x: 0, z: 200, r: 78, ground: "concrete" },
  gardens: { id: "gardens", x: -132, z: 118, r: 82, ground: "grass" },
  attractionRow: { id: "attractionRow", x: -190, z: -34, r: 116, ground: "asphalt" },
  works: { id: "works", x: -34, z: -188, r: 92, ground: "asphalt" },
  midway: { id: "midway", x: 104, z: -150, r: 78, ground: "planks" },
  pyro: { id: "pyro", x: 198, z: 20, r: 104, ground: "asphalt" },
  brakeRun: { id: "brakeRun", x: 128, z: 142, r: 62, ground: "asphalt" },
};

export const PARK = {
  /** Half-extent of the ground plane. Big enough that fog eats its edge. */
  extent: 2600,
  /** Everything sits on y = 0. */
  groundY: 0,
  /** Perimeter fence + tree line. */
  fenceRadius: 330,
  /** Camera far plane — must clear the sky dome at 1100. */
  far: 4200,
};

/* ── where the big things stand ───────────────────────────────────────────── */

export interface Slot {
  x: number;
  z: number;
  /** Facing, radians about Y. */
  rot: number;
  /** Overall scale multiplier for the structure. */
  scale?: number;
}

/**
 * Hand-placed so the ride frames them properly: an attraction has to be *seen*
 * from the rails, which means composing it against the track, not just dropping
 * it at its zone centre. Kinds that repeat (stalls, plinths) list one slot per
 * item, consumed in `park.json` order.
 */
export const SLOTS: Record<AttractionKind, Slot[]> = {
  scoreboard: [{ x: -110, z: 74, rot: 2.42 }],

  dropTower: [{ x: -258, z: 2, rot: -0.5 }],
  machineHall: [{ x: -208, z: -134, rot: 0.46 }],
  ferrisWheel: [{ x: -150, z: -178, rot: 0.88 }],

  mainStage: [{ x: -56, z: -244, rot: 0.43 }],

  // Two ranks facing each other across the rails, offset ±30 on the
  // perpendicular so the train threads the corridor rather than the booths.
  stall: [
    { x: 90, z: -211, rot: -0.59 },
    { x: 120, z: -191, rot: -0.59 },
    { x: 148, z: -165, rot: -0.59 },
    { x: 58, z: -161, rot: 2.56 },
    { x: 88, z: -141, rot: 2.56 },
    { x: 116, z: -115, rot: 2.56 },
  ],

  plinth: [
    { x: 216, z: -22, rot: -1.5 },
    { x: 228, z: 6, rot: -1.62 },
    { x: 232, z: 36, rot: -1.75 },
    { x: 224, z: 66, rot: -1.9 },
    { x: 194, z: 104, rot: -2.1 },
  ],
};

/**
 * The rest of the funfair.
 *
 * The circuit rings the park, which leaves the whole middle empty — and an
 * empty middle is what makes a park read as a diorama instead of a place. These
 * are pure set dressing: no résumé content, just rides turning in the distance
 * behind everything that does carry content.
 */
export const FURNITURE = {
  carousel: [
    { x: -46, z: 62, rot: 0.3 },
    { x: 66, z: -44, rot: -0.8 },
  ],
  swingRide: [
    { x: 26, z: 96, rot: 0 },
    { x: -88, z: -18, rot: 0.5 },
  ],
  teacups: [
    { x: -18, z: -64, rot: 0.2 },
    { x: 104, z: 46, rot: -0.4 },
  ],
  bumperCars: [{ x: 14, z: -96, rot: 0.16 }],
  bigTop: [{ x: 72, z: 34, rot: -0.25 }],
  waterTower: [{ x: -104, z: 34, rot: 0.4 }],
  waterSlide: [
    { x: -46, z: 138, rot: 1.1 },
    { x: 116, z: -48, rot: -1.9 },
  ],
  pirateShip: [{ x: 46, z: -22, rot: 0.7 }],
  hauntedHouse: [{ x: -76, z: 118, rot: -0.4 }],
  kiosks: [
    { x: -14, z: 24, rot: 1.2 },
    { x: 22, z: 14, rot: -0.6 },
    { x: -62, z: 8, rot: 2.1 },
    { x: 44, z: 68, rot: -1.4 },
    { x: -34, z: -18, rot: 0.4 },
    { x: 88, z: -6, rot: -2.2 },
    { x: -70, z: 90, rot: 1.8 },
    { x: 6, z: 62, rot: -0.2 },
    { x: 130, z: 8, rot: -1.1 },
    { x: -120, z: -66, rot: 0.9 },
    { x: 42, z: -78, rot: 2.6 },
    { x: -8, z: 132, rot: 0.1 },
  ],
} as const satisfies Record<string, readonly Slot[]>;

/** Landmarks that are not tied to a résumé item. */
export const LANDMARKS = {
  /** The entrance arch you pass under leaving the station. */
  gate: { x: 0, z: 246, rot: 0 },
  /** The boarding station shed. */
  station: { x: 0, z: 208, rot: 0.12 },
  /** The lit gantry over the track in The Works. */
  sponsorArch: { x: -2, z: -202, rot: 1.42 },
};
