"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { patchVertex, type ShaderLike } from "@/lib/world/shaderPatch";
import { WORLD } from "@/lib/world/layout";
import { PALETTE } from "@/lib/world/palette";
import { VOID_HEIGHT, WATER, type TerrainData } from "@/lib/world/terrain";

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();

/** How deep an interior column is extruded before the flat keel takes over. */
const INTERIOR_DEPTH = 14;
const RIM_THRESHOLD = 0.52;

interface Cells {
  caps: { pos: Float32Array; col: Float32Array; n: number };
  shafts: { pos: Float32Array; scaleY: Float32Array; col: Float32Array; n: number };
  keel: { pos: Float32Array; col: Float32Array; n: number };
  water: { pos: Float32Array; col: Float32Array; n: number };
  lava: { pos: Float32Array; n: number };
}

function buildCells(t: TerrainData): Cells {
  const total = t.w * t.d;
  const capPos = new Float32Array(total * 3);
  const capCol = new Float32Array(total * 3);
  const shPos = new Float32Array(total * 3);
  const shScale = new Float32Array(total);
  const shCol = new Float32Array(total * 3);
  const kPos = new Float32Array(total * 3);
  const kCol = new Float32Array(total * 3);
  const wPos = new Float32Array(total * 3);
  const wCol = new Float32Array(total * 3);
  const lPos = new Float32Array(total * 3);

  let ci = 0;
  let si = 0;
  let ki = 0;
  let wi = 0;
  let li = 0;

  const H = (ix: number, iz: number) => {
    if (ix < 0 || iz < 0 || ix >= t.w || iz >= t.d) return VOID_HEIGHT;
    const i = t.idx(ix, iz);
    return t.filled[i] ? t.height[i] : VOID_HEIGHT;
  };

  for (let iz = 0; iz < t.d; iz++) {
    const z = iz + t.minZ;
    for (let ix = 0; ix < t.w; ix++) {
      const i = t.idx(ix, iz);
      if (!t.filled[i]) continue;
      const x = ix + t.minX;
      const h = t.height[i];
      const rim = t.rim[i];

      // surface cap
      _c.setHex(t.surface[i]);
      capPos[ci * 3] = x;
      capPos[ci * 3 + 1] = h + 0.5;
      capPos[ci * 3 + 2] = z;
      capCol[ci * 3] = _c.r;
      capCol[ci * 3 + 1] = _c.g;
      capCol[ci * 3 + 2] = _c.b;
      ci++;

      // column shaft — deep at the rim so the cliff wall and keel read solid
      const nMin = Math.min(H(ix - 1, iz), H(ix + 1, iz), H(ix, iz - 1), H(ix, iz + 1));
      const exposed = nMin === VOID_HEIGHT || nMin < h - 1;
      const bottom =
        rim > RIM_THRESHOLD || exposed
          ? t.under[i]
          : Math.max(t.under[i], h - INTERIOR_DEPTH);
      const height = h - bottom;
      if (height > 0.2) {
        _c.setHex(t.sub[i]);
        shPos[si * 3] = x;
        shPos[si * 3 + 1] = bottom + height / 2;
        shPos[si * 3 + 2] = z;
        shScale[si] = height;
        shCol[si * 3] = _c.r;
        shCol[si * 3 + 1] = _c.g;
        shCol[si * 3 + 2] = _c.b;
        si++;
      }

      // flat keel plate closes the underside of interior columns
      if (bottom > t.under[i] + 0.5) {
        const glow = (ix * 31 + iz * 17) % 191 === 0;
        _c.setHex(glow ? PALETTE.mineral : rim > 0.3 ? PALETTE.crust : PALETTE.crustDark);
        kPos[ki * 3] = x;
        kPos[ki * 3 + 1] = t.under[i] + 1;
        kPos[ki * 3 + 2] = z;
        kCol[ki * 3] = _c.r;
        kCol[ki * 3 + 1] = _c.g;
        kCol[ki * 3 + 2] = _c.b;
        ki++;
      }

      // water & lava surfaces
      const kind = t.waterKind[i];
      if (kind === WATER.LAVA) {
        lPos[li * 3] = x;
        lPos[li * 3 + 1] = t.waterY[i] + 0.35;
        lPos[li * 3 + 2] = z;
        li++;
      } else if (kind !== WATER.NONE && kind !== WATER.OBSIDIAN) {
        const y = t.waterY[i];
        const depth = y - h;
        let col: number;
        if (kind === WATER.SWAMP) col = PALETTE.swampWater;
        else if (kind === WATER.RIVER) col = PALETTE.river;
        else col = depth > 5 ? PALETTE.oceanDeep : depth > 2 ? PALETTE.oceanShallow : PALETTE.lagoon;
        _c.setHex(col);
        wPos[wi * 3] = x;
        wPos[wi * 3 + 1] = y + 0.35;
        wPos[wi * 3 + 2] = z;
        wCol[wi * 3] = _c.r;
        wCol[wi * 3 + 1] = _c.g;
        wCol[wi * 3 + 2] = _c.b;
        wi++;
      }
    }
  }

  return {
    caps: { pos: capPos, col: capCol, n: ci },
    shafts: { pos: shPos, scaleY: shScale, col: shCol, n: si },
    keel: { pos: kPos, col: kCol, n: ki },
    water: { pos: wPos, col: wCol, n: wi },
    lava: { pos: lPos, n: li },
  };
}

