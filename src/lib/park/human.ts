import {
  BoxGeometry,
  BufferAttribute,
  CylinderGeometry,
  LatheGeometry,
  SphereGeometry,
  Vector2,
  type BufferGeometry,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A person.
 *
 * Two things make this read as a body rather than a stack of primitives: the
 * torso is a lathe with an actual chest, waist and shoulder line, and the limbs
 * are jointed — upper arm into forearm, thigh into shin — so they can bend.
 *
 * Every vertex carries a PART id, which is what lets a single instanced draw
 * animate four hundred separate walk cycles on the GPU. Skinning would be the
 * textbook answer and is completely unaffordable at this count; swinging four
 * rigid limb groups about their joints is indistinguishable at walking pace.
 */

const HEIGHT = 1.75;

/** Vertex part ids, matched by the shader patch below. */
export const PART = {
  STATIC: 0,
  LEG_L: 1,
  LEG_R: 2,
  ARM_L: 3,
  ARM_R: 4,
} as const;

/** Joint pivots the shader rotates about. Keep in step with the geometry. */
const HIP_Y = 0.94;
const HIP_X = 0.088;
const SHOULDER_Y = 1.4;
const SHOULDER_X = 0.185;

let bodyGeom: BufferGeometry | null = null;
let skinGeom: BufferGeometry | null = null;

/** Tags every vertex of a part so the shader knows which joint owns it. */
function tag(g: BufferGeometry, part: number) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n);
  a.fill(part);
  g.setAttribute("aPart", new BufferAttribute(a, 1));
  return g;
}

/**
 * A tapered segment hinged at its TOP end, so limbs can be chained.
 *
 * `bone` returns where the segment ends as well as its geometry — hand-guessing
 * the next joint's position is how you end up with a forearm that starts an
 * inch away from its own elbow.
 */
function bone(
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  yTop: number,
  tilt = 0,
): { geometry: BufferGeometry; x: number; y: number } {
  const g = new CylinderGeometry(rTop, rBot, len, 8, 1);
  g.translate(0, -len / 2, 0);
  if (tilt) g.rotateZ(tilt);
  g.translate(x, yTop, 0);
  // rotating (0, -len) about the top by `tilt`, then offsetting to the joint
  return {
    geometry: g,
    x: x + len * Math.sin(tilt),
    y: yTop - len * Math.cos(tilt),
  };
}

/** Where each hand ends up, so `humanSkin` can put one exactly there. */
export function wristAt(side: -1 | 1) {
  const sx = side * SHOULDER_X;
  const upperTilt = side * -0.12;
  const foreTilt = side * -0.34;
  const ex = sx + 0.3 * Math.sin(upperTilt);
  const ey = SHOULDER_Y - 0.3 * Math.cos(upperTilt);
  return {
    x: ex + 0.29 * Math.sin(foreTilt),
    y: ey - 0.29 * Math.cos(foreTilt),
  };
}

/**
 * Torso as a lathe: a real profile with a chest, a waist and a shoulder line,
 * instead of a cylinder pretending to be all three.
 */
function torso() {
  const profile = [
    new Vector2(0.001, 0.0),
    new Vector2(0.13, 0.01),
    new Vector2(0.155, 0.06),
    new Vector2(0.15, 0.16), // waist
    new Vector2(0.168, 0.26),
    new Vector2(0.19, 0.36), // chest
    new Vector2(0.196, 0.43),
    new Vector2(0.17, 0.48), // shoulder line
    new Vector2(0.09, 0.5),
    new Vector2(0.001, 0.505),
  ];
  const g = new LatheGeometry(profile, 12);
  // slightly flattened front-to-back; nobody is a cylinder
  g.scale(1, 1, 0.72);
  g.translate(0, 0.96, 0);
  return g;
}

/** Shirt, trousers, shoes — everything an instance tint reads as clothes. */
export function humanBody(): BufferGeometry {
  if (bodyGeom) return bodyGeom;
  const parts: BufferGeometry[] = [];

  parts.push(tag(torso(), PART.STATIC));

  // pelvis, bridging torso to legs
  const pelvis = new SphereGeometry(0.13, 10, 7);
  pelvis.scale(1.05, 0.7, 0.8);
  pelvis.translate(0, 0.97, 0);
  parts.push(tag(pelvis, PART.STATIC));

  for (const side of [-1, 1]) {
    const leg = side < 0 ? PART.LEG_L : PART.LEG_R;
    const arm = side < 0 ? PART.ARM_L : PART.ARM_R;
    const hx = side * HIP_X;
    const sx = side * SHOULDER_X;

    // thigh into shin into shoe — each joint taken from where the last ended
    const thigh = bone(0.082, 0.062, 0.46, hx, HIP_Y, side * 0.03);
    parts.push(tag(thigh.geometry, leg));
    const shin = bone(0.062, 0.046, 0.42, thigh.x, thigh.y, side * -0.02);
    parts.push(tag(shin.geometry, leg));

    const ankle = new SphereGeometry(0.05, 7, 6);
    ankle.translate(shin.x, shin.y, 0);
    parts.push(tag(ankle, leg));

    const shoe = new BoxGeometry(0.105, 0.07, 0.25);
    shoe.translate(shin.x, shin.y - 0.03, 0.045);
    parts.push(tag(shoe, leg));

    // shoulder cap into upper arm into forearm, same chain
    const cap = new SphereGeometry(0.062, 8, 6);
    cap.translate(sx, SHOULDER_Y, 0);
    parts.push(tag(cap, arm));

    const upper = bone(0.056, 0.045, 0.3, sx, SHOULDER_Y, side * -0.12);
    parts.push(tag(upper.geometry, arm));

    const elbow = new SphereGeometry(0.047, 7, 6);
    elbow.translate(upper.x, upper.y, 0);
    parts.push(tag(elbow, arm));

    // a little bend at the elbow, so arms are not two straight sticks
    const fore = bone(0.045, 0.036, 0.29, upper.x, upper.y, side * -0.34);
    parts.push(tag(fore.geometry, arm));
  }

  bodyGeom = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return bodyGeom;
}

