"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  type Points,
} from "three";
import { stations } from "@/lib/content";
import { ZONES } from "@/lib/park/layout";
import { Rng } from "@/lib/park/rand";
import { useParkCtx } from "./ParkContext";
import { useQuality } from "./Quality";

/**
 * Fireworks over the prize row.
 *
 * Every star is a point with a launch time, a burst velocity and a colour baked
 * into an attribute, and the whole show runs on the GPU from one uniform — the
 * clock. No per-frame work on the CPU at all, which is what lets it be four
 * thousand stars instead of four hundred.
 *
 * The shells fire hardest while the ride is actually in Pyro Field, and idle to
 * a slow background display the rest of the lap.
 */

const SHELLS = 22;
/** Stars per shell at full quality; thinned rather than dropped on weak GPUs. */
const PER_SHELL = 190;
/** Seconds between one shell and the next getting its turn. */
const STAGGER = 1.35;
const CYCLE = SHELLS * STAGGER;

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uGain;
  attribute vec3 aBurst;
  attribute vec3 aColor;
  attribute float aBirth;
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float age = mod(uTime - aBirth, ${CYCLE.toFixed(4)});

    // climb, then burst
    const float RISE = 1.55;
    const float LIFE = 3.1;
    vec3 p = position;

    if (age < RISE) {
      float k = age / RISE;
      p.y += (1.0 - pow(1.0 - k, 2.0)) * 96.0;
      vAlpha = smoothstep(0.0, 0.12, age) * 0.55;
      // the shell itself is a single hot point, so hide the spread
      p += aBurst * 0.012;
    } else if (age < RISE + LIFE) {
      float k = (age - RISE) / LIFE;
      p.y += 96.0;
      // ballistic, with drag
      float spread = (1.0 - exp(-k * 3.4)) / 3.4 * 3.4;
      p += aBurst * spread * 15.0;
      p.y -= k * k * 34.0;
      vAlpha = pow(1.0 - k, 2.2);
    } else {
      vAlpha = 0.0;
    }

    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uGain * (420.0 / max(-mv.z, 1.0));
    vAlpha *= uGain;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.001) discard;
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float core = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(vColor * (0.35 + core * 2.4), core * vAlpha);
  }
`;

export function Fireworks() {
  const q = useQuality();
  const { ride } = useParkCtx();
  const points = useRef<Points>(null);
  const station = useMemo(() => stations.find((s) => s.id === "awards"), []);

  // The finale is the one thing that should never be switched off — a park
  // that stops firing because the frame rate dipped has lost its ending. Thin
  // the shells instead, and only slightly: a few thousand additive points cost
  // almost nothing next to a draw call.
  const perShell = Math.max(
    50,
    Math.round(PER_SHELL * (q.tier === "high" ? 1 : q.tier === "medium" ? 0.85 : 0.65)),
  );
  const COUNT = SHELLS * perShell;

  const { geometry, material } = useMemo(() => {
    const rng = new Rng(31415);
    const zone = ZONES.pyro;
    const pos = new Float32Array(COUNT * 3);
    const burst = new Float32Array(COUNT * 3);
    const color = new Float32Array(COUNT * 3);
    const birth = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);

    const palette = [
      new Color(station?.accent ?? "#ff5f45"),
      new Color("#ffd166"),
      new Color("#8fd8ff"),
      new Color("#ff8bd0"),
      new Color("#c9ffa8"),
    ];

    for (let s = 0; s < SHELLS; s++) {
      const ox = zone.x + rng.spread(zone.r * 0.85);
      const oz = zone.z + rng.spread(zone.r * 0.85);
      const c = palette[rng.int(palette.length)];
      const t0 = s * STAGGER;
      // some shells are a sphere, some a flat ring — the mix is what stops it
      // looking like the same firework twenty-two times
      const ring = rng.chance(0.3);

      for (let k = 0; k < perShell; k++) {
        const i = s * perShell + k;
        pos[i * 3] = ox;
        pos[i * 3 + 1] = 2;
        pos[i * 3 + 2] = oz;

        const theta = rng.range(0, Math.PI * 2);
        const phi = ring ? Math.PI / 2 + rng.spread(0.16) : Math.acos(rng.range(-1, 1));
        const speed = rng.range(0.55, 1);
        burst[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
        burst[i * 3 + 1] = Math.cos(phi) * speed;
        burst[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;

        // a few stars in every shell burn a different colour
        const cc = rng.chance(0.12) ? palette[rng.int(palette.length)] : c;
        color[i * 3] = cc.r;
        color[i * 3 + 1] = cc.g;
        color[i * 3 + 2] = cc.b;

        birth[i] = t0;
        size[i] = rng.range(1.4, 3.6);
      }
    }

    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aBurst", new BufferAttribute(burst, 3));
    g.setAttribute("aColor", new BufferAttribute(color, 3));
    g.setAttribute("aBirth", new BufferAttribute(birth, 1));
    g.setAttribute("aSize", new BufferAttribute(size, 1));
    g.computeBoundingSphere();

    const m = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uGain: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });

    return { geometry: g, material: m };
  }, [station, perShell, COUNT]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;

    // full show while the ride is over the prize row, a low simmer otherwise
    const p = ride.current.progress;
    const inZone =
      station && p >= station.scroll.enter - 0.05 && p <= station.scroll.exit + 0.05;
    const target = q.calm ? 0.25 : inZone ? 1 : 0.22;
    const u = material.uniforms.uGain;
    u.value += (target - u.value) * 0.03;
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />;
}
