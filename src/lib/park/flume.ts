import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from "three";

/**
 * THE FLUME.
 *
 * One master curve, wound down the tower and then instanced three times at
 * 120°. That is not a shortcut, it is the whole trick: three independently
 * shaped helices sharing a tower will always find a way to pass through one
 * another, and the ride ends up threading somebody else's slide.
 *
 * Rotational copies of a single descending curve can be made not to, but the
 * condition is sharper than it first looks. Equal heights are easy: those are
 * the same curve parameter, so the points share a radius and differ by 120° of
 * yaw, which at our narrowest radius is nineteen units apart. The binding case
 * is the near miss — where one slide passes *over* another. At a given bearing
 * the three flumes are stacked a third of a turn apart, so what has to clear a
 * trough is the drop across 120° of turn, everywhere:
 *
 *     min drop per 120° of turn  >  trough diameter
 *
 * That is why the spiral is only a turn and a quarter over thirty-five units,
 * and why the descent is close to a constant pitch instead of easing in and
 * out. An eased descent crawls at the gate, and crawling at the gate is
 * precisely where the three of them crowd. `assertClearance` below checks the
 * built curve rather than trusting the arithmetic.
 *
 * The trough is an open U rather than a pipe, because that is what a water
 * slide is, and because you cannot see out of a pipe.
 */

export const FLUME = {
  /**
   * Platform floor. Level with the trough's rim at the gate rather than with
   * its axis — you step over a lip and sit down into the slide, which is both
   * how a real one works and the only way the deck edge and the trough mouth
   * meet instead of one floating three units above the other.
   */
  deck: 44.6,
  /** Where the trough picks you up. Its floor is a trough-radius below this. */
  entryY: 45.2,
  /** Bottom of the spiral, before the run-out swings wide. */
  helixEndY: 10,
  /** Lip of the trough where it lets go of you, just clear of the water. */
  exitY: 5.6,
  rTop: 11,
  rBot: 19,
  /** How far out over the pool the run-out reaches. */
  rExit: 22,
  /**
   * The number that keeps the three slides apart. Thirty-five units of drop
   * across a turn and a quarter is twenty-eight per turn, so nine per 120° —
   * comfortably more than the trough is thick. Winding it tighter is what put
   * the old tower's slides through each other.
   */
  turns: 1.25,
  runoutTurn: 0.2,
  /** Inner radius of the trough. */
  trough: 3.15,
  /** Half-angle of the U. Past π/2 the walls start to close back over you. */
  arc: 1.45,
  /** Ring the tower's columns stand on. */
  coreR: 4.8,
  poolR: 26,
  waterY: 1.5,
} as const;

/**
 * Gravity, in park units. The park runs at roughly 2.1 units to the metre —
 * a forty-unit tower is a twenty-metre one — so 9.81 m/s² lands here.
 */
const G = 21;
/** What survives the water's drag. Straight energy conservation is far too fast. */
const ETA = 0.35;
/** Push off the top rather than trickling out of the gate. */
const V0 = 6;
/** Past about 65° of bank the trough is a wall and the ride reads as a bug. */
const MAX_BANK = 1.15;

/** Derivative of smootherstep — the shape of the descent, not the descent. */
const dSmoother = (t: number) => 30 * t * t * (1 - t) * (1 - t);

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** One sampled station along the flume, with its banked frame. */
export interface Station {
  /** Centre of the trough's arc — the rider sits a trough-radius below this. */
  p: Vector3;
  /** Unit tangent, pointing downhill. */
  t: Vector3;
  /** Trough up, rolled into the bank. */
  u: Vector3;
  /** Trough left, rolled with it. `(-n, u, t)` is a right-handed basis. */
  n: Vector3;
  /** Arc length from the gate. */
  s: number;
  /** Roll, radians. Signed the same way as a rotation about `t`. */
  bank: number;
  /** How fast you are going through here. */
  v: number;
}

