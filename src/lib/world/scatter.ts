import { BIOMES, WORLD } from "./layout";
import { PALETTE } from "./palette";
import { makeRng, type Rng } from "./noise";
import { VOID_HEIGHT, WATER, type TerrainData } from "./terrain";
import type { TrackCorridor } from "./track";

/** One axis-aligned voxel box. Everything in the world is made of these. */
export interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  c: number;
}

export interface Creature {
  x: number;
  y: number;
  z: number;
  rot: number;
  kind: "deer" | "fox" | "bird" | "whale";
  scale: number;
  phase: number;
  /** Radius of the idle wander loop. */
  roam: number;
}

export interface Building {
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color: number;
  lit: boolean;
}

export interface ScatterData {
  boxes: Box[];
  creatures: Creature[];
  buildings: Building[];
  fragments: Box[];
  clouds: { x: number; y: number; z: number; sx: number; sz: number; kind: number }[];
}

const push = (out: Box[], x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number) =>
  out.push({ x, y, z, sx, sy, sz, c });

/* ─────────────────────────── flora builders ─────────────────────────────── */

function pine(out: Box[], x: number, y: number, z: number, rng: Rng, snowy: boolean) {
  const h = 5 + rng() * 5;
  const trunkH = h * 0.32;
  push(out, x, y + trunkH / 2, z, 0.7, trunkH, 0.7, PALETTE.trunkDark);
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const wdt = 4.2 * (1 - t * 0.72);
    const ly = y + trunkH + (h * 0.72 * i) / layers;
    push(out, x, ly, z, wdt, h * 0.26, wdt, i % 2 ? PALETTE.pineDark : PALETTE.pine);
    if (snowy) push(out, x, ly + h * 0.14, z, wdt * 0.92, 0.45, wdt * 0.92, PALETTE.snow);
  }
  if (snowy) push(out, x, y + trunkH + h * 0.78, z, 1.3, 1.0, 1.3, PALETTE.snow);
}

function broadleaf(out: Box[], x: number, y: number, z: number, rng: Rng, leaf: number, leafAlt: number) {
  const h = 6 + rng() * 7;
  push(out, x, y + h / 2, z, 1.0, h, 1.0, PALETTE.trunk);
  const blobs = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < blobs; i++) {
    const rx = (rng() - 0.5) * 3.4;
    const rz = (rng() - 0.5) * 3.4;
    const wdt = 4.5 + rng() * 3;
    push(
      out,
      x + rx,
      y + h + (rng() - 0.3) * 2,
      z + rz,
      wdt,
      2.2 + rng() * 1.6,
      wdt,
      rng() > 0.5 ? leaf : leafAlt,
    );
  }
}

function bloomTree(out: Box[], x: number, y: number, z: number, rng: Rng) {
  const h = 4 + rng() * 3.5;
  push(out, x, y + h / 2, z, 0.8, h, 0.8, PALETTE.trunk);
  for (let i = 0; i < 2; i++) {
    const wdt = 4 + rng() * 2.5;
    push(
      out,
      x + (rng() - 0.5) * 2,
      y + h + i * 1.4,
      z + (rng() - 0.5) * 2,
      wdt,
      1.8,
      wdt,
      rng() > 0.45 ? PALETTE.grovePink : PALETTE.grovePinkDeep,
    );
  }
}

function palm(out: Box[], x: number, y: number, z: number, rng: Rng) {
  const h = 6 + rng() * 4;
  const lean = (rng() - 0.5) * 2.5;
  const seg = 5;
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    push(out, x + lean * t * t, y + h * t + h / (seg * 2), z + lean * 0.4 * t * t, 0.65, h / seg, 0.65, PALETTE.trunk);
  }
  const tx = x + lean;
  const ty = y + h;
  const tz = z + lean * 0.4;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng();
    push(out, tx + Math.cos(a) * 2, ty - 0.3, tz + Math.sin(a) * 2, 3.6, 0.5, 1.3, PALETTE.palmLeaf);
  }
  push(out, tx, ty + 0.4, tz, 1.4, 0.8, 1.4, PALETTE.palmLeaf);
}

