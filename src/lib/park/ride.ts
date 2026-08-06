import { Quaternion, Vector3 } from "three";
import type { CameraRig } from "@/lib/content";

/**
 * Everything about where the rider is, written once per frame by `RideCamera`
 * and read by anything that needs to follow the train. Deliberately a mutable
 * ref rather than React state — nothing scroll-linked is allowed to re-render.
 */
export interface RideState {
  /** Eased scroll progress, 0..1. */
  progress: number;
  /** Ride time, 0..1. */
  tau: number;
  /** Arc-length position on the circuit, 0..1. */
  u: number;
  /** Metres per second. */
  speed: number;
  /** 0..1, normalised against the circuit's top speed. */
  rush: number;
  /** 0 = orbiting the park from above, 1 = fully onboard. */
  blend: number;
  /** Pose of the lead car. */
  pos: Vector3;
  quat: Quaternion;
  rig: CameraRig;
}

export function makeRideState(): RideState {
  return {
    progress: 0,
    tau: 0,
    u: 0,
    speed: 0,
    rush: 0,
    blend: 0,
    pos: new Vector3(),
    quat: new Quaternion(),
    rig: "orbit",
  };
}
