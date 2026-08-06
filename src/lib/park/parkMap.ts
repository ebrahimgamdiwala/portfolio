import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from "three";
import { fbm, makeNoise2D, Rng } from "./rand";
import { FURNITURE, LANDMARKS, SLOTS, ZONES } from "./layout";

/**
 * THE PARK SURFACE, painted as one non-repeating map.
 *
 * A tiled ground texture always eventually reads as a tile — from any height
 * the repeat resolves into a visible weave, and no amount of noise inside one
 * tile hides it. So the ground gets a single 2048px sheet stretched once across
 * the whole park instead: walkways joining the things that are actually there,
 * a pad under every ride, kerbs, wear where the crowds walk, and large slow
 * stains that break the tarmac up at macro scale.
 *
 * Because it is generated from the same layout tables the structures are built
 * from, the paths always go where the rides are.
 */

/** World units covered by the sheet, centred on the origin. */
export const MAP_SPAN = 900;
const PX = 2048;
const SCALE = PX / MAP_SPAN;

let cached: Texture | null = null;

const toPx = (v: number) => v * SCALE + PX / 2;

function stroke(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  width: number,
  style: string,
) {
  if (pts.length < 2) return;
  ctx.strokeStyle = style;
  ctx.lineWidth = width * SCALE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(toPx(pts[0][0]), toPx(pts[0][1]));
  for (let i = 1; i < pts.length; i++) {
    // curve through the midpoints so the walkways bend rather than kink
    const [px, pz] = pts[i - 1];
    const [cx, cz] = pts[i];
    ctx.quadraticCurveTo(
      toPx(px),
      toPx(pz),
      toPx((px + cx) / 2),
      toPx((pz + cz) / 2),
    );
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(toPx(last[0]), toPx(last[1]));
  ctx.stroke();
}

function disc(ctx: CanvasRenderingContext2D, x: number, z: number, r: number, style: string) {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(toPx(x), toPx(z), r * SCALE, 0, Math.PI * 2);
  ctx.fill();
}

export function parkMap(): Texture {
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = PX;
  canvas.height = PX;
  const ctx = canvas.getContext("2d")!;
  const rng = new Rng(4242);
  const n = makeNoise2D(606);

  ctx.clearRect(0, 0, PX, PX);

  /* ── macro variation ───────────────────────────────────────────────────── */

  // Big slow patches of lighter and darker tarmac. This is what actually stops
  // the ground reading as one flat sheet at a distance.
  const STEP = 8;
  const img = ctx.createImageData(PX, PX);
  for (let y = 0; y < PX; y += STEP) {
    for (let x = 0; x < PX; x += STEP) {
      const u = x / PX;
      const v = y / PX;
      const macro = fbm(n, u * 5, v * 5, 4);
      const patch = fbm(n, u * 13 + 20, v * 13, 3);
      const a = Math.round((macro * 0.5 + patch * 0.25) * 90);
      const lum = Math.round(120 + (macro - 0.5) * 90);
      for (let dy = 0; dy < STEP; dy++) {
        for (let dx = 0; dx < STEP; dx++) {
          const i = ((y + dy) * PX + (x + dx)) * 4;
          img.data[i] = lum;
          img.data[i + 1] = lum - 4;
          img.data[i + 2] = lum - 10;
          img.data[i + 3] = a;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  /* ── the walkway network ───────────────────────────────────────────────── */

  const CONCRETE = "#8b8578";
  const CONCRETE_EDGE = "#5d584f";

  // the spine: the gate, the plaza, then a loop around the whole midway
  const ring: [number, number][] = [
    [ZONES.plaza.x, ZONES.plaza.z],
    [ZONES.gardens.x + 30, ZONES.gardens.z + 10],
    [ZONES.attractionRow.x + 70, ZONES.attractionRow.z + 40],
    [ZONES.works.x - 20, ZONES.works.z + 60],
    [ZONES.midway.x - 30, ZONES.midway.z + 40],
    [ZONES.pyro.x - 60, ZONES.pyro.z - 20],
    [ZONES.brakeRun.x - 30, ZONES.brakeRun.z - 20],
    [ZONES.plaza.x, ZONES.plaza.z],
  ];

  // draw the kerb under the path first so every walkway gets an edge
  stroke(ctx, ring, 15, CONCRETE_EDGE);
  stroke(ctx, ring, 12, CONCRETE);

  // the entrance avenue
  stroke(
    ctx,
    [
      [LANDMARKS.gate.x, LANDMARKS.gate.z + 30],
      [LANDMARKS.gate.x, LANDMARKS.gate.z - 10],
      [ZONES.plaza.x, ZONES.plaza.z],
    ],
    22,
    CONCRETE_EDGE,
  );
  stroke(
    ctx,
    [
      [LANDMARKS.gate.x, LANDMARKS.gate.z + 30],
      [LANDMARKS.gate.x, LANDMARKS.gate.z - 10],
      [ZONES.plaza.x, ZONES.plaza.z],
    ],
    18,
    CONCRETE,
  );

  // spurs out to everything that stands on the ground
  const spurs: { x: number; z: number; pad: number }[] = [];
  for (const slots of Object.values(SLOTS)) {
    for (const s of slots) spurs.push({ x: s.x, z: s.z, pad: 16 });
  }
  for (const [kind, slots] of Object.entries(FURNITURE)) {
    const pad = kind === "kiosks" ? 8 : kind === "bigTop" ? 30 : 20;
    for (const s of slots) spurs.push({ x: s.x, z: s.z, pad });
  }

  for (const s of spurs) {
    // join each ride to the nearest point on the ring
    let best = ring[0];
    let bestD = Infinity;
    for (const r of ring) {
      const d = (r[0] - s.x) ** 2 + (r[1] - s.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    const mid: [number, number] = [
      (best[0] + s.x) / 2 + rng.spread(18),
      (best[1] + s.z) / 2 + rng.spread(18),
    ];
    stroke(ctx, [best, mid, [s.x, s.z]], 9, CONCRETE_EDGE);
    stroke(ctx, [best, mid, [s.x, s.z]], 7, CONCRETE);
  }

  // pads under the rides
  for (const s of spurs) {
    disc(ctx, s.x, s.z, s.pad + 1.6, CONCRETE_EDGE);
    disc(ctx, s.x, s.z, s.pad, CONCRETE);
  }

  /* ── wear and dirt ─────────────────────────────────────────────────────── */

  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 260; i++) {
    const x = rng.spread(MAP_SPAN / 2);
    const z = rng.spread(MAP_SPAN / 2);
    const r = rng.range(4, 26);
    const g = ctx.createRadialGradient(toPx(x), toPx(z), 0, toPx(x), toPx(z), r * SCALE);
    const dark = rng.chance(0.6);
    g.addColorStop(0, dark ? "rgba(20,18,16,0.55)" : "rgba(150,146,136,0.4)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(toPx(x) - r * SCALE, toPx(z) - r * SCALE, r * SCALE * 2, r * SCALE * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
