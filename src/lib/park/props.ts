import { Color, Quaternion, Vector3 } from "three";
import { stations } from "@/lib/content";
import type { CoasterData, Piece } from "./coaster";
import { PARK, SLOTS, ZONES } from "./layout";
import { Rng } from "./rand";

/**
 * Everything the park is dressed with: bulb runs, lamp posts, the tree line,
 * queue barriers and the crowd. All seeded, all instanced.
 *
 * The bulb strings do more for the mood than any other single thing here — a
 * catenary of warm points is instantly legible as "fairground", and with bloom
 * on they carry the whole night.
 */

export interface LampPost {
  x: number;
  z: number;
  h: number;
  rot: number;
}

export interface Tree {
  x: number;
  z: number;
  h: number;
  r: number;
  rot: number;
  tint: number;
}

export interface PropSet {
  /** xyz per bulb. */
  bulbs: Float32Array;
  /** rgb per bulb, linear. */
  bulbColors: Float32Array;
  /** The poles the strings hang from. */
  poles: Piece[];
  lamps: LampPost[];
  trees: Tree[];
  /** x, z, scale, phase per person. */
  crowd: Float32Array;
  /** Queue barriers and planter kerbs. */
  barriers: Piece[];
}

const IDENT: [number, number, number, number] = [0, 0, 0, 1];

/**
 * Coarse XZ index of the rails, so nothing gets planted in the ride's path.
 * Bucketed on a grid — a linear scan over 700 samples per query would be
 * thousands of times slower across the whole scatter pass.
 */
function trackMask(coaster: CoasterData) {
  const CELL = 16;
  const grid = new Map<number, number[]>();
  const p = new Vector3();
  const q = new Quaternion();
  const key = (ix: number, iz: number) => ix * 73856093 + iz;

  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < 900; i++) {
    coaster.sample(i / 900, p, q);
    const idx = xs.length;
    xs.push(p.x);
    zs.push(p.z);
    const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    const bucket = grid.get(k);
    if (bucket) bucket.push(idx);
    else grid.set(k, [idx]);
  }

  return (x: number, z: number, r: number) => {
    const span = Math.ceil(r / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const r2 = r * r;
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const bucket = grid.get(key(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const i of bucket) {
          const ex = xs[i] - x;
          const ez = zs[i] - z;
          if (ex * ex + ez * ez < r2) return true;
        }
      }
    }
    return false;
  };
}

/** Points along a hanging cable between two tops. */
function catenary(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  sag: number,
  n: number,
  out: number[],
) {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const dip = Math.sin(t * Math.PI) * sag;
    out.push(ax + (bx - ax) * t, ay + (by - ay) * t - dip, az + (bz - az) * t);
  }
}

