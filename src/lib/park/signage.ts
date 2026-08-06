import { Quaternion, Vector3 } from "three";
import { hoardingItems, posterOf, stations, type Poster, type Station } from "@/lib/content";
import type { CoasterData } from "./coaster";

/**
 * Where the ad hoardings stand.
 *
 * Placement is derived from the rails rather than hand-authored, which is the
 * whole trick: every board is planted on the approach to the station it belongs
 * to, offset to one side, and turned to face the seat the rider is actually
 * sitting in. You read them the way you read hoardings from a moving car —
 * they swing into frame, hold, and sweep past.
 */

/** Board face, in metres. 16:9 so the poster canvas maps cleanly. */
export const BOARD_W = 22;
export const BOARD_H = 12.4;

export interface Hoarding {
  key: string;
  station: Station;
  poster: Poster;
  accent: string;
  /** Centre of the board face. */
  position: [number, number, number];
  rotationY: number;
  /** Ground to the bottom edge of the board. */
  legs: number;
  /** Which side of the track it stands on: -1 left, +1 right. */
  side: number;
}

const pos = new Vector3();
const quat = new Quaternion();
const right = new Vector3();
const up = new Vector3();
const fwd = new Vector3();
const eye = new Vector3();

export function placeHoardings(coaster: CoasterData): Hoarding[] {
  const out: Hoarding[] = [];
  let prevU = 0;

  for (const station of stations) {
    const anchor = coaster.stationU[station.id];
    if (anchor === undefined) continue;

    const items = hoardingItems(station);
    const legStart = prevU;
    prevU = anchor;
    if (!items.length) continue;

    items.forEach((item, j) => {
      const f = items.length === 1 ? 0.55 : 0.26 + (j / (items.length - 1)) * 0.5;
      const u = legStart + (anchor - legStart) * f;

      coaster.sample(u, pos, quat);
      coaster.basis(u, right, up, fwd);

      // Always the rider's right. The copy overlay occupies the left of the
      // viewport, so a board on the left is a board nobody reads — and real
      // roadside hoardings sit on one side of the carriageway anyway.
      const side = 1;
      const dist = 27 + (j % 2) * 6;
      const cx = pos.x + right.x * side * dist;
      const cz = pos.z + right.z * side * dist;

      // Sit the board at the rider's eye line where possible, but never let it
      // sink into the ground or float on stilts taller than it is.
      const centreY = Math.min(Math.max(pos.y + 1.5, BOARD_H * 0.5 + 5), 46);
      const legs = centreY - BOARD_H * 0.5;

      // aim it back at where the rider is a moment before arriving
      coaster.sample(Math.max(0, u - 0.022), eye, quat);
      out.push({
        key: `${station.id}:${item.title}`,
        station,
        poster: posterOf(item, station),
        accent: station.accent,
        position: [cx, centreY, cz],
        rotationY: Math.atan2(eye.x - cx, eye.z - cz),
        legs,
        side,
      });
    });
  }

  return out;
}
