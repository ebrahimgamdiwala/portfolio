"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { WATER, type TerrainData } from "@/lib/world/terrain";

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();

/**
 * Each spout is ONE continuous sheet — a single tall box whose shader scrolls
 * vertical streaks down its face. Stacking discrete cubes made the falls read
 * as a dotted line; a swept sheet reads as moving water.
 */
const VERT = /* glsl */ `
  varying vec2  vLocal;   // x across the sheet, y from base (0) to lip (1)
  varying float vLen;     // fall height in world units
  varying float vSeed;

  void main() {
    vLocal = vec2(uv.x, position.y + 0.5);
    vLen = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
    vSeed = fract(instanceMatrix[3][0] * 0.137 + instanceMatrix[3][2] * 0.291);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uCool;
  uniform vec3  uFoam;
  varying vec2  vLocal;
  varying float vLen;
  varying float vSeed;

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  void main() {
    // distance below the lip, in world units, so streak scale is consistent
    float drop = (1.0 - vLocal.y) * vLen;

    // water accelerates as it falls: streaks stretch further down the sheet
    float speed = 26.0 + vSeed * 10.0;
    float phase = drop * 0.16 - uTime * (speed / 26.0) * 1.15;

    // a handful of independent lanes across the sheet
    float lane = floor(vLocal.x * 5.0);
    float n = fract(phase + hash(lane + vSeed * 7.0) * 3.0);
    float streak = smoothstep(0.0, 0.45, n) * smoothstep(1.0, 0.55, n);

    // foam at the lip, thinning and dissolving into the void below
    float lip = smoothstep(0.82, 1.0, vLocal.y);
    float dissolve = smoothstep(0.0, 0.42, vLocal.y);
    float mist = smoothstep(0.0, 0.2, vLocal.y) * 0.35;

    vec3 col = mix(uCool, uFoam, clamp(streak * 0.7 + lip, 0.0, 1.0));
    float alpha = (0.30 + streak * 0.42 + lip * 0.35) * dissolve;
    alpha = mix(alpha, alpha * 0.55, mist);

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function Waterfalls({ terrain }: { terrain: TerrainData }) {
  const spouts = useMemo(() => {
    const out: { x: number; y: number; z: number; len: number }[] = [];
    const seen = new Set<string>();
    for (let iz = 1; iz < terrain.d - 1; iz++) {
      for (let ix = 1; ix < terrain.w - 1; ix++) {
        const i = terrain.idx(ix, iz);
        if (!terrain.filled[i]) continue;
        const k = terrain.waterKind[i];
        if (k !== WATER.OCEAN && k !== WATER.RIVER) continue;
        const edge =
          !terrain.filled[terrain.idx(ix - 1, iz)] ||
          !terrain.filled[terrain.idx(ix + 1, iz)] ||
          !terrain.filled[terrain.idx(ix, iz - 1)] ||
          !terrain.filled[terrain.idx(ix, iz + 1)];
        if (!edge) continue;
        const x = ix + terrain.minX;
        const z = iz + terrain.minZ;
        // one sheet per stretch of rim rather than one per cell
        const key = `${Math.round(x / 6)}:${Math.round(z / 6)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          x,
          y: terrain.waterY[i],
          z,
          len: 38 + (Math.abs(x * 7 + z * 13) % 52),
        });
      }
    }
    return out;
  }, [terrain]);

  const ref = useRef<InstancedMesh>(null);
  const mat = useRef<ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCool: { value: new Color(0x2f9fc4) },
      uFoam: { value: new Color(0xeaf9ff) },
    }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || spouts.length === 0) return;
    spouts.forEach((s, i) => {
      // the sheet hangs from the waterline down into the void
      _p.set(s.x, s.y - s.len / 2, s.z);
      _q.identity();
      _s.set(3.2, s.len, 3.2);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setHex(0xffffff));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [spouts]);

  useFrame((s) => {
    const u = mat.current?.uniforms ?? uniforms;
    u.uTime.value = s.clock.elapsedTime;
  });

  if (spouts.length === 0) return null;

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spouts.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    </instancedMesh>
  );
}
