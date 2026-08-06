import { BoxGeometry, CylinderGeometry, SphereGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A person, in about two hundred triangles.
 *
 * Split into two meshes rather than one: everything that is clothing, and
 * everything that is skin. That way a single instanced draw per half can tint
 * shirts and complexions independently, and four hundred people cost two draw
 * calls between them.
 *
 * Deliberately not a billboard. Impostors are cheaper, but they betray
 * themselves the moment you walk around one — and in explore mode you can.
 */

const HEIGHT = 1.75;

let bodyGeom: BufferGeometry | null = null;
let skinGeom: BufferGeometry | null = null;

function limb(radius: number, length: number, x: number, y: number, tilt = 0) {
  const g = new CylinderGeometry(radius * 0.85, radius, length, 7, 1);
  g.rotateZ(tilt);
  g.translate(x, y, 0);
  return g;
}

/** Shirt, trousers, shoes — everything an instance tint should read as clothes. */
export function humanBody(): BufferGeometry {
  if (bodyGeom) return bodyGeom;

  const parts: BufferGeometry[] = [];

  // torso, tapered so it has shoulders
  const torso = new CylinderGeometry(0.2, 0.155, 0.56, 9, 1);
  torso.translate(0, 1.16, 0);
  parts.push(torso);

  // hips
  const hips = new BoxGeometry(0.28, 0.16, 0.19);
  hips.translate(0, 0.85, 0);
  parts.push(hips);

  // legs, very slightly apart
  parts.push(limb(0.075, 0.78, -0.085, 0.42));
  parts.push(limb(0.075, 0.78, 0.085, 0.42));

  // shoes
  for (const sx of [-0.085, 0.085]) {
    const shoe = new BoxGeometry(0.11, 0.07, 0.24);
    shoe.translate(sx, 0.04, 0.03);
    parts.push(shoe);
  }

  // arms, hanging with a little natural splay
  parts.push(limb(0.058, 0.6, -0.245, 1.12, 0.1));
  parts.push(limb(0.058, 0.6, 0.245, 1.12, -0.1));

  bodyGeom = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return bodyGeom;
}

/** Head, neck and hands. */
export function humanSkin(): BufferGeometry {
  if (skinGeom) return skinGeom;

  const parts: BufferGeometry[] = [];

  const head = new SphereGeometry(0.116, 10, 8);
  head.scale(1, 1.15, 0.94);
  head.translate(0, 1.6, 0);
  parts.push(head);

  const neck = new CylinderGeometry(0.055, 0.065, 0.1, 7);
  neck.translate(0, 1.47, 0);
  parts.push(neck);

  for (const sx of [-0.27, 0.27]) {
    const hand = new SphereGeometry(0.062, 7, 6);
    hand.translate(sx, 0.8, 0);
    parts.push(hand);
  }

  skinGeom = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return skinGeom;
}

export const HUMAN_HEIGHT = HEIGHT;
