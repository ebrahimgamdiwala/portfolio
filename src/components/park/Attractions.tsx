"use client";

import { useMemo, useRef, type ReactElement } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  DoubleSide,
  Matrix4,
  Quaternion,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import { posterOf, stations, type AttractionKind, type StationItem } from "@/lib/content";
import { explore, seats } from "@/lib/explore/store";
import { beam, box, placer } from "@/lib/park/build";
import type { Piece } from "@/lib/park/coaster";
import { SLOTS, type Slot } from "@/lib/park/layout";
import { neonText, panel } from "@/lib/park/sign";
import { paintedSteel } from "@/lib/park/textures";
import { Pieces } from "./primitives/Pieces";

/**
 * THE HEADLINE RIDES.
 *
 * Every project and job in `park.json` names an `attraction`, and that is what
 * gets built for it — StudyStack is a drop tower, OneFlow is a machine hall,
 * ChainForecast is the big wheel. Move the key in the JSON and the structure
 * moves with it.
 *
 * All of them turn, rise, blink or spin. A park where nothing moves is a model
 * of a park.
 */

const STEEL = () => paintedSteel(6);

/* ── shared bits ──────────────────────────────────────────────────────────── */

function Frame({ pieces, color = "#5a6070" }: { pieces: Piece[]; color?: string }) {
  const s = STEEL();
  return (
    <Pieces pieces={pieces} receiveShadow>
      <meshStandardMaterial
        color={color}
        roughness={0.6}
        metalness={0.7}
        map={s.map}
        normalMap={s.normalMap}
        roughnessMap={s.roughnessMap}
      />
    </Pieces>
  );
}

