"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { overviewBlend } from "@/lib/scroll/timeline";
import { useScroll } from "@/lib/scroll/ScrollProvider";
import { buildShotList, type CameraRig } from "@/lib/content";
import type { CoasterData } from "@/lib/park/coaster";
import type { RideState } from "@/lib/park/ride";
import { useQuality } from "./Quality";

/**
 * The camera director, and the frame's authority on where the ride is — it
 * writes `ride` before anything else reads it, so it must stay first in
 * `Scene`'s JSX.
 *
 * Four rigs, chosen per station in `park.json`:
 *
 *   orbit    the landing plate: a slow high arc over the whole park
 *   onboard  front seat. The camera takes the car's own orientation, so it
 *            banks with the track — most of the thrill lives here
 *   chase    pulled back and above, for the fireworks
 *   crane    a fixed camera planted beside the rails that the train sweeps past
 *
 * Rig changes crossfade rather than cut, so the ride never teleports.
 */

/**
 * Front-row eye point, measured from the centre of the spine: up past the deck
 * and the seat, and forward of the seat back so the lap bar and nose cowl frame
 * the bottom of the shot instead of filling it.
 */
const EYE_UP = 2.22;
const EYE_FWD = 0.72;
/** How much of the track's banking the camera is allowed to inherit. */
const ROLL_SHARE = 0.72;
/** Scroll distance a cut takes to crossfade. */
const CUT = 0.014;

const carPos = new Vector3();
const carQuat = new Quaternion();
const fwd = new Vector3();
const up = new Vector3();
const right = new Vector3();
const level = new Quaternion();
const basis = new Matrix4();
const WORLD_UP = new Vector3(0, 1, 0);

const posA = new Vector3();
const tgtA = new Vector3();
const posB = new Vector3();
const tgtB = new Vector3();
const camPos = new Vector3();
const camTgt = new Vector3();
const ovPos = new Vector3();
const ovTgt = new Vector3();
const lateral = new Vector3();
const scratch = new Vector3();

