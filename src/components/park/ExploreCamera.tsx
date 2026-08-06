"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { buildMarkers, type Marker } from "@/lib/explore/markers";
import { explore, seats, useExplore } from "@/lib/explore/store";
import { resolve } from "@/lib/explore/collide";
import { PARK } from "@/lib/park/layout";

/**
 * Walking the park, first-person.
 *
 * Mouse look is pointer-locked — click once and the mouse turns your head, the
 * way it does in any shooter. Targeting is a crosshair cone rather than a
 * raycast against marker meshes: with the pointer locked there is no cursor to
 * raycast from, and "is this marker near the middle of the screen" is both
 * cheaper and more forgiving than hitting a floating label exactly.
 *
 * Three states share the rig: walking, flown to a marker you have selected, and
 * strapped into a ride that is carrying you itself.
 */

const EYE = 1.72;
const WALK = 30;
const RUN = 72;
/** The fence is at PARK.fenceRadius; stop short of touching it. */
const BOUND = PARK.fenceRadius - 14;
/** How far off-centre a marker can be and still count as targeted. */
const AIM_COS = Math.cos(0.16);
const AIM_RANGE = 260;

const aim = new Vector3();
const want = new Vector3();
const flat = new Vector3();
const seatOut = new Vector3();
const fwd = new Vector3();
const toMarker = new Vector3();
const UP = new Vector3(0, 1, 0);
const pushed = { x: 0, z: 0 };

/** Live position, read by the map overlay. Deliberately not React state. */
export const walker = { x: 0, z: 300, yaw: 0 };

export function ExploreCamera() {
  const { camera, gl } = useThree();
  const { mode, selected, riding } = useExplore();
  const markers = useMemo(() => buildMarkers(), []);

  const pos = useRef(new Vector3(0, EYE, 300));
  const vel = useRef(new Vector3());
  const yaw = useRef(0);
  const pitch = useRef(-0.04);
  const keys = useRef<Record<string, boolean>>({});
  const drag = useRef<{ on: boolean; x: number; y: number }>({ on: false, x: 0, y: 0 });
  /** 0 = free, 1 = fully parked at the selected marker's viewpoint. */
  const lock = useRef(0);
  const hovered = useRef<string | null>(null);

  /* ── input ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (mode !== "explore") return;
    const el = gl.domElement;

    const isLocked = () => document.pointerLockElement === el;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      keys.current[e.key.toLowerCase()] = down;
      if (down && e.key === "Escape") explore.select(null);
      if (down && ["w", "a", "s", "d", " "].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const kDown = (e: KeyboardEvent) => onKey(e, true);
    const kUp = (e: KeyboardEvent) => onKey(e, false);

    const onClick = () => {
      // clicking the crosshair onto a marker opens it; otherwise grab the mouse
      if (isLocked()) {
        if (hovered.current) {
          explore.select(hovered.current);
          document.exitPointerLock();
        }
        return;
      }
      if (!explore.state.selected) el.requestPointerLock?.();
    };

    const onMove = (e: MouseEvent) => {
      if (isLocked()) {
        yaw.current -= e.movementX * 0.0022;
        pitch.current = MathUtils.clamp(pitch.current - e.movementY * 0.0019, -1.1, 0.9);
        return;
      }
      // fallback for touch and for anyone whose browser refuses the lock
      if (!drag.current.on) return;
      yaw.current -= (e.clientX - drag.current.x) * 0.004;
      pitch.current = MathUtils.clamp(
        pitch.current - (e.clientY - drag.current.y) * 0.0034,
        -1.1,
        0.9,
      );
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
    };

    const pDown = (e: PointerEvent) => {
      drag.current = { on: true, x: e.clientX, y: e.clientY };
    };
    const pUp = () => void (drag.current.on = false);
    const onLockChange = () => explore.setLocked(isLocked());

    window.addEventListener("keydown", kDown);
    window.addEventListener("keyup", kUp);
    el.addEventListener("click", onClick);
    el.addEventListener("pointerdown", pDown);
    window.addEventListener("pointerup", pUp);
    window.addEventListener("mousemove", onMove);
    document.addEventListener("pointerlockchange", onLockChange);

    return () => {
      window.removeEventListener("keydown", kDown);
      window.removeEventListener("keyup", kUp);
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointerdown", pDown);
      window.removeEventListener("pointerup", pUp);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      if (isLocked()) document.exitPointerLock();
      keys.current = {};
      explore.setLocked(false);
    };
  }, [mode, gl]);

  /** Drop the visitor on the avenue outside the arch, facing into the park. */
  useEffect(() => {
    if (mode !== "explore") return;
    pos.current.set(0, EYE, 300);
    yaw.current = 0;
    pitch.current = -0.04;
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
      seatOut.set(Math.sin(seat.yaw), 0, Math.cos(seat.yaw)).multiplyScalar(3.4);
      cam.position.lerp(want.copy(seat.pos).add(seatOut).setY(seat.pos.y + 1.2), 0.22);
      aim
        .copy(cam.position)
        .add(seatOut.multiplyScalar(9))
        .setY(cam.position.y - 2 + Math.sin(state.clock.elapsedTime * 0.4) * 1.5);
      cam.up.set(0, 1, 0);
      cam.lookAt(aim);
      cam.fov += (64 - cam.fov) * Math.min(1, dt * 3);
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
        flat.normalize().applyAxisAngle(UP, yaw.current);
        vel.current.addScaledVector(flat, speed * step * 6);
      }
      vel.current.multiplyScalar(Math.pow(0.0016, step));
      pos.current.addScaledVector(vel.current, step);

      // Soft wall at the fence: push back rather than clamp, so running at it
      // slows you to a stop instead of pinning you against an invisible line.
      const r = Math.hypot(pos.current.x, pos.current.z);
      if (r > BOUND) {
        const k = BOUND / r;
        pos.current.x *= k;
        pos.current.z *= k;
        vel.current.multiplyScalar(0.2);
      }

      // and out of anything you have walked into
      if (resolve(pos.current.x, pos.current.z, 0.9, pushed)) {
        pos.current.x = pushed.x;
        pos.current.z = pushed.z;
        vel.current.multiplyScalar(0.55);
      }
      pos.current.y = EYE;
    }

    walker.x = pos.current.x;
    walker.z = pos.current.z;
    walker.yaw = yaw.current;

    /* ── aim ─────────────────────────────────────────────────────────────── */

    fwd.set(
      -Math.sin(yaw.current) * Math.cos(pitch.current),
      Math.sin(pitch.current),
      -Math.cos(yaw.current) * Math.cos(pitch.current),
    );

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
      if (hovered.current) {
        hovered.current = null;
        explore.hover(null);
      }
    } else {
      cam.position.copy(pos.current);
      cam.up.set(0, 1, 0);
      cam.lookAt(aim.copy(cam.position).addScaledVector(fwd, 20));

      // whichever marker sits nearest the middle of the screen
      let best: string | null = null;
      let bestDot = AIM_COS;
      for (const m of markers) {
        toMarker.set(m.pos[0] - cam.position.x, m.pos[1] - cam.position.y, m.pos[2] - cam.position.z);
        const dist = toMarker.length();
        if (dist > AIM_RANGE || dist < 1) continue;
        const d = toMarker.divideScalar(dist).dot(fwd);
        if (d > bestDot) {
          bestDot = d;
          best = m.id;
        }
      }
      if (best !== hovered.current) {
        hovered.current = best;
        explore.hover(best);
      }
    }

    const targetFov = marker ? 48 : 72;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
  });

  return null;
}
