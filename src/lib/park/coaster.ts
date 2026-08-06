import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { LAP_END, RIDE_START } from "@/lib/scroll/timeline";
import { clamp01 } from "./rand";

/**
 * THE RIDE.
 *
 * One closed steel circuit threaded through every zone of the park. Two things
 * here are worth knowing before changing anything:
 *
 * 1. SPEED IS PHYSICAL. Rather than moving the car at a constant rate along the
 *    spline, the builder solves `v = sqrt(2g·Δh)` from the crest of the lift
 *    hill and integrates `dt = ds/v` into a time table. The car therefore
 *    crawls up the lift and howls out of the drop for the same reason a real
 *    one does — the geometry alone decides it.
 *
 * 2. BANKING IS PHYSICAL TOO. Each sample's roll is `atan(v²κ/g)`, the angle
 *    that puts the rider's net force straight down through the seat. That is
 *    how real track is designed, and it is why the turns read as *engineered*
 *    rather than as a spline someone tilted by eye.
 */

interface Node {
  x: number;
  z: number;
  y: number;
  /** Station anchored at this node. */
  station?: string;
  /** On the chain lift — speed is held constant here instead of solved. */
  lift?: boolean;
}

const NODES: Node[] = [
  { x: 0, z: 214, y: 6, station: "origin" }, // the boarding platform
  { x: -20, z: 210, y: 6 },
  { x: -42, z: 200, y: 8, lift: true }, // chain engages
  { x: -62, z: 186, y: 26, lift: true },
  { x: -80, z: 170, y: 52, lift: true },
  { x: -96, z: 152, y: 76, lift: true },
  { x: -108, z: 138, y: 88, lift: true }, // crest
  { x: -118, z: 126, y: 80 }, // over the lip
  { x: -130, z: 112, y: 40 }, // and down
  { x: -140, z: 96, y: 10, station: "education" }, // bottom of the first drop

  { x: -152, z: 76, y: 30 },
  { x: -168, z: 54, y: 14 },
  { x: -188, z: 28, y: 40 },
  { x: -212, z: 0, y: 18 },
  { x: -232, z: -26, y: 46, station: "projects" }, // alongside the drop tower
  { x: -222, z: -56, y: 22 },
  { x: -194, z: -74, y: 38 }, // over the machine hall
  { x: -160, z: -86, y: 16 },
  { x: -126, z: -98, y: 44 },
  { x: -100, z: -116, y: 62 }, // climbing to the wheel
  { x: -78, z: -140, y: 34 }, // straight through it
  { x: -58, z: -168, y: 52 },
  { x: -34, z: -196, y: 18, station: "experience" }, // under the gantry

  { x: 4, z: -212, y: 34 },
  { x: 42, z: -206, y: 12 },
  { x: 74, z: -186, y: 9 },
  { x: 104, z: -166, y: 11, station: "skills" }, // low and fast down the midway
  { x: 132, z: -140, y: 9 },

  { x: 156, z: -108, y: 44 }, // airtime hill
  { x: 172, z: -72, y: 12 },
  { x: 190, z: -34, y: 52 }, // and a bigger one
  { x: 202, z: 6, y: 14 },
  { x: 206, z: 44, y: 40, station: "awards" }, // over the prize row
  { x: 194, z: 80, y: 16 },

  { x: 172, z: 112, y: 24 },
  { x: 144, z: 140, y: 10, station: "contact" }, // brake run
  { x: 108, z: 168, y: 7 },
  { x: 70, z: 190, y: 6 },
  { x: 36, z: 206, y: 6 },
];

/** Samples along the circuit. Everything downstream indexes this table. */
const N = 1500;
/** Resolution of the tau -> u inverse table. */
const M = 2048;

const G = 9.81;
/** Chain speed, m/s. */
const V_LIFT = 6.5;
/** The car never fully stops, even at a crest. */
const V_MIN = 7;
/** Residual speed at the very top of the lift. */
const CREST_HEAD = 2.6;
const MAX_BANK = 1.05;

export const HALF_GAUGE = 0.58;
export const RAIL_R = 0.115;
export const RAIL_RISE = 0.44;
export const SPINE_R = 0.34;

export interface Piece {
  p: [number, number, number];
  q: [number, number, number, number];
  s: [number, number, number];
}

export interface CoasterData {
  curve: CatmullRomCurve3;
  length: number;
  /** Arc-length position of each station's anchor node. */
  stationU: Record<string, number>;
  /** The same anchors in ride-time space, which is what scroll maps onto. */
  stationTau: Record<string, number>;
  /** Chain-lift span, in u. */
  liftRange: [number, number];
  maxSpeed: number;