function cactus(out: Box[], x: number, y: number, z: number, rng: Rng) {
  const h = 3 + rng() * 5;
  push(out, x, y + h / 2, z, 1.1, h, 1.1, PALETTE.cactus);
  if (rng() > 0.4) {
    const s = rng() > 0.5 ? 1 : -1;
    push(out, x + s * 1.2, y + h * 0.55, z, 1.5, 0.9, 0.9, PALETTE.cactus);
    push(out, x + s * 1.8, y + h * 0.78, z, 0.9, 1.8, 0.9, PALETTE.cactus);
  }
}

function mangrove(out: Box[], x: number, y: number, z: number, rng: Rng) {
  const h = 3.5 + rng() * 2.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    push(out, x + Math.cos(a) * 0.9, y + 0.6, z + Math.sin(a) * 0.9, 0.4, 2.2, 0.4, PALETTE.trunkDark);
  }
  push(out, x, y + h * 0.7, z, 0.9, h, 0.9, PALETTE.trunkDark);
  push(out, x, y + h + 1, z, 5, 1.4, 5, PALETTE.swampGround);
  push(out, x + (rng() - 0.5) * 2, y + h + 2, z + (rng() - 0.5) * 2, 3.4, 1.1, 3.4, PALETTE.jungleDark);
}

function deadTree(out: Box[], x: number, y: number, z: number, rng: Rng, c: number) {
  const h = 3 + rng() * 4;
  push(out, x, y + h / 2, z, 0.6, h, 0.6, c);
  push(out, x + 1, y + h * 0.7, z, 1.8, 0.4, 0.4, c);
  push(out, x - 0.8, y + h * 0.85, z + 0.4, 1.4, 0.4, 0.4, c);
}

function shrub(out: Box[], x: number, y: number, z: number, rng: Rng, c: number) {
  const s = 1.2 + rng() * 1.6;
  push(out, x, y + s / 2, z, s, s * 0.8, s, c);
}

function boulder(out: Box[], x: number, y: number, z: number, rng: Rng, c: number) {
  const s = 1.4 + rng() * 3;
  push(out, x, y + s / 2.4, z, s, s * 0.8, s * (0.7 + rng() * 0.6), c);
  if (rng() > 0.6) push(out, x + s * 0.4, y + s * 0.2, z - s * 0.3, s * 0.6, s * 0.5, s * 0.6, c);
}

/* ─────────────────────────── the scatterer ──────────────────────────────── */

interface Slot {
  x: number;
  y: number;
  z: number;
  slope: number;
}

/**
 * Poisson-ish scatter: walk a jittered grid over a biome's ellipse and keep
 * points that pass terrain tests. Density is per 1x1 cell.
 */
function scatterIn(
  terrain: TerrainData,
  rng: Rng,
  biomeId: keyof typeof BIOMES,
  density: number,
  test: (s: Slot, biome: string) => boolean,
  emit: (s: Slot, rng: Rng) => void,
  spreadMul = 1,
) {
  const b = BIOMES[biomeId];
  const rx = b.radius[0] * spreadMul;
  const rz = b.radius[1] * spreadMul;
  const step = Math.max(1.4, 1 / Math.sqrt(density));
  for (let z = b.center[1] - rz; z <= b.center[1] + rz; z += step) {
    for (let x = b.center[0] - rx; x <= b.center[0] + rx; x += step) {
      const jx = x + (rng() - 0.5) * step * 1.7;
      const jz = z + (rng() - 0.5) * step * 1.7;
      const dx = (jx - b.center[0]) / rx;
      const dz = (jz - b.center[1]) / rz;
      if (dx * dx + dz * dz > 1) continue;
      const here = terrain.biomeAt(jx, jz);
      const y = terrain.heightAt(jx, jz);
      if (y === VOID_HEIGHT) continue;
      const slope = Math.max(
        Math.abs(y - terrain.heightAt(jx + 1.5, jz)),
        Math.abs(y - terrain.heightAt(jx, jz + 1.5)),
      );
      const slot: Slot = { x: jx, y, z: jz, slope };
      if (!test(slot, here)) continue;
      emit(slot, rng);
    }
  }
}

const dry = (t: TerrainData) => (s: Slot) => !t.isWaterAt(s.x, s.z);

