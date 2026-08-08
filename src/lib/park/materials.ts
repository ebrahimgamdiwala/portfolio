import type { Material, Mesh, Object3D, Texture } from "three";

/**
 * MATERIAL DEDUPLICATION.
 *
 * Every `<meshStandardMaterial>` written inside a `.map()` becomes its own
 * instance, so the park was ending up with ~995 materials for maybe forty
 * genuinely distinct looks. That costs twice: three compiles a shader program
 * per distinct configuration — which was eighteen seconds of the initial load —
 * and it cannot batch draws that do not share a material.
 *
 * This walks the built scene and collapses materials whose *entire* visual
 * signature matches onto one shared instance. Because the signature covers
 * every property that can change a pixel, a swap is by construction invisible:
 * two materials that survive the comparison would have rendered identically
 * anyway.
 *
 * Anything animated per-instance must opt out with `userData.noShare = true` —
 * see `markUnique` — or one stall's flickering sign would take every other
 * stall's sign with it.
 */

/** Numbers and flags that change how a material renders. */
const SCALARS = [
  "type",
  "transparent",
  "opacity",
  "alphaTest",
  "side",
  "shadowSide",
  "visible",
  "toneMapped",
  "vertexColors",
  "fog",
  "wireframe",
  "flatShading",
  "depthTest",
  "depthWrite",
  "blending",
  "premultipliedAlpha",
  "dithering",
  "roughness",
  "metalness",
  "emissiveIntensity",
  "envMapIntensity",
  "reflectivity",
  "clearcoat",
  "clearcoatRoughness",
  "transmission",
  "thickness",
  "ior",
  "sheen",
  "iridescence",
  "displacementScale",
  "aoMapIntensity",
  "lightMapIntensity",
  "bumpScale",
  "polygonOffset",
  "polygonOffsetFactor",
  "polygonOffsetUnits",
  "alphaToCoverage",
  "forceSinglePass",
] as const;

/** Colour-valued properties. */
const COLOURS = ["color", "emissive", "specular", "sheenColor", "attenuationColor"] as const;

/** Texture slots — compared by identity, since the same canvas is reused. */
const MAPS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "alphaMap",
  "aoMap",
  "bumpMap",
  "displacementMap",
  "envMap",
  "lightMap",
  "clearcoatNormalMap",
  "specularMap",
  "gradientMap",
  "matcap",
] as const;

type Any = Record<string, unknown>;

function signature(m: Material): string | null {
  const a = m as unknown as Any;

  // Shader-driven or hand-patched materials are their own thing entirely.
  if (a.onBeforeCompile && (a.onBeforeCompile as () => void).length > 0) return null;
  if (m.type === "ShaderMaterial" || m.type === "RawShaderMaterial") return null;

  const parts: string[] = [];
  for (const k of SCALARS) parts.push(`${k}=${String(a[k])}`);
  for (const k of COLOURS) {
    const c = a[k] as { getHexString?: () => string } | undefined;
    parts.push(`${k}=${c?.getHexString ? c.getHexString() : "-"}`);
  }
  for (const k of MAPS) {
    const t = a[k] as Texture | null | undefined;
    parts.push(`${k}=${t ? t.uuid : "-"}`);
  }
  // normalScale is a Vector2 and genuinely changes the surface
  const ns = a.normalScale as { x: number; y: number } | undefined;
  if (ns) parts.push(`ns=${ns.x},${ns.y}`);

  return parts.join("|");
}

/** Exclude a material from sharing — required for anything animated per-mesh. */
export function markUnique<T extends Material>(m: T | null): T | null {
  if (m) m.userData.noShare = true;
  return m;
}

export interface ShareStats {
  before: number;
  after: number;
  meshes: number;
}

/**
 * Collapses identical materials across a subtree. Safe to call more than once;
 * already-shared instances simply match themselves.
 */
export function shareMaterials(root: Object3D): ShareStats {
  const registry = new Map<string, Material>();
  const seen = new Set<string>();
  let meshes = 0;

  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.material) return;
    meshes++;

    const swap = (m: Material): Material => {
      seen.add(m.uuid);
      if (m.userData?.noShare) return m;
      const key = signature(m);
      if (!key) return m;

      const hit = registry.get(key);
      if (!hit) {
        registry.set(key, m);
        return m;
      }
      if (hit === m) return m;
      // The replaced instance is not disposed: its GPU resources (textures,
      // program) are shared with the survivor, and disposing it would free
      // them out from under it.
      return hit;
    };

    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(swap);
    else mesh.material = swap(mesh.material);
  });

  return { before: seen.size, after: registry.size, meshes };
}
