import { Color, Vector3 } from "three";
import { stations } from "@/lib/content";
import { FURNITURE, LANDMARKS, SLOTS } from "./layout";
import type { Hoarding } from "./signage";

/**
 * Every practical light in the park, as data.
 *
 * There are roughly eighty things here that ought to cast light, and a forward
 * renderer will fall over long before that. So none of them is a real light:
 * the list is a *candidate set*, and `LightPool` keeps a handful of real
 * point lights which it reassigns to whichever candidates are nearest the
 * camera each frame. Everything else is carried by emissive geometry and bloom,
 * which is where most of the look lives anyway.
 */

export interface LightSource {
  pos: Vector3;
  color: Color;
  intensity: number;
  distance: number;
}

const HEIGHTS: Record<string, number> = {
  dropTower: 46,
  ferrisWheel: 54,
  machineHall: 22,
  mainStage: 20,
  signalTower: 40,
  scoreboard: 24,
  stall: 6,
  plinth: 8,
};

export function buildLights(hoardings: Hoarding[]): LightSource[] {
  const out: LightSource[] = [];

  const add = (x: number, y: number, z: number, hex: string, intensity: number, distance: number) =>
    out.push({ pos: new Vector3(x, y, z), color: new Color(hex), intensity, distance });

  // résumé attractions take their zone's accent
  const used: Record<string, number> = {};
  for (const station of stations) {
    for (const item of station.items) {
      const kind = item.attraction;
      if (!kind) continue;
      const i = used[kind] ?? 0;
      used[kind] = i + 1;
      const slot = SLOTS[kind]?.[i];
      if (!slot) continue;
      const h = HEIGHTS[kind] ?? 12;
      const big = h > 20;
      add(slot.x, h, slot.z, station.accent, big ? 2600 : 340, big ? 240 : 60);
    }
  }

  // the funfair burns warm
  for (const s of FURNITURE.carousel) add(s.x, 10, s.z, "#ffb866", 900, 110);
  for (const s of FURNITURE.swingRide) add(s.x, 32, s.z, "#ffd6a0", 900, 130);
  for (const s of FURNITURE.teacups) add(s.x, 7, s.z, "#ffd0e0", 520, 80);
  for (const s of FURNITURE.bumperCars) add(s.x, 9, s.z, "#8ec8ff", 720, 100);
  for (const s of FURNITURE.bigTop) add(s.x, 13, s.z, "#ffb84d", 1000, 130);
  for (const s of FURNITURE.kiosks) add(s.x, 4.5, s.z, "#ffb765", 190, 34);

  // hoardings are washed by their own floods
  for (const h of hoardings) {
    add(h.position[0], h.legs + 1.5, h.position[2], "#ffe0b0", 420, 70);
  }

  add(LANDMARKS.gate.x, 34, LANDMARKS.gate.z, "#ffbf7a", 2400, 210);
  add(LANDMARKS.station.x, 12, LANDMARKS.station.z, "#ffc78a", 900, 110);

  return out;
}