/** A glowing tube — the park's whole vocabulary of light in one component. */
function Neon({
  radius,
  tube = 0.28,
  color,
  arc = Math.PI * 2,
  ...props
}: {
  radius: number;
  tube?: number;
  color: string;
  arc?: number;
} & React.ComponentProps<"mesh">) {
  return (
    <mesh {...props}>
      <torusGeometry args={[radius, tube, 8, 64, arc]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/** A flat sign that reads as lit tube rather than printed vinyl. */
function Sign({
  text,
  color,
  width,
  height,
  mono,
  ...props
}: {
  text: string;
  color: string;
  width: number;
  height: number;
  mono?: boolean;
} & React.ComponentProps<"mesh">) {
  const tex = useMemo(() => neonText(text, color, { mono }), [text, color, mono]);
  return (
    <mesh {...props}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={tex}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/** A lit board, opaque, for names and numbers. */
function Panel({
  headline,
  sub,
  accent,
  width,
  height,
  big,
  ...props
}: {
  headline: string;
  sub?: string;
  accent: string;
  width: number;
  height: number;
  big?: boolean;
} & React.ComponentProps<"mesh">) {
  const tex = useMemo(
    () => panel(headline, sub, accent, { big }),
    [headline, sub, accent, big],
  );
  return (
    <mesh {...props} castShadow>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        map={tex}
        emissiveMap={tex}
        emissive="#ffffff"
        emissiveIntensity={1.1}
        roughness={0.5}
      />
    </mesh>
  );
}

/** A lattice mast, generated once. */
function mast(height: number, base: number, top: number, bays: number): Piece[] {
  const out: Piece[] = [];
  const corner = (i: number, y: number) => {
    const w = base + (top - base) * (y / height);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    return new Vector3(Math.cos(a) * w, y, Math.sin(a) * w);
  };
  for (let i = 0; i < 4; i++) {
    out.push(beam(corner(i, 0), corner(i, height), 0.62));
  }
  for (let b = 0; b <= bays; b++) {
    const y = (b / bays) * height;
    for (let i = 0; i < 4; i++) {
      out.push(beam(corner(i, y), corner((i + 1) % 4, y), 0.34));
      if (b < bays) {
        const y2 = ((b + 1) / bays) * height;
        out.push(beam(corner(i, y), corner((i + 1) % 4, y2), 0.24));
      }
    }
  }
  return out;
}

/* ── the big wheel ────────────────────────────────────────────────────────── */

const R_WHEEL = 44;
const GONDOLAS = 24;
const mtx = new Matrix4();
const vec = new Vector3();
const qut = new Quaternion();
const scl = new Vector3(1, 1, 1);

function FerrisWheel({ slot, accent, item }: { slot: Slot; accent: string; item: StationItem }) {
  const wheel = useRef<Group>(null);
  const cabins = useRef<InstancedMesh>(null);
  const glows = useRef<InstancedMesh>(null);

  const spokes = useMemo(() => {
    const out: Piece[] = [];
    const hub = (z: number) => new Vector3(0, 0, z);
    for (let side of [-3.2, 3.2]) {
      for (let i = 0; i < GONDOLAS; i++) {
        const a = (i / GONDOLAS) * Math.PI * 2;
        const rim = new Vector3(Math.cos(a) * R_WHEEL, Math.sin(a) * R_WHEEL, side);
        out.push(beam(hub(side), rim, 0.28));
        const b = ((i + 1) / GONDOLAS) * Math.PI * 2;
        const nxt = new Vector3(Math.cos(b) * R_WHEEL, Math.sin(b) * R_WHEEL, side);
        out.push(beam(rim, nxt, 0.42));
        // inner tension ring
        out.push(
          beam(
            rim.clone().multiplyScalar(0.52).setZ(side),
            nxt.clone().multiplyScalar(0.52).setZ(side),
            0.16,
          ),
        );
      }
    }
    // cross bracing between the two rims
    for (let i = 0; i < GONDOLAS; i += 2) {
      const a = (i / GONDOLAS) * Math.PI * 2;
      const b = ((i + 1) / GONDOLAS) * Math.PI * 2;
      out.push(
        beam(
          new Vector3(Math.cos(a) * R_WHEEL, Math.sin(a) * R_WHEEL, -3.2),
          new Vector3(Math.cos(b) * R_WHEEL, Math.sin(b) * R_WHEEL, 3.2),
          0.18,
        ),
      );
    }
    return out;
  }, []);

  const legs = useMemo(() => {
    const out: Piece[] = [];
    const hubY = R_WHEEL + 9;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        out.push(
          beam(
            new Vector3(sx * 26, 0, sz * 22),
            new Vector3(0, hubY, sz * 4.2),
            1.5,
          ),
        );
      }
      out.push(beam(new Vector3(-26, 0, sz * 22), new Vector3(26, 0, sz * 22), 0.9));
      out.push(
        beam(new Vector3(-16, hubY * 0.42, sz * 13), new Vector3(16, hubY * 0.42, sz * 13), 0.6),
      );
      out.push(box(0, 0.6, sz * 22, 58, 1.2, 5));
    }
    return out;
  }, []);

  useFrame((state, dt) => {
    const w = wheel.current;
    if (!w) return;
    w.rotation.z += dt * 0.052;

    // Gondolas hang level no matter where the wheel is, so in world space they
    // only ever translate — which means the whole ring is one instanced draw.
    const spin = w.rotation.z;
    const yaw = slot.rot;
    qut.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    const hubY = R_WHEEL + 9;
    const pulse = state.clock.elapsedTime * 2.4;

    for (let i = 0; i < GONDOLAS; i++) {
      const a = (i / GONDOLAS) * Math.PI * 2 + spin;
      vec
        .set(Math.cos(a) * R_WHEEL, Math.sin(a) * R_WHEEL + hubY, 0)
        .applyQuaternion(qut)
        .add(new Vector3(slot.x, 0, slot.z));
      vec.y -= 3.0;
      mtx.compose(vec, qut, scl);
      cabins.current?.setMatrixAt(i, mtx);
      // gondola zero is the one you get into
      if (i === 0) {
        seats.ferrisWheel.pos.copy(vec);
        seats.ferrisWheel.yaw = yaw + Math.PI / 2;
      }
      // the roof lights chase around the rim
      const lit = 0.55 + 0.45 * Math.sin(pulse + i * 0.7);
      scl.setScalar(0.8 + lit * 0.5);
      vec.y += 2.1;
      mtx.compose(vec, qut, scl);
      glows.current?.setMatrixAt(i, mtx);
      scl.setScalar(1);
    }
    if (cabins.current) cabins.current.instanceMatrix.needsUpdate = true;
    if (glows.current) glows.current.instanceMatrix.needsUpdate = true;
  });

  const poster = posterOf(item, stations[0]);

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <Frame pieces={legs} color="#6d7382" />

      <group ref={wheel} position={[0, R_WHEEL + 9, 0]}>
        <Frame pieces={spokes} color="#8b93a4" />
        {/* the rims, in tube light */}
        {[-3.4, 3.4].map((z) => (
          <Neon key={z} radius={R_WHEEL} tube={0.36} color={accent} position={[0, 0, z]} />
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[2.6, 2.6, 9, 16]} />
          <meshStandardMaterial color="#3c414d" roughness={0.4} metalness={0.9} />
        </mesh>
      </group>

      {/* cabins and their roof lamps, both instanced */}
      <instancedMesh ref={cabins} args={[undefined, undefined, GONDOLAS]} castShadow>
        <boxGeometry args={[3.4, 2.6, 3.4]} />
        <meshPhysicalMaterial
          color="#eef2f8"
          roughness={0.25}
          metalness={0.2}
          clearcoat={0.7}
        />
      </instancedMesh>
      <instancedMesh ref={glows} args={[undefined, undefined, GONDOLAS]}>
        <sphereGeometry args={[0.62, 10, 8]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </instancedMesh>

      {/* nameplate across the base */}
      <Panel
        headline={poster.headline}
        sub={poster.ride}
        accent={accent}
        width={40}
        height={11}
        position={[0, 7.5, 24]}
      />
    </group>
  );
}

/* ── the drop tower ───────────────────────────────────────────────────────── */

const TOWER_H = 118;

function DropTower({ slot, accent, item }: { slot: Slot; accent: string; item: StationItem }) {
  const car = useRef<Group>(null);
  const beacon = useRef<MeshBasicMaterial>(null);
  const structure = useMemo(() => mast(TOWER_H, 6.5, 3.4, 22), []);
  const poster = posterOf(item, stations[0]);

  const boarded = useRef(-1);

  useFrame((state) => {
    // Boarding restarts the cycle from the bottom. Strapping somebody in and
    // then making them wait nine seconds for the haul to come back down is not
    // a ride, it is a queue.
    const riding = explore.state.riding === "dropTower";
    if (riding && boarded.current < 0) boarded.current = state.clock.elapsedTime;
    if (!riding) boarded.current = -1;

    const clock = riding ? state.clock.elapsedTime - boarded.current : state.clock.elapsedTime;
    const t = clock % 15;
    let y: number;
    if (t < 9) {
      // hauled up, easing out at the top
      const k = t / 9;
      y = (1 - Math.pow(1 - k, 2.4)) * (TOWER_H - 22);
    } else if (t < 10.6) {
      y = TOWER_H - 22; // the pause that does all the work
    } else if (t < 12.1) {
      const k = (t - 10.6) / 1.5;
      y = (TOWER_H - 22) * (1 - k * k); // free fall
    } else {
      const k = (t - 12.1) / 2.9;
      y = 6 * Math.exp(-k * 5) * Math.abs(Math.sin(k * 12)); // the bounce
    }
    if (car.current) car.current.position.y = y + 8;
    if (beacon.current) {
      beacon.current.opacity = Math.sin(state.clock.elapsedTime * 3) > 0 ? 1 : 0.05;
    }
    // publish the seat for ExploreCamera to strap into
    seats.dropTower.pos.set(slot.x, y + 8, slot.z);
    seats.dropTower.yaw = slot.rot;
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <Frame pieces={structure} color="#7a4250" />

      {/* neon runs the full height — this is the park's landmark from anywhere */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh key={i} position={[Math.cos(a) * 5.6, TOWER_H / 2, Math.sin(a) * 5.6]}>
            <boxGeometry args={[0.5, TOWER_H, 0.5]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
        );
      })}

      {/* the car */}
      <group ref={car}>
        <mesh castShadow>
          <torusGeometry args={[7.4, 1.5, 8, 28]} />
          <meshStandardMaterial color="#e8e9ee" roughness={0.3} metalness={0.6} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 7.4, -1.4, Math.sin(a) * 7.4]} castShadow>
              <boxGeometry args={[1.5, 2.2, 1.5]} />
              <meshStandardMaterial color="#1b1e26" roughness={0.8} />
            </mesh>
          );
        })}
        <Neon radius={7.4} tube={0.3} color="#fff0d0" rotation={[Math.PI / 2, 0, 0]} position={[0, 1.6, 0]} />
      </group>

      {/* crown and beacon */}
      <mesh position={[0, TOWER_H + 3, 0]} castShadow>
        <coneGeometry args={[6, 9, 4]} />
        <meshStandardMaterial color="#4a4f5c" roughness={0.5} metalness={0.8} />
      </mesh>
      <mesh position={[0, TOWER_H + 9, 0]}>
        <sphereGeometry args={[1.5, 12, 10]} />
        <meshBasicMaterial ref={beacon} color="#ff3b30" transparent toneMapped={false} />
      </mesh>

      <Panel
        headline={poster.headline}
        sub={poster.ride}
        accent={accent}
        width={26}
        height={9}
        position={[0, 22, 7.5]}
      />
    </group>
  );
}

