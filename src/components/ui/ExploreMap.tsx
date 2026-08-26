"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Vector3 } from "three";
import { walker } from "@/components/park/ExploreCamera";
import { buildMarkers, type Marker } from "@/lib/explore/markers";
import { explore, useExplore } from "@/lib/explore/store";
import { PARK, ZONES } from "@/lib/park/layout";
import { usePark } from "@/lib/usePark";

/**
 * The park map.
 *
 * Drawn straight from the layout tables and the solved circuit, so it can never
 * disagree with the park it is a map of. The visitor's own arrow is written to
 * the DOM from an animation frame rather than through React — a minimap that
 * re-renders sixty times a second would cost more than the scene behind it.
 */

/** World half-extent the map covers. */
const SPAN = 360;

export function ExploreMap() {
  const { mode, selected } = useExplore();
  const world = usePark();
  const [open, setOpen] = useState(true);
  const [hovered, setHovered] = useState<Marker | null>(null);
  const arrow = useRef<SVGGElement>(null);

  const markers = useMemo(() => buildMarkers(), []);
  const active = hovered ?? (selected ? markers.find((m) => m.id === selected) ?? null : null);

  const track = useMemo(() => {
    if (!world) return "";
    const p = new Vector3();
    const pts: string[] = [];
    for (let i = 0; i <= 220; i++) {
      world.coaster.curve.getPointAt((i % 220) / 220, p);
      pts.push(`${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [world]);

  // M toggles it, the way it does in every game that has one
  useEffect(() => {
    if (mode !== "explore") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m") setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  useEffect(() => {
    if (mode !== "explore" || !open) return;
    let id = 0;
    const tick = () => {
      const g = arrow.current;
      if (g) {
        g.setAttribute(
          "transform",
          `translate(${walker.x.toFixed(1)} ${walker.z.toFixed(1)}) rotate(${(
            (-walker.yaw * 180) / Math.PI
          ).toFixed(1)})`,
        );
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [mode, open]);

  if (mode !== "explore") return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-1.5 sm:gap-2">
      {/* Ride Name Hover/Active Pill */}
      <AnimatePresence>
        {open && active && (
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="pointer-events-none flex max-w-[14rem] sm:max-w-md items-center gap-2 rounded-full border border-white/20 bg-black/85 px-3.5 py-1.5 text-white shadow-xl backdrop-blur-xl"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full animate-pulse shadow-[0_0_8px_currentColor]"
              style={{ backgroundColor: active.accent, color: active.accent }}
            />
            <span className="truncate font-mono text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-white/95">
              {active.title}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <div className="pointer-events-auto overflow-hidden rounded-2xl border border-white/15 bg-black/75 shadow-2xl backdrop-blur-md [-webkit-backdrop-filter:blur(16px)] [transform:translateZ(0)]">
          <svg
            viewBox={`${-SPAN} ${-SPAN} ${SPAN * 2} ${SPAN * 2}`}
            className="h-[6.5rem] w-[6.5rem] landscape:h-[8.5rem] landscape:w-[8.5rem] sm:h-[18rem] sm:w-[18rem] md:h-[24rem] md:w-[24rem] lg:h-[28rem] lg:w-[28rem] xl:h-[32rem] xl:w-[32rem] 2xl:h-[35rem] 2xl:w-[35rem]"
            role="img"
            aria-label="Map of the park"
          >
            {/* perimeter */}
            <circle
              cx={0}
              cy={0}
              r={PARK.fenceRadius}
              fill="rgba(255,255,255,0.025)"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={2.5}
              strokeDasharray="10 8"
            />

            {/* zones */}
            {Object.values(ZONES).map((z) => (
              <circle
                key={z.id}
                cx={z.x}
                cy={z.z}
                r={z.r}
                fill="rgba(255,255,255,0.035)"
                stroke="none"
              />
            ))}

            {/* the circuit */}
            <polyline
              points={track}
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={4}
              strokeLinejoin="round"
            />
            <polyline
              points={track}
              fill="none"
              stroke="rgba(255,120,120,0.75)"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />

            {/* every attraction you can visit */}
            {markers.map((m) => {
              const on = selected === m.id;
              const isHov = hovered?.id === m.id;
              return (
                <g
                  key={m.id}
                  className="cursor-pointer"
                  onClick={() => explore.select(on ? null : m.id)}
                  onPointerEnter={() => setHovered(m)}
                  onPointerLeave={() => setHovered((cur) => (cur?.id === m.id ? null : cur))}
                >
                  <circle cx={m.pos[0]} cy={m.pos[2]} r={on || isHov ? 22 : 16} fill="transparent" />
                  <circle
                    cx={m.pos[0]}
                    cy={m.pos[2]}
                    r={on || isHov ? 14 : 9}
                    fill={m.accent}
                    opacity={on || isHov ? 1 : 0.85}
                  />
                  <circle
                    cx={m.pos[0]}
                    cy={m.pos[2]}
                    r={on || isHov ? 22 : 15}
                    fill="none"
                    stroke={m.accent}
                    strokeWidth={isHov ? 3.5 : 2.5}
                    opacity={on ? 0.95 : isHov ? 0.85 : 0.35}
                  />
                </g>
              );
            })}

            {/* you */}
            <g ref={arrow}>
              <circle r={26} fill="rgba(255,255,255,0.14)" />
              <polygon
                points="0,-22 15,17 0,8 -15,17"
                fill="#ffffff"
                stroke="#05070d"
                strokeWidth={3}
              />
            </g>
          </svg>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto rounded-full border border-white/15 bg-black/60 px-3 py-1.5 sm:px-4 sm:py-2 font-mono text-[9px] sm:text-[10px] uppercase tracking-widest2 text-white/60 backdrop-blur-md transition-colors hover:text-white"
      >
        {open ? "Hide map" : "Map"} · M
      </button>
    </div>
  );
}
