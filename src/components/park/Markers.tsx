"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, DoubleSide, Vector3, type Group, type Mesh } from "three";
import { buildMarkers, type Marker } from "@/lib/explore/markers";
import { useExplore } from "@/lib/explore/store";
import { neonText } from "@/lib/park/sign";

/**
 * Waypoints.
 *
 * Drawn with depth testing off and a very high render order, so a marker is
 * never swallowed by the ride it is attached to — a waypoint you cannot see
 * from behind a gantry is not a waypoint. Their on-screen size is held roughly
 * constant with distance too, so the far side of the park stays legible instead
 * of dissolving into a speck.
 */

const camPos = new Vector3();

/** Markers hold full strength to here, then fade out and cull. */
const FADE_NEAR = 130;
const FADE_FAR = 210;

function Pin({ marker, state }: { marker: Marker; state: "idle" | "aimed" | "dim" }) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const fade = useRef(-1);
  const { camera } = useThree();

  const label = useMemo(
    () => neonText(marker.title, marker.accent, { width: 1024, height: 160, mono: true }),
    [marker],
  );
  const prompt = useMemo(
    () => neonText(marker.action.toUpperCase(), "#ffffff", { width: 1024, height: 128, mono: true }),
    [marker],
  );

  useFrame((s) => {
    const g = group.current;
    if (!g) return;
    const t = s.clock.elapsedTime;

    camPos.setFromMatrixPosition(camera.matrixWorld);
    const dist = camPos.distanceTo(g.parent!.position);

    // Drawn through walls, so without a range limit all eighteen stack up into
    // a wall of text across the whole screen. Only the ones near enough to walk
    // to are worth showing.
    const near = dist < FADE_FAR;
    g.visible = near;
    if (!near) return;

    // hold the label at a readable size wherever you are standing
    const size = MathUtilsClamp(dist / 62, 0.5, 2.2);
    const pulse = state === "aimed" ? 1.16 : 1;
    g.scale.setScalar(size * pulse);
    g.position.y = marker.pos[1] + Math.sin(t * 1.3 + marker.pos[0]) * 0.9;
    g.rotation.y = Math.atan2(camPos.x - marker.pos[0], camPos.z - marker.pos[2]);

    // and fade out over the last stretch rather than popping
    const f = MathUtilsClamp((FADE_FAR - dist) / (FADE_FAR - FADE_NEAR), 0, 1);
    if (fade.current !== f) {
      fade.current = f;
      g.traverse((o) => {
        const m = (o as Mesh).material as { opacity?: number; userData?: never } | undefined;
        const base = (o as Mesh).userData?.baseOpacity as number | undefined;
        if (m && base !== undefined) m.opacity = base * f;
      });
    }

    if (ring.current) ring.current.rotation.z = t * 0.5;
  });

  const dim = state === "dim";
  const opacity = dim ? 0.18 : 1;
  const w = Math.max(15, marker.title.length * 1.45);

  return (
    <group position={[marker.pos[0], marker.pos[1], marker.pos[2]]}>
      <group ref={group}>
        {/* backing plate, so the lettering has something to sit on against a
            bright sky or a lit facade */}
        <mesh position={[0, 0, -0.1]} renderOrder={9000} userData={{ baseOpacity: dim ? 0.14 : state === "aimed" ? 0.82 : 0.62 }}>
          <planeGeometry args={[w, 5.4]} />
          <meshBasicMaterial
            color="#05070d"
            transparent
            opacity={dim ? 0.14 : state === "aimed" ? 0.82 : 0.62}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
            side={DoubleSide}
          />
        </mesh>
        <mesh renderOrder={9001} userData={{ baseOpacity: opacity }}>
          <planeGeometry args={[w, 4.2]} />
          <meshBasicMaterial
            map={label}
            transparent
            opacity={opacity}
            depthTest={false}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
            side={DoubleSide}
          />
        </mesh>

        {/* the call to action, only on the one you are looking at */}
        {state === "aimed" && (
          <mesh position={[0, -3.6, 0]} renderOrder={9002} userData={{ baseOpacity: 1 }}>
            <planeGeometry args={[w * 0.8, 2.4]} />
            <meshBasicMaterial
              map={prompt}
              transparent
              opacity={1}
              depthTest={false}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
              side={DoubleSide}
            />
          </mesh>
        )}

        {/* the diamond that says "target" */}
        <mesh position={[0, 3.6, 0]} rotation={[0, 0, Math.PI / 4]} renderOrder={9001} userData={{ baseOpacity: dim ? 0.2 : 1 }}>
          <planeGeometry args={[1.5, 1.5]} />
          <meshBasicMaterial
            color={marker.accent}
            transparent
            opacity={dim ? 0.2 : 1}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
            side={DoubleSide}
          />
        </mesh>
      </group>

      {/* the beam standing in the ring, so a pin reads from across the park */}
      <mesh position={[0, -marker.pos[1] / 2, 0]} renderOrder={8000}>
        <cylinderGeometry args={[0.7, 2, marker.pos[1], 12, 1, true]} />
        <meshBasicMaterial
          color={marker.accent}
          transparent
          opacity={dim ? 0.05 : state === "aimed" ? 0.3 : 0.18}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={ring}
        position={[0, -marker.pos[1] + 0.2, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={8001}
      >
        <ringGeometry args={[4.2, 5.6, 4, 1]} />
        <meshBasicMaterial
          color={marker.accent}
          transparent
          opacity={dim ? 0.18 : state === "aimed" ? 1 : 0.7}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

/** Local clamp — importing MathUtils for one call is not worth the line. */
function MathUtilsClamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function Markers() {
  const { mode, selected, hovered } = useExplore();
  const markers = useMemo(() => buildMarkers(), []);

  if (mode !== "explore") return null;

  return (
    <group>
      {markers.map((m) => (
        <Pin
          key={m.id}
          marker={m}
          state={
            selected && selected !== m.id
              ? "dim"
              : hovered === m.id && !selected
                ? "aimed"
                : "idle"
          }
        />
      ))}
    </group>
  );
}