/* ── the machine hall ─────────────────────────────────────────────────────── */

function Gear({ radius, teeth, speed, color }: { radius: number; teeth: number; speed: number; color: string }) {
  const ref = useRef<Group>(null);
  const boost = useRef(1);
  useFrame((_, dt) => {
    // throwing the switch on the machine hall winds everything up
    const want = explore.state.selected?.includes("OneFlow") ? 4.5 : 1;
    boost.current += (want - boost.current) * Math.min(1, dt * 1.4);
    if (ref.current) ref.current.rotation.z += dt * speed * boost.current;
  });
  return (
    <group ref={ref}>
      <mesh>
        <torusGeometry args={[radius, radius * 0.16, 10, 40]} />
        <meshStandardMaterial color="#6c5240" roughness={0.45} metalness={0.85} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[radius * 0.2, radius * 0.2, 1.2, 12]} />
        <meshStandardMaterial color="#3b3128" roughness={0.5} metalness={0.9} />
      </mesh>
      {Array.from({ length: teeth }, (_, i) => {
        const a = (i / teeth) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]} rotation={[0, 0, a]}>
            <boxGeometry args={[radius * 0.2, radius * 0.16, 1.1]} />
            <meshStandardMaterial color="#7d6048" roughness={0.45} metalness={0.85} />
          </mesh>
        );
      })}
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} rotation={[0, 0, a]}>
            <boxGeometry args={[radius * 1.7, radius * 0.11, 0.7]} />
            <meshStandardMaterial color="#5c4736" roughness={0.5} metalness={0.85} />
          </mesh>
        );
      })}
      <Neon radius={radius * 0.42} tube={0.14} color={color} />
    </group>
  );
}

