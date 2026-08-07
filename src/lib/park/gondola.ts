import {
  BoxGeometry,
  CylinderGeometry,
  LatheGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A ferris wheel gondola.
 *
 * Authored with its ORIGIN AT THE PIVOT — the point on the rim it hangs from —
 * so the instance matrix is simply the rim position and the cabin swings from
 * the right place. Building it centred on the cabin instead is what makes a
 * rider feel like they are dangling off the wheel rather than sitting in
 * something.
 *
 * Three parts, three materials: the painted shell, the glass, and the trim.
 */

/** Floor height below the pivot. */
export const CABIN_FLOOR = -3.9;
/** Where a rider's eyes are, relative to the pivot. */
export const CABIN_EYE = CABIN_FLOOR + 1.35;

const R = 1.85;

let shellGeom: BufferGeometry | null = null;
let glassGeom: BufferGeometry | null = null;
let trimGeom: BufferGeometry | null = null;

/** Lathe from a profile, then dropped so y = 0 sits at the cabin floor. */
function lathe(points: [number, number][], segments = 18) {
  const g = new LatheGeometry(
    points.map(([x, y]) => new Vector2(Math.max(x, 0.001), y)),
    segments,
  );
  g.translate(0, CABIN_FLOOR, 0);
  return g;
}

/** Painted bodywork: the tub below the windows and the roof above them. */
export function gondolaShell(): BufferGeometry {
  if (shellGeom) return shellGeom;
  const parts: BufferGeometry[] = [];

  // lower tub — a curved hull, not a box
  parts.push(
    lathe([
      [0, 0],
      [0.9, 0],
      [1.4, 0.12],
      [1.68, 0.42],
      [R, 0.95],
      [R, 1.32],
    ]),
  );

  // roof: a shallow dome closing over the window band
  parts.push(
    lathe([
      [R, 2.62],
      [R * 0.98, 2.85],
      [R * 0.82, 3.12],
      [R * 0.5, 3.32],
      [0, 3.4],
    ]),
  );

  // floor pan
  const floor = new CylinderGeometry(R * 0.92, R * 0.92, 0.1, 18);
  floor.translate(0, CABIN_FLOOR + 0.06, 0);
  parts.push(floor);

  // two benches facing each other across the cabin
  for (const sz of [-1, 1]) {
    const seat = new BoxGeometry(2.3, 0.16, 0.62);
    seat.translate(0, CABIN_FLOOR + 0.62, sz * 0.78);
    parts.push(seat);
    const back = new BoxGeometry(2.3, 0.7, 0.14);
    back.translate(0, CABIN_FLOOR + 0.98, sz * 1.12);
    parts.push(back);
  }

  // the yoke it hangs from: a V down to the roof, plus the hanger eye
  for (const sx of [-1, 1]) {
    const arm = new CylinderGeometry(0.09, 0.11, 3.5, 8);
    arm.rotateZ(sx * 0.19);
    arm.translate(sx * 0.33, -1.75, 0);
    parts.push(arm);
  }
  const eye = new TorusGeometry(0.26, 0.09, 8, 14);
  eye.rotateY(Math.PI / 2);
  parts.push(eye);
  const yokeBar = new CylinderGeometry(0.07, 0.07, 2.2, 8);
  yokeBar.rotateZ(Math.PI / 2);
  yokeBar.translate(0, CABIN_FLOOR + 3.42, 0);
  parts.push(yokeBar);

  shellGeom = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return shellGeom;
}

/** The glazed band you actually look out of. */
export function gondolaGlass(): BufferGeometry {
  const g = new CylinderGeometry(R * 0.99, R * 0.99, 1.3, 18, 1, true);
  g.translate(0, CABIN_FLOOR + 1.97, 0);
  glassGeom ??= g;
  return glassGeom;
}

/** Bright metal: window mullions, rails, and the rim below the roof. */
export function gondolaTrim(): BufferGeometry {
  if (trimGeom) return trimGeom;
  const parts: BufferGeometry[] = [];

  // mullions between the panes — the thing that makes it read as a cabin
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const post = new BoxGeometry(0.09, 1.34, 0.09);
    post.translate(Math.cos(a) * R, CABIN_FLOOR + 1.97, Math.sin(a) * R);
    parts.push(post);
  }

  // waist and eaves rings
  for (const y of [1.3, 2.64]) {
    const ring = new TorusGeometry(R * 1.005, 0.075, 8, 20);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, CABIN_FLOOR + y, 0);
    parts.push(ring);
  }

  // grab rail inside
  const rail = new TorusGeometry(R * 0.78, 0.05, 6, 18);
  rail.rotateX(Math.PI / 2);
  rail.translate(0, CABIN_FLOOR + 1.5, 0);
  parts.push(rail);

  // finial on the roof
  const finial = new SphereGeometry(0.16, 8, 6);
  finial.translate(0, CABIN_FLOOR + 3.5, 0);
  parts.push(finial);

  trimGeom = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return trimGeom;
}