export interface FlumeData {
  stations: Station[];
  length: number;
  /** Trough and its rolled rims, in one buffer. */
  shell: BufferGeometry;
  /** The sheet of water running down it. */
  water: BufferGeometry;
  /** Cantilever brackets tying the trough back to the tower. */
  brackets: { from: Vector3; to: Vector3 }[];
}

/* ── the master curve ─────────────────────────────────────────────────────── */

function masterCurve(): CatmullRomCurve3 {
  const { entryY, helixEndY, exitY, rTop, rBot, rExit, turns, runoutTurn } = FLUME;
  const NH = 132;
  const NR = 44;
  const pts: Vector3[] = [];

  // Integrate the descent instead of writing it, so it cannot go uphill. Both
  // terms stay near one on purpose: a flume that eases in and out of its drop
  // reads better on paper but spends the gate crawling, and the gate is exactly
  // where the three slides are stacked closest. `base` is a mild steepening
  // through the middle, `roll` one gentle swell per turn — enough that the
  // slide breathes, small enough that the 120° drop never thins below a trough.
  const rate: number[] = [];
  let total = 0;
  for (let i = 0; i <= NH; i++) {
    const t = i / NH;
    const base = 0.94 + 0.12 * dSmoother(t);
    const roll = 1 + 0.15 * Math.cos(t * turns * Math.PI * 2);
    rate.push(base * roll);
    if (i > 0) total += (rate[i - 1] + rate[i]) * 0.5;
  }

  const dropH = entryY - helixEndY;
  let acc = 0;
  for (let i = 0; i <= NH; i++) {
    const t = i / NH;
    if (i > 0) acc += (rate[i - 1] + rate[i]) * 0.5;
    const a = t * turns * Math.PI * 2;
    const r = rTop + (rBot - rTop) * Math.pow(t, 0.8);
    pts.push(new Vector3(Math.cos(a) * r, entryY - (acc / total) * dropH, Math.sin(a) * r));
  }

  // Run-out: the spiral unwinds, swings out over the pool and flattens into
  // the drop. Still strictly descending, so it is covered by the same proof.
  const aEnd = turns * Math.PI * 2;
  const dropR = helixEndY - exitY;
  for (let i = 1; i <= NR; i++) {
    const t = i / NR;
    const ease = 1 - (1 - t) * (1 - t);
    const a = aEnd + runoutTurn * Math.PI * 2 * ease;
    const r = rBot + (rExit - rBot) * ease;
    const y = helixEndY - dropR * (0.16 * t + 0.84 * (1 - Math.pow(1 - t, 1.7)));
    pts.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }

  return new CatmullRomCurve3(pts, false, "catmullrom", 0.5);
}

/* ── frames, speed and bank ───────────────────────────────────────────────── */

function buildStations(curve: CatmullRomCurve3, N: number): Station[] {
  const pts: Vector3[] = [];
  for (let i = 0; i <= N; i++) pts.push(curve.getPoint(i / N));

  const arc: number[] = [0];
  for (let i = 1; i <= N; i++) arc.push(arc[i - 1] + pts[i].distanceTo(pts[i - 1]));

  const UP = new Vector3(0, 1, 0);
  const y0 = pts[0].y;
  const out: Station[] = [];

  for (let i = 0; i <= N; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(N, i + 1)];
    const t = b.clone().sub(a).normalize();
    // Fixed-up frame rather than Frenet. A Frenet normal on a helix rolls the
    // trough over on its own as the curve twists, which is a bank you did not
    // ask for and cannot control; this one starts level and takes only the
    // bank computed below.
    const n = new Vector3().crossVectors(t, UP).normalize();
    const u = new Vector3().crossVectors(n, t).normalize();
    // Energy conservation, minus what the water eats.
    const v = Math.sqrt(V0 * V0 + 2 * G * ETA * Math.max(0, y0 - pts[i].y));
    out.push({ p: pts[i], t, u, n, s: arc[i], bank: 0, v });
  }

  // Bank each station by the angle that puts the net force through the floor —
  // which is how a real flume is built, and the reason the water stays in it.
  for (let i = 0; i <= N; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(N, i + 1)];
    const ds = b.s - a.s;
    if (ds < 1e-4) continue;
    const st = out[i];
    // dT/ds, flattened: what is left points at the centre of the turn.
    const turn = b.t.clone().sub(a.t).divideScalar(ds);
    turn.y = 0;
    const kappa = turn.length();
    if (kappa < 1e-6) continue;
    const side = turn.divideScalar(kappa).dot(st.n) < 0 ? -1 : 1;
    st.bank = side * clamp(Math.atan((kappa * st.v * st.v) / G), 0, MAX_BANK);
  }

  // Smooth the bank so the trough eases in and out of its turns instead of
  // snapping over at the top of the spiral.
  const raw = out.map((s) => s.bank);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < N; i++) raw[i] = (raw[i - 1] + raw[i] * 2 + raw[i + 1]) * 0.25;
  }
  for (let i = 0; i <= N; i++) {
    const st = out[i];
    st.bank = raw[i];
    if (!st.bank) continue;
    st.u.applyAxisAngle(st.t, st.bank);
    st.n.applyAxisAngle(st.t, st.bank);
  }

  return out;
}

