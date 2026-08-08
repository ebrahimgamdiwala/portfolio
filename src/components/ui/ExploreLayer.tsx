"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { meta } from "@/lib/content";
import { buildMarkers } from "@/lib/explore/markers";
import { explore, useExplore } from "@/lib/explore/store";
import { useScroll } from "@/lib/scroll/ScrollProvider";
import { useRafProgress } from "@/lib/scroll/useRafProgress";
import { ExploreMap } from "./ExploreMap";
import { MobileControls } from "./MobileControls";
import { isTouchDevice } from "@/lib/explore/touch";

/**
 * Everything explore mode says out loud.
 *
 * The invitation only appears once the lap has actually closed — being offered
 * the run of the park before you have ridden it would give away the ending.
 */

const ease = [0.16, 1, 0.3, 1] as const;

/* ── the invitation ───────────────────────────────────────────────────────── */

function Invitation() {
  const { mode, unlocked } = useExplore();
  const { laps } = useScroll();

  // The lap counter lives in a ref, so it has to be polled. `unlock()` is a
  // no-op once set and the store only notifies on a real change, so this
  // cannot turn into a render every frame.
  useRafProgress((p) => {
    if (unlocked) return;
    if (laps.current >= 1 || p > 0.985) explore.unlock();
  });

  if (mode === "explore" || !unlocked) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-2 sm:px-6 sm:pb-10"
    >
      <button
        type="button"
        onClick={explore.enter}
        className="pointer-events-auto group flex max-w-[92vw] items-center gap-2.5 rounded-full border border-white/20 bg-black/55 px-4 py-2 backdrop-blur-md transition-colors hover:border-white/50 sm:gap-4 sm:px-6 sm:py-3"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
        </span>
        <span className="truncate font-mono text-[10px] uppercase tracking-widest text-white/85 sm:text-[11px] sm:tracking-widest2">
          <span className="hidden sm:inline">The park is open — </span>
          Explore on foot
        </span>
        <span className="shrink-0 font-mono text-[11px] text-white/45 transition-transform duration-300 group-hover:translate-x-1">
          →
        </span>
      </button>
    </motion.div>
  );
}

/* ── the card that opens when you click a marker ──────────────────────────── */

