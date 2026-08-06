import { stations, type Station, type StationItem } from "@/lib/content";
import { LANDMARKS, SLOTS, type Slot } from "@/lib/park/layout";

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
  item?: StationItem;
  station: Station;
}

/** Marker height, camera stand-off and eye height per structure. */
const FRAMING: Record<string, { hover: number; back: number; eye: number }> = {
  dropTower: { hover: 16, back: 62, eye: 26 },
  ferrisWheel: { hover: 20, back: 96, eye: 40 },
  machineHall: { hover: 30, back: 68, eye: 22 },
  mainStage: { hover: 26, back: 60, eye: 18 },
  scoreboard: { hover: 22, back: 46, eye: 16 },
  stall: { hover: 13, back: 22, eye: 7 },
  plinth: { hover: 14, back: 20, eye: 8 },
  gate: { hover: 42, back: 74, eye: 26 },
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