function MachineHall({ slot, accent, item }: { slot: Slot; accent: string; item: StationItem }) {
  const poster = posterOf(item, stations[0]);
  const W = 62;
  const D = 40;
  const HGT = 26;

  const skeleton = useMemo(() => {
    const out: Piece[] = [];
    const at = placer(0, 0, 0, 0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        out.push(beam(at((sx * W) / 2, 0, (sz * D) / 2), at((sx * W) / 2, HGT, (sz * D) / 2), 1.3));
      }
      out.push(beam(at((sx * W) / 2, HGT, -D / 2), at((sx * W) / 2, HGT, D / 2), 0.9));
    }
    // roof trusses
    for (let i = 0; i <= 6; i++) {
      const z = -D / 2 + (i / 6) * D;
      out.push(beam(at(-W / 2, HGT, z), at(0, HGT + 9, z), 0.7));
      out.push(beam(at(W / 2, HGT, z), at(0, HGT + 9, z), 0.7));
    }
    out.push(beam(at(0, HGT + 9, -D / 2), at(0, HGT + 9, D / 2), 0.8));
    return out;
  }, []);

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      {/* the shed itself */}
      <mesh position={[0, HGT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[W - 2, HGT, D - 2]} />
        <meshStandardMaterial color="#2a2b33" roughness={0.82} metalness={0.35} />
      </mesh>
      <Frame pieces={skeleton} color="#4e5361" />

      {/* lit windows down both flanks */}
      {[-1, 1].map((sx) =>
        Array.from({ length: 7 }, (_, i) => (
          <mesh
            key={`${sx}${i}`}
            position={[(sx * (W - 1.4)) / 2, 15, -D / 2 + 5 + i * 5]}
            rotation={[0, (sx * Math.PI) / 2, 0]}
          >
            <planeGeometry args={[3.4, 7]} />
            <meshBasicMaterial color="#ffca7a" toneMapped={false} />
          </mesh>
        )),
      )}

      {/* gears on the gable — an ERP is a machine, so it gets machinery */}
      <group position={[0, 17, D / 2 + 0.6]}>
        <Gear radius={8.5} teeth={18} speed={0.34} color={accent} />
        <group position={[13.5, -6.5, -0.9]}>
          <Gear radius={5.5} teeth={12} speed={-0.52} color={accent} />
        </group>
        <group position={[-12.5, -7.5, -0.9]}>
          <Gear radius={4.5} teeth={10} speed={0.66} color={accent} />
        </group>
      </group>

      {/* stacks */}
      {[-18, 18].map((x) => (
        <group key={x} position={[x, 0, -D / 2 + 5]}>
          <mesh position={[0, HGT + 12, 0]} castShadow>
            <cylinderGeometry args={[2.1, 2.7, 24, 14]} />
            <meshStandardMaterial color="#33353d" roughness={0.85} />
          </mesh>
          <mesh position={[0, HGT + 24, 0]}>
            <torusGeometry args={[2.15, 0.3, 6, 20]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
        </group>
      ))}

      <Panel
        headline={poster.headline}
        sub={poster.ride}
        accent={accent}
        width={38}
        height={10}
        position={[0, HGT + 5, D / 2 + 1]}
      />
    </group>
  );
}

