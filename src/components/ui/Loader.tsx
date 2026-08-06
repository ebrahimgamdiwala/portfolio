"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { meta } from "@/lib/content";

/**
 * Covers the void while ~30k terrain columns are generated. The counter is
 * time-based rather than fake-random so it always finishes on the real handoff.
 */
export function Loader({ ready }: { ready: boolean }) {
  const [pct, setPct] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      // creep toward 92% while generating, then snap home
      const creep = 92 * (1 - Math.exp(-elapsed / 900));
      setPct((p) => Math.max(p, ready ? Math.min(100, p + 6) : creep));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  useEffect(() => {
    if (pct >= 100) {
      const id = setTimeout(() => setGone(true), 620);
      return () => clearTimeout(id);
    }
  }, [pct]);

  return (
    <AnimatePresence>
      {!gone && (
        <motion.div
          exit={{ opacity: 0 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex flex-col justify-between bg-void px-6 py-10 sm:px-10 sm:py-12"
        >
          <div className="font-mono text-[11px] uppercase tracking-widest2 text-white/40">
            {meta.name}
          </div>

          <div className="flex items-end justify-between gap-6">
            <div className="max-w-sm">
              <div className="font-mono text-[11px] uppercase tracking-widest2 text-white/35">
                Generating the island
              </div>
              <div className="mt-3 h-px w-full max-w-xs overflow-hidden bg-white/12">
                <motion.div
                  className="h-full bg-white/80"
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.3, ease: "linear" }}
                />
              </div>
            </div>
            <div className="font-mono text-[clamp(2.5rem,9vw,5rem)] font-medium leading-none tracking-tight text-white/85 tabular-nums">
              {String(Math.floor(pct)).padStart(3, "0")}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
