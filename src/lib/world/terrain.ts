import {
  BIOMES,
  BIOME_ORDER,
  LANDMARKS,
  LAVA_FLOWS,
  RIVERS,
  WORLD,
  type BiomeId,
} from "./layout";
import { PALETTE } from "./palette";
import { clamp01, fbm2D, lerp, ridge2D, smoothstep, valueNoise2D } from "./noise";

export const WATER = {
  NONE: 0,
  OCEAN: 1,
  RIVER: 2,
  SWAMP: 3,
  LAVA: 4,
  OBSIDIAN: 5,
} as const;

export const VOID_HEIGHT = -9999;

export interface TerrainData {
  w: number;
  d: number;
  minX: number;
  minZ: number;
  height: Int16Array;
  under: Int16Array;
  biome: Uint8Array;
  surface: Uint32Array;
  sub: Uint32Array;
  waterY: Int16Array;
  waterKind: Uint8Array;
  /** Normalised distance from island centre, 0 centre -> 1 rim. */
  rim: Float32Array;
  filled: Uint8Array;
  idx: (ix: number, iz: number) => number;
  /** Surface height at arbitrary world coords (voxel units, may be fractional). */
  heightAt: (x: number, z: number) => number;
  biomeAt: (x: number, z: number) => BiomeId;
  isWaterAt: (x: number, z: number) => boolean;
}

/** Small offshore islands and reefs sitting outside the main landmass. */
const ISLETS: { x: number; z: number; r: number; h: number }[] = [
  { x: -92, z: 62, r: 10, h: 8 },
  { x: -60, z: 82, r: 8, h: 6 },
  { x: 30, z: 84, r: 9, h: 7 },
  { x: 74, z: 70, r: 7, h: 5 },
  { x: -104, z: 30, r: 7, h: 5 },
];

const BIOME_INDEX: Record<BiomeId, number> = BIOME_ORDER.reduce(
  (acc, id, i) => ({ ...acc, [id]: i }),
  {} as Record<BiomeId, number>,
);

/** Biomes that actually compete for surface area (ocean is derived from height). */
const COMPETING = BIOME_ORDER.filter((b) => b !== "ocean");

function distToPolyline(x: number, z: number, pts: [number, number][]) {
  let best = Infinity;
  let bestT = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz || 1e-6;
    let t = ((x - ax) * vx + (z - az) * vz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + vx * t;
    const pz = az + vz * t;
    const dd = Math.hypot(x - px, z - pz);
    if (dd < best) {
      best = dd;
      bestT = (i + t) / (pts.length - 1);
    }
  }
  return { dist: best, t: bestT };
}

/** Signed island mask. Returns normalised rim radius (>1 means void). */
function rimRadius(x: number, z: number, seed: number) {
  const warp = (fbm2D(x * 0.018, z * 0.018, seed + 91, 3) - 0.5) * 0.19;
  const lobe = (fbm2D(x * 0.035, z * 0.035, seed + 41, 2) - 0.5) * 0.09;
  const nx = x / 94;
  const nz = z / 80;
  return Math.hypot(nx, nz) + warp + lobe;
}

/** How much ocean this compass direction receives — south & west are coastal. */
function coastalness(x: number, z: number) {
  return clamp01(0.42 + 0.55 * (z / 80) + 0.38 * (-x / 94));
}

function biomeHeight(b: (typeof BIOMES)[BiomeId], x: number, z: number, seed: number) {
  const n = fbm2D(x * b.freq, z * b.freq, seed + BIOME_INDEX[b.id] * 197, 4);
  if (b.ridged <= 0) return b.base + b.amp * (n - 0.38);
  const r = ridge2D(x * b.freq * 0.82, z * b.freq * 0.82, seed + 313, 4);
  const mix = lerp(n, r, b.ridged);
  return b.base + b.amp * (mix - 0.38);
}