  railPaths: [CatmullRomCurve3, CatmullRomCurve3];
  spinePath: CatmullRomCurve3;
  catwalk: BufferGeometry;
  chain: BufferGeometry;
  ties: Piece[];
  supports: Piece[];

  /** Ride time (0..1) -> arc length (0..1). */
  uAtTau(tau: number): number;
  /** Pose of the car at arc-length u. Returns speed in m/s. */
  sample(u: number, pos: Vector3, quat: Quaternion): number;
  /** Right and up axes at u, for hanging things off the track. */
  basis(u: number, right: Vector3, up: Vector3, fwd: Vector3): void;
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

const FORWARD = new Vector3(0, 0, 1);
const WORLD_UP = new Vector3(0, 1, 0);

/** A unit box stretched and rotated to span two points. */
function beam(a: Vector3, b: Vector3, thickness: number): Piece {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const q = new Quaternion().setFromUnitVectors(FORWARD, dir.normalize());
  return {
    p: [mid.x, mid.y, mid.z],
    q: [q.x, q.y, q.z, q.w],
    s: [thickness, thickness, Math.max(len, 0.05)],
  };
}

/**
 * A flat ribbon swept along a path — the maintenance catwalk and the lift
 * chain. One geometry, one draw call, no instancing overhead.
 */
function ribbon(centre: Vector3[], right: Vector3[], width: number, closed: boolean) {
  const n = centre.length;
  const verts = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const norms = new Float32Array(n * 2 * 3);
  const half = width / 2;

  for (let i = 0; i < n; i++) {
    const c = centre[i];
    const r = right[i];
    const v = i * 6;
    verts[v] = c.x - r.x * half;
    verts[v + 1] = c.y - r.y * half;
    verts[v + 2] = c.z - r.z * half;
    verts[v + 3] = c.x + r.x * half;
    verts[v + 4] = c.y + r.y * half;
    verts[v + 5] = c.z + r.z * half;
    // flat-ish upward normal is fine: these are always seen edge-on or from above
    norms[v + 1] = 1;
    norms[v + 4] = 1;
    const u = (i / (n - 1)) * n * 0.12;
    uvs[i * 4] = u;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = u;
    uvs[i * 4 + 3] = 1;
  }

  const quads = closed ? n : n - 1;
  const idx = new Uint32Array(quads * 6);
  for (let i = 0; i < quads; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    idx.set([a, b, a + 1, b, b + 1, a + 1], i * 6);
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(verts, 3));
  g.setAttribute("normal", new BufferAttribute(norms, 3));
  g.setAttribute("uv", new BufferAttribute(uvs, 2));
  g.setIndex(new BufferAttribute(idx, 1));
  return g;
}

/* ── build ────────────────────────────────────────────────────────────────── */

export function buildCoaster(): CoasterData {
  const pts = NODES.map((n) => new Vector3(n.x, n.y, n.z));
  const curve = new CatmullRomCurve3(pts, true, "catmullrom", 0.42);
  const DIV = 6000;
  curve.arcLengthDivisions = DIV;

  const lengths = curve.getLengths(DIV);
  const total = lengths[DIV];

  // On a closed curve three maps control point i to t = i / count, so the
  // arc-length position of a node is the length table read at that t.
  const uAtNode = (i: number) => {
    const j = (i / NODES.length) * DIV;
    const j0 = Math.floor(j);
    const j1 = Math.min(DIV, j0 + 1);
    return (lengths[j0] + (lengths[j1] - lengths[j0]) * (j - j0)) / total;
  };

  const stationU: Record<string, number> = {};
  let liftStart = 1;
  let liftEnd = 0;
  NODES.forEach((n, i) => {
    if (n.station) stationU[n.station] = uAtNode(i);
    if (n.lift) {
      liftStart = Math.min(liftStart, uAtNode(i));
      liftEnd = Math.max(liftEnd, uAtNode(i));
    }
  });

  /* ── sample the circuit ────────────────────────────────────────────────── */

  const COUNT = N + 1; // last entry duplicates the first so wrapping is seamless
  const pos = new Float32Array(COUNT * 3);
  const tan = new Float32Array(COUNT * 3);
  const quat = new Float32Array(COUNT * 4);
  const speed = new Float32Array(COUNT);
  const rightArr = new Float32Array(COUNT * 3);
  const upArr = new Float32Array(COUNT * 3);

  const p = new Vector3();
  const t = new Vector3();
  let hTop = -Infinity;

  for (let i = 0; i < COUNT; i++) {
    const u = (i % N) / N;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    p.toArray(pos, i * 3);
    t.toArray(tan, i * 3);
    if (p.y > hTop) hTop = p.y;
  }

  // ds is constant because getPointAt is arc-length parameterised
  const ds = total / N;

  /* ── speed: conservation of energy off the crest ───────────────────────── */

  // The circuit opens at the station, so u = 0 .. liftEnd is dispatch + chain,
  // and the brake run hauls the car back down to chain speed before it gets
  // there. That is how a real ride is laid out, and it is also what makes the
  // lap wrap invisible: the speed at u = 1 has to equal the speed at u = 0.
  const brakeFrom = stationU.contact ?? 0.9;

  for (let i = 0; i < COUNT; i++) {
    const u = (i % N) / N;
    const y = pos[i * 3 + 1];
    const free = Math.sqrt(Math.max(V_MIN * V_MIN, 2 * G * (hTop + CREST_HEAD - y)));

    if (u <= liftEnd) {
      // rolling out of the station, then on the chain. Release over the last
      // stretch of the lift so the drop is a swell rather than a step change.
      const k = clamp01((u - liftStart) / Math.max(1e-6, liftEnd - liftStart));
      const blend = k > 0.86 ? (k - 0.86) / 0.14 : 0;
      speed[i] = V_LIFT + (free - V_LIFT) * blend * blend;
    } else if (u >= brakeFrom) {
      const b = clamp01((u - brakeFrom) / Math.max(1e-6, 1 - brakeFrom));
      speed[i] = free + (V_LIFT - free) * (b * b * (3 - 2 * b));
    } else {
      speed[i] = free;
    }
  }

  /* ── banking: the angle that puts net force through the seat ───────────── */

  const roll = new Float32Array(COUNT);
  const ta = new Vector3();
  const tb = new Vector3();
  for (let i = 0; i < COUNT; i++) {
    ta.fromArray(tan, i * 3);
    tb.fromArray(tan, ((i + 1) % N) * 3);
    // signed horizontal turn rate; positive means bending to the left
    const cross = ta.x * tb.z - ta.z * tb.x;
    const kappa = -cross / ds;
    const v = speed[i];
    roll[i] = Math.max(-MAX_BANK, Math.min(MAX_BANK, Math.atan((v * v * kappa) / G)));
  }
  // two box-blur passes, wrapped — raw curvature off a spline is far too noisy
  // to steer a camera with
  for (let pass = 0; pass < 2; pass++) {
    const src = roll.slice();
    const R = 14;
    for (let i = 0; i < COUNT; i++) {
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += src[(((i + k) % N) + N) % N];
      roll[i] = sum / (R * 2 + 1);
    }
  }

  /* ── frames ────────────────────────────────────────────────────────────── */

  const fwd = new Vector3();
  const up = new Vector3();
  const right = new Vector3();
  const left = new Vector3();
  const basisM = new Matrix4();
  const q = new Quaternion();

  for (let i = 0; i < COUNT; i++) {
    fwd.fromArray(tan, i * 3).normalize();
    // world up, orthogonalised against the tangent. The circuit never inverts,
    // so this is stabler than a transported frame and has no arbitrary start.
    up.copy(WORLD_UP).addScaledVector(fwd, -WORLD_UP.dot(fwd));
    if (up.lengthSq() < 1e-6) up.set(0, 0, 1);
    up.normalize();
    left.crossVectors(WORLD_UP, fwd).normalize();

    // lean into the turn
    const a = roll[i];
    up.multiplyScalar(Math.cos(a)).addScaledVector(left, Math.sin(a)).normalize();
    right.crossVectors(fwd, up).normalize();
    up.crossVectors(right, fwd).normalize();

    right.toArray(rightArr, i * 3);
    up.toArray(upArr, i * 3);

    // basis(+X right, +Y up, +Z back) so the object's -Z runs along the track
    basisM.makeBasis(right, up, fwd.clone().negate());
    q.setFromRotationMatrix(basisM).toArray(quat, i * 4);
  }

  /* ── ride time ─────────────────────────────────────────────────────────── */

  const time = new Float32Array(COUNT);
  for (let i = 1; i < COUNT; i++) {
    // trapezoid on 1/v
    time[i] = time[i - 1] + ds * 0.5 * (1 / speed[i - 1] + 1 / speed[i]);
  }
  const totalTime = time[COUNT - 1];
  for (let i = 0; i < COUNT; i++) time[i] /= totalTime;

  // invert to a uniform tau -> u table
  const uOfTau = new Float32Array(M + 1);
  let cursor = 0;
  for (let k = 0; k <= M; k++) {
    const target = k / M;
    while (cursor < COUNT - 2 && time[cursor + 1] < target) cursor++;
    const span = time[cursor + 1] - time[cursor] || 1e-9;
    const f = clamp01((target - time[cursor]) / span);
    uOfTau[k] = (cursor + f) / N;
  }

  const tauAtU = (u: number) => {
    const f = clamp01(u) * N;
    const i = Math.min(COUNT - 2, Math.floor(f));
    return time[i] + (time[i + 1] - time[i]) * (f - i);
  };

  const stationTau: Record<string, number> = {};
  for (const [id, u] of Object.entries(stationU)) stationTau[id] = tauAtU(u);

  /* ── physical track ────────────────────────────────────────────────────── */

  const leftPts: Vector3[] = [];
  const rightPts: Vector3[] = [];
  const spinePts: Vector3[] = [];
  const walkC: Vector3[] = [];
  const walkR: Vector3[] = [];
  const chainC: Vector3[] = [];
  const chainR: Vector3[] = [];
  const ties: Piece[] = [];
  const supports: Piece[] = [];

  const c = new Vector3();
  const rv = new Vector3();
  const uv = new Vector3();
  const tmpA = new Vector3();
  const tmpB = new Vector3();

  for (let i = 0; i < N; i++) {
    const u = i / N;
    c.fromArray(pos, i * 3);
    rv.fromArray(rightArr, i * 3);
    uv.fromArray(upArr, i * 3);

    const rail = (side: number) =>
      c.clone().addScaledVector(rv, side * HALF_GAUGE).addScaledVector(uv, RAIL_RISE);
    const l = rail(-1);
    const r = rail(1);
    const s = c.clone().addScaledVector(uv, -0.28);

    leftPts.push(l);
    rightPts.push(r);
    spinePts.push(s);

    // catwalk hangs off the right-hand side, just below the rails
    walkC.push(c.clone().addScaledVector(rv, HALF_GAUGE + 1.15).addScaledVector(uv, -0.1));
    walkR.push(rv.clone());

    if (u >= liftStart && u <= liftEnd) {
      chainC.push(c.clone().addScaledVector(uv, 0.06));
      chainR.push(rv.clone());
    }

    // webbing: the alternating V of struts that makes a coaster unmistakable
    if (i % 5 === 0) {
      ties.push(beam(l, r, 0.12));
      ties.push(beam(s, l, 0.11));
      ties.push(beam(s, r, 0.11));
    } else if (i % 5 === 2) {
      const j = (i + 5) % N;
      tmpA.fromArray(pos, j * 3);
      tmpB.fromArray(rightArr, j * 3);
      const nu = new Vector3().fromArray(upArr, j * 3);
      const nl = tmpA.clone().addScaledVector(tmpB, -HALF_GAUGE).addScaledVector(nu, RAIL_RISE);
      const nr = tmpA.clone().addScaledVector(tmpB, HALF_GAUGE).addScaledVector(nu, RAIL_RISE);
      ties.push(beam(s, nl, 0.075));
      ties.push(beam(s, nr, 0.075));
    }

    /* lattice support towers */
    if (i % 34 === 0) {
      const gap = c.y;
      if (gap < 4.5) continue;
      const spread = Math.min(4.6, 1.1 + gap * 0.075);
      const top = s.clone();
      const legs: Vector3[] = [];
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        const foot = new Vector3(c.x + sx * spread, 0, c.z + sz * spread);
        legs.push(foot);
        supports.push(beam(foot, top, 0.34));
      }

      const rungs = Math.max(1, Math.floor(gap / 8));
      for (let k = 1; k <= rungs; k++) {
        const f = k / (rungs + 1);
        const ring = legs.map((leg) => leg.clone().lerp(top, f));
        supports.push(beam(ring[0], ring[1], 0.15));
        supports.push(beam(ring[2], ring[3], 0.15));
        supports.push(beam(ring[0], ring[2], 0.15));
        supports.push(beam(ring[1], ring[3], 0.15));
        if (k < rungs) {
          const nxt = legs.map((leg) => leg.clone().lerp(top, (k + 1) / (rungs + 1)));
          supports.push(beam(ring[0], nxt[1], 0.1));
          supports.push(beam(ring[2], nxt[3], 0.1));
        }
      }
      for (const foot of legs) {
        supports.push({ p: [foot.x, 0.35, foot.z], q: [0, 0, 0, 1], s: [2.1, 0.7, 2.1] });
      }
    }
  }

