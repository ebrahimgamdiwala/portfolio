import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import type { Poster } from "@/lib/content";
import { fbm, makeNoise2D, Rng } from "./rand";

/**
 * Attraction posters, painted straight from `park.json` onto a canvas and hung
 * on the hoardings out in the park.
 *
 * This is the load-bearing idea of the whole branch: the résumé is not
 * *described* by the 3D scene, it is *printed into* it. Change a headline in
 * the JSON and a billboard beside the rails changes.
 */

const W = 1280;
const H = 720;

const cache = new Map<string, CanvasTexture>();
/** Redrawn once the webfonts land, or the first paint uses fallback metrics. */
const pending: (() => void)[] = [];
let fontsHooked = false;

function families() {
  const s = getComputedStyle(document.documentElement);
  const sans = s.getPropertyValue("--font-sans").trim();
  const mono = s.getPropertyValue("--font-mono").trim();
  return {
    sans: `${sans ? `${sans}, ` : ""}Inter, system-ui, sans-serif`,
    mono: `${mono ? `${mono}, ` : ""}ui-monospace, monospace`,
  };
}

/** Largest size at which `text` still fits `maxWidth`. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  weight: string,
  family: string,
) {
  let size = start;
  for (let i = 0; i < 40; i++) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size *= 0.94;
  }
  return size;
}

function tracked(ctx: CanvasRenderingContext2D, em: number) {
  try {
    ctx.letterSpacing = `${em}em`;
  } catch {
    /* older engines just render tighter */
  }
}

function draw(ctx: CanvasRenderingContext2D, poster: Poster, accent: string, seed: number) {
  const f = families();
  const rng = new Rng(seed);
  const n = makeNoise2D(seed);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  tracked(ctx, 0);

  /* ── ground ────────────────────────────────────────────────────────────── */

  ctx.fillStyle = "#0a0a10";
  ctx.fillRect(0, 0, W, H);

  // vintage sunburst behind the headline
  const cx = W * 0.3;
  const cy = H * 0.52;
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = accent;
  const RAYS = 26;
  for (let i = 0; i < RAYS; i += 2) {
    const a0 = (i / RAYS) * Math.PI * 2;
    const a1 = ((i + 1) / RAYS) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, W, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // accent bloom behind everything
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.72);
  glow.addColorStop(0, `${accent}66`);
  glow.addColorStop(0.45, `${accent}1f`);
  glow.addColorStop(1, "#00000000");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // halftone
  ctx.save();
  ctx.globalAlpha = 0.11;
  ctx.fillStyle = "#ffffff";
  for (let y = 0; y < H; y += 9) {
    for (let x = 0; x < W; x += 9) {
      const d = fbm(n, x / 190, y / 190, 3);
      if (d < 0.46) continue;
      ctx.beginPath();
      ctx.arc(x, y, (d - 0.46) * 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  /* ── marquee frame ─────────────────────────────────────────────────────── */

  const PAD = 34;
  ctx.strokeStyle = "#ffffff26";
  ctx.lineWidth = 3;
  ctx.strokeRect(PAD, PAD, W - PAD * 2, H - PAD * 2);
  ctx.strokeStyle = `${accent}88`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(PAD + 11, PAD + 11, W - (PAD + 11) * 2, H - (PAD + 11) * 2);

  // the ring of bulbs that says "fairground" before a single word is read
  const bulb = (x: number, y: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 13);
    g.addColorStop(0, "#fffdf4");
    g.addColorStop(0.28, "#ffdda2");
    g.addColorStop(1, "#ffb04c00");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    ctx.fill();
  };
  const STEP = 46;
  for (let x = PAD + STEP / 2; x < W - PAD; x += STEP) {
    bulb(x, PAD + 5.5);
    bulb(x, H - PAD - 5.5);
  }
  for (let y = PAD + STEP / 2; y < H - PAD; y += STEP) {
    bulb(PAD + 5.5, y);
    bulb(W - PAD - 5.5, y);
  }

  /* ── type ──────────────────────────────────────────────────────────────── */

  const L = 92;
  const R = W - 92;
  ctx.textBaseline = "alphabetic";

  let y = 168;

  if (poster.kicker) {
    tracked(ctx, 0.34);
    ctx.font = `600 25px ${f.mono}`;
    ctx.fillStyle = accent;
    ctx.fillText(poster.kicker.toUpperCase(), L + 30, y);
    // the little square bullet
    ctx.fillRect(L, y - 12, 13, 13);
    tracked(ctx, 0);
    y += 34;
  }

  const headSize = fit(ctx, poster.headline, R - L, 152, "800", f.sans);
  ctx.font = `800 ${headSize}px ${f.sans}`;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = `${accent}cc`;
  ctx.shadowBlur = 46;
  ctx.fillText(poster.headline, L, y + headSize * 0.78);
  ctx.shadowBlur = 0;
  y += headSize * 0.78 + 26;

  if (poster.ride) {
    const rideSize = fit(ctx, `“${poster.ride}”`, R - L, 50, "500", f.sans);
    ctx.font = `500 ${rideSize}px ${f.sans}`;
    ctx.fillStyle = accent;
    ctx.fillText(`“${poster.ride}”`, L, y + rideSize);
    y += rideSize + 18;
  }

  // rule
  ctx.fillStyle = "#ffffff2e";
  ctx.fillRect(L, H - 132, R - L, 2);

  if (poster.sub) {
    tracked(ctx, 0.2);
    const subSize = fit(ctx, poster.sub.toUpperCase(), (R - L) * 0.68, 27, "500", f.mono);
    ctx.font = `500 ${subSize}px ${f.mono}`;
    ctx.fillStyle = "#ffffffb0";
    ctx.fillText(poster.sub.toUpperCase(), L, H - 92);
    tracked(ctx, 0);
  }

  if (poster.stat) {
    ctx.textAlign = "right";
    const statSize = fit(ctx, poster.stat, (R - L) * 0.4, 76, "700", f.sans);
    ctx.font = `700 ${statSize}px ${f.sans}`;
    ctx.fillStyle = accent;
    ctx.shadowColor = `${accent}aa`;
    ctx.shadowBlur = 30;
    ctx.fillText(poster.stat, R, H - 84);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
  }

  /* ── wear ──────────────────────────────────────────────────────────────── */

  // paste-up scratches
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#ffffff";
  for (let i = 0; i < 22; i++) {
    ctx.lineWidth = rng.range(0.5, 1.6);
    ctx.beginPath();
    const x0 = rng.range(0, W);
    const y0 = rng.range(0, H);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + rng.spread(90), y0 + rng.spread(24));
    ctx.stroke();
  }
  ctx.restore();

  // uneven ink and a vignette so it never reads as flat vector art
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.72);
  vig.addColorStop(0, "#ffffff");
  vig.addColorStop(1, "#6a6a78");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** The texture for one poster. Cached — several hoardings share a station. */
export function posterTexture(poster: Poster, accent: string) {
  const key = `${poster.headline}|${poster.ride ?? ""}|${accent}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const seed = key.length * 7919 + key.charCodeAt(0);

  draw(ctx, poster, accent, seed);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cache.set(key, tex);

  // First paint can land before Inter and JetBrains Mono are ready, which
  // would leave every board set in the fallback face. Repaint when they are.
  pending.push(() => {
    draw(ctx, poster, accent, seed);
    tex.needsUpdate = true;
  });
  if (!fontsHooked) {
    fontsHooked = true;
    document.fonts.ready.then(() => {
      for (const redraw of pending) redraw();
      pending.length = 0;
    });
  }

  return tex;
}
