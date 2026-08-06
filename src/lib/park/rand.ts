/**
 * Determinism. One seed rebuilds the same park every time, which is what keeps
 * the server and the client from disagreeing about where anything stands.
 */

/** Fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** 0..1 */
  unit() {
    return this.next();
  }

  range(a: number, b: number) {
    return a + this.next() * (b - a);
  }

  /** Centred on 0, so ±spread. */
  spread(s: number) {
    return (this.next() * 2 - 1) * s;
  }

  int(n: number) {
    return Math.floor(this.next() * n);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  chance(p: number) {
    return this.next() < p;
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

/* ── noise ────────────────────────────────────────────────────────────────── */

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Value noise on an integer lattice, 0..1. Cheap and plenty for grunge maps —
 * nothing here needs gradient noise's directional quality.
 */
export function makeNoise2D(seed: number) {
  const S = seed >>> 0;
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ S;
    h = Math.imul(h ^ (h >>> 15), 0x2545f491);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };

  return function noise(x: number, y: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = lerp(hash(xi, yi), hash(xi + 1, yi), tx);
    const b = lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), tx);
    return lerp(a, b, ty);
  };
}

export type Noise2D = ReturnType<typeof makeNoise2D>;

/** Summed octaves. Returns 0..1. */
export function fbm(noise: Noise2D, x: number, y: number, octaves = 4, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

/** Distance to the nearest of a scattered point set — the classic cell look. */
export function worley(noise: Noise2D, x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = 1e9;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const px = cx + noise(cx, cy);
      const py = cy + noise(cx + 71, cy - 37);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) best = d;
    }
  }
  return Math.min(1, Math.sqrt(best));
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = lerp;
export const smoothstep = (a: number, b: number, t: number) =>
  smooth(clamp01((t - a) / (b - a || 1e-6)));
