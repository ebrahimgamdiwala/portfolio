"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { hero, meta } from "@/lib/content";
import { useRafProgress } from "@/lib/scroll/useRafProgress";

const rise = {
  hidden: { opacity: 0, y: 26 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1.15, delay: 0.35 + i * 0.09, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

/** The landing plate. Dissolves the moment the ride starts moving. */
export function Hero() {
  const ref = useRef<HTMLDivElement>(null);

  useRafProgress((p) => {
    const el = ref.current;
    if (!el) return;
    // A small dead-zone: mobile browsers often report a sliver of scroll on
    // first paint (address-bar collapse, layout settling), which used to be
    // enough to visibly blur the name before the visitor has scrolled at all.
    const t = Math.min(1, Math.max(0, (p - 0.006) / 0.045));
    el.style.opacity = String(1 - t);
    el.style.transform = `translate3d(0, ${-t * 40}px, 0)`;
    el.style.filter = `blur(${t * 7}px)`;
    el.style.visibility = t >= 0.995 ? "hidden" : "visible";
  });

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-0 z-20 flex h-[100dvh] flex-col justify-end px-6 pb-16 sm:px-10 sm:pb-20 lg:justify-center lg:pb-0"
    >
      <div className="max-w-3xl">
        <motion.p
          custom={0}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mb-5 font-mono text-[11px] uppercase tracking-widest2 text-white/45"
        >
          {hero.eyebrow}
        </motion.p>

        <h1 className="font-sans text-[clamp(2.6rem,9vw,7.5rem)] font-semibold leading-[0.88] tracking-[-0.045em] text-white">
          {hero.titleLines.map((line, i) => (
            <motion.span
              key={line}
              custom={i + 1}
              variants={rise}
              initial="hidden"
              animate="show"
              className="block"
            >
              {line}
            </motion.span>
          ))}
        </h1>

        <motion.div
          custom={hero.titleLines.length + 1}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          <span className="font-mono text-[11px] uppercase tracking-widest2 text-white/70">
            {hero.subtitle}
          </span>
          <span className="h-px w-10 bg-white/25" />
          <span className="font-mono text-[11px] uppercase tracking-widest2 text-white/45">
            {meta.focus}
          </span>
        </motion.div>

        <motion.p
          custom={hero.titleLines.length + 2}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-6 max-w-md text-[15px] leading-relaxed text-white/60"
        >
          {hero.blurb}
        </motion.p>

        <motion.div
          custom={hero.titleLines.length + 3}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-10 flex gap-10"
        >
          {hero.stats.map((s) => (
            <div key={s.label}>
              <div className="text-2xl font-medium tracking-tight text-white">{s.value}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-widest2 text-white/40">
                {s.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.7, duration: 1.2 }}
        className="absolute bottom-8 right-6 flex items-center gap-3 sm:right-10"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest2 text-white/40">
          {hero.scrollHint}
        </span>
        <span className="relative block h-8 w-px overflow-hidden bg-white/15">
          <span className="absolute inset-x-0 top-0 h-3 animate-scroll-hint bg-white/70" />
        </span>
      </motion.div>
    </div>
  );
}
