"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Vector3 } from "three";
import { walker } from "@/components/park/ExploreCamera";
import { buildMarkers } from "@/lib/explore/markers";
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
  const arrow = useRef<SVGGElement>(null);

  const markers = useMemo(() => buildMarkers(), []);

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
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="pointer-events-auto overflow-hidden rounded-2xl border border-white/12 bg-black/65 backdrop-blur-xl">
          <svg
            viewBox={`${-SPAN} ${-SPAN} ${SPAN * 2} ${SPAN * 2}`}
            className="h-[15rem] w-[15rem] sm:h-[17rem] sm:w-[17rem]"
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
              return (
                <g
                  key={m.id}
                  className="cursor-pointer"
                  onClick={() => explore.select(on ? null : m.id)}
                >
                  <circle cx={m.pos[0]} cy={m.pos[2]} r={on ? 20 : 15} fill="transparent" />
                  <circle
                    cx={m.pos[0]}
                    cy={m.pos[2]}
                    r={on ? 13 : 9}
                    fill={m.accent}
                    opacity={on ? 1 : 0.85}
                  />
                  <circle
                    cx={m.pos[0]}
                    cy={m.pos[2]}
                    r={on ? 21 : 15}
                    fill="none"
                    stroke={m.accent}
                    strokeWidth={2.5}
                    opacity={on ? 0.9 : 0.35}
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
        className="pointer-events-auto rounded-full border border-white/15 bg-black/60 px-4 py-2 font-mono text-[10px] uppercase tracking-widest2 text-white/60 backdrop-blur-md transition-colors hover:text-white"
      >
        {open ? "Hide map" : "Map"} · M
      </button>
    </div>
  );
}
