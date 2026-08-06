"use client";

import { useMemo, useRef } from "react";
import { BackSide, Color, ShaderMaterial, Vector3 } from "three";

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3  uTop;
  uniform vec3  uHorizon;
  uniform vec3  uVoid;
  uniform float uVoidMix;
  uniform vec3  uSunDir;
  uniform vec3  uSunColor;
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);

    // horizon -> zenith gradient, with a soft band below the horizon too
    float h = clamp(d.y, -1.0, 1.0);
    float up = pow(clamp(h, 0.0, 1.0), 0.62);
    vec3 col = mix(uHorizon, uTop, up);

    // ground half falls away so the island never sits on a bright floor
    col = mix(col * 0.42, col, smoothstep(-0.28, 0.02, h));

    // sun bloom smeared into the surrounding air
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(sd, 14.0) * 0.55;
    col += uSunColor * pow(sd, 3.0) * 0.10;

    // the landing orbit keeps the island suspended in a black void
    col = mix(col, uVoid, uVoidMix);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * A camera-locked gradient sky. Colours are pushed in every frame by <Sky>,
 * which blends the current biome's atmosphere with the hour of the ride.
 */
export function SkyDome({ handle }: { handle: React.MutableRefObject<ShaderMaterial | null> }) {
  const ref = useRef<ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTop: { value: new Color(0x4a97d8) },
      uHorizon: { value: new Color(0xcde2f2) },
      uVoid: { value: new Color(0x05070a) },
      uVoidMix: { value: 1 },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunColor: { value: new Color(0xffffff) },
    }),
    [],
  );

  return (
    <mesh frustumCulled={false} renderOrder={-1000} scale={900}>
      <sphereGeometry args={[1, 32, 20]} />
      <shaderMaterial
        ref={(m) => {
          ref.current = m;
          handle.current = m;
        }}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        side={BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}