/* ── the main stage ───────────────────────────────────────────────────────── */

function MainStage({ slot, accent, item }: { slot: Slot; accent: string; item: StationItem }) {
  const poster = posterOf(item, stations[0]);
  const bars = useRef<Group>(null);
  const W = 46;
  const H = 30;

  const truss = useMemo(() => {
    const out: Piece[] = [];
    for (const sx of [-1, 1]) {
      out.push(beam(new Vector3((sx * W) / 2, 0, 0), new Vector3((sx * W) / 2, H, 0), 1.6));
      out.push(beam(new Vector3((sx * W) / 2, 0, -8), new Vector3((sx * W) / 2, H, 0), 0.6));
    }
    out.push(beam(new Vector3(-W / 2, H, 0), new Vector3(W / 2, H, 0), 1.5));
    out.push(beam(new Vector3(-W / 2, H - 5, 0), new Vector3(W / 2, H - 5, 0), 0.6));
    for (let i = 0; i <= 10; i++) {
      const x = -W / 2 + (i / 10) * W;
      out.push(beam(new Vector3(x, H - 5, 0), new Vector3(x, H, 0), 0.3));
    }
    return out;
  }, []);

  useFrame((state) => {
    if (!bars.current) return;
    // the rig idles between acts and works properly once there is an audience
    const live = explore.state.selected?.includes("Frappe") ? 3.4 : 1;
    const t = state.clock.elapsedTime;
    bars.current.rotation.x = -0.6 + Math.sin(t * 0.7 * live) * 0.28 * live;
    bars.current.rotation.z = Math.sin(t * 0.43 * live) * 0.18 * (live - 0.6);
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      {/* deck */}
      <mesh position={[0, 2, -6]} receiveShadow castShadow>
        <boxGeometry args={[W + 6, 4, 22]} />
        <meshStandardMaterial color="#22242c" roughness={0.85} />
      </mesh>
      <Frame pieces={truss} color="#585e6d" />

      {/* the screen */}
      <Panel
        headline={poster.headline}
        sub={poster.sub}
        accent={accent}
        width={W - 8}
        height={15}
        big
        position={[0, 15, -7]}
      />

      {/* moving lights on the top bar */}
      <group ref={bars} position={[0, H - 1.4, 0]}>
        {[-16, -8, 0, 8, 16].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh>
              <cylinderGeometry args={[0.7, 0.5, 1.4, 10]} />
              <meshStandardMaterial color="#1d1f26" roughness={0.6} metalness={0.7} />
            </mesh>
            <mesh position={[0, -14, 0]}>
              <coneGeometry args={[4.2, 28, 14, 1, true]} />
              <meshBasicMaterial
                color={accent}
                transparent
                opacity={0.14}
                depthWrite={false}
                blending={AdditiveBlending}
                side={DoubleSide}
                toneMapped={false}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* speaker stacks */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[(sx * (W + 10)) / 2, 9, 2]} castShadow>
          <boxGeometry args={[5, 18, 5]} />
          <meshStandardMaterial color="#15171d" roughness={0.9} />
        </mesh>
      ))}

      <Sign
        text={poster.ride ?? ""}
        color={accent}
        width={W}
        height={7}
        position={[0, H + 5, 0]}
        mono
      />
    </group>
  );
}

