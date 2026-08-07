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

const EYE = 3.4;
const WALK = 30;
const RUN = 72;
/** The fence is at PARK.fenceRadius; stop short of touching it. */
const BOUND = PARK.fenceRadius - 14;
/** How far off-centre a marker can be and still count as targeted. */
const AIM_COS = Math.cos(0.16);
/** Matched to the marker cull distance — you cannot target what you cannot see. */
const AIM_RANGE = 95;

const aim = new Vector3();
const want = new Vector3();
const flat = new Vector3();
const seatOut = new Vector3();
const fwd = new Vector3();
const toMarker = new Vector3();
const UP = new Vector3(0, 1, 0);
const pushed = { x: 0, z: 0 };
const dir = new Vector3();

/**
 * Swings an aim point about its own eye position by a yaw and pitch offset.
 * Lets a ride frame the shot it wants while the rider still turns their head.
 */
function freeLook(eye: Vector3, target: Vector3, dYaw: number, dPitch: number) {
  dir.subVectors(target, eye);
  const len = dir.length() || 1;
  dir.divideScalar(len);

  const y = Math.atan2(dir.x, dir.z) + dYaw;
  const p = MathUtils.clamp(Math.asin(MathUtils.clamp(dir.y, -1, 1)) + dPitch, -1.2, 1.2);
  const c = Math.cos(p);
  target.set(
    eye.x + Math.sin(y) * c * len,
    eye.y + Math.sin(p) * len,
    eye.z + Math.cos(y) * c * len,
  );
}

/** Live position, read by the map overlay. Deliberately not React state. */
export const walker = { x: 0, z: 180, yaw: 0 };

