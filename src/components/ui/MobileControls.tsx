"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { explore, useExplore } from "@/lib/explore/store";
import { isTouchDevice, touch } from "@/lib/explore/touch";

/**
 * Explore mode on a phone.
 *
 * A thumbstick on the left for walking, drag anywhere on the right to look, and
 * a tap to enter whatever the crosshair is on — the same three verbs as the
 * desktop controls, mapped onto the two thumbs you actually have.
 *
 * The stick writes into a plain mutable object rather than React state; at sixty
 * frames a second a re-render per joystick sample would cost more than the park.
 */

const STICK_R = 58;
const KNOB_R = 26;

function useIsPortrait() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return portrait;
}

/* ── turn your phone ──────────────────────────────────────────────────────── */

function RotatePrompt() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-black/92 px-8 text-center backdrop-blur-md"
    >
      <motion.div
        animate={{ rotate: [0, 90, 90, 0] }}
        transition={{ duration: 2.6, times: [0, 0.35, 0.75, 1], repeat: Infinity, ease: "easeInOut" }}
        className="rounded-[10px] border-2 border-white/70"
        style={{ width: 54, height: 88 }}
      />
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest2 text-white/85">
          Turn your phone sideways
        </p>
        <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-white/45">
          The park is a wide place. Landscape gives you the room to walk around it.
        </p>
      </div>
    </motion.div>
  );
}

/* ── the thumbstick ───────────────────────────────────────────────────────── */

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = base.current;
    if (!el) return;

    const move = (cx: number, cy: number) => {
      let dx = cx - origin.current.x;
      let dy = cy - origin.current.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        dx = (dx / d) * STICK_R;
        dy = (dy / d) * STICK_R;
      }
      if (knob.current) {
        knob.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      }
      touch.moveX = dx / STICK_R;
      // screen-down is walk-backwards
      touch.moveY = -dy / STICK_R;
    };

    const release = () => {
      pointer.current = null;
      touch.moveX = 0;
      touch.moveY = 0;
      if (knob.current) knob.current.style.transform = "translate3d(0,0,0)";
    };

    const onDown = (e: PointerEvent) => {
      if (pointer.current !== null) return;
      pointer.current = e.pointerId;
      const r = el.getBoundingClientRect();
      origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      el.setPointerCapture(e.pointerId);
      move(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (pointer.current !== e.pointerId) return;
      move(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      if (pointer.current !== e.pointerId) return;
      release();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      release();
    };
  }, []);

  return (
    <div
      ref={base}
      className="pointer-events-auto absolute bottom-8 left-8 touch-none rounded-full border border-white/20 bg-white/[0.06] backdrop-blur-sm"
      style={{ width: STICK_R * 2, height: STICK_R * 2 }}
      aria-label="Walk"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          ref={knob}
          className="rounded-full border border-white/40 bg-white/25 transition-none"
          style={{ width: KNOB_R * 2, height: KNOB_R * 2 }}
        />
      </div>
    </div>
  );
}

/* ── drag to look, tap to enter ───────────────────────────────────────────── */

function LookPad() {
  const pad = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = pad.current;
    if (!el) return;
    let id: number | null = null;
    let last = { x: 0, y: 0 };
    let moved = 0;

    const onDown = (e: PointerEvent) => {
      if (id !== null) return;
      id = e.pointerId;
      last = { x: e.clientX, y: e.clientY };
      moved = 0;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      touch.lookX += dx;
      touch.lookY += dy;
      moved += Math.abs(dx) + Math.abs(dy);
      last = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      id = null;
      // a tap, not a drag — enter whatever the crosshair is on
      if (moved < 12) {
        const hovered = explore.state.hovered;
        if (hovered) explore.select(hovered);
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div
      ref={pad}
      className="pointer-events-auto absolute inset-y-0 right-0 touch-none"
      style={{ left: "38%" }}
      aria-label="Look around"
    />
  );
}

/* ── the lot ──────────────────────────────────────────────────────────────── */

export function MobileControls() {
  const { mode, selected, riding, hovered } = useExplore();
  const [isTouch, setIsTouch] = useState(false);
  const portrait = useIsPortrait();

  useEffect(() => setIsTouch(isTouchDevice()), []);

  if (!isTouch || mode !== "explore") return null;

  const free = !selected && !riding;

  return (
    <>
      <AnimatePresence>{portrait && <RotatePrompt key="rotate" />}</AnimatePresence>

      {!portrait && (
        <div className="pointer-events-none fixed inset-0 z-40">
          {free && (
            <>
              <LookPad />
              <Joystick />

              {/* crosshair, and what it is on */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div
                  className="rounded-full border transition-all duration-200"
                  style={{
                    width: hovered ? 20 : 8,
                    height: hovered ? 20 : 8,
                    borderColor: hovered ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)",
                    borderWidth: hovered ? 2 : 1.5,
                  }}
                />
              </div>

              <div className="absolute inset-x-0 bottom-3 flex justify-center px-4">
                <span className="rounded-full border border-white/10 bg-black/50 px-4 py-2 font-mono text-[9px] uppercase tracking-widest2 text-white/55 backdrop-blur-md">
                  {hovered ? "Tap to enter" : "Stick to walk · drag to look"}
                </span>
              </div>
            </>
          )}

          {riding && (
            <>
              <LookPad />
              <div className="absolute inset-x-0 bottom-3 flex justify-center px-4">
                <span className="rounded-full border border-white/10 bg-black/50 px-4 py-2 font-mono text-[9px] uppercase tracking-widest2 text-white/55 backdrop-blur-md">
                  Drag to look around
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
