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

  const avenue: [number, number][] = [
    [LANDMARKS.gate.x, LANDMARKS.gate.z + 30],
    [LANDMARKS.gate.x, LANDMARKS.gate.z - 10],
    [ZONES.plaza.x, ZONES.plaza.z],
  ];

  // everything that stands on the ground needs joining to the network
  const stops: { x: number; z: number; pad: number }[] = [];
  for (const slots of Object.values(SLOTS)) {
    for (const s of slots) stops.push({ x: s.x, z: s.z, pad: 16 });
  }
  for (const [kind, slots] of Object.entries(FURNITURE)) {
    const pad = kind === "kiosks" ? 8 : kind === "bigTop" ? 30 : 20;
    for (const s of slots) stops.push({ x: s.x, z: s.z, pad });
  }

  /**
   * Nearest point anywhere on the ring, not merely its nearest corner.
   * Snapping to vertices funnels a dozen spurs into the same eight points and
   * the result reads as a starburst rather than a park.
   */
  function meetRing(x: number, z: number): [number, number] {
    let best: [number, number] = ring[0];
    let bestD = Infinity;
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const px = ax + dx * t;
      const pz = az + dz * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [px, pz];
      }
    }
    return best;
  }

  // Collect the whole network before drawing any of it. Stroking kerb-then-fill
  // per path means every later kerb cuts a dark scar across the fills already
  // laid down, and the junctions come out looking cut rather than joined.
  const paths: { pts: [number, number][]; w: number }[] = [
    { pts: ring, w: 12 },
    { pts: avenue, w: 18 },
  ];
  const pads: { x: number; z: number; r: number }[] = [];

  for (const s of stops) {
    const meet = meetRing(s.x, s.z);
    const run = Math.hypot(meet[0] - s.x, meet[1] - s.z);
    pads.push({ x: s.x, z: s.z, r: s.pad });
    // already on the walkway — a spur here would just be a stub
    if (run < s.pad + 6) continue;

    // bend the spur a little so the network is not all radial spokes
    const mid: [number, number] = [
      (meet[0] + s.x) / 2 + rng.spread(Math.min(20, run * 0.22)),
      (meet[1] + s.z) / 2 + rng.spread(Math.min(20, run * 0.22)),
    ];
    paths.push({ pts: [meet, mid, [s.x, s.z]], w: run > 90 ? 8 : 6.5 });
    // a fillet where it meets the ring, so the junction is rounded not butted
    pads.push({ x: meet[0], z: meet[1], r: 8 });
  }

  // pass one: every kerb
  for (const p of paths) stroke(ctx, p.pts, p.w + 3, CONCRETE_EDGE);
  for (const p of pads) disc(ctx, p.x, p.z, p.r + 1.6, CONCRETE_EDGE);
  // pass two: every fill
  for (const p of paths) stroke(ctx, p.pts, p.w, CONCRETE);
  for (const p of pads) disc(ctx, p.x, p.z, p.r, CONCRETE);

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