function Card() {
  const { selected, riding } = useExplore();
  const markers = useMemo(() => buildMarkers(), []);
  const marker = markers.find((m) => m.id === selected);
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => setIsTouch(isTouchDevice()), []);
  if (!marker) return null;

  const item = marker.item;
  const isContact = marker.kind === "gate";

  // On a phone, once you're actually strapped into the ride, the full info
  // card just blocks the view of the thing you came to see — drop down to
  // the two controls that still matter.
  if (isTouch && riding) {
    return (
      <motion.div
        key={`${marker.id}-riding`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.4, ease }}
        className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex justify-center gap-3 px-4"
      >
        {marker.boardable && (
          <button
            type="button"
            onClick={() => explore.ride(null)}
            className="pointer-events-auto rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-widest2 text-black transition-opacity hover:opacity-85"
            style={{ background: marker.accent }}
          >
            Get off
          </button>
        )}
        <button
          type="button"
          onClick={() => explore.select(null)}
          className="pointer-events-auto rounded-full border border-white/15 bg-black/55 px-4 py-2 font-mono text-[10px] uppercase tracking-widest2 text-white/70 backdrop-blur-md transition-colors hover:text-white"
        >
          Back to the park
        </button>
      </motion.div>
    );
  }

  return (
    <motion.aside
      key={marker.id}
      initial={{ opacity: 0, x: -28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -28 }}
      transition={{ duration: 0.55, ease }}
      className="pointer-events-auto fixed bottom-0 left-0 top-0 z-40 flex w-full max-w-[26rem] flex-col justify-center px-4 py-6 sm:px-10 sm:py-0"
    >
      <div
        data-lenis-prevent
        className="max-h-[88dvh] overflow-y-auto rounded-2xl border border-white/12 bg-black/72 p-4 backdrop-blur-xl sm:p-6"
      >
        <div className="flex items-center gap-3">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: marker.accent }}
          />
          <span
            className="font-mono text-[10px] uppercase tracking-widest2"
            style={{ color: marker.accent }}
          >
            {marker.title}
          </span>
        </div>

        <h2 className="mt-2 text-[clamp(1.1rem,3vw,1.9rem)] font-semibold leading-tight tracking-[-0.03em] text-white sm:mt-3">
          {isContact ? "Let's build something" : (item?.title ?? marker.station.title)}
        </h2>

        {(item?.org || item?.subtitle) && (
          <p className="mt-1 text-[13px] text-white/50">
            {[item.org, item.subtitle, item.period].filter(Boolean).join(" · ")}
          </p>
        )}

        <p className="mt-2 text-[13px] leading-relaxed text-white/55 sm:mt-3">{marker.hint}</p>

        {isContact ? (
          <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
            <a
              href={`mailto:${meta.email}`}
              className="group block text-[15px] font-medium text-white"
            >
              {meta.email}
              <span className="block h-px w-0 bg-white transition-[width] duration-500 group-hover:w-full" />
            </a>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {meta.socials.map((s) => (
                <a
                  key={s.label}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono text-[10px] uppercase tracking-widest2 text-white/50 transition-colors hover:text-white"
                >
                  {s.label} ↗
                </a>
              ))}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest2 text-emerald-300/70">
              {meta.availability}
            </p>
          </div>
        ) : (
          <>
            {item?.points?.length ? (
              <ul
                data-lenis-prevent
                className="mt-3 max-h-[22vh] space-y-1.5 overflow-y-auto pr-1 sm:mt-4 sm:max-h-[34vh] sm:space-y-2"
              >
                {item.points.map((p) => (
                  <li
                    key={p}
                    className="flex gap-3 text-[13px] leading-relaxed text-white/62"
                  >
                    <span className="mt-[9px] h-px w-3 shrink-0 bg-white/30" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {item?.tags?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4">
                {item.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/65"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}

            {item?.note || item?.result ? (
              <p className="mt-3 text-[12.5px] text-white/50 sm:mt-4">
                {[item.result, item.note].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-4 flex items-center gap-3 sm:mt-6">
          {marker.boardable && (
            <button
              type="button"
              onClick={() => explore.ride(riding ? null : (marker.rideId ?? marker.kind))}
              className="rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-widest2 text-black transition-opacity hover:opacity-85"
              style={{ background: marker.accent }}
            >
              {riding ? "Get off" : marker.action}
            </button>
          )}
          <button
            type="button"
            onClick={() => explore.select(null)}
            className="font-mono text-[10px] uppercase tracking-widest2 text-white/45 transition-colors hover:text-white"
          >
            Back to the park
          </button>
        </div>
      </div>
    </motion.aside>
  );
}

/* ── the persistent chrome ────────────────────────────────────────────────── */

function Hud() {
  const { selected, riding, pointerLocked, hovered } = useExplore();
  const free = !selected && !riding;
  // MobileControls draws its own crosshair and hint; two sets of instructions,
  // one of them telling a phone to click, is worse than none.
  const [touchUi, setTouchUi] = useState(false);
  useEffect(() => setTouchUi(isTouchDevice()), []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-30"
    >
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="font-mono text-[10px] uppercase tracking-widest2 text-white/45">
          Exploring the park
        </span>
        <button
          type="button"
          onClick={explore.leave}
          className="pointer-events-auto font-mono text-[10px] uppercase tracking-widest2 text-white/60 transition-colors hover:text-white"
        >
          ← Back to the ride
        </button>
      </div>

      {/* crosshair — the thing you aim markers with */}
      {free && pointerLocked && !touchUi && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className="rounded-full border transition-all duration-200"
            style={{
              width: hovered ? 18 : 7,
              height: hovered ? 18 : 7,
              borderColor: hovered ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)",
              borderWidth: hovered ? 2 : 1.5,
            }}
          />
        </div>
      )}

      <AnimatePresence>
        {(free || riding?.startsWith("bumperCars")) && !touchUi && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 bottom-0 flex justify-center px-6 pb-8"
          >
            <span className="rounded-full border border-white/10 bg-black/50 px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest2 text-white/55 backdrop-blur-md">
              {riding?.startsWith("bumperCars")
                ? "W S accelerate & reverse · A D steer · mouse look"
                : pointerLocked
                  ? hovered
                    ? "Click to enter · esc to release the mouse"
                    : "W A S D walk · mouse look · shift run · M map · esc release"
                  : "Click anywhere to take the controls"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── the lot ──────────────────────────────────────────────────────────────── */

export function ExploreLayer() {
  const { mode } = useExplore();
  const { stop, start } = useScroll();

  // Lenis must let go of the wheel while you are walking, or scrolling to look
  // around would fling the ride forward underneath you.
  useEffect(() => {
    if (mode === "explore") stop();
    else start();
  }, [mode, stop, start]);

  return (
    <>
      <Invitation />
      <AnimatePresence>{mode === "explore" && <Hud key="hud" />}</AnimatePresence>
      <AnimatePresence>{mode === "explore" && <Card />}</AnimatePresence>
      <ExploreMap />
      <MobileControls />
    </>
  );
}
