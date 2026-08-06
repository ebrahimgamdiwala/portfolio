import { PALETTE } from "./palette";

/**
 * THE MAP.
 *
 * The island is a floating landmass laid out on the XZ plane, centred on the
 * origin. -Z is "north" (cold, alpine), +Z is "south" (coast, ocean).
 * Elevation is Y, quantised to whole voxels by the terrain builder.
 *
 * Biome placement follows the ecological chain:
 *   alpine peaks -> conifer foothills -> highlands -> grove
 *   meltwater -> jungle -> grassland plateau -> delta -> ocean
 *   desert sits in the western rain shadow; the volcano is isolated in the east.
 * The city is the one human intrusion, built on the south-western delta plain.
 */

export const WORLD = {
  seed: 20260805,
  /** Half-extent of the generation grid in voxels. */
  halfX: 96,
  halfZ: 84,
  /** Voxel edge length in world units. */
  cell: 1,
  /** Water plane height. Terrain below this floods. */
  seaLevel: 3,
  /** Underside of the floating crust at the rim. */
  crustDepth: 26,
} as const;

export type BiomeId =
  | "ocean"
  | "shore"
  | "grasslands"
  | "grove"
  | "jungle"
  | "swamp"
  | "highlands"
  | "conifer"
  | "summit"
  | "desert"
  | "volcano"
  | "city";