export function buildProps(coaster: CoasterData): PropSet {
  const rng = new Rng(20260806);
  const nearTrack = trackMask(coaster);

  const bulbPts: number[] = [];
  const bulbCols: number[] = [];
  const poles: Piece[] = [];
  const lamps: LampPost[] = [];
  const trees: Tree[] = [];
  const barriers: Piece[] = [];
  const crowdPts: number[] = [];

  const warm = new Color("#ffcf8f");
  const tint = new Color();
  const accents = stations.map((s) => new Color(s.accent));

  const pole = (x: number, z: number, h: number, w = 0.34): Piece => ({
    p: [x, h / 2, z],
    q: IDENT,
    s: [w, h, w],
  });

  /* ── bulb rings around the social zones ────────────────────────────────── */

  const ring = (
    cx: number,
    cz: number,
    radius: number,
    count: number,
    height: number,
    accent: Color,
  ) => {
    const tops: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = cx + Math.cos(a) * radius;
      const z = cz + Math.sin(a) * radius;
      if (nearTrack(x, z, 9)) continue;
      const h = height + rng.spread(0.6);
      poles.push(pole(x, z, h));
      tops.push([x, h, z]);
    }
    for (let i = 0; i < tops.length; i++) {
      const a = tops[i];
      const b = tops[(i + 1) % tops.length];
      const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (span > radius * 1.4) continue; // skipped pole left a gap; do not bridge it
      const n = Math.max(4, Math.round(span / 2.1));
      const before = bulbPts.length;
      catenary(a[0], a[1], a[2], b[0], b[1], b[2], span * 0.16, n, bulbPts);
      for (let k = before; k < bulbPts.length; k += 3) {
        // mostly warm tungsten with an occasional accent bulb in the run
        tint.copy(rng.chance(0.16) ? accent : warm);
        bulbCols.push(tint.r, tint.g, tint.b);
      }
    }
  };

  ring(ZONES.plaza.x, ZONES.plaza.z, 56, 16, 7.5, accents[0]);
  ring(ZONES.gardens.x, ZONES.gardens.z, 52, 13, 6.5, accents[1]);
  ring(ZONES.pyro.x, ZONES.pyro.z, 74, 16, 7, accents[5]);

  /* ── the midway: two rows of poles with strings straight across ────────── */

  const stallSlots = SLOTS.stall;
  for (let i = 0; i < 3; i++) {
    const a = stallSlots[i];
    const b = stallSlots[i + 3];
    const ax = a.x + (a.x - ZONES.midway.x) * 0.16;
    const az = a.z + (a.z - ZONES.midway.z) * 0.16;
    const bx = b.x + (b.x - ZONES.midway.x) * 0.16;
    const bz = b.z + (b.z - ZONES.midway.z) * 0.16;
    poles.push(pole(ax, az, 9.5, 0.4));
    poles.push(pole(bx, bz, 9.5, 0.4));
    const span = Math.hypot(bx - ax, bz - az);
    const before = bulbPts.length;
    catenary(ax, 9.5, az, bx, 9.5, bz, span * 0.13, Math.round(span / 1.8), bulbPts);
    for (let k = before; k < bulbPts.length; k += 3) {
      tint.copy(rng.chance(0.3) ? accents[4] : warm);
      bulbCols.push(tint.r, tint.g, tint.b);
    }
  }

  /* ── lamp posts through the working zones ──────────────────────────────── */

  for (const zone of Object.values(ZONES)) {
    const count = Math.round(zone.r / 9);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = zone.r * Math.sqrt(rng.range(0.25, 1));
      const x = zone.x + Math.cos(a) * d;
      const z = zone.z + Math.sin(a) * d;
      if (nearTrack(x, z, 12)) continue;
      lamps.push({ x, z, h: rng.range(8.5, 12.5), rot: rng.range(0, Math.PI * 2) });
    }
  }

  /* ── perimeter tree line ───────────────────────────────────────────────── */

  for (let i = 0; i < 300; i++) {
    const a = (i / 300) * Math.PI * 2 + rng.spread(0.02);
    const d = PARK.fenceRadius + rng.range(4, 96);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    trees.push({
      x,
      z,
      h: rng.range(14, 30),
      r: rng.range(5, 10),
      rot: rng.range(0, Math.PI * 2),
      tint: rng.unit(),
    });
  }
  // a stand of them inside the gardens
  for (let i = 0; i < 40; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(28, ZONES.gardens.r);
    const x = ZONES.gardens.x + Math.cos(a) * d;
    const z = ZONES.gardens.z + Math.sin(a) * d;
    if (nearTrack(x, z, 16)) continue;
    trees.push({
      x,
      z,
      h: rng.range(9, 16),
      r: rng.range(3.5, 6),
      rot: rng.range(0, Math.PI * 2),
      tint: rng.unit(),
    });
  }

  /* ── queue barriers around the headline attractions ────────────────────── */

  for (const kind of ["dropTower", "ferrisWheel", "machineHall", "mainStage"] as const) {
    for (const slot of SLOTS[kind]) {
      const r = 26;
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const x = slot.x + Math.cos(a) * r;
        const z = slot.z + Math.sin(a) * r;
        if (nearTrack(x, z, 8)) continue;
        barriers.push({ p: [x, 0.55, z], q: IDENT, s: [0.14, 1.1, 0.14] });
      }
    }
  }

  /* ── the crowd ─────────────────────────────────────────────────────────── */

  const crowdZones = [ZONES.plaza, ZONES.midway, ZONES.attractionRow, ZONES.pyro];
  for (const zone of crowdZones) {
    const count = zone.id === "plaza" ? 190 : 110;
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = zone.r * Math.sqrt(rng.unit()) * 0.92;
      const x = zone.x + Math.cos(a) * d;
      const z = zone.z + Math.sin(a) * d;
      if (nearTrack(x, z, 5)) continue;
      crowdPts.push(x, z, rng.range(1.55, 1.92), rng.range(0, Math.PI * 2));
    }
  }

  return {
    bulbs: new Float32Array(bulbPts),
    bulbColors: new Float32Array(bulbCols),
    poles,
    lamps,
    trees,
    crowd: new Float32Array(crowdPts),
    barriers,
  };
}
