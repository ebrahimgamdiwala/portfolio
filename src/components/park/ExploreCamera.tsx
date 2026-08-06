"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { buildMarkers, type Marker } from "@/lib/explore/markers";
import { explore, seats, useExplore } from "@/lib/explore/store";
import { PARK } from "@/lib/park/layout";

/**
 * Walking the park.
 *
 * Three states in one rig: strolling under your own steam, flying to a marker
 * you have clicked, and strapped into a ride that is moving you itself.
 *
 * Look is drag-to-turn rather than pointer lock. Locking the pointer on a page
 * somebody arrived at by scrolling is a hostile surprise, and it breaks the
 * click-a-marker interaction this whole mode is built on.
 */

const EYE = 1.75;
const WALK = 26;
const RUN = 62;
const BOUND = PARK.fenceRadius - 12;

const aim = new Vector3();
const want = new Vector3();
const flat = new Vector3();
const seatOut = new Vector3();

export function ExploreCamera() {
  const { camera, gl } = useThree();
  const { mode, selected, riding } = useExplore();
  const markers = useMemo(() => buildMarkers(), []);

  const pos = useRef(new Vector3(0, EYE, 300));
  const vel = useRef(new Vector3());
  const yaw = useRef(0);
  const pitch = useRef(-0.05);
  const keys = useRef<Record<string, boolean>>({});
  const drag = useRef<{ on: boolean; x: number; y: number }>({ on: false, x: 0, y: 0 });
  /** 0 = free, 1 = fully parked at the selected marker's viewpoint. */
  const lock = useRef(0);

  /* ── input ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (mode !== "explore") return;
    const el = gl.domElement;

    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (e.key === "Escape") explore.select(null);
      if (["w", "a", "s", "d", " "].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => void (keys.current[e.key.toLowerCase()] = false);

    const pDown = (e: PointerEvent) => {
      drag.current = { on: true, x: e.clientX, y: e.clientY };
    };
    const pMove = (e: PointerEvent) => {
      if (!drag.current.on) return;
      yaw.current -= (e.clientX - drag.current.x) * 0.0042;
      pitch.current = MathUtils.clamp(
        pitch.current - (e.clientY - drag.current.y) * 0.0035,
        -0.9,
        0.7,
      );
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
    };
    const pUp = () => void (drag.current.on = false);

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    el.addEventListener("pointerdown", pDown);
    window.addEventListener("pointermove", pMove);
    window.addEventListener("pointerup", pUp);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      el.removeEventListener("pointerdown", pDown);
      window.removeEventListener("pointermove", pMove);
      window.removeEventListener("pointerup", pUp);
      keys.current = {};
    };
  }, [mode, gl]);

  /** Drop the visitor at the gate the first time they walk in. */
  useEffect(() => {
    if (mode !== "explore") return;
    // on the avenue outside the arch, facing down it into the park
    pos.current.set(0, EYE, 300);
    yaw.current = 0;
    pitch.current = -0.05;
    vel.current.set(0, 0, 0);
    lock.current = 0;
  }, [mode]);

  const marker: Marker | undefined = useMemo(
    () => markers.find((m) => m.id === selected),
    [markers, selected],
  );

  useFrame((state, dt) => {
    if (mode !== "explore") return;
    const cam = camera as PerspectiveCamera;
    const step = Math.min(dt, 0.05);

    /* ── strapped in ─────────────────────────────────────────────────────── */

    if (riding && seats[riding]) {
      const seat = seats[riding];
      // sit just outside the car, looking out over the park rather than at the
      // back of the seat in front
      seatOut.set(Math.sin(seat.yaw), 0, Math.cos(seat.yaw)).multiplyScalar(3.2);
      cam.position.lerp(want.copy(seat.pos).add(seatOut).setY(seat.pos.y + 1.2), 0.22);
      aim
        .copy(cam.position)
        .add(seatOut.multiplyScalar(9))
        .setY(cam.position.y - 2 + Math.sin(state.clock.elapsedTime * 0.4) * 1.5);
      cam.up.set(0, 1, 0);
      cam.lookAt(aim);
      cam.fov += (62 - cam.fov) * Math.min(1, dt * 3);
      cam.updateProjectionMatrix();
      return;
    }

    /* ── parked at a marker, or walking ──────────────────────────────────── */

    const target = marker ? 1 : 0;
    lock.current += (target - lock.current) * Math.min(1, step * 2.6);

    if (lock.current < 0.995) {
      const speed = keys.current.shift ? RUN : WALK;
      flat.set(0, 0, 0);
      if (keys.current.w || keys.current.arrowup) flat.z -= 1;
      if (keys.current.s || keys.current.arrowdown) flat.z += 1;
      if (keys.current.a || keys.current.arrowleft) flat.x -= 1;
      if (keys.current.d || keys.current.arrowright) flat.x += 1;
      if (flat.lengthSq() > 0) {
        flat.normalize().applyAxisAngle(new Vector3(0, 1, 0), yaw.current);
        vel.current.addScaledVector(flat, speed * step * 6);
      }
      vel.current.multiplyScalar(Math.pow(0.0016, step));
      pos.current.addScaledVector(vel.current, step);

      // keep the visitor inside the fence
      const r = Math.hypot(pos.current.x, pos.current.z);
      if (r > BOUND) {
        pos.current.x *= BOUND / r;
        pos.current.z *= BOUND / r;
      }
      pos.current.y = EYE;
    }

    if (marker) {
      want.set(marker.view[0], marker.view[1], marker.view[2]);
      cam.position.lerpVectors(pos.current, want, lock.current);
      aim.set(marker.look[0], marker.look[1], marker.look[2]);
      // drift the parked shot so it never sits perfectly still
      const t = state.clock.elapsedTime;
      cam.position.x += Math.sin(t * 0.24) * 1.6 * lock.current;
      cam.position.y += Math.sin(t * 0.31) * 0.7 * lock.current;
      cam.up.set(0, 1, 0);
      cam.lookAt(aim);
    } else {
      cam.position.copy(pos.current);
      aim
        .set(
          Math.sin(yaw.current) * Math.cos(pitch.current),
          Math.sin(pitch.current),
          Math.cos(yaw.current) * Math.cos(pitch.current),
        )
        .multiplyScalar(-20)
        .add(cam.position);
      cam.up.set(0, 1, 0);
      cam.lookAt(aim);
    }

    const targetFov = marker ? 48 : 66;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
  });

  return null;
}
