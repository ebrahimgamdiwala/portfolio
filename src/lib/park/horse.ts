import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A carousel horse.
 *
 * Authored facing +X, standing about 1.8 units tall, with the brass pole
 * passing vertically through the saddle. Split into coat and tack so one
 * instance tint can colour the horse while the mane, saddle and hooves stay
 * their own materials — a single-colour horse reads as a lump.
 *
 * Posed mid-gallop: front legs reaching, hind legs extended back. A carousel
 * horse standing square looks like a table.
 */

let coatGeom: BufferGeometry | null = null;
let tackGeom: BufferGeometry | null = null;

const UPPER_LEN = 0.54;
const LOWER_LEN = 0.48;

/**
 * A tapered limb segment hinged at its top end, returning where it ends.
 *
 * Guessing the next joint separately from the rotation that produced it is how
 * you get a shin that starts nowhere near its own knee — which is exactly what
 * detached these legs from the horse.
 */
function segment(rTop: number, rBot: number, len: number, x: number, y: number, tilt: number) {
  const g = new CylinderGeometry(rTop, rBot, len, 7, 1);
  g.translate(0, -len / 2, 0);
  g.rotateZ(tilt);
  g.translate(x, y, 0);
  return { geometry: g, x: x + len * Math.sin(tilt), y: y - len * Math.cos(tilt) };
}

/** One leg: shoulder joint, upper, knee, lower — chained off each other. */
function leg(hipX: number, hipY: number, zx: number, upper: number, lower: number) {
  const parts: BufferGeometry[] = [];

  // a joint ball where the leg meets the barrel, so it is not a floating stick
  const socket = new SphereGeometry(0.15, 8, 6);
  socket.translate(hipX, hipY, 0);
  parts.push(socket);

  const thigh = segment(0.13, 0.09, UPPER_LEN, hipX, hipY, -upper);
  parts.push(thigh.geometry);

  const knee = new SphereGeometry(0.085, 7, 6);
  knee.translate(thigh.x, thigh.y, 0);
  parts.push(knee);

  const shin = segment(0.075, 0.055, LOWER_LEN, thigh.x, thigh.y, -lower);
  parts.push(shin.geometry);

  for (const p of parts) p.translate(0, 0, zx);
  return { parts, footX: shin.x, footY: shin.y, footZ: zx };
}

/**
 * The four legs, solved once so coat and tack agree on where the hooves are.
 *
 * A positive angle sweeps a leg *backward*, so the fronts take negative angles
 * to reach forward and the hinds positive to drive back. Getting that the wrong
 * way round folds all four hooves in under the belly.
 */
function legSolve() {
  return [
    leg(0.5, -0.16, 0.2, -0.62, -0.15),
    leg(0.44, -0.16, -0.2, -0.38, -0.05),
    leg(-0.58, -0.14, 0.2, 0.72, 0.42),
    leg(-0.52, -0.14, -0.2, 0.5, 0.26),
  ];
}

export function horseCoat(): BufferGeometry {
  if (coatGeom) return coatGeom;
  const parts: BufferGeometry[] = [];

  // barrel — deeper at the chest than the flank
  const body = new SphereGeometry(0.62, 16, 12);
  body.scale(1.55, 0.85, 0.62);
  body.translate(0, 0.02, 0);
  parts.push(body);

  const chest = new SphereGeometry(0.42, 12, 10);
  chest.scale(1, 1.05, 0.78);
  chest.translate(0.62, 0.04, 0);
  parts.push(chest);

  const rump = new SphereGeometry(0.44, 12, 10);
  rump.scale(0.95, 1, 0.8);
  rump.translate(-0.66, 0.06, 0);
  parts.push(rump);

  // neck, rising forward
  const neck = new CylinderGeometry(0.19, 0.29, 0.86, 10);
  neck.rotateZ(-0.62);
  neck.translate(0.95, 0.44, 0);
  parts.push(neck);

  // head and muzzle
  const skull = new SphereGeometry(0.2, 10, 8);
  skull.scale(1.25, 0.92, 0.78);
  skull.translate(1.36, 0.82, 0);
  parts.push(skull);

  const muzzle = new CylinderGeometry(0.1, 0.13, 0.36, 8);
  muzzle.rotateZ(Math.PI / 2 - 0.42);
  muzzle.translate(1.62, 0.68, 0);
  parts.push(muzzle);

  for (const sz of [-0.1, 0.1]) {
    const ear = new ConeGeometry(0.055, 0.17, 6);
    ear.rotateZ(-0.22);
    ear.translate(1.24, 1.02, sz);
    parts.push(ear);
  }

  // legs: fronts reaching, hinds driving back
  for (const l of legSolve()) parts.push(...l.parts);

  coatGeom = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return coatGeom;
}

/** Mane, tail, saddle, bridle, hooves — everything that is not horse. */
export function horseTack(): BufferGeometry {
  if (tackGeom) return tackGeom;
  const parts: BufferGeometry[] = [];

  // mane along the crest of the neck
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const tuft = new BoxGeometry(0.14, 0.2 - t * 0.06, 0.1);
    tuft.rotateZ(-0.6);
    tuft.translate(0.78 + t * 0.5, 0.66 + t * 0.32, 0);
    parts.push(tuft);
  }

  // tail, flying out behind
  const tail = new ConeGeometry(0.16, 0.78, 8);
  tail.rotateZ(1.25);
  tail.translate(-1.12, 0.24, 0);
  parts.push(tail);

  // saddle over the barrel, with a raised cantle
  const saddle = new SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  saddle.scale(1.25, 0.6, 0.92);
  saddle.translate(-0.06, 0.42, 0);
  parts.push(saddle);

  const cantle = new TorusGeometry(0.2, 0.06, 6, 12, Math.PI);
  cantle.rotateY(Math.PI / 2);
  cantle.translate(-0.46, 0.56, 0);
  parts.push(cantle);

  // girth strap round the barrel
  const girth = new TorusGeometry(0.56, 0.045, 6, 16);
  girth.rotateY(Math.PI / 2);
  girth.scale(1, 0.92, 1);
  girth.translate(-0.04, 0.02, 0);
  parts.push(girth);

  // stirrups
  for (const sz of [-0.34, 0.34]) {
    const strap = new BoxGeometry(0.05, 0.34, 0.04);
    strap.translate(-0.06, 0.16, sz);
    parts.push(strap);
    const iron = new TorusGeometry(0.08, 0.025, 5, 10);
    iron.translate(-0.06, -0.02, sz);
    parts.push(iron);
  }

  // bridle
  const brow = new TorusGeometry(0.17, 0.028, 5, 12);
  brow.rotateY(Math.PI / 2);
  brow.scale(1, 0.85, 1);
  brow.translate(1.36, 0.8, 0);
  parts.push(brow);

  // hooves, taken from the same leg solve the coat uses rather than guessed
  for (const l of legSolve()) {
    const hoof = new CylinderGeometry(0.095, 0.115, 0.15, 8);
    hoof.translate(l.footX, l.footY - 0.04, l.footZ);
    parts.push(hoof);
  }

  tackGeom = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return tackGeom;
}