/** Vertical room a prop must leave under the rails. */
const TREE_CLEARANCE = 22;
const TOWER_CLEARANCE = 9;

export function buildScatter(
  terrain: TerrainData,
  seed = WORLD.seed,
  corridor?: TrackCorridor,
): ScatterData {
  const boxes: Box[] = [];
  const creatures: Creature[] = [];
  const buildings: Building[] = [];
  const fragments: Box[] = [];
  const clouds: ScatterData["clouds"] = [];
  const rng = makeRng(seed ^ 0x5eed);
  const isDry = dry(terrain);

  /** True when a prop of this height would foul the ride passing overhead. */
  const underTrack = (s: Slot) =>
    corridor !== undefined &&
    corridor.lowestOver(s.x, s.z, 5.5) - s.y < TREE_CLEARANCE;

  /** Combines the usual terrain tests with the track clearance rule. */
  const clear = (fn: (s: Slot, b: string) => boolean) => (s: Slot, b: string) =>
    fn(s, b) && !underTrack(s);

  /* jungle — dense emerald canopy */
  scatterIn(
    terrain,
    rng,
    "jungle",
    0.16,
    clear((s, b) => b === "jungle" && isDry(s) && s.slope < 4),
    (s, r) => {
      if (r() > 0.14) broadleaf(boxes, s.x, s.y, s.z, r, PALETTE.jungle, PALETTE.jungleDark);
      else shrub(boxes, s.x, s.y, s.z, r, PALETTE.jungleFloor);
    },
  );

  /* conifer foothills — snow-capped pines */
  scatterIn(
    terrain,
    rng,
    "conifer",
    0.1,
    clear((s, b) => (b === "conifer" || b === "summit") && isDry(s) && s.slope < 5 && s.y < 44),
    (s, r) => pine(boxes, s.x, s.y, s.z, r, true),
  );

  /* alpine stragglers on the lower mountain slopes */
  scatterIn(
    terrain,
    rng,
    "summit",
    0.014,
    clear((s, b) => b === "summit" && isDry(s) && s.y < 40 && s.slope < 4),
    (s, r) => pine(boxes, s.x, s.y, s.z, r, true),
    0.9,
  );

  /* highlands — sparse scrub and rock */
  scatterIn(
    terrain,
    rng,
    "highlands",
    0.05,
    (s, b) => b === "highlands" && isDry(s),
    (s, r) => {
      const k = r();
      if (k > 0.72) pine(boxes, s.x, s.y, s.z, r, false);
      else if (k > 0.4) boulder(boxes, s.x, s.y, s.z, r, PALETTE.highlandRock);
      else shrub(boxes, s.x, s.y, s.z, r, PALETTE.scrub);
    },
  );

  /* flowering grove — pink canopy and meadow bloom */
  scatterIn(
    terrain,
    rng,
    "grove",
    0.13,
    clear((s, b) => b === "grove" && isDry(s) && s.slope < 4),
    (s, r) => {
      if (r() > 0.22) bloomTree(boxes, s.x, s.y, s.z, r);
      else shrub(boxes, s.x, s.y, s.z, r, PALETTE.grovePink);
    },
  );

  /* grasslands — copses and wildflowers */
  scatterIn(
    terrain,
    rng,
    "grasslands",
    0.035,
    clear((s, b) => b === "grasslands" && isDry(s) && s.slope < 3),
    (s, r) => {
      const k = r();
      if (k > 0.78) broadleaf(boxes, s.x, s.y, s.z, r, PALETTE.grassDark, PALETTE.jungle);
      else if (k > 0.34) shrub(boxes, s.x, s.y, s.z, r, r() > 0.5 ? PALETTE.bloomYellow : PALETTE.bloomWhite);
      else shrub(boxes, s.x, s.y, s.z, r, PALETTE.grassDark);
    },
  );

  /* desert — cacti across the flats, dry brush */
  scatterIn(
    terrain,
    rng,
    "desert",
    0.05,
    (s, b) => b === "desert" && isDry(s) && s.slope < 3,
    (s, r) => {
      const k = r();
      if (k > 0.5) cactus(boxes, s.x, s.y, s.z, r);
      else if (k > 0.2) shrub(boxes, s.x, s.y, s.z, r, PALETTE.duneDark);
      else boulder(boxes, s.x, s.y, s.z, r, PALETTE.sandstone);
    },
  );

  /* swamp — mangroves in standing water */
  scatterIn(
    terrain,
    rng,
    "swamp",
    0.09,
    clear((s, b) => b === "swamp" || b === "jungle"),
    (s, r) => {
      if (r() > 0.35) mangrove(boxes, s.x, s.y - 0.5, s.z, r);
      else deadTree(boxes, s.x, s.y, s.z, r, PALETTE.trunkDark);
    },
  );

  /* volcanic wasteland — charred remains and basalt */
  scatterIn(
    terrain,
    rng,
    "volcano",
    0.04,
    (s, b) => b === "volcano" && isDry(s) && s.slope < 5,
    (s, r) => {
      if (r() > 0.5) deadTree(boxes, s.x, s.y, s.z, r, PALETTE.basaltDark);
      else boulder(boxes, s.x, s.y, s.z, r, PALETTE.ash);
    },
  );

  /* beaches — palms along the warm coast */
  scatterIn(
    terrain,
    rng,
    "shore",
    0.03,
    clear(
      (s, b) =>
        (b === "shore" || b === "grasslands") &&
        isDry(s) &&
        s.y <= WORLD.seaLevel + 4 &&
        s.y >= WORLD.seaLevel,
    ),
    (s, r) => {
      if (r() > 0.35) palm(boxes, s.x, s.y, s.z, r);
      else boulder(boxes, s.x, s.y, s.z, r, PALETTE.rockLight);
    },
    1.1,
  );

  /* ── the city: a voxel skyline on the delta plain ─────────────────────── */
  const city = BIOMES.city;
  const grid = 5.5;
  for (let z = city.center[1] - city.radius[1]; z < city.center[1] + city.radius[1]; z += grid) {
    for (let x = city.center[0] - city.radius[0]; x < city.center[0] + city.radius[0]; x += grid) {
      const dx = (x - city.center[0]) / city.radius[0];
      const dz = (z - city.center[1]) / city.radius[1];
      const dd = Math.hypot(dx, dz);
      if (dd > 1) continue;
      // avenues: leave a cross-hatch of empty lanes
      if (Math.abs(((x - city.center[0]) % 16) as number) < 3.2) continue;
      if (Math.abs(((z - city.center[1]) % 18) as number) < 3.2) continue;
      const jx = x + (rng() - 0.5) * 1.2;
      const jz = z + (rng() - 0.5) * 1.2;
      const y = terrain.heightAt(jx, jz);
      if (y === VOID_HEIGHT || terrain.isWaterAt(jx, jz)) continue;
      if (terrain.biomeAt(jx, jz) !== "city") continue;

      // tall core, low outskirts
      const core = Math.pow(1 - dd, 1.6);
      let h = 6 + core * 44 * (0.45 + rng() * 0.85) + rng() * 6;
      const bw = 2.8 + rng() * 1.8;
      const bd = 2.8 + rng() * 1.8;

      // The coaster threads the skyline, so anything under it gets its top
      // shaved off rather than spearing the rails.
      if (corridor) {
        const over = corridor.lowestOver(jx, jz, 7 + Math.max(bw, bd));
        if (over !== Infinity) {
          const allowed = over - y - TOWER_CLEARANCE;
          if (allowed < 5) continue;
          h = Math.min(h, allowed);
        }
      }

      buildings.push({
        x: jx,
        z: jz,
        y,
        w: bw,
        d: bd,
        h,
        color: rng() > 0.45 ? PALETTE.concrete : PALETTE.concreteDark,
        lit: true,
      });
      // antenna / crown
      if (h > 28 && rng() > 0.5) {
        push(boxes, jx, y + h + 3, jz, 0.4, 6, 0.4, PALETTE.concreteDark);
        push(boxes, jx, y + h + 6.4, jz, 0.9, 0.9, 0.9, PALETTE.lava);
      }
    }
  }
  // harbour cranes & a couple of piers to anchor the city to the delta
  for (let i = 0; i < 6; i++) {
    const px = city.center[0] + (rng() - 0.5) * city.radius[0] * 1.5;
    const pz = city.center[1] + city.radius[1] * (0.75 + rng() * 0.4);
    const py = terrain.heightAt(px, pz);
    if (py === VOID_HEIGHT) continue;
    push(boxes, px, py + 1, pz, 12, 0.6, 2.4, PALETTE.trunkDark);
    push(boxes, px, py + 5, pz - 1, 0.7, 8, 0.7, PALETTE.concreteDark);
    push(boxes, px + 2, py + 9, pz - 1, 5, 0.6, 0.6, PALETTE.concreteDark);
  }

  /* ── fauna ─────────────────────────────────────────────────────────────── */
  const placeFauna = (
    biomeId: keyof typeof BIOMES,
    kind: Creature["kind"],
    count: number,
    scale: number,
  ) => {
    const b = BIOMES[biomeId];
    let tries = 0;
    let placed = 0;
    while (placed < count && tries < count * 40) {
      tries++;
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng());
      const x = b.center[0] + Math.cos(a) * b.radius[0] * rr * 0.85;
      const z = b.center[1] + Math.sin(a) * b.radius[1] * rr * 0.85;
      const y = terrain.heightAt(x, z);
      if (y === VOID_HEIGHT) continue;
      const water = terrain.isWaterAt(x, z);
      if (kind === "whale" ? !water : water) continue;
      creatures.push({
        x,
        y,
        z,
        rot: rng() * Math.PI * 2,
        kind,
        scale,
        phase: rng() * Math.PI * 2,
        roam: 2 + rng() * 6,
      });
      placed++;
    }
  };

  placeFauna("grasslands", "deer", 14, 1);
  placeFauna("grove", "deer", 8, 0.95);
  placeFauna("conifer", "deer", 9, 1.05);
  placeFauna("jungle", "deer", 7, 0.9);
  placeFauna("desert", "fox", 10, 0.75);
  placeFauna("swamp", "fox", 5, 0.7);
  placeFauna("highlands", "fox", 5, 0.75);
  placeFauna("jungle", "bird", 10, 0.6);
  placeFauna("shore", "bird", 8, 0.6);
  placeFauna("summit", "bird", 6, 0.7);
  placeFauna("ocean", "whale", 6, 1.6);

  /* ── floating rock fragments beneath the island ────────────────────────── */
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng());
    const x = Math.cos(a) * 92 * rr;
    const z = Math.sin(a) * 78 * rr;
    const y = -20 - rng() * 70;
    const s = 1.5 + rng() * 7;
    fragments.push({
      x,
      y,
      z,
      sx: s,
      sy: s * (0.5 + rng()),
      sz: s * (0.6 + rng() * 0.8),
      c: rng() > 0.14 ? (rng() > 0.5 ? PALETTE.crust : PALETTE.crustDark) : PALETTE.mineral,
    });
  }

  /* ── cloud decks, staggered by biome ───────────────────────────────────── */
  const deck = (
    cx: number,
    cz: number,
    rx: number,
    rz: number,
    y: number,
    count: number,
    kind: number,
  ) => {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng());
      clouds.push({
        x: cx + Math.cos(a) * rx * rr,
        z: cz + Math.sin(a) * rz * rr,
        y: y + (rng() - 0.5) * 9,
        sx: 6 + rng() * 11,
        sz: 5 + rng() * 9,
        kind,
      });
    }
  };
  deck(BIOMES.conifer.center[0], BIOMES.conifer.center[1], 42, 24, 60, 20, 1); // snow
  deck(BIOMES.jungle.center[0], BIOMES.jungle.center[1], 40, 38, 54, 24, 0); // rain
  deck(BIOMES.highlands.center[0], BIOMES.highlands.center[1], 34, 30, 58, 12, 0);
  deck(BIOMES.grasslands.center[0], BIOMES.grasslands.center[1], 44, 32, 50, 10, 0);
  deck(BIOMES.volcano.center[0], BIOMES.volcano.center[1], 26, 24, 96, 10, 2); // ash
  deck(BIOMES.summit.center[0], BIOMES.summit.center[1] - 14, 56, 16, 98, 12, 1);

  return { boxes, creatures, buildings, fragments, clouds };
}
