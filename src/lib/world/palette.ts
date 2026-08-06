import { Color } from "three";

/**
 * Every colour in the world, in one place.
 * Values are linear-ish sRGB hex; three.js converts on upload.
 */
export const PALETTE = {
  // water
  oceanDeep: 0x0b3d5c,
  oceanShallow: 0x1e8fa8,
  lagoon: 0x38c6c9,
  river: 0x2fa8d8,
  swampWater: 0x2f4436,

  // ground
  sand: 0xe8d8a8,
  sandWet: 0xd4c08a,
  dune: 0xd9b169,
  duneDark: 0xc0954f,
  sandstone: 0xb87d42,

  grass: 0x5c9e3f,
  grassDark: 0x477f31,
  grassOlive: 0x7ba24a,
  meadow: 0x6fae4c,

  jungle: 0x1f6b32,
  jungleDark: 0x14512a,
  jungleFloor: 0x2c5a2a,
  swampGround: 0x4a5433,

  grovePink: 0xf2a7c8,
  grovePinkDeep: 0xe07fae,
  groveFloor: 0x9a7f86,

  highland: 0x6f7f5e,
  highlandRock: 0x74796d,
  scrub: 0x8a9470,

  snow: 0xf2f6fb,
  snowShade: 0xd8e2ee,
  rock: 0x6b7280,
  rockDark: 0x4a515c,
  rockLight: 0x8b93a0,

  basalt: 0x1c1b1f,
  basaltDark: 0x111013,
  ash: 0x3a3a40,
  lava: 0xff6a1a,
  lavaHot: 0xffc24a,
  obsidian: 0x141020,

  // structures
  concrete: 0x9aa2ac,
  concreteDark: 0x6f7681,
  glass: 0x33506b,
  windowLit: 0xffd79a,
  asphalt: 0x2b2f36,

  // flora
  trunk: 0x6b4a2f,
  trunkDark: 0x4e361f,
  pine: 0x1c4d33,
  pineDark: 0x143726,
  palmLeaf: 0x3f9a4c,
  cactus: 0x3f7d4a,
  bloomYellow: 0xf2d45c,
  bloomWhite: 0xf4f2e6,

  // underside
  crust: 0x5a5f68,
  crustDark: 0x3c414a,
  mineral: 0x3ddcff,
} as const;

export type PaletteKey = keyof typeof PALETTE;

const _c = new Color();

/** hex -> {r,g,b} in 0..1, with an optional multiplicative brightness jitter. */
export function shade(hex: number, amount = 0): { r: number; g: number; b: number } {
  _c.setHex(hex);
  if (amount !== 0) {
    const m = 1 + amount;
    _c.r = Math.min(1, _c.r * m);
    _c.g = Math.min(1, _c.g * m);
    _c.b = Math.min(1, _c.b * m);
  }
  return { r: _c.r, g: _c.g, b: _c.b };
}

export function mixHex(a: number, b: number, t: number): number {
  const ca = new Color(a);
  const cb = new Color(b);
  return ca.lerp(cb, t).getHex();
}