/* ── sweeping a cross-section along it ────────────────────────────────────── */

/** A point on the cross-section: offset along `n`/`u`, plus its normal there. */
interface ProfilePt {
  lat: number;
  vert: number;
  nx: number;
  ny: number;
}

/** One continuous ribbon of cross-section. */
interface Strip {
  pts: ProfilePt[];
  /** Texture repeat across the strip. */
  across: number;
}

function sweep(stations: Station[], strips: Strip[], vScale: number): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const N = stations.length;

  for (const strip of strips) {
    const M = strip.pts.length;
    const base = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const st = stations[i];
      for (let j = 0; j < M; j++) {
        const q = strip.pts[j];
        pos.push(
          st.p.x + st.n.x * q.lat + st.u.x * q.vert,
          st.p.y + st.n.y * q.lat + st.u.y * q.vert,
          st.p.z + st.n.z * q.lat + st.u.z * q.vert,
        );
        nor.push(
          st.n.x * q.nx + st.u.x * q.ny,
          st.n.y * q.nx + st.u.y * q.ny,
          st.n.z * q.nx + st.u.z * q.ny,
        );
        uv.push((j / (M - 1)) * strip.across, st.s * vScale);
      }
    }
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < M - 1; j++) {
        const a = base + i * M + j;
        const b = a + M;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** The open U. Normals face inward, because that is the side you ride on. */
function troughStrip(R: number, A: number, M: number): Strip {
  const pts: ProfilePt[] = [];
  for (let j = 0; j <= M; j++) {
    const a = -A + (2 * A * j) / M;
    pts.push({
      lat: Math.sin(a) * R,
      vert: -Math.cos(a) * R,
      nx: -Math.sin(a),
      ny: Math.cos(a),
    });
  }
  return { pts, across: 1 };
}

/** The rolled rim along one edge — the bead every fibreglass flume is made of. */
function rimStrip(R: number, A: number, side: 1 | -1, bead: number, M: number): Strip {
  const cx = Math.sin(A * side) * (R + bead * 0.4);
  const cy = -Math.cos(A) * (R + bead * 0.4);
  const pts: ProfilePt[] = [];
  for (let j = 0; j <= M; j++) {
    const a = (j / M) * Math.PI * 2;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    pts.push({ lat: cx + nx * bead, vert: cy + ny * bead, nx, ny });
  }
  return { pts, across: 1 };
}

/**
 * The sheet of water, a hair above the floor and narrower than the trough.
 * Wide enough to still be under the rafts at `RAFT_FLOAT` — narrower than that
 * and a raft reads as floating past the edge of its own water.
 */
function waterStrip(R: number, M: number): Strip {
  const A = 1.0;
  const pts: ProfilePt[] = [];
  for (let j = 0; j <= M; j++) {
    const a = -A + (2 * A * j) / M;
    pts.push({
      lat: Math.sin(a) * (R - 0.12),
      vert: -Math.cos(a) * (R - 0.12),
      nx: -Math.sin(a),
      ny: Math.cos(a),
    });
  }
  return { pts, across: 1 };
}

/* ── the whole thing, built once ──────────────────────────────────────────── */

let cached: FlumeData | null = null;

/**
 * Geometry for one flume. Shared by every flume on every tower — they are all
 * the same curve at a different yaw, so building it twice would be building
 * the same forty thousand triangles twice.
 */
export function flume(): FlumeData {
  if (cached) return cached;

  const { trough: R, arc: A, coreR } = FLUME;
  const stations = buildStations(masterCurve(), 190);

  const shell = sweep(
    stations,
    [troughStrip(R, A, 14), rimStrip(R, A, 1, 0.3, 6), rimStrip(R, A, -1, 0.3, 6)],
    1 / 6,
  );
  const water = sweep(stations, [waterStrip(R, 8)], 1 / 9);

  // Brackets back to the tower: a cantilever arm plus a diagonal tie. Radial,
  // which is what makes them safe — a neighbouring flume is a third of a turn
  // away at every height, so a strut that only ever moves inward cannot reach
  // one, and the tower's own wraps at this bearing are a full turn above.
  //
  // `from` has to clear the shell's own outer skin — `R` is the floor's
  // centreline, so anything short of that (the previous 0.92·R) lands inside
  // the open channel instead of underneath it, and the strut comes out of the
  // water in the rider's lap. `R + rim bead` puts it on the true outside.
  const brackets: { from: Vector3; to: Vector3 }[] = [];
  const spiralEnd = stations.length - 52;
  for (let i = 6; i < spiralEnd; i += 12) {
    const st = stations[i];
    const from = st.p.clone().addScaledVector(st.u, -(R + 0.5));
    const bearing = Math.atan2(st.p.z, st.p.x);
    brackets.push({
      from,
      to: new Vector3(Math.cos(bearing) * coreR, from.y - 0.2, Math.sin(bearing) * coreR),
    });
    brackets.push({
      from,
      to: new Vector3(Math.cos(bearing) * coreR, Math.max(0, from.y - 3.2), Math.sin(bearing) * coreR),
    });
  }
  // The run-out has swung too far out to reach back. Support it with legs attached to the outer
  // underside of the flume so they stay completely clear of the rider's forward view and trough.
  for (let i = spiralEnd + 4; i < stations.length - 4; i += 22) {
    const st = stations[i];
    const from = st.p.clone().addScaledVector(st.u, -(R + 0.5)).addScaledVector(st.n, 1.4);
    brackets.push({ from, to: new Vector3(from.x, 0, from.z) });
  }

  cached = { stations, length: stations[stations.length - 1].s, shell, water, brackets };
  if (process.env.NODE_ENV === "development") assertClearance(cached);
  return cached;
}

/**
 * The invariant, checked against the geometry that actually got built.
 *
 * Every point of a trough lies within one trough-radius of its centreline, so
 * two centrelines further apart than a trough diameter cannot possibly share
 * space. Measuring that directly is worth more than the arithmetic in the
 * header comment: it holds no matter what anybody later does to the easing,
 * the turn count or the flare, which are exactly the knobs that look harmless
 * and are not.
 */
export function clearance(data: FlumeData) {
  const st = data.stations;
  const yaw = (Math.PI * 2) / 3;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);

  let neighbour = Infinity;
  let self = Infinity;
  for (let i = 0; i < st.length; i++) {
    const a = st[i].p;
    for (let j = 0; j < st.length; j++) {
      const b = st[j].p;
      // against the next slide round, which is this one turned a third of a turn
      const dx = a.x - (c * b.x - s * b.z);
      const dz = a.z - (s * b.x + c * b.z);
      const d = Math.hypot(dx, a.y - b.y, dz);
      if (d < neighbour) neighbour = d;
      // and against its own later wraps, ignoring the stretch either side of
      // here, which is near by definition rather than by mistake
      if (st[j].s - st[i].s > 24) {
        const own = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (own < self) self = own;
      }
    }
  }
  return { neighbour, self, needed: FLUME.trough * 2 };
}

