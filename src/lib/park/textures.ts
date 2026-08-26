import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";
import { clamp01, fbm, makeNoise2D, mix, smoothstep, worley, type Noise2D } from "./rand";

/**
 * Procedural surfaces, baked to canvases once and cached.
 *
 * There are no photo textures and no HDRIs in this project, so realism has to
 * come from material *response* — a believable normal and, above all, a
 * believable roughness. The single biggest win is wet ground: puddles that drop
 * roughness to near zero let the park's neon smear across the tarmac, which is
 * what the eye reads as "photographed" rather than "rendered".
 */

export interface Surface {
  map: Texture;
  normalMap: Texture;
  roughnessMap: Texture;
}

/** What a shader callback returns for one texel. */
interface Texel {
  /** Albedo, 0..1. */
  r: number;
  g: number;
  b: number;
  /** Height, 0..1 — differentiated into the normal map. */
  h: number;
  /** Roughness, 0..1. */
  rough: number;
}

const cache = new Map<string, Surface>();
const flat = new Map<string, Texture>();

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

function finish(tex: CanvasTexture, repeat: number, srgb: boolean) {
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Runs `shade` over a square lattice and derives three tiling maps from it.
 * The normal is a Sobel difference of the height channel, wrapped at the edges
 * so the tile has no seam.
 */
function bake(
  key: string,
  size: number,
  repeat: number,
  bump: number,
  shade: (x: number, y: number) => Texel,
): Surface {
  const hit = cache.get(key);
  if (hit) return hit;

  const albedo = canvas(size);
  const normal = canvas(size);
  const rough = canvas(size);
  const aCtx = albedo.getContext("2d")!;
  const nCtx = normal.getContext("2d")!;
  const rCtx = rough.getContext("2d")!;

  const aImg = aCtx.createImageData(size, size);
  const nImg = nCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const t = shade(x, y);
      height[i] = t.h;
      aImg.data[i * 4] = t.r * 255;
      aImg.data[i * 4 + 1] = t.g * 255;
      aImg.data[i * 4 + 2] = t.b * 255;
      aImg.data[i * 4 + 3] = 255;
      const rv = clamp01(t.rough) * 255;
      rImg.data[i * 4] = rv;
      rImg.data[i * 4 + 1] = rv;
      rImg.data[i * 4 + 2] = rv;
      rImg.data[i * 4 + 3] = 255;
    }
  }

  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * bump;
      const dy = (at(x, y + 1) - at(x, y - 1)) * bump;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nImg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      nImg.data[i + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const surface: Surface = {
    map: finish(new CanvasTexture(albedo), repeat, true),
    normalMap: finish(new CanvasTexture(normal), repeat, false),
    roughnessMap: finish(new CanvasTexture(rough), repeat, false),
  };
  cache.set(key, surface);
  return surface;
}

/* ── surfaces ─────────────────────────────────────────────────────────────── */

/**
 * Wet tarmac. Aggregate speckle under a coat of large, soft puddles; inside a
 * puddle the surface goes glassy and the normal flattens out, so reflections of
 * the neon survive it.
 */
/**
 * Wet tarmac.
 *
 * HIGH-FREQUENCY CONTENT ONLY. This tile covers five kilometres of ground, and
 * anything in it slower than a couple of metres across resolves into a visible
 * repeating swell the moment you look at the distance — which is exactly what
 * large "wear" and "pool" octaves used to do here. Grain the eye cannot count
 * is safe; blotches it can are not.
 *
 * All the macro variation the ground actually needs — paths, pads, dirt, damp
 * patches — lives in `parkMap.ts`, which is stretched across the park exactly
 * once and therefore cannot repeat.
 */
export function asphalt(repeat = 300): Surface {
  const n = makeNoise2D(11);
  const S = 512;
  // Low bump too: crank it and the aggregate resolves into a woven grid.
  return bake(`asphalt:${repeat}`, S, repeat, 0.35, (x, y) => {
    const u = (x / S) * 8;
    const v = (y / S) * 8;

    const grit = worley(n, u * 11, v * 11);
    const grain = fbm(n, u * 30, v * 30, 3);
    const fine = fbm(n, u * 64, v * 64, 2);

    // puddles, but small ones — at this tile scale they are metre-wide, which
    // is both realistic and far too fine to read as a pattern
    const pool = fbm(n, u * 3.4 + 30, v * 3.4 - 12, 2);
    const puddle = smoothstep(0.52, 0.63, pool);
    const damp = smoothstep(0.44, 0.58, pool);

    const base = 0.062 + grit * 0.016 + grain * 0.013 + fine * 0.008;
    const alb = mix(base, base * 0.62, puddle);
    const h = mix(grit * 0.5 + grain * 0.5, 0.5, puddle * 0.9);
    const rough = mix(mix(0.9, 0.66, damp), 0.06, puddle);

    return { r: alb * 1.02, g: alb, b: alb * 1.1, h, rough };
  });
}