/* ── the scoreboard ───────────────────────────────────────────────────────── */

function Scoreboard({ slot, accent, item }: { slot: Slot; accent: string; item: StationItem }) {
  const poster = posterOf(item, stations[1]);
  const legs = useMemo(() => {
    const out: Piece[] = [];
    for (const sx of [-1, 1]) {
      out.push(beam(new Vector3(sx * 9, 0, 0), new Vector3(sx * 9, 20, 0), 1.2));
      out.push(beam(new Vector3(sx * 9, 3, 0), new Vector3(sx * 13, 0, 4), 0.5));
    }
    out.push(beam(new Vector3(-9, 20, 0), new Vector3(9, 20, 0), 0.8));
    out.push(box(0, 0.4, 0, 30, 0.8, 10));
    return out;
  }, []);

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <Frame pieces={legs} color="#4a5a52" />
      <Panel
        headline={poster.stat ?? "9.70"}
        sub={item.metricNote?.toUpperCase()}
        accent={accent}
        width={24}
        height={14}
        big
        position={[0, 27, 0]}
      />
      <Sign
        text={poster.headline}
        color={accent}
        width={26}
        height={4.5}
        position={[0, 17.5, 0.3]}
        mono
      />
    </group>
  );
}

/* ── dispatch ─────────────────────────────────────────────────────────────── */

const BUILDERS: Partial<
  Record<AttractionKind, (p: { slot: Slot; accent: string; item: StationItem }) => ReactElement>
> = {
  ferrisWheel: FerrisWheel,
  dropTower: DropTower,
  machineHall: MachineHall,
  mainStage: MainStage,
  scoreboard: Scoreboard,
};

export function Attractions() {
  const built = useMemo(() => {
    const used: Partial<Record<AttractionKind, number>> = {};
    const out: { key: string; kind: AttractionKind; slot: Slot; accent: string; item: StationItem }[] =
      [];

    for (const station of stations) {
      for (const item of station.items) {
        const kind = item.attraction;
        if (!kind || !BUILDERS[kind]) continue;
        const i = used[kind] ?? 0;
        used[kind] = i + 1;
        const slot = SLOTS[kind]?.[i];
        if (!slot) continue;
        out.push({ key: `${station.id}:${item.title}`, kind, slot, accent: station.accent, item });
      }
    }
    return out;
  }, []);

  return (
    <group>
      {built.map(({ key, kind, slot, accent, item }) => {
        const Build = BUILDERS[kind]!;
        return <Build key={key} slot={slot} accent={accent} item={item} />;
      })}
    </group>
  );
}