function assertClearance(data: FlumeData) {
  const { neighbour, self, needed } = clearance(data);
  if (neighbour < needed || self < needed) {
    console.error(
      `[flume] slides overlap — centrelines come within ` +
        `${Math.min(neighbour, self).toFixed(2)} but a trough is ${needed.toFixed(2)} across ` +
        `(neighbour ${neighbour.toFixed(2)}, own wraps ${self.toFixed(2)}). ` +
        `Check FLUME.turns against the drop: each 120° of turn has to fall further ` +
        `than a trough is thick.`,
    );
  }
}

/* ── reading a position back out ──────────────────────────────────────────── */

export interface RidePose {
  pos: Vector3;
  /** Unit tangent. */
  fwd: Vector3;
  up: Vector3;
  left: Vector3;
  bank: number;
  v: number;
}

/**
 * Where you are, `s` units down the slide. Interpolates between stations
 * rather than re-evaluating the curve, so the frame — bank included — comes
 * out of the same data the trough was built from and the rider cannot drift
 * out of their own slide.
 */
export function poseAt(data: FlumeData, s: number, out: RidePose): RidePose {
  const st = data.stations;
  const last = st.length - 1;
  const clamped = clamp(s, 0, data.length);

  // Stations are near-uniform in arc length, so start from the proportional
  // guess and walk the couple of steps the easing put us out by.
  let i = clamp(Math.floor((clamped / data.length) * last), 0, last - 1);
  while (i > 0 && st[i].s > clamped) i--;
  while (i < last - 1 && st[i + 1].s < clamped) i++;

  const a = st[i];
  const b = st[i + 1];
  const span = b.s - a.s;
  const f = span > 1e-6 ? (clamped - a.s) / span : 0;

  out.pos.copy(a.p).lerp(b.p, f);
  out.fwd.copy(a.t).lerp(b.t, f).normalize();
  out.up.copy(a.u).lerp(b.u, f).normalize();
  // Re-derive left from the interpolated pair so the basis stays orthonormal.
  out.left.crossVectors(out.fwd, out.up).normalize();
  out.bank = a.bank + (b.bank - a.bank) * f;
  out.v = a.v + (b.v - a.v) * f;
  return out;
}

