import { Quaternion, Vector3 } from "three";
import type { Piece } from "./coaster";

/**
 * Shared box-kit. Every structure in the park — track webbing, hoarding frames,
 * gantries, stall skeletons — is assembled from stretched unit boxes so it can
 * all be drawn with a handful of InstancedMeshes.
 */

const FORWARD = new Vector3(0, 0, 1);
export const UP = new Vector3(0, 1, 0);
export const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];

/** A box stretched and rotated to span two points. */
export function beam(a: Vector3, b: Vector3, thickness: number, depth = thickness): Piece {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const q = new Quaternion().setFromUnitVectors(FORWARD, dir.normalize());
  return {
    p: [mid.x, mid.y, mid.z],
    q: [q.x, q.y, q.z, q.w],
    s: [thickness, depth, Math.max(len, 0.05)],
  };
}

/** An axis-aligned box, optionally spun about Y. */
export function box(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  yaw = 0,
): Piece {
  const q = new Quaternion().setFromAxisAngle(UP, yaw);
  return { p: [x, y, z], q: [q.x, q.y, q.z, q.w], s: [sx, sy, sz] };
}

/**
 * Maps a structure authored in its own local space onto a slot in the park.
 * Local +Z is the direction the structure faces.
 */
export function placer(originX: number, originY: number, originZ: number, yaw: number) {
  const rot = new Quaternion().setFromAxisAngle(UP, yaw);
  const origin = new Vector3(originX, originY, originZ);

  return function at(lx: number, ly: number, lz: number) {
    return new Vector3(lx, ly, lz).applyQuaternion(rot).add(origin);
  };
}