function useInstances(
  ref: React.RefObject<InstancedMesh>,
  pos: Float32Array,
  col: Float32Array | null,
  n: number,
  scale: (i: number) => [number, number, number],
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || n === 0) return;
    for (let i = 0; i < n; i++) {
      _p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      _q.identity();
      const s = scale(i);
      _s.set(s[0], s[1], s[2]);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      if (col) mesh.setColorAt(i, _c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, col, n]);
}

export function Terrain({ terrain }: { terrain: TerrainData }) {
  const cells = useMemo(() => buildCells(terrain), [terrain]);

  const capRef = useRef<InstancedMesh>(null!);
  const shaftRef = useRef<InstancedMesh>(null!);
  const keelRef = useRef<InstancedMesh>(null!);
  const waterRef = useRef<InstancedMesh>(null!);
  const lavaRef = useRef<InstancedMesh>(null!);

  useInstances(capRef, cells.caps.pos, cells.caps.col, cells.caps.n, () => [1, 1, 1]);
  useInstances(shaftRef, cells.shafts.pos, cells.shafts.col, cells.shafts.n, (i) => [
    1,
    cells.shafts.scaleY[i],
    1,
  ]);
  useInstances(keelRef, cells.keel.pos, cells.keel.col, cells.keel.n, () => [1, 2, 1]);
  useInstances(waterRef, cells.water.pos, cells.water.col, cells.water.n, () => [1, 0.7, 1]);
  useInstances(lavaRef, cells.lava.pos, null, cells.lava.n, () => [1, 0.7, 1]);

  // animated water surface — a gentle voxel swell, driven in the vertex shader
  const waterUniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const lavaUniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  const patchWater = (shader: ShaderLike) =>
    patchVertex(
      shader,
      waterUniforms,
      "uniform float uTime;",
      `#ifdef USE_INSTANCING
         vec3 iPos = instanceMatrix[3].xyz;
         transformed.y += sin(uTime * 1.4 + iPos.x * 0.32 + iPos.z * 0.27) * 0.16
                        + cos(uTime * 0.9 - iPos.x * 0.19 + iPos.z * 0.23) * 0.1;
       #endif`,
    );

  const patchLava = (shader: ShaderLike) =>
    patchVertex(
      shader,
      lavaUniforms,
      "uniform float uTime;",
      `#ifdef USE_INSTANCING
         vec3 iPos = instanceMatrix[3].xyz;
         transformed.y += sin(uTime * 0.7 + iPos.x * 0.5 + iPos.z * 0.4) * 0.22;
       #endif`,
    );

  useFrame((state) => {
    waterUniforms.uTime.value = state.clock.elapsedTime;
    lavaUniforms.uTime.value = state.clock.elapsedTime;
    const mat = lavaRef.current?.material as MeshStandardMaterial | undefined;
    if (mat) mat.emissiveIntensity = 1.5 + Math.sin(state.clock.elapsedTime * 1.7) * 0.35;
  });

  return (
    <group>
      <instancedMesh
        ref={capRef}
        args={[undefined, undefined, Math.max(1, cells.caps.n)]}
        receiveShadow
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} metalness={0} flatShading />
      </instancedMesh>

      <instancedMesh
        ref={shaftRef}
        args={[undefined, undefined, Math.max(1, cells.shafts.n)]}
        receiveShadow
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} metalness={0} flatShading />
      </instancedMesh>

      <instancedMesh
        ref={keelRef}
        args={[undefined, undefined, Math.max(1, cells.keel.n)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} metalness={0} flatShading />
      </instancedMesh>

      <instancedMesh
        ref={waterRef}
        args={[undefined, undefined, Math.max(1, cells.water.n)]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          transparent
          opacity={0.82}
          roughness={0.18}
          metalness={0.05}
          flatShading
          onBeforeCompile={patchWater}
        />
      </instancedMesh>

      <instancedMesh
        ref={lavaRef}
        args={[undefined, undefined, Math.max(1, cells.lava.n)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={PALETTE.lava}
          emissive={PALETTE.lavaHot}
          emissiveIntensity={1.6}
          roughness={0.6}
          toneMapped={false}
          flatShading
          onBeforeCompile={patchLava}
        />
      </instancedMesh>
    </group>
  );
}