export function RideCamera({
  coaster,
  progressToTau,
  ride,
}: {
  coaster: CoasterData;
  progressToTau: (p: number) => number;
  ride: MutableRefObject<RideState>;
}) {
  const { camera, size } = useThree();
  const { eased } = useScroll();
  const q = useQuality();

  const pointer = useRef({ x: 0, y: 0 });
  const shake = useRef(0);

  /**
   * The cut list, flattened across every station. Walking one global list
   * rather than per-station sequences means a cut at a station boundary
   * crossfades exactly like a cut inside one.
   */
  const shots = useMemo(() => buildShotList(), []);

  /** Fixed crane positions, one per station, solved off the rails once. */
  const cranes = useMemo(() => {
    const out: Record<string, { pos: Vector3; look: Vector3 }> = {};
    const p = new Vector3();
    const qq = new Quaternion();
    const r = new Vector3();
    const u = new Vector3();
    const f = new Vector3();
    for (const [id, anchor] of Object.entries(coaster.stationU)) {
      coaster.sample(anchor, p, qq);
      coaster.basis(anchor, r, u, f);
      out[id] = {
        pos: p.clone().addScaledVector(r, 26).addScaledVector(WORLD_UP, 11).addScaledVector(f, 16),
        look: p.clone(),
      };
    }
    return out;
  }, [coaster]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  /** Writes a rig's desired eye + aim into the given vectors. */
  function pose(rig: CameraRig, stationId: string, t: number, outPos: Vector3, outTgt: Vector3) {
    if (rig === "crane") {
      const c = cranes[stationId];
      if (c) {
        outPos.copy(c.pos);
        outTgt.copy(carPos);
        return;
      }
    }

    if (rig === "chase") {
      // drifts out and back so a long chase never sits still
      const swing = Math.sin(t * 0.23) * 9;
      outPos
        .copy(carPos)
        .addScaledVector(WORLD_UP, 9 + Math.sin(t * 0.17) * 2.5)
        .addScaledVector(fwd, -21)
        .addScaledVector(right, swing + pointer.current.x * 5);
      outTgt.copy(carPos).addScaledVector(fwd, 12).addScaledVector(WORLD_UP, 2);
      return;
    }

    if (rig === "flank") {
      // Alongside, on the left. The hoardings all stand on the rider's right,
      // so from here the train is in profile with a board behind it.
      outPos
        .copy(carPos)
        .addScaledVector(right, -26 - Math.sin(t * 0.19) * 6)
        .addScaledVector(WORLD_UP, 5.5 + Math.sin(t * 0.26) * 2)
        .addScaledVector(fwd, 4);
      outTgt.copy(carPos).addScaledVector(fwd, 3).addScaledVector(WORLD_UP, 1.5);
      return;
    }

    if (rig === "drone") {
      // High and ahead, looking back down the rails as the train comes on.
      outPos
        .copy(carPos)
        .addScaledVector(fwd, 54)
        .addScaledVector(WORLD_UP, 34 + Math.sin(t * 0.15) * 6)
        .addScaledVector(right, Math.sin(t * 0.11) * 22);
      outTgt.copy(carPos).addScaledVector(WORLD_UP, 3);
      return;
    }

    // onboard, and the fallback for anything unrecognised
    outPos.copy(carPos).addScaledVector(up, EYE_UP).addScaledVector(fwd, EYE_FWD);
    outTgt.copy(outPos).addScaledVector(fwd, 26);
  }

  useFrame((state, dt) => {
    const cam = camera as PerspectiveCamera;
    const t = state.clock.elapsedTime;
    const p = eased.current;
    const blend = overviewBlend(p);

    /* ── where is the car ──────────────────────────────────────────────── */

    const tau = MathUtils.clamp(progressToTau(p), 0, 1);
    const u = MathUtils.clamp(coaster.uAtTau(tau), 0, 1);
    const speed = coaster.sample(u, carPos, carQuat);

    fwd.set(0, 0, -1).applyQuaternion(carQuat);
    up.set(0, 1, 0).applyQuaternion(carQuat);
    right.set(1, 0, 0).applyQuaternion(carQuat);

    const r = ride.current;
    r.progress = p;
    r.tau = tau;
    r.u = u;
    r.speed = speed;
    r.rush = MathUtils.clamp(speed / coaster.maxSpeed, 0, 1);
    r.blend = blend;
    r.pos.copy(carPos);
    r.quat.copy(carQuat);

    /* ── which shot ────────────────────────────────────────────────────── */

    // Position-keyed rather than time-keyed, so scrubbing back and forth
    // through the page always lands on the same frame.
    let i = 0;
    while (i < shots.length - 1 && p >= shots[i].to) i++;
    const shot = shots[i];
    const prev = shots[Math.max(0, i - 1)];

    const raw = MathUtils.clamp((p - shot.from) / CUT, 0, 1);
    const mix = raw * raw * (3 - 2 * raw);
    const onboard = shot.rig === "onboard" && mix > 0.5;
    r.rig = shot.rig;

    pose(prev.rig, prev.stationId, t, posA, tgtA);
    pose(shot.rig, shot.stationId, t, posB, tgtB);
    camPos.lerpVectors(posA, posB, mix);
    camTgt.lerpVectors(tgtA, tgtB, mix);

    /* ── the landing plate ─────────────────────────────────────────────── */

    const orbit = t * 0.021 + 0.75;
    const radius = 430;
    ovPos.set(
      Math.sin(orbit) * radius + pointer.current.x * 34,
      186 - pointer.current.y * 22,
      Math.cos(orbit) * radius,
    );
    // on wide screens, push the park clear of the copy on the left
    const aspect = size.width / Math.max(1, size.height);
    lateral.set(-ovPos.z, 0, ovPos.x).normalize();
    ovTgt.set(pointer.current.x * 12, 34, 0).addScaledVector(lateral, aspect > 1.25 ? 78 : 0);

    camPos.lerp(ovPos, 1 - blend);
    camTgt.lerp(ovTgt, 1 - blend);

    /* ── shudder ───────────────────────────────────────────────────────── */

    const rush = q.calm ? 0 : r.rush;
    shake.current += (rush - shake.current) * Math.min(1, dt * 3);
    const amp = shake.current * shake.current * blend * 0.13;
    camPos.x += Math.sin(t * 27.3) * amp;
    camPos.y += Math.sin(t * 34.1) * amp * 1.3;

    // never let the eye drop through the tarmac
    if (camPos.y < 1.4) camPos.y = 1.4;

    cam.position.copy(camPos);

    /* ── aim ───────────────────────────────────────────────────────────── */

    if (onboard && blend > 0.5) {
      // Take the car's own orientation so the horizon rolls through the turns,
      // then give back some of the bank — a full 60° roll is thrilling for two
      // seconds and nauseating for twenty.
      scratch.copy(fwd);
      right.crossVectors(scratch, WORLD_UP).normalize();
      up.crossVectors(right, scratch).normalize();
      basis.makeBasis(right, up, scratch.clone().negate());
      level.setFromRotationMatrix(basis);
      cam.quaternion.slerpQuaternions(level, carQuat, ROLL_SHARE * blend);
      cam.rotateY(-pointer.current.x * 0.24);
      // a few degrees down on top of the track's own pitch, so the park stays
      // in the bottom of frame instead of sky filling it on every pull-out
      cam.rotateX(-0.1 - pointer.current.y * 0.14);
    } else {
      cam.up.set(0, 1, 0);
      cam.lookAt(camTgt);
    }

    /* ── lens ──────────────────────────────────────────────────────────── */

    // wider on the outside rigs so the park has room in frame
    const rideFov = onboard ? 56 + shake.current * 12 : shot.rig === "drone" ? 52 : 46;
    const targetFov = MathUtils.lerp(34, rideFov, blend);
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 2.6);
    cam.updateProjectionMatrix();
  });

  return null;
}
