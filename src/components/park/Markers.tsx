"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, DoubleSide, type Group } from "three";
import { buildMarkers, type Marker } from "@/lib/explore/markers";
import { explore, useExplore } from "@/lib/explore/store";
import { neonText } from "@/lib/park/sign";

/**
 * The things in the park you can click.
 *
 * A ring on the ground, a beam of light standing in it, and the ride's name
 * floating above — the same visual grammar every park uses for "queue here",
 * which means nobody needs telling what it is.
 */

function Pin({ marker, dim }: { marker: Marker; dim: boolean }) {
  const group = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  const { camera } = useThree();
  const label = useMemo(
    () => neonText(marker.title, marker.accent, { width: 1024, height: 160, mono: true }),
    [marker],
  );

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.position.y = marker.pos[1] + Math.sin(t * 1.3 + marker.pos[0]) * 0.9;
    // the label always turns to face you; the ring stays flat on the ground
    g.rotation.y = Math.atan2(
      camera.position.x - marker.pos[0],
      camera.position.z - marker.pos[2],
    );
    const want = (hover ? 1.18 : 1) * (dim ? 0.55 : 1);
    g.scale.lerp({ x: want, y: want, z: want } as never, 0.14);
  });

  const w = Math.max(14, marker.title.length * 1.5);

  return (
    <group position={[marker.pos[0], marker.pos[1], marker.pos[2]]}>
      <group ref={group}>
        <mesh
          onPointerOver={(e) => {
            e.stopPropagation();
            setHover(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHover(false);
            document.body.style.cursor = "";
          }}
          onClick={(e) => {
            e.stopPropagation();
            explore.select(marker.id);
          }}
        >
          <planeGeometry args={[w, 4.4]} />
          <meshBasicMaterial
            map={label}
            transparent
            opacity={dim ? 0.35 : 1}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
            side={DoubleSide}
          />
        </mesh>
      </group>

      {/* the beam standing in the ring, so a pin reads from across the park */}
      <mesh position={[0, -marker.pos[1] / 2, 0]}>
        <cylinderGeometry args={[0.55, 1.4, marker.pos[1], 10, 1, true]} />
        <meshBasicMaterial
          color={marker.accent}
          transparent
          opacity={dim ? 0.05 : 0.16}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, -marker.pos[1] + 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.6, 4.6, 32]} />
        <meshBasicMaterial
          color={marker.accent}
          transparent
          opacity={dim ? 0.2 : 0.75}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

export function Markers() {
  const { mode, selected } = useExplore();
  const markers = useMemo(() => buildMarkers(), []);

  if (mode !== "explore") return null;

  return (
    <group>
      {markers.map((m) => (
        <Pin key={m.id} marker={m} dim={selected !== null && selected !== m.id} />
      ))}
    </group>
  );
}