export interface BiomeDef {
  id: BiomeId;
  name: string;
  /** Region centre on the XZ plane. */
  center: [number, number];
  /** Elliptical influence radii (x, z). */
  radius: [number, number];
  /** Base terrain height in voxels. */
  base: number;
  /** Vertical noise amplitude in voxels. */
  amp: number;
  /** Noise frequency — low = broad landforms, high = broken ground. */
  freq: number;
  /** Ridged noise weight; 1 = sharp alpine crests. */
  ridged: number;
  /** Influence weight when biomes compete for a cell. */
  weight: number;
  surface: number;
  surfaceAlt: number;
  /** Colour of the cliff/soil column below the surface cap. */
  subsurface: number;
  legend: string;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  ocean: {
    id: "ocean",
    name: "Coastal Ocean",
    center: [0, 96],
    radius: [130, 60],
    base: -4,
    amp: 3,
    freq: 0.05,
    ridged: 0,
    weight: 0.7,
    surface: PALETTE.sandWet,
    surfaceAlt: PALETTE.sand,
    subsurface: PALETTE.rockDark,
    legend: "Turquoise shelf, reefs, delta mouths",
  },
  shore: {
    id: "shore",
    name: "Beaches",
    center: [14, 70],
    radius: [58, 22],
    base: 4,
    amp: 2,
    freq: 0.07,
    ridged: 0,
    weight: 0.85,
    surface: PALETTE.sand,
    surfaceAlt: PALETTE.sandWet,
    subsurface: PALETTE.sandWet,
    legend: "Bright sand, palms, curved bays",
  },
  grasslands: {
    id: "grasslands",
    name: "Central Grasslands",
    center: [-6, 16],
    radius: [46, 34],
    base: 9,
    amp: 3.5,
    freq: 0.055,
    ridged: 0,
    weight: 1,
    surface: PALETTE.grass,
    surfaceAlt: PALETTE.grassOlive,
    subsurface: PALETTE.trunkDark,
    legend: "Flat river plateau, braided tributaries",
  },
  grove: {
    id: "grove",
    name: "Flowering Grove",
    center: [-58, -20],
    radius: [30, 30],
    base: 13,
    amp: 4,
    freq: 0.07,
    ridged: 0,
    weight: 1,
    surface: PALETTE.groveFloor,
    surfaceAlt: PALETTE.grovePink,
    subsurface: PALETTE.trunkDark,
    legend: "Pink blossom basin below the highland slope",
  },
  jungle: {
    id: "jungle",
    name: "Dense Jungle",
    center: [50, 4],
    radius: [40, 38],
    base: 12,
    amp: 8,
    freq: 0.085,
    ridged: 0.25,
    weight: 1,
    surface: PALETTE.jungle,
    surfaceAlt: PALETTE.jungleDark,
    subsurface: PALETTE.jungleFloor,
    legend: "Emerald canopy, ponds, permanent rain",
  },
  swamp: {
    id: "swamp",
    name: "Backwater Swamp",
    center: [68, 44],
    radius: [26, 24],
    base: 5,
    amp: 2.5,
    freq: 0.1,
    ridged: 0,
    weight: 1.05,
    surface: PALETTE.swampGround,
    surfaceAlt: PALETTE.jungleFloor,
    subsurface: PALETTE.swampGround,
    legend: "Stagnant channels, mangroves, low mist",
  },
  highlands: {
    id: "highlands",
    name: "Temperate Highlands",
    center: [-56, -54],
    radius: [34, 30],
    base: 26,
    amp: 7,
    freq: 0.06,
    ridged: 0.3,
    weight: 1,
    surface: PALETTE.highland,
    surfaceAlt: PALETTE.scrub,
    subsurface: PALETTE.highlandRock,
    legend: "Elevated scrub plain, mist and drizzle",
  },
  conifer: {
    id: "conifer",
    name: "Snowy Conifer Forest",
    center: [-2, -52],
    radius: [40, 22],
    base: 22,
    amp: 6,
    freq: 0.07,
    ridged: 0.2,
    weight: 1,
    surface: PALETTE.snowShade,
    surfaceAlt: PALETTE.snow,
    subsurface: PALETTE.rock,
    legend: "Pine foothills under a snowfall deck",
  },
  summit: {
    id: "summit",
    name: "Snow Mountains",
    center: [4, -80],
    radius: [64, 26],
    base: 40,
    amp: 34,
    freq: 0.045,
    ridged: 1,
    weight: 1.15,
    surface: PALETTE.snow,
    surfaceAlt: PALETTE.rockLight,
    subsurface: PALETTE.rock,
    legend: "Alpine massif — blizzard on the far face",
  },
  desert: {
    id: "desert",
    name: "Desert Basin",
    center: [-62, 26],
    radius: [36, 34],
    base: 7,
    amp: 3,
    freq: 0.05,
    ridged: 0,
    weight: 1,
    surface: PALETTE.dune,
    surfaceAlt: PALETTE.duneDark,
    subsurface: PALETTE.sandstone,
    legend: "Arid flats, sandstone peaks, sandstorms",
  },
  volcano: {
    id: "volcano",
    name: "Volcanic Wasteland",
    center: [62, -46],
    radius: [30, 28],
    base: 14,
    amp: 12,
    freq: 0.06,
    ridged: 0.6,
    weight: 1,
    surface: PALETTE.basalt,
    surfaceAlt: PALETTE.ash,
    subsurface: PALETTE.basaltDark,
    legend: "Stratovolcano, lava tributaries, ash plumes",
  },
  city: {
    id: "city",
    name: "The City",
    center: [-30, 50],
    radius: [26, 20],
    base: 8,
    amp: 1.2,
    freq: 0.09,
    ridged: 0,
    weight: 1.2,
    surface: PALETTE.asphalt,
    surfaceAlt: PALETTE.concreteDark,
    subsurface: PALETTE.concreteDark,
    legend: "Delta metropolis — where the work ships",
  },
};

export const BIOME_ORDER: BiomeId[] = [
  "summit",
  "conifer",
  "highlands",
  "grove",
  "jungle",
  "swamp",
  "grasslands",
  "city",
  "desert",
  "volcano",
  "shore",
  "ocean",
];

/**
 * Atmosphere per region. The sky is not a fixed void once the ride starts —
 * each biome carries the air its weather implies: rain haze over the jungle,
 * suspended dust in the desert, ash over the caldera, whiteout at the summit.
 * These are daylight reference colours; `sky.ts` dims and tints them by hour.
 */
export interface BiomeSky {
  /** Colour at the zenith. */
  top: number;
  /** Colour at the horizon, and the colour distance fog fades into. */
  horizon: number;
  /** Exponential fog density — how thick the air reads. */
  fog: number;
}

