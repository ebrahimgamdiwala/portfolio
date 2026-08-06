"use client";

import Lenis from "lenis";
import { LAP_END, RIDE_START } from "./timeline";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ScrollApi {
  /** Raw 0..1 page progress, updated every frame without re-rendering React. */
  progress: React.MutableRefObject<number>;
  /** Eased progress the 3D world actually follows. */
  eased: React.MutableRefObject<number>;
  /** Downward = 1, upward = -1, idle decays toward 0. */
  velocity: React.MutableRefObject<number>;
  /** How many complete laps of the circuit the rider has done. */
  laps: React.MutableRefObject<number>;
  scrollTo: (p: number) => void;
  /** Hand the wheel back to the page — explore mode needs it. */
  stop: () => void;
  start: () => void;
  ready: boolean;
}

const Ctx = createContext<ScrollApi | null>(null);

export function useScroll() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useScroll must be used inside <ScrollProvider>");
  return ctx;
}

/**
 * Smooth scroll + a frame-synced progress ref. Nothing here triggers a React
 * render; the canvas reads the refs directly inside its own render loop.
 */
export function ScrollProvider({ children }: { children: ReactNode }) {
  const progress = useRef(0);
  const eased = useRef(0);
  const velocity = useRef(0);
  const laps = useRef(0);
  const lenisRef = useRef<Lenis | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // the ride must always begin at the shore, never where the browser left off
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    const lenis = new Lenis({
      duration: 1.25,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      wheelMultiplier: 0.9,
      touchMultiplier: 1.6,
      syncTouch: true,
    });
    lenisRef.current = lenis;

    // Lenis owns the scroll position outright and `eased` is damped over ~50
    // frames, so there is no way to park the ride at an exact point from
    // outside without a handle on both. Development only — it is what the
    // screenshot harness drives.
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __ride?: unknown }).__ride = {
        lenis,
        seek(p: number) {
          const limit = document.documentElement.scrollHeight - window.innerHeight;
          lenis.scrollTo(p * limit, { immediate: true, force: true });
          progress.current = p;
          eased.current = p;
        },
      };
    }

    // The coaster is a closed circuit: the rail under the camera at the very
    // bottom of the page is the same rail as at RIDE_START. So when the rider
    // runs off the end we put them straight back there and the lap continues
    // with no visible cut. Only forward travel wraps — scrolling up still
    // returns to the landing plate.
    let wrapping = false;
    const onScroll = ({
      scroll,
      limit,
      velocity: v,
    }: {
      scroll: number;
      limit: number;
      velocity: number;
    }) => {
      const p = limit > 0 ? Math.min(1, Math.max(0, scroll / limit)) : 0;

      if (!wrapping && limit > 0 && p >= LAP_END && v > 0) {
        wrapping = true;
        lenis.scrollTo(RIDE_START * limit, { immediate: true, force: true });
        progress.current = RIDE_START;
        // snap the damped follower too, or it would rewind the whole ride
        eased.current = RIDE_START;
        velocity.current = 0;
        laps.current += 1;
        wrapping = false;
        return;
      }

      progress.current = p;
      velocity.current = v;
    };
    lenis.on("scroll", onScroll);

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      // critically damped follow so the ride never snaps
      eased.current += (progress.current - eased.current) * 0.085;
      velocity.current *= 0.92;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const scrollTo = useCallback((p: number) => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    lenis.scrollTo(p * limit, { duration: 2.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
  }, []);

  const stop = useCallback(() => lenisRef.current?.stop(), []);
  const start = useCallback(() => lenisRef.current?.start(), []);

  const api = useMemo<ScrollApi>(
    () => ({ progress, eased, velocity, laps, scrollTo, stop, start, ready }),
    [scrollTo, stop, start, ready],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