export function ExploreCamera() {
  const { camera, gl } = useThree();
  const mode = useExplore().mode;
  const selected = useExplore().selected;
  const riding = useExplore().riding;
  const markers = useMemo(() => buildMarkers(), []);

  const pos = useRef(new Vector3(0, EYE, 180));
  const vel = useRef(new Vector3());
  const yaw = useRef(0);
  const pitch = useRef(-0.04);
  const keys = useRef<Set<string>>(new Set());
  if (!(keys.current instanceof Set)) keys.current = new Set();
  const drag = useRef<{ on: boolean; x: number; y: number }>({ on: false, x: 0, y: 0 });
  /** 0 = free, 1 = fully parked at the selected marker's viewpoint. */
  const lock = useRef(0);
  const hovered = useRef<string | null>(null);
  /** Which ride the camera is currently strapped into. */
  const boarded = useRef<string | null>(null);
  /** Walking heading, parked while strapped into a ride. */
  const stowed = useRef({ yaw: 0, pitch: 0 });

  /* ── input ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (mode !== "explore") return;
    const el = gl.domElement;

    const isLocked = () => document.pointerLockElement === el;

    const tryLock = () => {
      try {
        const p = (el as any).requestPointerLock?.();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (err) {}
    };

    const tryUnlock = () => {
      try {
        if (isLocked()) document.exitPointerLock?.();
      } catch (err) {}
    };

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const code = (e.code || "").toLowerCase();

      // Map physical key code to game action
      if (code === "keyw" || code === "arrowup")    { down ? keys.current.add("w") : keys.current.delete("w"); }
      if (code === "keys" || code === "arrowdown")  { down ? keys.current.add("s") : keys.current.delete("s"); }
      if (code === "keya" || code === "arrowleft")  { down ? keys.current.add("a") : keys.current.delete("a"); }
      if (code === "keyd" || code === "arrowright") { down ? keys.current.add("d") : keys.current.delete("d"); }
      if (code === "shiftleft" || code === "shiftright") { down ? keys.current.add("shift") : keys.current.delete("shift"); }

      if (down && code === "escape") {
        explore.select(null);
        explore.ride(null);
        tryUnlock();
      }
    };
    const kDown = (e: KeyboardEvent) => onKey(e, true);
    const kUp = (e: KeyboardEvent) => onKey(e, false);

    const onClick = () => {
      if (isLocked()) {
        if (hovered.current) {
          explore.select(hovered.current);
          tryUnlock();
        }
        return;
      }
      if (!explore.state.selected || explore.state.riding) tryLock();
    };

    const onMove = (e: MouseEvent) => {
      if (isLocked()) {
        yaw.current -= e.movementX * 0.0022;
        pitch.current = MathUtils.clamp(pitch.current - e.movementY * 0.0019, -1.1, 0.9);
        return;
      }
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
    const onBlur = () => {
      keys.current.clear();
    };

    document.addEventListener("keydown", kDown, { capture: true });
    document.addEventListener("keyup", kUp, { capture: true });
    window.addEventListener("blur", onBlur);
    el.addEventListener("click", onClick);
    el.addEventListener("pointerdown", pDown);
    window.addEventListener("pointerup", pUp);
    window.addEventListener("mousemove", onMove);
    document.addEventListener("pointerlockchange", onLockChange);

    return () => {
      document.removeEventListener("keydown", kDown, { capture: true });
      document.removeEventListener("keyup", kUp, { capture: true });
      window.removeEventListener("blur", onBlur);
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointerdown", pDown);
      window.removeEventListener("pointerup", pUp);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      tryUnlock();
      keys.current.clear();
      explore.setLocked(false);
    };
  }, [mode, gl]);

  /** Drop the visitor on the avenue outside the arch, facing into the park. */
  useEffect(() => {
    if (mode !== "explore") return;
    pos.current.set(0, EYE, 180);
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
      const isSlide = riding.startsWith("waterSlide");
      const isCarousel = riding.startsWith("carousel");
      const isTeacups = riding.startsWith("teacups");
      const isSwingRide = riding.startsWith("swingRide");
      const isPirateShip = riding.startsWith("pirateShip");

      if (isSlide) {
        const fwdX = Math.sin(seat.yaw);
        const fwdZ = Math.cos(seat.yaw);
        cam.position.set(seat.pos.x, seat.pos.y + 4.5, seat.pos.z);
        aim.set(
          cam.position.x + fwdX * 14,
          cam.position.y - 3,
          cam.position.z + fwdZ * 14,
        );
      } else if (isCarousel) {
        const outX = Math.sin(seat.yaw);
        const outZ = Math.cos(seat.yaw);
        want.set(seat.pos.x, seat.pos.y + 0.6, seat.pos.z);
        cam.position.lerp(want, 0.35);
        aim.set(
          cam.position.x + outX * 16,
          cam.position.y + 0.5 + Math.sin(state.clock.elapsedTime * 0.5) * 0.3,
          cam.position.z + outZ * 16,
        );
      } else if (isTeacups) {
        const outX = Math.sin(seat.yaw);
        const outZ = Math.cos(seat.yaw);
        want.set(seat.pos.x, seat.pos.y + 0.8, seat.pos.z);
        cam.position.lerp(want, 0.4);
        aim.set(
          cam.position.x + outX * 14,
          cam.position.y + 0.4,
          cam.position.z + outZ * 14,
        );
      } else if (isSwingRide) {
        const outX = Math.sin(seat.yaw);
        const outZ = Math.cos(seat.yaw);
        want.set(seat.pos.x, seat.pos.y + 0.5, seat.pos.z);
        cam.position.lerp(want, 0.35);
        aim.set(
          cam.position.x + outX * 18,
          cam.position.y - 1.5,
          cam.position.z + outZ * 18,
        );
      } else if (isPirateShip) {
        const fwdX = Math.sin(seat.yaw);
        const fwdZ = Math.cos(seat.yaw);
        // Sit elevated on top of the galleon deck above passenger seats
        cam.position.set(seat.pos.x, seat.pos.y + 4.8, seat.pos.z);
        aim.set(
          cam.position.x + fwdX * 16,
          cam.position.y - 0.5,
          cam.position.z + fwdZ * 16,
        );
      } else {
        // Drop tower and big wheel. Both publish a seat you are actually
        // sitting in, so sit in it — offsetting outward from the seat is what
        // made the wheel feel like dangling off the rim rather than riding in
        // a cabin.
        const outX = Math.sin(seat.yaw);
        const outZ = Math.cos(seat.yaw);
        cam.position.lerp(seat.pos, 0.3);
        aim.set(
          cam.position.x + outX * 20,
          cam.position.y - 2.5,
          cam.position.z + outZ * 20,
        );
      }

      // On boarding, park the walking heading and hand the mouse over as a
      // free-look offset on top of whatever framing the ride just set. Being
      // strapped into a seat should not also strap down your neck.
      if (boarded.current !== riding) {
        boarded.current = riding;
        stowed.current = { yaw: yaw.current, pitch: pitch.current };
        yaw.current = 0;
        pitch.current = 0;
      }
      freeLook(cam.position, aim, yaw.current, pitch.current);

      cam.up.set(0, 1, 0);
      cam.lookAt(aim);
      cam.fov += (64 - cam.fov) * Math.min(1, dt * 3);
      cam.updateProjectionMatrix();

      walker.x = seat.pos.x;
      walker.z = seat.pos.z;
      walker.yaw = seat.yaw;
      return;
    }

    // stepped off — give the walker back the heading they had before boarding
    if (boarded.current) {
      boarded.current = null;
      yaw.current = stowed.current.yaw;
      pitch.current = stowed.current.pitch;
    }

    /* ── parked at a marker, or walking ──────────────────────────────────── */

    let inputFwd = 0;
    let inputSide = 0;
    if (keys.current.has("w")) inputFwd += 1;
    if (keys.current.has("s")) inputFwd -= 1;
    if (keys.current.has("d")) inputSide += 1;
    if (keys.current.has("a")) inputSide -= 1;

    const hasInput = inputFwd !== 0 || inputSide !== 0;

    // Pressing WASD movement keys while locked at a marker instantly resumes free walking
    if (hasInput) {
      if (selected) explore.select(null);
      lock.current = 0;
    }

    const isParked = Boolean(marker) && !hasInput;
    const target = isParked ? 1 : 0;
    if (!hasInput) {
      lock.current += (target - lock.current) * Math.min(1, step * 2.6);
    }

    if (lock.current < 0.995) {
      const isShift = keys.current.has("shift");
      const speed = isShift ? RUN : WALK;

      let targetX = 0;
      let targetZ = 0;

      if (inputFwd !== 0 || inputSide !== 0) {
        const inputLen = Math.hypot(inputFwd, inputSide);
        const nFwd = inputFwd / inputLen;
        const nSide = inputSide / inputLen;

        const sinY = Math.sin(yaw.current);
        const cosY = Math.cos(yaw.current);

        const moveDirX = -sinY * nFwd + cosY * nSide;
        const moveDirZ = -cosY * nFwd - sinY * nSide;

        targetX = moveDirX * speed;
        targetZ = moveDirZ * speed;
      }

      // Smooth, responsive acceleration and deceleration
      vel.current.x += (targetX - vel.current.x) * Math.min(1, step * 16);
      vel.current.z += (targetZ - vel.current.z) * Math.min(1, step * 16);

      pos.current.x += vel.current.x * step;
      pos.current.z += vel.current.z * step;

      const r = Math.hypot(pos.current.x, pos.current.z);
      if (r > BOUND) {
        const k = BOUND / r;
        pos.current.x *= k;
        pos.current.z *= k;
        vel.current.multiplyScalar(0.2);
      }

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
