"use client";

import { useEffect, useRef, useState } from "react";
import { stationDrift, stationOpacity, stations, type Station } from "@/lib/content";
import { useRafProgress } from "@/lib/scroll/useRafProgress";
import { useScroll } from "@/lib/scroll/ScrollProvider";
import { StationContent } from "./StationContent";

/** Short viewport — a phone on its side. The bottom-anchored layout tuned for
 *  a tall portrait screen just runs off the top of one of these. */
function useIsShort() {
  const [short, setShort] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-height: 480px)");
    const sync = () => setShort(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return short;
}

/**
 * One fixed panel per station, faded in and out by scroll position.
 * Panels never re-render — a single rAF loop writes opacity/transform straight
 * to the DOM so the WebGL layer keeps the whole frame budget.
 */
function StationPanel({ station }: { station: Station }) {
  const root = useRef<HTMLElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const short = useIsShort();

  useRafProgress((p) => {
    const el = root.current;
    if (!el) return;
    const o = stationOpacity(p, station);
    const visible = o > 0.001;
    el.style.visibility = visible ? "visible" : "hidden";
    if (!visible) return;

    el.style.opacity = String(o);
    el.style.transform = `translate3d(0, ${(1 - o) * 22}px, 0)`;

    // drift the item column through its own overflow across the station slice
    const vp = viewport.current;
    const list = inner.current;
    if (vp && list) {
      const overflow = Math.max(0, list.scrollHeight - vp.clientHeight);
      list.style.transform = `translate3d(0, ${-overflow * stationDrift(p, station)}px, 0)`;
    }
  });

  return (
    <section
      ref={root}
      aria-label={station.label}
      style={{ visibility: "hidden", opacity: 0 }}
      className={`pointer-events-none fixed inset-x-0 z-20 flex flex-col px-6 sm:px-10 lg:inset-y-0 lg:justify-center lg:pb-16 lg:pt-28 ${
        short ? "inset-y-0 justify-center py-4" : "bottom-0 justify-end pb-12 pt-24"
      }`}
    >
      <div className="pointer-events-auto w-full max-w-[34rem]">
        <header>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[11px] tracking-widest2 text-white/35">
              {station.chapter}
            </span>
            <span className="h-px w-8 bg-white/20" />
            <span className="font-mono text-[10px] uppercase tracking-widest2 text-white/50">
              {station.label}
            </span>
            <span
              className="font-mono text-[10px] uppercase tracking-widest2"
              style={{ color: station.accent }}
            >
              {station.marquee}
            </span>
          </div>

          <h2
            className={`mt-3 font-semibold leading-[1.04] tracking-[-0.035em] text-white [text-shadow:0_1px_28px_rgba(0,0,0,0.75)] ${
              short ? "text-[clamp(1.15rem,3vw,1.8rem)]" : "text-[clamp(1.6rem,3.4vw,2.5rem)]"
            }`}
          >
            {station.title}
          </h2>
          <p
            className={`mt-2.5 max-w-[30rem] leading-relaxed text-white/60 ${
              short ? "text-[12.5px]" : "text-[13.5px]"
            }`}
          >
            {station.body}
          </p>
        </header>

        <div
          ref={viewport}
          className={`station-mask mt-6 overflow-hidden lg:max-h-[44vh] ${short ? "max-h-[24vh]" : "max-h-[40vh]"}`}
        >
          <div ref={inner} className="will-change-transform">
            <StationContent station={station} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Legibility scrim — only present once the ride has left the landing plate. */
function Scrim() {
  const ref = useRef<HTMLDivElement>(null);
  useRafProgress((p) => {
    const el = ref.current;
    if (!el) return;
    const t = Math.min(1, Math.max(0, (p - 0.02) / 0.06));
    el.style.opacity = String(t);
  });
  return (
    <div ref={ref} style={{ opacity: 0 }} className="pointer-events-none fixed inset-0 z-10">
      {/* vertical wash on narrow screens, a left column on wide ones */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/45 to-black/10 lg:hidden" />
      <div className="absolute inset-0 hidden lg:block lg:bg-[linear-gradient(to_right,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.86)_26%,rgba(0,0,0,0.5)_44%,rgba(0,0,0,0)_66%)]" />
      {/* keeps the navbar legible over bright terrain */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
    </div>
  );
}

/** Thin right-edge rail marking every chapter along the ride. */
function ProgressRail() {
  const fill = useRef<HTMLDivElement>(null);
  const lapLabel = useRef<HTMLSpanElement>(null);
  const { laps } = useScroll();
  const shown = useRef(-1);

  useRafProgress((p) => {
    if (fill.current) fill.current.style.transform = `scaleY(${p})`;

    // the circuit is closed, so the ride can be taken more than once
    const n = laps.current;
    if (n !== shown.current && lapLabel.current) {
      shown.current = n;
      lapLabel.current.textContent = n > 0 ? `LAP ${String(n + 1).padStart(2, "0")}` : "";
      lapLabel.current.style.opacity = n > 0 ? "1" : "0";
    }
  });

  return (
    <div className="pointer-events-none fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 sm:right-8 lg:block">
      <span
        ref={lapLabel}
        style={{ opacity: 0 }}
        className="absolute -top-7 right-0 whitespace-nowrap font-mono text-[9px] tracking-widest2 text-white/45 transition-opacity duration-700"
      />
      <div className="relative h-56 w-px bg-white/12">
        <div
          ref={fill}
          className="absolute inset-x-0 top-0 h-full origin-top bg-white/70"
          style={{ transform: "scaleY(0)" }}
        />
        {stations.map((s) => (
          <span
            key={s.id}
            className="absolute -left-[3px] h-px w-[7px] bg-white/30"
            style={{ top: `${s.scroll.enter * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function StationLayer() {
  return (
    <>
      <Scrim />
      {stations.map((s) => (
        <StationPanel key={s.id} station={s} />
      ))}
      <ProgressRail />
    </>
  );
}
