"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import { BIOMES } from "@/lib/world/layout";
import { makeRng } from "@/lib/world/noise";
import { overviewBlend } from "@/lib/scroll/timeline";
import { useScroll } from "@/lib/scroll/ScrollProvider";

const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uBox;
  uniform vec3  uVel;
  uniform float uSize;
  uniform float uIntensity;
  uniform float uSpread;
  attribute vec3 aSeed;
  varying float vFade;

  void main() {
    // Every particle carries its own speed. A field that all moves at one
    // velocity translates rigidly and reads as a frozen lattice; varying the
    // rate per particle is what makes it actually churn.
    float rate = 1.0 - uSpread + aSeed.x * uSpread * 2.0;
    vec3 p = position + uVel * uTime * rate;

    // wrap inside the zone box on every axis
    p = mod(p + uBox * 0.5, uBox) - uBox * 0.5;

    // independent sway phase per particle
    float ph = aSeed.y * 43.0;
    p.x += sin(uTime * (0.7 + aSeed.z * 1.4) + ph) * (1.0 + aSeed.z * 2.2);
    p.z += cos(uTime * (0.6 + aSeed.x * 1.2) + ph * 0.7) * (0.8 + aSeed.x * 1.8);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = max(-mv.z, 1.0);
    gl_PointSize = clamp(uSize * (170.0 / dist), 1.0, 14.0);

    // cull the tail of the particle set when intensity drops, and fade the
    // survivors out with distance so nothing pops
    vFade = step(aSeed.y, uIntensity) * (1.0 - smoothstep(180.0, 460.0, dist));
    if (vFade <= 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    if (vFade <= 0.01) discard;
    gl_FragColor = vec4(uColor, uOpacity * vFade);
  }
`;

interface FieldProps {
  center: [number, number, number];
  box: [number, number, number];
  count: number;
  color: number;
  velocity: [number, number, number];
  size?: number;
  opacity?: number;
  additive?: boolean;
  intensity: number;
  seed: number;
  /** 0 = every particle moves at the same rate, 1 = wildly varied. */
  spread?: number;
}

/** One volumetric weather cell: a wrapping box of square voxel particles. */
function Field({
  center,
  box,
  count,
  color,
  velocity,
  size = 2.2,
  opacity = 0.75,
  additive = false,
  intensity,
  seed,
  spread = 0.45,
}: FieldProps) {
  const geo = useMemo(() => {
    const rng = makeRng(seed);
    const pos = new Float32Array(count * 3);
    const sd = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rng() - 0.5) * box[0];
      pos[i * 3 + 1] = (rng() - 0.5) * box[1];
      pos[i * 3 + 2] = (rng() - 0.5) * box[2];
      sd[i * 3] = rng();
      sd[i * 3 + 1] = rng();
      sd[i * 3 + 2] = rng();
    }
    return { pos, sd };
  }, [count, box, seed]);

  const mat = useRef<ShaderMaterial>(null!);
  const pts = useRef<Points>(null!);
  const { eased } = useScroll();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBox: { value: new Vector3(box[0], box[1], box[2]) },
      uVel: { value: new Vector3(velocity[0], velocity[1], velocity[2]) },
      uSize: { value: size },
      uColor: { value: new Color(color) },
      uOpacity: { value: opacity },
      uIntensity: { value: 0 },
      uSpread: { value: spread },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((state) => {
    // read straight off the live material so nothing depends on R3F keeping
    // the uniforms object identity across re-renders
    const u = mat.current?.uniforms ?? uniforms;
    u.uTime.value = state.clock.elapsedTime;

    // weather only builds once the rider is inside the world, so the high
    // orbit on the landing page stays clean
    const gate = 0.02 + overviewBlend(eased.current ?? 0) * 0.98;
    u.uIntensity.value += (intensity * gate - u.uIntensity.value) * 0.03;
    u.uOpacity.value = opacity * (0.25 + gate * 0.75);
  });

  return (
    <points ref={pts} position={center} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[geo.pos, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[geo.sd, 3]} />
      </bufferGeometry>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthWrite={false}
        blending={additive ? AdditiveBlending : NormalBlending}
      />
    </points>
  );
}

/**
 * Every weather system on the island, each locked to the biome that earns it.
 * `focus` is the id of the station the ride is currently nearest — it swells
 * that region's weather so the pass-through reads dramatically.
 */
export function Weather({ focus }: { focus: string }) {
  const boost = (id: string, base: number) => (focus === id ? 1 : base);

  const jungle = BIOMES.jungle.center;
  const conifer = BIOMES.conifer.center;
  const desert = BIOMES.desert.center;
  const volcano = BIOMES.volcano.center;
  const summit = BIOMES.summit.center;
  const highlands = BIOMES.highlands.center;
  const grove = BIOMES.grove.center;

  return (
    <group>
      {/* jungle: permanent rain — small, fast, heavily varied */}
      <Field
        center={[jungle[0], 32, jungle[1]]}
        box={[86, 58, 80]}
        count={4200}
        color={0x9fd6ff}
        velocity={[2, -52, 0]}
        size={0.95}
        opacity={0.55}
        spread={0.32}
        intensity={boost("projects", 0.72)}
        seed={11}
      />

      {/* conifer foothills: snowfall under the cloud deck */}
      <Field
        center={[conifer[0], 38, conifer[1]]}
        box={[86, 44, 50]}
        count={3000}
        color={0xffffff}
        velocity={[3.5, -7.5, 1.5]}
        size={1.8}
        opacity={0.9}
        spread={0.75}
        intensity={0.85}
        seed={22}
      />

      {/* behind face of the alpine massif: white windstorm sheets */}
      <Field
        center={[summit[0], 56, summit[1] - 20]}
        box={[140, 58, 44]}
        count={4000}
        color={0xe8f2ff}
        velocity={[52, -4, 8]}
        size={2.0}
        opacity={0.5}
        spread={0.6}
        intensity={boost("contact", 0.9)}
        seed={33}
      />

      {/* desert: dust and sand driven along the flats */}
      <Field
        center={[desert[0], 15, desert[1]]}
        box={[86, 32, 80]}
        count={3200}
        color={0xd9b169}
        velocity={[44, 2, 11]}
        size={2.1}
        opacity={0.4}
        spread={0.65}
        intensity={boost("skills", 0.8)}
        seed={44}
      />

      {/* volcano: ash plume rising and settling */}
      <Field
        center={[volcano[0], 70, volcano[1]]}
        box={[64, 88, 62]}
        count={2600}
        color={0x5a5a62}
        velocity={[12, 9, 5]}
        size={2.4}
        opacity={0.42}
        spread={0.8}
        intensity={boost("awards", 0.85)}
        seed={55}
      />

      {/* volcano: glowing embers */}
      <Field
        center={[volcano[0], 58, volcano[1]]}
        box={[46, 68, 46]}
        count={900}
        color={0xff8a3c}
        velocity={[5, 16, 3]}
        size={1.2}
        opacity={0.95}
        spread={0.85}
        additive
        intensity={boost("awards", 0.7)}
        seed={66}
      />

      {/* highlands: thin drizzle */}
      <Field
        center={[highlands[0], 44, highlands[1]]}
        box={[72, 42, 64]}
        count={1400}
        color={0xc7d8e8}
        velocity={[6, -28, 2]}
        size={0.9}
        opacity={0.35}
        spread={0.35}
        intensity={0.55}
        seed={77}
      />

      {/* grove: drifting blossom */}
      <Field
        center={[grove[0], 24, grove[1]]}
        box={[64, 28, 64]}
        count={900}
        color={0xffc9e0}
        velocity={[6, -2.2, 4]}
        size={1.6}
        opacity={0.55}
        spread={0.9}
        intensity={0.6}
        seed={88}
      />

      {/* swamp haze */}
      <Field
        center={[BIOMES.swamp.center[0], 11, BIOMES.swamp.center[1]]}
        box={[56, 14, 52]}
        count={800}
        color={0x9db09a}
        velocity={[3, 0.8, 1.5]}
        size={9}
        opacity={0.1}
        spread={0.9}
        intensity={0.75}
        seed={99}
      />
    </group>
  );
}