/** Vertical ramp, opaque at the bottom, clear at the top. */
export function verticalFade(): Texture {
  const key = "verticalFade";
  const hit = flat.get(key);
  if (hit) return hit;

  const c = canvas(4);
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, "#777777");
  g.addColorStop(0.6, "#1a1a1a");
  g.addColorStop(0.85, "#000000");
  g.addColorStop(1, "#000000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);

  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  flat.set(key, tex);
  return tex;
}

/**
 * Radial ramp used to sink everything past the park's edge into the haze, so
 * open ground never has to hold up to being looked at from a kilometre away.
 */
export function outfieldFade(): Texture {
  const key = "outfieldFade";
  const hit = flat.get(key);
  if (hit) return hit;

  const S = 512;
  const c = canvas(S);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // clear out to the tree line, then down hard — the band in between is where
  // a tiled surface gets far enough away to start showing its repeat
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.16, "rgba(0,0,0,0)");
  g.addColorStop(0.3, "rgba(0,0,0,0.86)");
  g.addColorStop(1, "rgba(0,0,0,0.98)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  flat.set(key, tex);
  return tex;
}

/** Poured concrete — plaza slabs, plinths, footings. */
export function concrete(repeat = 18): Surface {
  const n = makeNoise2D(29);
  const S = 512;
  return bake(`concrete:${repeat}`, S, repeat, 1.5, (x, y) => {
    const u = (x / S) * 6;
    const v = (y / S) * 6;
    const blotch = fbm(n, u * 2.2, v * 2.2, 4);
    const fine = fbm(n, u * 22, v * 22, 2);
    const stain = smoothstep(0.35, 0.75, fbm(n, u * 0.9 + 8, v * 0.9, 3));

    // expansion joints on a 1/3-tile grid
    const gx = Math.abs(((x / S) * 3) % 1 - 0.5);
    const gy = Math.abs(((y / S) * 3) % 1 - 0.5);
    const joint = smoothstep(0.5, 0.47, Math.min(gx, gy));

    let base = 0.2 + blotch * 0.12 + fine * 0.04;
    base = mix(base, base * 0.72, stain * 0.5);
    base = mix(base, base * 0.45, joint);

    return {
      r: base * 1.02,
      g: base,
      b: base * 0.96,
      h: mix(blotch * 0.4 + fine * 0.6, 0, joint),
      rough: mix(0.82 - blotch * 0.1, 0.94, joint),
    };
  });
}

/** Boardwalk planking for the midway stalls and station platform. */
export function planks(repeat = 10): Surface {
  const n = makeNoise2D(53);
  const S = 512;
  const ROWS = 8;
  return bake(`planks:${repeat}`, S, repeat, 2.2, (x, y) => {
    const u = x / S;
    const v = y / S;
    const row = Math.floor(v * ROWS);
    // stagger the butt joints row to row
    const shift = (row % 2) * 0.5;
    const along = (u + shift) * 3;
    const board = Math.floor(along);

    const tint = 0.72 + (makeNoise2D(row * 31 + board)(0.5, 0.5) - 0.5) * 0.35;
    const grain = fbm(n, u * 90, (v + board * 7) * 5, 3);
    const seamV = smoothstep(0.5, 0.42, Math.abs((v * ROWS) % 1 - 0.5));
    const seamU = smoothstep(0.5, 0.44, Math.abs(along % 1 - 0.5));
    const seam = Math.max(seamV, seamU);

    let base = (0.16 + grain * 0.1) * tint;
    base = mix(base, base * 0.3, seam);

    return {
      r: base * 1.35,
      g: base * 1.02,
      b: base * 0.72,
      h: mix(grain, 0, seam),
      rough: mix(0.72 + grain * 0.16, 0.95, seam),
    };
  });
}

/** Lawn for Foundation Gardens. */
export function grass(repeat = 60): Surface {
  const n = makeNoise2D(71);
  const S = 256;
  return bake(`grass:${repeat}`, S, repeat, 2.8, (x, y) => {
    const u = (x / S) * 6;
    const v = (y / S) * 6;
    const blade = fbm(n, u * 34, v * 34, 2);
    const clump = fbm(n, u * 3, v * 3, 4);
    const dry = smoothstep(0.55, 0.85, fbm(n, u * 1.1 + 40, v * 1.1, 3));

    const lum = 0.055 + clump * 0.05 + blade * 0.03;
    return {
      r: lum * mix(0.55, 1.15, dry),
      g: lum * mix(1.25, 1.05, dry),
      b: lum * mix(0.5, 0.55, dry),
      h: blade * 0.7 + clump * 0.3,
      rough: 0.88 - clump * 0.08,
    };
  });
}

