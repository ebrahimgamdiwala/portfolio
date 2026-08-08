import { stations, type Station, type StationItem } from "@/lib/content";
import { FURNITURE, LANDMARKS, SLOTS, type Slot } from "@/lib/park/layout";

/**
 * The things you can walk up to and do.
 *
 * Built from the same JSON that builds the park, so a marker can never point at
 * a ride that is not there. Each one knows where the camera should stand to see
 * it, and whether it is something you can actually board.
 */

export interface Marker {
  id: string;
  kind: string;
  /** Ride name in lights. */
  title: string;
  /** What the button says. */
  action: string;
  /** A line explaining what this teaches you. */
  hint: string;
  /** Where the floating marker hovers. */
  pos: [number, number, number];
  /** Where the camera stands to look at it. */
  view: [number, number, number];
  look: [number, number, number];
  accent: string;
  /** True when selecting it straps the camera into the ride. */
  boardable?: boolean;
  /** Moving-seat key when several rides share the same kind. */
  rideId?: string;
  /**
   * How big the thing is, for aiming. Targeting tests the crosshair ray
   * against a sphere this size rather than against the marker's own point, so
   * looking anywhere at a ride selects it — you should not have to find a
   * label floating at its centre.
   */
  radius: number;
  item?: StationItem;
  station: Station;
}

/** Marker height, camera stand-off and eye height per structure. */
const FRAMING: Record<string, { hover: number; back: number; eye: number }> = {
  dropTower: { hover: 16, back: 62, eye: 26 },
  ferrisWheel: { hover: 20, back: 96, eye: 40 },
  carousel: { hover: 16, back: 44, eye: 15 },
  waterSlide: { hover: 25, back: 74, eye: 28 },
  teacups: { hover: 14, back: 36, eye: 12 },
  swingRide: { hover: 22, back: 52, eye: 18 },
  pirateShip: { hover: 22, back: 42, eye: 18 },
  machineHall: { hover: 30, back: 68, eye: 22 },
  mainStage: { hover: 26, back: 38, eye: 15 },
  scoreboard: { hover: 22, back: 46, eye: 16 },
  stall: { hover: 13, back: 22, eye: 7 },
  plinth: { hover: 14, back: 20, eye: 8 },
  gate: { hover: 42, back: 74, eye: 26 },
};

/** Aim volume per structure — roughly what the thing occupies on screen. */
const AIM_RADIUS: Record<string, number> = {
  dropTower: 20,
  ferrisWheel: 48,
  machineHall: 36,
  mainStage: 30,
  scoreboard: 16,
  carousel: 20,
  waterSlide: 28,
  teacups: 16,
  swingRide: 20,
  pirateShip: 20,
  stall: 10,
  plinth: 8,
  gate: 34,
};

const ACTIONS: Record<string, { action: string; hint: string }> = {
  dropTower: {
    action: "Take the drop",
    hint: "Ride it to the top and find out what the platform underneath it does.",
  },
  ferrisWheel: {
    action: "Take a turn",
    hint: "Board a gondola. The numbers come round with you.",
  },
  carousel: {
    action: "Ride a horse",
    hint: "Pick a horse and take a spin around the midway.",
  },
  waterSlide: {
    action: "Ride the slide",
    hint: "Climb aboard and follow the flume all the way into the splash pool.",
  },
  teacups: {
    action: "Spin the cups",
    hint: "Climb into a cup and spin around the wooden deck.",
  },
  swingRide: {
    action: "Fly the swings",
    hint: "Take a chair and soar as the central column spins up.",
  },
  pirateShip: {
    action: "Board the galleon",
    hint: "Board the swinging pirate galleon as it arches high above the park.",
  },
  machineHall: {
    action: "Start the machine",
    hint: "Throw the switch and watch the pipeline turn over.",
  },
  mainStage: {
    action: "Catch the show",
    hint: "The marquee that is lit right now.",
  },
  scoreboard: {
    action: "Read the board",
    hint: "Six semesters, one number.",
  },
  stall: {
    action: "Play the stall",
    hint: "Every prize on the back shelf is something that has shipped.",
  },
  plinth: {
    action: "Read the plaque",
    hint: "Thirty-six hours, a live demo at the end.",
  },
  gate: {
    action: "Sign the guest book",
    hint: "Where to find me when the park closes.",
  },
};

function place(
  slot: Slot,
  kind: string,
  id: string,
  title: string,
  station: Station,
  item?: StationItem,
): Marker {
  const f = FRAMING[kind] ?? { hover: 16, back: 40, eye: 12 };
  const { action, hint } = ACTIONS[kind] ?? { action: "Take a look", hint: "" };
  // stand off along the direction the structure faces, so you see its front
  const vx = slot.x + Math.sin(slot.rot) * f.back;
  const vz = slot.z + Math.cos(slot.rot) * f.back;

  return {
    id,
    kind,
    title,
    action,
    hint,
    pos: [slot.x, f.hover, slot.z],
    view: [vx, f.eye, vz],
    look: [slot.x, f.hover * 0.7, slot.z],
    radius: AIM_RADIUS[kind] ?? 14,
    accent: station.accent,
    boardable: kind === "dropTower" || kind === "ferrisWheel",
    item,
    station,
  };
}

export function buildMarkers(): Marker[] {
  const out: Marker[] = [];
  const used: Record<string, number> = {};

  for (const station of stations) {
    for (const item of station.items) {
      const kind = item.attraction;
      if (!kind) continue;
      const i = used[kind] ?? 0;
      used[kind] = i + 1;
      const slot = SLOTS[kind]?.[i];
      if (!slot) continue;

      const title =
        item.poster?.ride ?? item.poster?.headline ?? item.title.toUpperCase();
      out.push(place(slot, kind, `${station.id}:${item.title}`, title, station, item));
    }
  }

  // These are park attractions rather than portfolio entries, but they use
  // the same marker and boarding flow as the headline rides.
  FURNITURE.carousel.forEach((slot, i) => {
    const marker = place(slot, "carousel", `carousel:${i}`, "CAROUSEL", stations[0]);
    marker.boardable = true;
    marker.rideId = `carousel${i}`;
    out.push(marker);
  });
  FURNITURE.waterSlide.forEach((slot, i) => {
    const marker = place(slot, "waterSlide", `water-slide:${i}`, "WATER SLIDES", stations[0]);
    marker.boardable = true;
    marker.rideId = `waterSlide${i}`;
    out.push(marker);
  });
  FURNITURE.teacups.forEach((slot, i) => {
    const marker = place(slot, "teacups", `teacups:${i}`, "CUP & SAUCER", stations[0]);
    marker.boardable = true;
    marker.rideId = `teacups${i}`;
    out.push(marker);
  });
  FURNITURE.swingRide.forEach((slot, i) => {
    const marker = place(slot, "swingRide", `swing-ride:${i}`, "SWING RIDE", stations[0]);
    marker.boardable = true;
    marker.rideId = `swingRide${i}`;
    out.push(marker);
  });
  FURNITURE.pirateShip.forEach((slot, i) => {
    const marker = place(slot, "pirateShip", `pirate-ship:${i}`, "PIRATE GALLEON", stations[0]);
    marker.boardable = true;
    marker.rideId = `pirateShip${i}`;
    out.push(marker);
  });

  // the way out, which is also the way to reach me
  const contact = stations.find((s) => s.id === "contact") ?? stations[stations.length - 1];
  out.push(
    place(
      { x: LANDMARKS.gate.x, z: LANDMARKS.gate.z, rot: LANDMARKS.gate.rot },
      "gate",
      "gate",
      "THE GATE",
      contact,
    ),
  );

  return out;
}