export const BIOME_SKY: Record<BiomeId, BiomeSky> = {
  ocean: { top: 0x2f86c4, horizon: 0xbfe6f2, fog: 0.0014 },
  shore: { top: 0x3d95cf, horizon: 0xcfeaf2, fog: 0.0015 },
  grasslands: { top: 0x4a97d8, horizon: 0xcde2f2, fog: 0.0018 },
  grove: { top: 0xa87fc0, horizon: 0xf7d3e6, fog: 0.0026 },
  jungle: { top: 0x4c7f78, horizon: 0xbcd2c6, fog: 0.0046 },
  swamp: { top: 0x5f6b55, horizon: 0xb4bda0, fog: 0.0055 },
  highlands: { top: 0x5e7c93, horizon: 0xc9d7e1, fog: 0.0034 },
  conifer: { top: 0x7ea4c6, horizon: 0xdfeaf5, fog: 0.0038 },
  summit: { top: 0x7099c4, horizon: 0xeef6fc, fog: 0.0046 },
  desert: { top: 0xc99450, horizon: 0xf4dda8, fog: 0.0038 },
  volcano: { top: 0x1d1418, horizon: 0x7a3018, fog: 0.005 },
  city: { top: 0x40456e, horizon: 0xe8c3a0, fog: 0.0028 },
};

/** Isolated landmark cones that punch above their host biome. */
export const LANDMARKS = {
  volcanoCone: { x: 62, z: -46, radius: 20, height: 62, craterRadius: 5 },
  desertMesa: [
    { x: -76, z: 34, radius: 11, height: 30 },
    { x: -58, z: 40, radius: 8, height: 22 },
    { x: -70, z: 14, radius: 7, height: 18 },
  ],
} as const;

/**
 * The wet corridor. Rivers are polylines carved into the heightfield; water
 * only ever flows downhill along this chain:
 * alpine melt -> conifer foothills -> grasslands -> delta -> ocean,
 * with a jungle branch and a moist feeder into the grove.
 */
export const RIVERS: { points: [number, number][]; width: number; depth: number }[] = [
  // main stem: snowmelt -> conifer -> grassland plateau -> delta
  {
    points: [
      [6, -64],
      [2, -50],
      [-4, -34],
      [2, -18],
      [-6, -2],
      [-2, 14],
      [-10, 30],
      [-6, 46],
      [-2, 62],
      [2, 76],
    ],
    width: 3.4,
    depth: 4,
  },
  // jungle tributary joining the main stem
  {
    points: [
      [30, -30],
      [38, -14],
      [44, 2],
      [36, 18],
      [20, 26],
      [4, 26],
      [-6, 30],
    ],
    width: 2.6,
    depth: 3,
  },
  // highland moisture feeding the pink grove, then out to the plains
  {
    points: [
      [-54, -44],
      [-58, -30],
      [-54, -14],
      [-44, -2],
      [-28, 8],
      [-14, 18],
    ],
    width: 2.2,
    depth: 3,
  },
  // grassland braid
  {
    points: [
      [-30, 4],
      [-20, 16],
      [-16, 32],
      [-22, 44],
      [-18, 58],
    ],
    width: 1.8,
    depth: 2.5,
  },
  // swamp backwater — stagnant, connected to the jungle wet side
  {
    points: [
      [56, 26],
      [64, 36],
      [72, 46],
      [66, 56],
    ],
    width: 4.5,
    depth: 2,
  },
];

/** Lava tributaries — volcanic ground only, never touching the desert. */
export const LAVA_FLOWS: { points: [number, number][]; width: number }[] = [
  {
    points: [
      [62, -46],
      [58, -34],
      [52, -26],
      [46, -20],
    ],
    width: 2.4,
  },
  {
    points: [
      [62, -46],
      [72, -38],
      [78, -28],
    ],
    width: 2,
  },
  {
    points: [
      [62, -46],
      [56, -58],
      [48, -64],
    ],
    width: 1.8,
  },
];