  const path = (points: Vector3[]) => {
    const cv = new CatmullRomCurve3(points, true, "centripetal", 0.5);
    cv.arcLengthDivisions = DIV;
    return cv;
  };

  /* ── sampling API ──────────────────────────────────────────────────────── */

  const qa = new Quaternion();
  const qb = new Quaternion();

  function sample(u: number, outPos: Vector3, outQuat: Quaternion) {
    const f = clamp01(u) * N;
    const i = Math.min(COUNT - 2, Math.floor(f));
    const k = f - i;
    outPos.set(
      pos[i * 3] + (pos[(i + 1) * 3] - pos[i * 3]) * k,
      pos[i * 3 + 1] + (pos[(i + 1) * 3 + 1] - pos[i * 3 + 1]) * k,
      pos[i * 3 + 2] + (pos[(i + 1) * 3 + 2] - pos[i * 3 + 2]) * k,
    );
    qa.fromArray(quat, i * 4);
    qb.fromArray(quat, (i + 1) * 4);
    outQuat.slerpQuaternions(qa, qb, k);
    return speed[i] + (speed[i + 1] - speed[i]) * k;
  }

  function basis(u: number, outRight: Vector3, outUp: Vector3, outFwd: Vector3) {
    const i = Math.min(COUNT - 1, Math.round(clamp01(u) * N));
    outRight.fromArray(rightArr, i * 3);
    outUp.fromArray(upArr, i * 3);
    outFwd.fromArray(tan, i * 3);
  }

