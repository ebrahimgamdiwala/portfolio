import { CatmullRomCurve3, Quaternion, Vector3 } from "three";
import { PALETTE } from "./palette";
import { WORLD } from "./layout";
import { VOID_HEIGHT, type TerrainData } from "./terrain";
import { clamp01 } from "./noise";
import { LAP_END, RIDE_START } from "@/lib/scroll/timeline";

/**
 * THE RIDE.
 *
 * A single Catmull-Rom spline threaded through every station. Scroll progress
 * is remapped so each station's anchor lands exactly on its slice of the
 * timeline (see `src/data/portfolio.json` -> stations[].scroll).
 */

interface Node {
  /** World X. */
  x: number;
  /** World Z. */
  z: number;
  /** Height above local terrain, or absolute Y when `abs` is set. */
  y: number;
  abs?: boolean;
  /** Station id this node anchors, if any. */
  station?: string;
}

/**
 * A CLOSED CIRCUIT. The ride tours the island station by station, then breaks
 * out over the rim and sweeps the whole landmass on a high return leg before
 * rejoining the shore where it began — so the coaster is a real loop with no
 * dangling ends, and the finale is the best view of the world.
 *
 * Heights are deliberately generous: the point of the ride is the island, not
 * the rails, so staying well clear of the canopy keeps the horizon open.
 */
const NODES: Node[] = [
  { x: 16, z: 76, y: 15, station: "origin" },
  { x: 6, z: 56, y: 20 },
  { x: -2, z: 36, y: 26 },
  { x: -8, z: 18, y: 22, station: "education" },
  { x: 4, z: 2, y: 32 },
  { x: 28, z: -4, y: 40 },
  { x: 52, z: 2, y: 30, station: "projects" },
  { x: 68, z: 22, y: 32 },
  { x: 54, z: 46, y: 36 },
  { x: 20, z: 58, y: 42 },
  { x: -12, z: 58, y: 46 },
  { x: -30, z: 48, y: 44, station: "experience" },
  { x: -50, z: 44, y: 36 },
  { x: -64, z: 28, y: 22, station: "skills" },
  { x: -82, z: 4, y: 28 },
  { x: -62, z: -20, y: 24 },
  { x: -32, z: -28, y: 36 },
  { x: 4, z: -30, y: 48 },
  { x: 42, z: -34, y: 46 },
  { x: 62, z: -44, y: 24, station: "awards" },
  { x: 60, z: -66, y: 32 },
  { x: 30, z: -78, y: 24 },
  { x: 2, z: -76, y: 18, station: "contact" },

  // return leg: out over the rim and around the island at altitude
  { x: -34, z: -82, y: 96, abs: true },
  { x: -76, z: -58, y: 104, abs: true },
  { x: -104, z: -14, y: 96, abs: true },
  { x: -110, z: 34, y: 82, abs: true },
  { x: -86, z: 74, y: 66, abs: true },
  { x: -42, z: 98, y: 52, abs: true },
  { x: 8, z: 104, y: 38, abs: true },
  { x: 34, z: 94, y: 26, abs: true },
];

export interface TrackPiece {
  p: [number, number, number];
  q: [number, number, number, number];
  s: [number, number, number];
  c: number;
}

/**
 * Spatial index of the ride's path, used to keep the world from growing into
 * it: towers get their tops shaved off under the track, and trees leave a
 * cleared lane beneath it.
 */
export class TrackCorridor {
  private grid = new Map<number, number[]>();
  private xs: number[] = [];
  private ys: number[] = [];
  private zs: number[] = [];
  private readonly cell = 8;

  constructor(curve: CatmullRomCurve3, samples = 1400) {
    const p = new Vector3();
    for (let i = 0; i < samples; i++) {
      curve.getPointAt(i / samples, p);
      const idx = this.xs.length;
      this.xs.push(p.x);
      this.ys.push(p.y);
      this.zs.push(p.z);
      const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell));
      const bucket = this.grid.get(k);
      if (bucket) bucket.push(idx);
      else this.grid.set(k, [idx]);
    }
  }

  private key(ix: number, iz: number) {
    return ix * 100003 + iz;
  }

  /**
   * Lowest height the track reaches within `radius` of (x, z),
   * or Infinity when the ride never passes overhead.
   */
  lowestOver(x: number, z: number, radius: number): number {
    const span = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    const r2 = radius * radius;
    let lowest = Infinity;
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const bucket = this.grid.get(this.key(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const i of bucket) {
          const ddx = this.xs[i] - x;
          const ddz = this.zs[i] - z;
          if (ddx * ddx + ddz * ddz <= r2 && this.ys[i] < lowest) lowest = this.ys[i];
        }
      }
    }
    return lowest;
  }
}

