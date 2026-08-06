import type { IUniform } from "three";

/**
 * Minimal shape of the object three hands to `onBeforeCompile`. Typed locally
 * because the exported name for it has moved between three releases.
 */
export interface ShaderLike {
  uniforms: Record<string, IUniform>;
  vertexShader: string;
  fragmentShader: string;
}

/** Injects a uniform declaration and a snippet after `#include <begin_vertex>`. */
export function patchVertex(
  shader: ShaderLike,
  uniforms: Record<string, IUniform>,
  declarations: string,
  body: string,
) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${declarations}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${body}`);
}