  function uAtTau(tau: number) {
    const f = clamp01(tau) * M;
    const i = Math.min(M - 1, Math.floor(f));
    return uOfTau[i] + (uOfTau[i + 1] - uOfTau[i]) * (f - i);
  }

  let maxSpeed = 0;
  for (let i = 0; i < COUNT; i++) if (speed[i] > maxSpeed) maxSpeed = speed[i];

  return {
    curve,
    length: total,
    stationU,
    stationTau,
    liftRange: [liftStart, liftEnd],
    maxSpeed,
    railPaths: [path(leftPts), path(rightPts)],
    spinePath: path(spinePts),
    catwalk: ribbon(walkC, walkR, 1.5, true),
    chain: ribbon(chainC, chainR, 0.34, false),
    ties,
    supports,
    uAtTau,
    sample,
    basis,
  };
}

/* ── scroll -> ride time ──────────────────────────────────────────────────── */

export interface TimedStation {
  id: string;
  scroll: { enter: number; exit: number };
}

/**
 * Builds the scroll -> ride-time remap. Each station's anchor is placed a third
 * of the way into its own scroll slice, so the camera settles before the copy
 * is fully readable and then eases on.
 *
 * Note this maps into *time*, not arc length — the energy profile then decides
 * where along the rail that time actually is, which is what preserves the
 * coaster's acceleration inside every leg.
 */
export function makeProgressMap(
  stations: TimedStation[],
  stationTau: Record<string, number>,
) {
  // The rider sits at the circuit's start for the whole dive-in from orbit, so
  // tau == 0 exactly when the handover completes. That is what makes the wrap
  // from LAP_END back to RIDE_START seamless.
  const keys: { p: number; tau: number }[] = [
    { p: 0, tau: 0 },
    { p: RIDE_START, tau: 0 },
  ];

  for (const s of stations) {
    const tau = stationTau[s.id];
    if (tau === undefined || tau === 0) continue;
    keys.push({ p: s.scroll.enter + (s.scroll.exit - s.scroll.enter) * 0.34, tau });
  }

  keys.push({ p: LAP_END, tau: 1 });
  keys.push({ p: 1, tau: 1 });
  keys.sort((a, b) => a.p - b.p);

  return function progressToTau(p: number) {
    const t = clamp01(p);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (t >= a.p && t <= b.p) {
        const f = (t - a.p) / (b.p - a.p || 1e-6);
        // a touch of ease inside each leg so arrivals settle into the station
        const e = f * f * (3 - 2 * f) * 0.3 + f * 0.7;
        return a.tau + (b.tau - a.tau) * e;
      }
    }
    return t;
  };
}