export interface TrackData {
  curve: CatmullRomCurve3;
  corridor: TrackCorridor;
  /** Normalised arc-length position of each station anchor. */
  stationU: Record<string, number>;
  /** The two running rails and the box spine, as swept tube paths. */
  railPaths: CatmullRomCurve3[];
  spinePath: CatmullRomCurve3;
  /** Cross ties and the webbing between spine and rails. */
  ties: TrackPiece[];
  /** Lattice support towers down to the terrain. */
  supports: TrackPiece[];
  length: number;
}

const FORWARD = new Vector3(0, 0, 1);

/** A box stretched and rotated to span two points — the universal strut. */
function beam(a: Vector3, b: Vector3, thickness: number, c: number): TrackPiece {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const q = new Quaternion().setFromUnitVectors(FORWARD, dir.normalize());
  return {
    p: [mid.x, mid.y, mid.z],
    q: [q.x, q.y, q.z, q.w],
    s: [thickness, thickness, Math.max(len, 0.05)],
    c,
  };
}

function nodeY(t: TerrainData, node: Node) {
  if (node.abs) return node.y;
  const h = t.heightAt(node.x, node.z);
  const base = h === VOID_HEIGHT ? WORLD.seaLevel : h;
  return base + node.y;
}

export function buildTrack(terrain: TerrainData): TrackData {
  const pts = NODES.map((n) => new Vector3(n.x, nodeY(terrain, n), n.z));
  const curve = new CatmullRomCurve3(pts, true, "catmullrom", 0.35);
  // three re-derives the arc-length table on demand and defaults to 200
  // divisions; over a spline this long that is far too coarse and the rider
  // would speed up and slow down between control points.
  const DIV = 4000;
  curve.arcLengthDivisions = DIV;

  // arc-length position of every control point. On a closed curve three maps
  // control point i to t = i / count (not i / (count - 1)).
  const lengths = curve.getLengths(DIV);
  const total = lengths[DIV];
  const uAtIndex = (i: number) => {
    const t = i / NODES.length;
    const j = t * DIV;
    const j0 = Math.floor(j);
    const j1 = Math.min(DIV, j0 + 1);
    const f = j - j0;
    return (lengths[j0] + (lengths[j1] - lengths[j0]) * f) / total;
  };

  const stationU: Record<string, number> = {};
  NODES.forEach((n, i) => {
    if (n.station) stationU[n.station] = uAtIndex(i);
  });

  /* ── the physical ride ──────────────────────────────────────────────────
   * A real coaster is a triangulated spine: one box beam carrying two round
   * running rails, tied together by a repeating web of struts. We sweep three
   * tube paths along the spline using its Frenet frames (which roll with the
   * curvature, so the whole assembly banks through turns for free), then bolt
   * on the webbing and lattice supports as instanced beams.
   */
  const ties: TrackPiece[] = [];
  const supports: TrackPiece[] = [];

  const SEGS = 820;
  const frames = curve.computeFrenetFrames(SEGS, true);

  const leftPts: Vector3[] = [];
  const rightPts: Vector3[] = [];
  const spinePts: Vector3[] = [];

  const GAUGE = 1.15; // half-distance between running rails
  const RAIL_RISE = 0.62; // rails sit above the spine
  const cur = new Vector3();

  // exclusive of SEGS: the swept paths are closed, so the last sample would
  // duplicate the first and give the spline a zero-length segment
  for (let i = 0; i < SEGS; i++) {
    curve.getPointAt(i / SEGS, cur);
    const N = frames.normals[Math.min(i, SEGS - 1)];
    const B = frames.binormals[Math.min(i, SEGS - 1)];

    const l = cur.clone().addScaledVector(B, -GAUGE).addScaledVector(N, RAIL_RISE);
    const r = cur.clone().addScaledVector(B, GAUGE).addScaledVector(N, RAIL_RISE);
    const s = cur.clone().addScaledVector(N, -0.5);

    leftPts.push(l);
    rightPts.push(r);
    spinePts.push(s);

    // webbing: alternating V-struts from the spine up to each rail, plus a
    // cross tie. This is what gives a coaster its unmistakable read.
    if (i % 6 === 0) {
      ties.push(beam(l, r, 0.16, PALETTE.rockDark));
      ties.push(beam(s, l, 0.15, PALETTE.rockDark));
      ties.push(beam(s, r, 0.15, PALETTE.rockDark));
    } else if (i % 3 === 0) {
      const ahead = ((i + 6) % SEGS) / SEGS;
      const nxt = curve.getPointAt(ahead);
      const nl = nxt.clone().addScaledVector(B, -GAUGE).addScaledVector(N, RAIL_RISE);
      const nr = nxt.clone().addScaledVector(B, GAUGE).addScaledVector(N, RAIL_RISE);
      ties.push(beam(s, nl, 0.11, PALETTE.rockDark));
      ties.push(beam(s, nr, 0.11, PALETTE.rockDark));
    }

    /* lattice support towers */
    if (i % 22 === 0) {
      const ground = terrain.heightAt(cur.x, cur.z);
      if (ground === VOID_HEIGHT) continue;
      const gap = cur.y - ground;
      if (gap < 4 || gap > 95) continue;

      const spread = Math.min(3.4, 0.9 + gap * 0.09);
      const top = s.clone();
      const legs: Vector3[] = [];
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        const foot = new Vector3(cur.x + sx * spread, ground - 0.5, cur.z + sz * spread);
        legs.push(foot);
        supports.push(beam(foot, top, 0.3, PALETTE.crust));
      }

      // horizontal rungs + diagonal bracing up the tower
      const rungs = Math.max(1, Math.floor(gap / 7));
      for (let k = 1; k <= rungs; k++) {
        const t = k / (rungs + 1);
        const ring = legs.map((f) => f.clone().lerp(top, t));
        supports.push(beam(ring[0], ring[1], 0.16, PALETTE.crustDark));
        supports.push(beam(ring[2], ring[3], 0.16, PALETTE.crustDark));
        supports.push(beam(ring[0], ring[2], 0.16, PALETTE.crustDark));
        supports.push(beam(ring[1], ring[3], 0.16, PALETTE.crustDark));
        if (k < rungs) {
          const up = legs.map((f) => f.clone().lerp(top, (k + 1) / (rungs + 1)));
          supports.push(beam(ring[0], up[1], 0.11, PALETTE.crustDark));
          supports.push(beam(ring[2], up[3], 0.11, PALETTE.crustDark));
        }
      }
      // footing pads
      for (const foot of legs) {
        supports.push({
          p: [foot.x, foot.y, foot.z],
          q: [0, 0, 0, 1],
          s: [1.5, 1, 1.5],
          c: PALETTE.crustDark,
        });
      }
    }
  }

  // Swept paths carry ~800 control points, so their arc-length table has to be
  // finer still or TubeGeometry bunches the rails up through tight curves.
  const mk = (points: Vector3[]) => {
    const c = new CatmullRomCurve3(points, true, "centripetal", 0.5);
    c.arcLengthDivisions = DIV;
    return c;
  };

  return {
    curve,
    corridor: new TrackCorridor(curve),
    stationU,
    railPaths: [mk(leftPts), mk(rightPts)],
    spinePath: mk(spinePts),
    ties,
    supports,
    length: total,
  };
}

