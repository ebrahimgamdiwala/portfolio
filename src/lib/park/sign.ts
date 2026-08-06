import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

/**
 * Lit signage — every word the park says out loud.
 *
 * Two flavours: `neonText` paints glowing letters on a transparent field for
 * planes that get blended additively (so they read as tube light), and `panel`
 * paints an opaque board for scoreboards and marquees.
 */

const cache = new Map<string, CanvasTexture>();
const pending: (() => void)[] = [];
let hooked = false;

function fonts() {
  const s = getComputedStyle(document.documentElement);
  const sans = s.getPropertyValue("--font-sans").trim();
  const mono = s.getPropertyValue("--font-mono").trim();
  return {
    sans: `${sans ? `${sans}, ` : ""}Inter, system-ui, sans-serif`,
    mono: `${mono ? `${mono}, ` : ""}ui-monospace, monospace`,
  };
}

function fitted(
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

function make(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  paint(ctx);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cache.set(key, tex);

  // repaint once the webfonts land
  pending.push(() => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    paint(ctx);
    tex.needsUpdate = true;
  });
  if (!hooked) {
    hooked = true;
    document.fonts.ready.then(() => {
      for (const redraw of pending) redraw();
      pending.length = 0;
    });
  }

  return tex;
}

/**
 * Glowing letters on transparent. Meant for an additively blended plane, which
 * is what makes it read as a lit tube rather than a printed sticker.
 */
export function neonText(
  text: string,
  color: string,
  opts: { width?: number; height?: number; mono?: boolean; weight?: string } = {},
) {
  const W = opts.width ?? 1024;
  const H = opts.height ?? 256;
  const key = `neon:${text}:${color}:${W}:${H}:${opts.mono ? "m" : "s"}`;

  return make(key, W, H, (ctx) => {
    const f = fonts();
    const family = opts.mono ? f.mono : f.sans;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (opts.mono) {
      try {
        ctx.letterSpacing = "0.16em";
      } catch {
        /* fine without it */
      }
    }

    const size = fitted(ctx, text, W * 0.88, H * 0.62, opts.weight ?? "800", family);
    ctx.font = `${opts.weight ?? "800"} ${size}px ${family}`;

    // three passes: a wide bloom, a tight halo, then the hot core
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.85;
    ctx.fillText(text, W / 2, H / 2);
    ctx.shadowBlur = size * 0.35;
    ctx.fillText(text, W / 2, H / 2);
    ctx.shadowBlur = size * 0.18;
    ctx.fillStyle = "#fffdf8";
    ctx.fillText(text, W / 2, H / 2);
    ctx.shadowBlur = 0;
  });
}

/** An opaque lit board — scoreboards, gate marquees, ride nameplates. */
export function panel(
  headline: string,
  sub: string | undefined,
  accent: string,
  opts: { width?: number; height?: number; big?: boolean } = {},
) {
  const W = opts.width ?? 1024;
  const H = opts.height ?? 512;
  const key = `panel:${headline}:${sub ?? ""}:${accent}:${W}:${H}:${opts.big ? 1 : 0}`;

  return make(key, W, H, (ctx) => {
    const f = fonts();

    ctx.fillStyle = "#07080e";
    ctx.fillRect(0, 0, W, H);

    // faint scanlines, like an old dot-matrix board
    ctx.fillStyle = "#ffffff0a";
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);

    const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
    glow.addColorStop(0, `${accent}30`);
    glow.addColorStop(1, "#00000000");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = `${accent}70`;
    ctx.lineWidth = 5;
    ctx.strokeRect(14, 14, W - 28, H - 28);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const cy = sub ? H * 0.42 : H * 0.5;
    const size = fitted(ctx, headline, W * 0.82, opts.big ? H * 0.66 : H * 0.42, "800", f.sans);
    ctx.font = `800 ${size}px ${f.sans}`;
    ctx.shadowColor = accent;
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(headline, W / 2, cy);
    ctx.shadowBlur = 0;

    if (sub) {
      try {
        ctx.letterSpacing = "0.3em";
      } catch {
        /* fine without it */
      }
      const ss = fitted(ctx, sub, W * 0.8, H * 0.11, "600", f.mono);
      ctx.font = `600 ${ss}px ${f.mono}`;
      ctx.fillStyle = accent;
      ctx.fillText(sub, W / 2, H * 0.76);
    }
  });
}