/** Painted steel with honest wear — ride structure, gantries, fences. */
export function paintedSteel(repeat = 4): Surface {
  const n = makeNoise2D(97);
  const S = 256;
  return bake(`paintedSteel:${repeat}`, S, repeat, 1.1, (x, y) => {
    const u = (x / S) * 4;
    const v = (y / S) * 4;
    const scuff = fbm(n, u * 12, v * 12, 3);
    const chip = smoothstep(0.72, 0.9, fbm(n, u * 30 + 5, v * 30, 2));
    const dirt = smoothstep(0.4, 0.8, fbm(n, u * 2, v * 6, 3));

    // white base so a material colour can tint it
    const base = mix(0.86, 0.62, dirt * 0.6) - chip * 0.4;
    return {
      r: base,
      g: base * 0.99,
      b: base * 0.97,
      h: scuff * 0.4 + chip,
      rough: mix(0.34 + scuff * 0.14, 0.8, chip),
    };
  });
}

/* ── flat (albedo-only) textures ──────────────────────────────────────────── */

/** The carnival awning stripe. Vertical bands, tileable across the canopy. */
export function stripes(a: string, b: string, count = 10): Texture {
  const key = `stripes:${a}:${b}:${count}`;
  const hit = flat.get(key);
  if (hit) return hit;

  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = b;
  const w = S / count;
  for (let i = 0; i < count; i += 2) ctx.fillRect(i * w, 0, w, S);

  // a little vertical soiling so it is not pure vector art
  const n = makeNoise2D(13);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#000";
  for (let x = 0; x < S; x++) {
    const d = fbm(n, x / 26, 0.5, 3);
    ctx.fillRect(x, S * (1 - d * 0.45), 1, S);
  }
  ctx.globalAlpha = 1;

  const tex = finish(new CanvasTexture(c), 1, true);
  flat.set(key, tex);
  return tex;
}

/**
 * Radial alpha ramp for feathering a zone patch into the tarmac around it.
 * Without it every zone reads as a hard-edged disc stamped on the ground.
 */
export function radialFade(): Texture {
  const key = "radialFade";
  const hit = flat.get(key);
  if (hit) return hit;

  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.58, "#ffffff");
  g.addColorStop(0.82, "#6a6a6a");
  g.addColorStop(1, "#000000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  flat.set(key, tex);
  return tex;
}

/** Soft round falloff — the sprite behind bulbs, embers and firework stars. */
export function glowSprite(): Texture {
  const key = "glow";
  const hit = flat.get(key);
  if (hit) return hit;

  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(255,255,255,0.72)");
  g.addColorStop(0.5, "rgba(255,255,255,0.16)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  flat.set(key, tex);
  return tex;
}

/**
 * A sheet of standing human silhouettes, used as instanced crowd impostors.
 * Eight variations across one row so the crowd does not read as clones.
 */
export function crowdSheet(): Texture {
  const key = "crowd";
  const hit = flat.get(key);
  if (hit) return hit;

  const COLS = 8;
  const W = 512;
  const H = 128;
  const c = canvas(1);
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  // white so the sheet can be used as a tintable map with alpha cut-out
  ctx.fillStyle = "#fff";

  const cw = W / COLS;
  for (let i = 0; i < COLS; i++) {
    const n = makeNoise2D(i * 17 + 3);
    const cx = i * cw + cw / 2;
    const build = 0.85 + n(0.5, 0.5) * 0.3;
    const headR = 7 * build;
    const shoulder = 15 * build;
    const hip = 11 * build;
    const top = 18;
    const legTop = 74;
    const foot = 120;

    ctx.beginPath();
    ctx.arc(cx, top, headR, 0, Math.PI * 2);
    ctx.fill();

    // torso
    ctx.beginPath();
    ctx.moveTo(cx - shoulder, top + headR + 2);
    ctx.quadraticCurveTo(cx - shoulder * 1.05, legTop - 20, cx - hip, legTop);
    ctx.lineTo(cx + hip, legTop);
    ctx.quadraticCurveTo(cx + shoulder * 1.05, legTop - 20, cx + shoulder, top + headR + 2);
    ctx.closePath();
    ctx.fill();

    // legs, one slightly forward
    const stride = (n(2.5, 1.5) - 0.5) * 8;
    ctx.fillRect(cx - hip + 1, legTop - 2, 8 * build, foot - legTop);
    ctx.fillRect(cx + hip - 9 * build, legTop - 2, 8 * build, foot - legTop - stride);
  }

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  flat.set(key, tex);
  return tex;
}

/** Raise anisotropy on everything already baked, once the renderer is known. */
export function applyAnisotropy(max: number) {
  const a = Math.min(8, max);
  for (const s of cache.values()) {
    s.map.anisotropy = a;
    s.normalMap.anisotropy = a;
    s.roughnessMap.anisotropy = a;
    s.map.needsUpdate = true;
  }
}