export interface StationTiming {
  id: string;
  enter: number;
  exit: number;
  u: number;
}

/**
 * Builds the scroll -> arc-length remap. Each station gets its anchor placed a
 * third of the way into its own scroll slice so the camera settles before the
 * copy is fully readable, then eases on.
 */
export function makeProgressMap(
  stations: { id: string; scroll: { enter: number; exit: number } }[],
  stationU: Record<string, number>,
) {
  // The rider sits at the circuit's start point for the whole dive-in from
  // orbit, so u == 0 exactly when the handover completes. That is what makes
  // the wrap from p = 1 back to p = RIDE_START seamless.
  const keys: { p: number; u: number }[] = [
    { p: 0, u: 0 },
    { p: RIDE_START, u: 0 },
  ];
  for (const s of stations) {
    const u = stationU[s.id];
    if (u === undefined) continue;
    const p = s.scroll.enter + (s.scroll.exit - s.scroll.enter) * 0.34;
    keys.push({ p, u });
  }

  // The return leg carries a lot of arc length but only a sliver of scroll.
  // Without a midpoint the rider would be flung around it; this splits the
  // remainder so the first half of the flyaround stays watchable.
  const last = keys[keys.length - 1];
  if (last && last.p < LAP_END) {
    keys.push({
      p: last.p + (LAP_END - last.p) * 0.55,
      u: last.u + (1 - last.u) * 0.42,
    });
  }

  // the lap closes before the page bottom; the sliver beyond it holds still
  keys.push({ p: LAP_END, u: 1 });
  keys.push({ p: 1, u: 1 });
  keys.sort((a, b) => a.p - b.p);

  return function progressToU(p: number) {
    const t = clamp01(p);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (t >= a.p && t <= b.p) {
        const f = (t - a.p) / (b.p - a.p || 1e-6);
        // ease within each leg so arrivals decelerate into the station
        const e = f * f * (3 - 2 * f) * 0.35 + f * 0.65;
        return a.u + (b.u - a.u) * e;
      }
    }
    return t;
  };
}