/** Head, neck and hands. */
export function humanSkin(): BufferGeometry {
  if (skinGeom) return skinGeom;
  const parts: BufferGeometry[] = [];

  // skull, with a jaw rather than a ball
  const head = new SphereGeometry(0.105, 12, 10);
  head.scale(1, 1.16, 0.92);
  head.translate(0, 1.58, 0);
  parts.push(tag(head, PART.STATIC));

  const jaw = new SphereGeometry(0.078, 10, 8);
  jaw.scale(1, 0.82, 1.02);
  jaw.translate(0, 1.52, 0.016);
  parts.push(tag(jaw, PART.STATIC));

  const neck = new CylinderGeometry(0.05, 0.062, 0.11, 8);
  neck.translate(0, 1.45, 0);
  parts.push(tag(neck, PART.STATIC));

  // Hands go exactly where the forearms end — the same solve the body uses,
  // rather than a second guess at the same number.
  for (const side of [-1, 1] as const) {
    const arm = side < 0 ? PART.ARM_L : PART.ARM_R;
    const wrist = wristAt(side);
    const hand = new SphereGeometry(0.052, 8, 6);
    hand.scale(0.82, 1.2, 0.72);
    hand.rotateZ(side * -0.34);
    hand.translate(wrist.x, wrist.y - 0.035, 0);
    parts.push(tag(hand, arm));
  }

  skinGeom = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return skinGeom;
}

/* ── the walk cycle ───────────────────────────────────────────────────────── */

const DECLARE = /* glsl */ `
  attribute float aPart;
  attribute float aPhase;
  attribute float aGait;
  uniform float uTime;

  const float HIP_Y = ${HIP_Y};
  const float HIP_X = ${HIP_X};
  const float SHOULDER_Y = ${SHOULDER_Y};
  const float SHOULDER_X = ${SHOULDER_X};

  // rotate p about a pivot, around the X axis
  vec3 swingAbout(vec3 p, vec3 pivot, float a) {
    vec3 v = p - pivot;
    float c = cos(a);
    float s = sin(a);
    return pivot + vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
  }

  // returns the joint pivot and swing angle for this vertex's part
  void gait(float part, float phase, float gait, out vec3 pivot, out float angle) {
    // a stride, plus a much smaller idle sway so standers are not statues
    float stride = sin(uTime * 5.4 + phase) * 0.62 * gait;
    float idle = sin(uTime * 1.1 + phase) * 0.03 * (1.0 - gait);
    float a = stride + idle;

    if (part < 0.5) { pivot = vec3(0.0); angle = 0.0; return; }
    if (part < 1.5) { pivot = vec3(-HIP_X, HIP_Y, 0.0); angle = a; return; }
    if (part < 2.5) { pivot = vec3( HIP_X, HIP_Y, 0.0); angle = -a; return; }
    // arms counter-swing against the legs
    if (part < 3.5) { pivot = vec3(-SHOULDER_X, SHOULDER_Y, 0.0); angle = -a * 0.72; return; }
    pivot = vec3(SHOULDER_X, SHOULDER_Y, 0.0);
    angle = a * 0.72;
  }
`;

const BODY = /* glsl */ `
  vec3 jointPivot;
  float jointAngle;
  gait(aPart, aPhase, aGait, jointPivot, jointAngle);
  if (aPart > 0.5) {
    transformed = swingAbout(transformed, jointPivot, jointAngle);
  }
`;

const NORMAL = /* glsl */ `
  {
    vec3 np;
    float na;
    gait(aPart, aPhase, aGait, np, na);
    if (aPart > 0.5) {
      objectNormal = swingAbout(objectNormal, vec3(0.0), na);
    }
  }
`;

/**
 * Patches a material so instances animate their own walk from `aPhase` and
 * `aGait`. Pass the same `clock` to every material that must stay in step —
 * a hand drifting out of phase with its own arm is very noticeable.
 */
export function applyWalkCycle(material: Material, clock = { value: 0 }) {
  const uTime = clock;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${DECLARE}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${NORMAL}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${BODY}`);
  };
  // three keys its program cache on this, so two materials sharing a patch
  // must share a key — and one that differs from the unpatched default
  material.customProgramCacheKey = () => "park-walk-cycle";

  return uTime;
}

export const HUMAN_HEIGHT = HEIGHT;
