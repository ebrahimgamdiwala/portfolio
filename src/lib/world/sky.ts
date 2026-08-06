import { Color, Vector3 } from "three";
import { clamp01 } from "./noise";
import { BIOME_SKY, type BiomeId } from "./layout";

/**
 * The ride is also a day. Light is keyed to scroll progress rather than a
 * wall clock, so every station gets the hour that suits it: dawn on the shore,
 * noon over the jungle, dusk as the city lights come on, night in the caldera,
 * first light at the summit.
 *
 * Sky and fog *colour* are not keyed here — those come from the biome under
 * the rider (see `Atmosphere` below). These keys only set the hour.
 */
export interface SkyKey {
  p: number;
  /** Direction from world origin toward the sun. */
  sun: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  ambient: number;
  ambientIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** 0 = broad daylight, 1 = full night (drives city glow). */
  night: number;
}

export const SKY_KEYS: SkyKey[] = [
  {
    p: 0.0,
    sun: [0.5, 0.42, 0.76],
    sunColor: 0xffc48c,
    sunIntensity: 2.9,
    ambient: 0x8ea2c4,
    ambientIntensity: 0.82,
    hemiSky: 0xffdcb4,
    hemiGround: 0x36415e,
    hemiIntensity: 1.0,
    night: 0.12,
  },
  {
    p: 0.2,
    sun: [0.35, 0.62, 0.7],
    sunColor: 0xfff0d4,
    sunIntensity: 2.8,
    ambient: 0x9fb2cc,
    ambientIntensity: 0.72,
    hemiSky: 0xdcefff,
    hemiGround: 0x40502f,
    hemiIntensity: 0.8,
    night: 0.0,
  },
  {
    p: 0.36,
    sun: [-0.1, 0.86, 0.5],
    sunColor: 0xffffff,
    sunIntensity: 2.5,
    ambient: 0xa8bccf,
    ambientIntensity: 0.7,
    hemiSky: 0xcfe6f5,
    hemiGround: 0x2f4a2a,
    hemiIntensity: 0.9,
    night: 0.0,
  },
  {
    p: 0.55,
    sun: [-0.72, 0.2, 0.62],
    sunColor: 0xff9a52,
    sunIntensity: 2.2,
    ambient: 0x6a6e94,
    ambientIntensity: 0.5,
    hemiSky: 0xffb27a,
    hemiGround: 0x2c2f47,
    hemiIntensity: 0.7,
    night: 0.45,
  },
  {
    p: 0.7,
    sun: [-0.88, 0.08, 0.2],
    sunColor: 0xff7b3a,
    sunIntensity: 1.5,
    ambient: 0x4a4a72,
    ambientIntensity: 0.42,
    hemiSky: 0xc9743f,
    hemiGround: 0x241f33,
    hemiIntensity: 0.55,
    night: 0.72,
  },
  {
    p: 0.85,
    sun: [-0.6, -0.16, -0.5],
    sunColor: 0x5566aa,
    sunIntensity: 0.45,
    ambient: 0x27304d,
    ambientIntensity: 0.3,
    hemiSky: 0x30405f,
    hemiGround: 0x14141f,
    hemiIntensity: 0.4,
    night: 1.0,
  },
  {
    p: 1.0,
    sun: [0.42, 0.1, -0.72],
    sunColor: 0xa9c8ff,
    sunIntensity: 1.6,
    ambient: 0x5b708f,
    ambientIntensity: 0.5,
    hemiSky: 0xbcd6f5,
    hemiGround: 0x2b3448,
    hemiIntensity: 0.7,
    night: 0.35,
  },
];

export interface SkyState {
  sun: Vector3;
  sunColor: Color;
  sunIntensity: number;
  ambient: Color;
  ambientIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  night: number;
  /** Distance fog, always matched to the horizon so depth reads correctly. */
  fog: Color;
  fogDensity: number;
  /** Atmosphere drawn on the dome, after biome and hour are combined. */
  skyTop: Color;
  skyHorizon: Color;
}

export function makeSkyState(): SkyState {
  return {
    sun: new Vector3(),
    sunColor: new Color(),
    sunIntensity: 1,
    ambient: new Color(),
    ambientIntensity: 1,
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemiIntensity: 1,
    night: 0,
    fog: new Color(),
    fogDensity: 0.002,
    skyTop: new Color(),
    skyHorizon: new Color(),
  };
}

const _a = new Color();
const _b = new Color();
const _k1 = new Vector3();

/** Writes the interpolated hour for a given scroll progress into `out`. */
export function sampleSky(p: number, out: SkyState): SkyState {
  const t = clamp01(p);
  let i = 0;
  while (i < SKY_KEYS.length - 2 && t > SKY_KEYS[i + 1].p) i++;
  const k0 = SKY_KEYS[i];
  const k1 = SKY_KEYS[i + 1];
  const raw = clamp01((t - k0.p) / (k1.p - k0.p || 1e-6));
  const f = raw * raw * (3 - 2 * raw);

  out.sun
    .set(k0.sun[0], k0.sun[1], k0.sun[2])
    .lerp(_k1.set(k1.sun[0], k1.sun[1], k1.sun[2]), f)
    .normalize();

  out.sunColor.copy(_a.setHex(k0.sunColor)).lerp(_b.setHex(k1.sunColor), f);
  out.ambient.copy(_a.setHex(k0.ambient)).lerp(_b.setHex(k1.ambient), f);
  out.hemiSky.copy(_a.setHex(k0.hemiSky)).lerp(_b.setHex(k1.hemiSky), f);
  out.hemiGround.copy(_a.setHex(k0.hemiGround)).lerp(_b.setHex(k1.hemiGround), f);

  const mix = (a: number, b: number) => a + (b - a) * f;
  out.sunIntensity = mix(k0.sunIntensity, k1.sunIntensity);
  out.ambientIntensity = mix(k0.ambientIntensity, k1.ambientIntensity);
  out.hemiIntensity = mix(k0.hemiIntensity, k1.hemiIntensity);
  out.night = mix(k0.night, k1.night);
  return out;
}

/* -- biome atmosphere ----------------------------------------------------- */

const WHITE = new Color(0xffffff);
const _top = new Color();
const _hor = new Color();
const _tint = new Color();

/** Smoothed biome atmosphere, so crossing a border is a fade and not a cut. */
export class Atmosphere {
  readonly top = new Color(BIOME_SKY.grasslands.top);
  readonly horizon = new Color(BIOME_SKY.grasslands.horizon);
  density = BIOME_SKY.grasslands.fog;

  /**
   * Eases toward `biome`'s air, then folds in the hour: the whole sky is
   * tinted by sun colour and crushed toward black as the sun drops.
   */
  update(biome: BiomeId, sky: SkyState, dt: number) {
    const target = BIOME_SKY[biome] ?? BIOME_SKY.grasslands;
    const k = Math.min(1, dt * 1.1);

    this.top.lerp(_top.setHex(target.top), k);
    this.horizon.lerp(_hor.setHex(target.horizon), k);
    this.density += (target.fog - this.density) * k;

    // daylight factor: full colour at noon, deeply crushed at night
    const lum = 0.1 + 0.9 * clamp01(sky.sunIntensity / 2.8);
    _tint.copy(sky.sunColor).lerp(WHITE, 0.45);

    sky.skyTop.copy(this.top).multiply(_tint).multiplyScalar(lum);
    sky.skyHorizon.copy(this.horizon).multiply(_tint).multiplyScalar(lum);

    // fog always matches the horizon -- that is what makes distance read
    sky.fog.copy(sky.skyHorizon);
    sky.fogDensity = this.density;
  }
}