export function buildTerrain(seed = WORLD.seed): TerrainData {
  const { halfX, halfZ, seaLevel, crustDepth } = WORLD;
  const w = halfX * 2 + 1;
  const d = halfZ * 2 + 1;
  const n = w * d;

  const height = new Int16Array(n).fill(VOID_HEIGHT);
  const under = new Int16Array(n);
  const biome = new Uint8Array(n);
  const surface = new Uint32Array(n);
  const sub = new Uint32Array(n);
  const waterY = new Int16Array(n).fill(-32768);
  const waterKind = new Uint8Array(n);
  const rimArr = new Float32Array(n);
  const filled = new Uint8Array(n);

  const idx = (ix: number, iz: number) => iz * w + ix;

  // ── pass 1: heightfield ────────────────────────────────────────────────────
  for (let iz = 0; iz < d; iz++) {
    const z = iz - halfZ;
    for (let ix = 0; ix < w; ix++) {
      const x = ix - halfX;
      const i = idx(ix, iz);

      let r = rimRadius(x, z, seed);
      let isIslet = false;
      let isletH = 0;

      if (r > 1) {
        for (const s of ISLETS) {
          const dd = Math.hypot(x - s.x, z - s.z) / s.r;
          if (dd < 1) {
            isIslet = true;
            isletH = s.h * (1 - dd * dd);
            break;
          }
        }
        if (!isIslet) continue;
        r = 1;
      }

      rimArr[i] = r;
      filled[i] = 1;

      // biome competition with domain warping so borders are ragged, not elliptical
      const wx = x + (valueNoise2D(x * 0.04, z * 0.04, seed + 5) - 0.5) * 16;
      const wz = z + (valueNoise2D(x * 0.04, z * 0.04, seed + 6) - 0.5) * 16;

      let total = 0;
      let hSum = 0;
      let bestW = -1;
      let bestId: BiomeId = "grasslands";

      for (const id of COMPETING) {
        const b = BIOMES[id];
        const dx = (wx - b.center[0]) / b.radius[0];
        const dz = (wz - b.center[1]) / b.radius[1];
        const dd = dx * dx + dz * dz;
        if (dd >= 1) continue;
        const f = 1 - dd;
        const bw = b.weight * f * f;
        total += bw;
        hSum += bw * biomeHeight(b, x, z, seed);
        if (bw > bestW) {
          bestW = bw;
          bestId = id;
        }
      }

      if (total < 1e-4) {
        // gaps between influence ellipses fall back to the nearest region
        let nd = Infinity;
        for (const id of COMPETING) {
          const b = BIOMES[id];
          const dx = (wx - b.center[0]) / b.radius[0];
          const dz = (wz - b.center[1]) / b.radius[1];
          const dd = dx * dx + dz * dz;
          if (dd < nd) {
            nd = dd;
            bestId = id;
          }
        }
        total = 1;
        hSum = biomeHeight(BIOMES[bestId], x, z, seed);
      }

      let h = hSum / total;

      // ── landmarks ────────────────────────────────────────────────────────
      const vc = LANDMARKS.volcanoCone;
      const vd = Math.hypot(x - vc.x, z - vc.z) / vc.radius;
      if (vd < 1) {
        const cone = BIOMES.volcano.base + vc.height * Math.pow(1 - vd, 1.55);
        h = Math.max(h, cone);
        const cr = vc.craterRadius / vc.radius;
        if (vd < cr) h -= (1 - vd / cr) * 15;
      }
      for (const m of LANDMARKS.desertMesa) {
        const md = Math.hypot(x - m.x, z - m.z) / m.radius;
        if (md < 1) {
          h = Math.max(h, BIOMES.desert.base + m.height * smoothstep(1, 0.58, md));
        }
      }

      // ── coastal taper: ocean shelf on the south & west, cliffs elsewhere ──
      const coast = coastalness(x, z);
      const rimT = smoothstep(0.66, 1.0, r);
      h = lerp(h, seaLevel - 5.5, rimT * coast);
      h = lerp(h, h * 0.94 + 1.5, rimT * (1 - coast) * 0.35);

      if (isIslet) h = Math.max(seaLevel - 4, isletH + seaLevel - 3);

      // ── rivers ───────────────────────────────────────────────────────────
      let wk: number = WATER.NONE;
      let wy = -32768;

      for (const riv of RIVERS) {
        const { dist } = distToPolyline(x, z, riv.points);
        if (dist < riv.width + 1.5) {
          const t = smoothstep(riv.width + 1.5, 0, dist);
          const carve = riv.depth * t;
          const hOrig = h;
          h -= carve;
          if (t > 0.35) {
            wk = riv === RIVERS[4] ? WATER.SWAMP : WATER.RIVER;
            wy = Math.round(hOrig - 0.8);
          }
        }
      }

      // ── lava ─────────────────────────────────────────────────────────────
      for (const flow of LAVA_FLOWS) {
        const { dist } = distToPolyline(x, z, flow.points);
        if (dist < flow.width) {
          const t = smoothstep(flow.width, 0, dist);
          const hOrig = h;
          h -= 1.6 * t;
          if (t > 0.3) {
            wk = WATER.LAVA;
            wy = Math.round(hOrig - 0.5);
          }
        }
      }

      const hi = Math.round(h);
      height[i] = hi;

      // ocean floods anything below sea level (and overrides river tagging)
      if (hi < seaLevel && wk !== WATER.LAVA) {
        wk = WATER.OCEAN;
        wy = seaLevel;
      } else if (wk !== WATER.NONE && wy <= hi) {
        wy = hi + 1;
      }

      waterKind[i] = wk;
      waterY[i] = wy;
      biome[i] = BIOME_INDEX[bestId];

      // ── underside keel ───────────────────────────────────────────────────
      const keel = Math.pow(clamp01(1 - r), 1.35);
      const jag = (fbm2D(x * 0.06, z * 0.06, seed + 777, 3) - 0.5) * 7;
      under[i] = Math.round(-2 - crustDepth * keel + jag - (hi > 34 ? 8 : 0));
    }
  }

  // ── pass 2: surface materials ──────────────────────────────────────────────
  for (let iz = 0; iz < d; iz++) {
    const z = iz - halfZ;
    for (let ix = 0; ix < w; ix++) {
      const i = idx(ix, iz);
      if (!filled[i]) continue;
      const x = ix - halfX;
      const hi = height[i];
      const id = BIOME_ORDER[biome[i]];
      const b = BIOMES[id];

      const v = valueNoise2D(x * 0.33, z * 0.33, seed + 1234);
      let s = v > 0.55 ? b.surfaceAlt : b.surface;
      let su = b.subsurface;

      // slope shading: steep faces expose rock/soil
      const hL = height[idx(Math.max(0, ix - 1), iz)];
      const hR = height[idx(Math.min(w - 1, ix + 1), iz)];
      const hU = height[idx(ix, Math.max(0, iz - 1))];
      const hD = height[idx(ix, Math.min(d - 1, iz + 1))];
      const slope = Math.max(
        Math.abs(hi - hL),
        Math.abs(hi - hR),
        Math.abs(hi - hU),
        Math.abs(hi - hD),
      );

      // alpine snowline & bare rock on steep faces
      if (hi > 46) s = PALETTE.snow;
      else if (hi > 36 && id !== "volcano") s = v > 0.5 ? PALETTE.snow : PALETTE.rockLight;
      if (slope > 3 && id !== "volcano") {
        s = hi > 40 ? PALETTE.rockLight : id === "desert" ? PALETTE.sandstone : PALETTE.rock;
        su = PALETTE.rockDark;
      }

      // beaches: the band just above the waterline on coastal ground
      if (hi >= WORLD.seaLevel && hi <= WORLD.seaLevel + 2 && rimArr[i] > 0.45) {
        s = v > 0.5 ? PALETTE.sand : PALETTE.sandWet;
        su = PALETTE.sandWet;
      }
      // submerged floor
      if (hi < WORLD.seaLevel) {
        s = hi > WORLD.seaLevel - 3 ? PALETTE.sandWet : PALETTE.rockDark;
        su = PALETTE.rockDark;
      }

      if (waterKind[i] === WATER.LAVA) {
        s = PALETTE.basaltDark;
        su = PALETTE.basaltDark;
      }

      surface[i] = s;
      sub[i] = su;
    }
  }

  // ── pass 3: lava meeting water quenches to obsidian ────────────────────────
  const R = 3;
  for (let iz = 0; iz < d; iz++) {
    for (let ix = 0; ix < w; ix++) {
      const i = idx(ix, iz);
      if (waterKind[i] !== WATER.LAVA) continue;
      let touched = false;
      for (let dz = -R; dz <= R && !touched; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= w || jz >= d) continue;
          const j = idx(jx, jz);
          const k = waterKind[j];
          if (k === WATER.OCEAN || k === WATER.RIVER || k === WATER.SWAMP) {
            touched = true;
            break;
          }
        }
      }
      if (touched) {
        waterKind[i] = WATER.OBSIDIAN;
        surface[i] = PALETTE.obsidian;
        sub[i] = PALETTE.obsidian;
      }
    }
  }

  const sample = (x: number, z: number) => {
    const ix = Math.round(x) + halfX;
    const iz = Math.round(z) + halfZ;
    if (ix < 0 || iz < 0 || ix >= w || iz >= d) return null;
    const i = idx(ix, iz);
    return filled[i] ? i : null;
  };

  return {
    w,
    d,
    minX: -halfX,
    minZ: -halfZ,
    height,
    under,
    biome,
    surface,
    sub,
    waterY,
    waterKind,
    rim: rimArr,
    filled,
    idx,
    heightAt(x, z) {
      const i = sample(x, z);
      if (i === null) return VOID_HEIGHT;
      const k = waterKind[i];
      if (k === WATER.OCEAN) return WORLD.seaLevel;
      if (k === WATER.RIVER || k === WATER.SWAMP || k === WATER.LAVA) return waterY[i];
      return height[i];
    },
    biomeAt(x, z) {
      const i = sample(x, z);
      return i === null ? "ocean" : BIOME_ORDER[biome[i]];
    },
    isWaterAt(x, z) {
      const i = sample(x, z);
      return i === null ? true : waterKind[i] !== WATER.NONE;
    },
  };
}
