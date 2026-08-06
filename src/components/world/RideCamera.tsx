"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { overviewBlend } from "@/lib/scroll/timeline";
import type { TrackData } from "@/lib/world/track";
import { useScroll } from "@/lib/scroll/ScrollProvider";

const ridePos = new Vector3();
const rideAhead = new Vector3();
const tanA = new Vector3();
const tanB = new Vector3();
const up = new Vector3(0, 1, 0);
const side = new Vector3();
const ovPos = new Vector3();
const ovTarget = new Vector3();
const lateral = new Vector3();
const camPos = new Vector3();
const camTarget = new Vector3();

/** How far ahead along the curve the rider looks. */
const LOOK_AHEAD = 0.014;
/** Chase-cam offsets, in world units, from the rail head. */
const CAM_UP = 4.4;
const CAM_BACK = 11;

export function RideCamera({
  track,
  progressToU,
}: {
  track: TrackData;
  progressToU: (p: number) => number;
}) {
  const { camera, size } = useThree();
  const { eased } = useScroll();
  const pointer = useRef({ x: 0, y: 0 });
  const lastU = useRef(0);
  const roll = useRef(0);
  const shake = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, dt) => {
    const cam = camera as PerspectiveCamera;
    const t = state.clock.elapsedTime;
    const p = eased.current;
    const blend = overviewBlend(p);
    const u = MathUtils.clamp(progressToU(p), 0, 1);

    /* ── ride pose ─────────────────────────────────────────────────────── */
    track.curve.getPointAt(u, ridePos);
    track.curve.getPointAt(Math.min(1, u + LOOK_AHEAD), rideAhead);
    track.curve.getTangentAt(u, tanA);
    track.curve.getTangentAt(Math.min(1, u + 0.004), tanB);

    // Chase cam: directly above and behind the car, with NO lateral offset, so
    // the track runs straight up the middle of frame. A nose-mounted view spends
    // the whole ride staring at rails; pulling back puts the biome in shot too.
    side.crossVectors(tanA, up).normalize();
    ridePos.addScaledVector(up, CAM_UP).addScaledVector(tanA, -CAM_BACK);

    // aim a little above the track ahead so the horizon stays in shot
    rideAhead.addScaledVector(up, 2.4);

    // bank into turns: signed horizontal curvature
    const turn = tanA.x * tanB.z - tanA.z * tanB.x;
    const targetRoll = MathUtils.clamp(turn * 26, -0.4, 0.4);
    roll.current += (targetRoll - roll.current) * Math.min(1, dt * 4);

    // only the pointer nudges the aim sideways — nothing automatic, so the
    // rails stay centred
    rideAhead.addScaledVector(side, pointer.current.x * 3.5);

    /* ── overview pose (the landing page) ──────────────────────────────── */
    const orbit = Math.sin(t * 0.04) * 0.32 - 0.36;
    const radius = 342;
    ovPos.set(
      Math.sin(orbit) * radius + pointer.current.x * 26,
      206 - pointer.current.y * 20,
      Math.cos(orbit) * radius,
    );

    // on wide screens, aim left of the island so it sits clear of the copy
    const aspect = size.width / Math.max(1, size.height);
    const shift = aspect > 1.25 ? 44 : 0;
    lateral.set(-ovPos.z, 0, ovPos.x).normalize();
    ovTarget
      .set(pointer.current.x * 10, 10, -4)
      .addScaledVector(lateral, shift);

    /* ── blend ─────────────────────────────────────────────────────────── */
    camPos.lerpVectors(ovPos, ridePos, blend);
    camTarget.lerpVectors(ovTarget, rideAhead, blend);

    // Coaster shudder, scaled by how fast the rider is actually moving.
    // A large jump means the lap wrapped, not that we suddenly went supersonic.
    const du = Math.abs(u - lastU.current);
    const speed = du > 0.5 ? 0 : du / Math.max(dt, 1 / 120);
    lastU.current = u;
    shake.current += (Math.min(speed * 90, 1) - shake.current) * 0.06;
    const amp = shake.current * blend * 0.16;
    camPos.x += Math.sin(t * 24.3) * amp;
    camPos.y += Math.sin(t * 31.7) * amp;

    cam.position.copy(camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(camTarget);
    cam.rotateZ(roll.current * blend);

    const targetFov = MathUtils.lerp(36, 54 + shake.current * 6, blend);
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 3);
    cam.near = 0.5;
    cam.far = 1400;
    cam.updateProjectionMatrix();
  });

  return null;
}