/** How far you coast past the lip before the pool has fully swallowed you. */
export const SPLASH_RUN = 17;

const LEVEL = new Vector3(0, 1, 0);

/**
 * Where a rider is `s` units into the ride, including the coast past the lip.
 * Past the end of the trough the flume has let go: you carry on along the exit
 * tangent, shedding the bank and settling onto the water. Returning the same
 * pose shape for both halves means the rider and the rafts do not need to know
 * which one they are in.
 */
export function slidePose(data: FlumeData, s: number, out: RidePose): RidePose {
  poseAt(data, s, out);
  const over = s - data.length;
  if (over <= 0) return out;

  const f = clamp(over / SPLASH_RUN, 0, 1);
  const glide = over * (1 - f * 0.45);
  out.pos.x += out.fwd.x * glide;
  out.pos.z += out.fwd.z * glide;
  // Float the trough frame down until its floor is the water line.
  const rest = FLUME.waterY + FLUME.trough - 0.4;
  out.pos.y += (rest - out.pos.y) * f * f;
  // Level off, and let the water take the speed out of you.
  out.bank *= 1 - f;
  LEVEL.set(0, 1, 0);
  out.up.lerp(LEVEL, f).normalize();
  out.left.crossVectors(out.fwd, out.up).normalize();
  out.v *= 1 - f * 0.8;
  return out;
}

export function makePose(): RidePose {
  return {
    pos: new Vector3(),
    fwd: new Vector3(0, 0, 1),
    up: new Vector3(0, 1, 0),
    left: new Vector3(1, 0, 0),
    bank: 0,
    v: 0,
  };
}
