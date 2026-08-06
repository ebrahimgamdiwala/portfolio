import { BackSide, Color, ShaderMaterial, Vector3, type IUniform } from "three";
import { park, type SkyKey } from "@/lib/content";
import { clamp01 } from "./rand";

/**
 * The dusk -> night arc.
 *
 * Keyframes live in `park.json` and are sampled on *ride progress*, not on wall
 * clock — so the sun sets as you descend into the park, and because the lap
 * wrap resets progress, every lap opens at golden hour again.
 */

export interface SkyState {
  sun: Color;
  sky: Color;
  haze: Color;
  fog: Color;
  /** Unit vector pointing at the sun. */
  dir: Vector3;
  sunI: number;
  ambI: number;
  stars: number;
  /** 0..1 — how hard the park's own lights are driven. */
  neon: number;
  exposure: number;
}

const KEYS = park.sky as SkyKey[];
const DEG = Math.PI / 180;

export function makeSkyState(): SkyState {
  return {
    sun: new Color(),
    sky: new Color(),
    haze: new Color(),
    fog: new Color(),
    dir: new Vector3(),
    sunI: 1,
    ambI: 0.3,
    stars: 0,
    neon: 0,
    exposure: 1,
  };
}

const a = new Color();
const b = new Color();

/** Writes the interpolated sky at ride progress `p` into `out`. */
export function sampleSky(p: number, out: SkyState): SkyState {
  const t = clamp01(p);

  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].at) i++;
  const k0 = KEYS[i];
  const k1 = KEYS[i + 1] ?? k0;
  const span = k1.at - k0.at || 1;
  const raw = clamp01((t - k0.at) / span);
  const f = raw * raw * (3 - 2 * raw);

  const lerpHex = (h0: string, h1: string, into: Color) => {
    a.set(h0);
    b.set(h1);
    into.copy(a).lerp(b, f);
  };

  lerpHex(k0.sun, k1.sun, out.sun);
  lerpHex(k0.sky, k1.sky, out.sky);
  lerpHex(k0.haze, k1.haze, out.haze);
  lerpHex(k0.fog, k1.fog, out.fog);

  const mix = (x: number, y: number) => x + (y - x) * f;
  out.sunI = mix(k0.sunI, k1.sunI);
  out.ambI = mix(k0.ambI, k1.ambI);
  out.stars = mix(k0.stars, k1.stars);
  out.neon = mix(k0.neon, k1.neon);
  out.exposure = mix(k0.exposure, k1.exposure);

  const el = mix(k0.elev, k1.elev) * DEG;
  const az = mix(k0.azim, k1.azim) * DEG;
  const ce = Math.cos(el);
  out.dir.set(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce).normalize();

  return out;
}

/* ── the dome ─────────────────────────────────────────────────────────────── */

export interface SkyUniforms extends Record<string, IUniform> {
  uSky: IUniform<Color>;
  uHaze: IUniform<Color>;
  uSun: IUniform<Color>;
  uSunDir: IUniform<Vector3>;
  uStars: IUniform<number>;
  uNeon: IUniform<number>;
  uTime: IUniform<number>;
}

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * Horizon-to-zenith gradient, a sun that keeps glowing after it has set, a star
 * field that fades up, and a warm band of the park's own light pollution
 * sitting on the horizon once the neon takes over.
 */
const FRAG = /* glsl */ `
  uniform vec3 uSky;
  uniform vec3 uHaze;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uStars;
  uniform float uNeon;
  uniform float uTime;
  varying vec3 vDir;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float starField(vec3 d) {
    vec3 p = d * 260.0;
    vec3 ip = floor(p);
    vec3 fp = fract(p);
    float h = hash31(ip);
    if (h < 0.9885) return 0.0;
    vec2 c = vec2(hash31(ip + 11.0), hash31(ip + 27.0));
    float r = length(fp.xy - c);
    float mag = (h - 0.9885) / 0.0115;
    float twinkle = 0.72 + 0.28 * sin(uTime * 2.1 + h * 90.0);
    return smoothstep(0.10, 0.0, r) * mag * twinkle;
  }

  void main() {
    vec3 d = normalize(vDir);
    float up = d.y;

    // vertical gradient, warmest right at the horizon
    float t = smoothstep(-0.04, 0.46, up);
    vec3 col = mix(uHaze, uSky, t);

    // the sun's glow survives well past its own disc
    float cosA = dot(d, normalize(uSunDir));
    float halo = pow(max(cosA, 0.0), 7.0);
    float wide = pow(max(cosA, 0.0), 1.6);
    col += uSun * (halo * 0.85 + wide * 0.16);
    // the disc itself, only while it is actually above the horizon
    float disc = smoothstep(0.9993, 0.9997, cosA) * smoothstep(-0.03, 0.02, uSunDir.y);
    col += uSun * disc * 3.0;

    // stars, culled below the horizon and hidden inside the sun's glare
    float sTerm = starField(d) * uStars * smoothstep(-0.02, 0.18, up);
    col += vec3(0.86, 0.9, 1.0) * sTerm * (1.0 - wide * 0.8);

    // the park's own light pollution, hugging the horizon
    float pollute = pow(1.0 - clamp(abs(up) * 4.2, 0.0, 1.0), 2.4);
    col += vec3(1.0, 0.52, 0.24) * pollute * uNeon * 0.14;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function makeSkyMaterial() {
  const uniforms: SkyUniforms = {
    uSky: { value: new Color("#0b1130") },
    uHaze: { value: new Color("#ff8a4c") },
    uSun: { value: new Color("#ff9d4a") },
    uSunDir: { value: new Vector3(0, 0.2, 1) },
    uStars: { value: 0 },
    uNeon: { value: 0 },
    uTime: { value: 0 },
  };

  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });

  return { material, uniforms };
}

/** Copies a sampled state into a dome's uniforms. */
export function applySky(uniforms: SkyUniforms, s: SkyState, time: number) {
  uniforms.uSky.value.copy(s.sky);
  uniforms.uHaze.value.copy(s.haze);
  uniforms.uSun.value.copy(s.sun);
  uniforms.uSunDir.value.copy(s.dir);
  uniforms.uStars.value = s.stars;
  uniforms.uNeon.value = s.neon;
  uniforms.uTime.value = time;
}
