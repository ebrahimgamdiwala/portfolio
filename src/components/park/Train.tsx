"use client";

import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { Color, Group, Quaternion, Vector3 } from "three";
import { HALF_GAUGE, RAIL_R, RAIL_RISE, type CoasterData } from "@/lib/park/coaster";
import type { RideState } from "@/lib/park/ride";
import { useQuality } from "./Quality";

/**
 * The train. Four cars, each riding its own point on the spline — which is why
 * it articulates properly through the turns instead of moving as one rigid
 * block.
 *
 * You are sitting in car 0. Its nose cowl and lap bar are deliberately in the
 * bottom of frame the whole ride: nothing else does as much to convince you
 * that you are *on* something rather than flying behind it.
 */

const CARS = 4;
const CAR_LEN = 3.6;
/** Body sits this far above the rail line. */
const DECK = RAIL_RISE + 0.52;

const pos = new Vector3();
const quat = new Quaternion();
const up = new Vector3();

function Wheels() {
  const y = -DECK + RAIL_RISE + RAIL_R * 0.4;
  return (
    <group>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}${sz}`}
            position={[sx * HALF_GAUGE, y, sz * 1.15]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.24, 0.24, 0.2, 12]} />
            <meshStandardMaterial color="#16181d" roughness={0.75} metalness={0.3} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Car({ accent, front }: { accent: Color; front: boolean }) {
  return (
    <group>
      {/* chassis */}
      <RoundedBox args={[1.72, 0.86, 3.1]} radius={0.22} smoothness={3} castShadow>
        <meshPhysicalMaterial
          color={accent}
          roughness={0.28}
          metalness={0.35}
          clearcoat={0.85}
          clearcoatRoughness={0.14}
        />
      </RoundedBox>

      {/* dark floor pan under the body */}
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[1.5, 0.3, 2.9]} />
        <meshStandardMaterial color="#15171c" roughness={0.85} metalness={0.4} />
      </mesh>

      {/* nose cowl on the lead car */}
      {front && (
        <>
          <RoundedBox
            args={[1.5, 0.66, 1.5]}
            radius={0.3}
            smoothness={3}
            position={[0, -0.05, -2.0]}
            castShadow
          >
            <meshPhysicalMaterial
              color={accent}
              roughness={0.24}
              metalness={0.4}
              clearcoat={0.9}
              clearcoatRoughness={0.1}
            />
          </RoundedBox>
          {/* headlamps */}
          {[-0.42, 0.42].map((x) => (
            <mesh key={x} position={[x, 0.02, -2.66]}>
              <sphereGeometry args={[0.15, 12, 10]} />
              <meshBasicMaterial color="#fff3d8" toneMapped={false} />
            </mesh>
          ))}
          <pointLight position={[0, 0.1, -3]} color="#ffe6bb" intensity={22} distance={34} decay={2} />
        </>
      )}

      {/* Seat backs. Both sit *behind* the front-row eye point in
          RideCamera — put one in front of it and it fills the whole shot. */}
      {[0.2, 1.36].map((z) => (
        <mesh key={z} position={[0, 0.62, z]} castShadow>
          <boxGeometry args={[1.5, 0.72, 0.22]} />
          <meshStandardMaterial color="#101216" roughness={0.92} />
        </mesh>
      ))}

      {/* lap bars — the thing your eye reads as "restrained" */}
      {[-1.24, 0.02].map((z) => (
        <mesh key={z} position={[0, 0.46, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.52, 0.075, 8, 20, Math.PI]} />
          <meshStandardMaterial color="#c9cfd9" roughness={0.3} metalness={0.9} />
        </mesh>
      ))}

      {/* side stripe */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.78, 0.16, 2.6]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>

      <Wheels />
    </group>
  );
}

export function Train({
  coaster,
  ride,
}: {
  coaster: CoasterData;
  ride: MutableRefObject<RideState>;
}) {
  const q = useQuality();
  const group = useRef<Group>(null);
  const cars = useRef<(Group | null)[]>([]);
  const accent = useMemo(() => new Color("#e8402f"), []);
  const gap = CAR_LEN / coaster.length;

  useFrame(() => {
    const head = ride.current.u;
    for (let k = 0; k < CARS; k++) {
      const g = cars.current[k];
      if (!g) continue;
      // wrap backwards past the start of the circuit
      const u = (((head - k * gap) % 1) + 1) % 1;
      coaster.sample(u, pos, quat);
      up.set(0, 1, 0).applyQuaternion(quat);
      g.position.copy(pos).addScaledVector(up, DECK);
      g.quaternion.copy(quat);
    }
    // the train is only worth drawing once the ride has actually started
    if (group.current) group.current.visible = ride.current.blend > 0.04;
  });

  return (
    <group ref={group}>
      {Array.from({ length: CARS }, (_, k) => (
        <group key={k} ref={(el) => void (cars.current[k] = el)}>
          <Car accent={accent} front={k === 0} />
        </group>
      ))}
      {q.shadows && null}
    </group>
  );
}
