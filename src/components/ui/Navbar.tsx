"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { meta, stationAnchor, stations } from "@/lib/content";
import { useScroll } from "@/lib/scroll/ScrollProvider";
import { useRafProgress } from "@/lib/scroll/useRafProgress";

/**
 * Text-only navigation. No panels, no borders, nothing that would sit on top
 * of the world like a UI chrome — just words that light up.
 */
export function Navbar() {
  const { scrollTo } = useScroll();
  const [active, setActive] = useState(stations[0].id);

  useRafProgress((p) => {
    const st =
      stations.find((s) => p >= s.scroll.enter && p < s.scroll.exit) ??
      stations[stations.length - 1];
    if (st.id !== active) setActive(st.id);
  });

  return (
    <motion.header
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-6 px-6 py-5 sm:px-10 sm:py-6"
    >
      <button
        type="button"
        onClick={() => scrollTo(0)}
        className="pointer-events-auto group flex shrink-0 items-baseline gap-2.5 text-left"
        aria-label="Back to the start"
      >
        <span className="text-[13px] font-semibold tracking-tight text-white">
          {meta.shortName}
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest2 text-white/40 transition-colors group-hover:text-white/80 sm:block">
          {meta.role}
        </span>
      </button>

      <nav className="pointer-events-auto hidden items-center gap-7 md:flex">
        {stations.map((s) => (
          <NavLink
            key={s.id}
            label={s.nav}
            active={active === s.id}
            onClick={() => scrollTo(stationAnchor(s))}
          />
        ))}
      </nav>

      <a
        href={`mailto:${meta.email}`}
        className="pointer-events-auto group relative hidden font-mono text-[11px] uppercase tracking-widest2 text-white/60 transition-colors hover:text-white md:block"
      >
        Get in touch
        <span className="absolute -bottom-1 left-0 h-px w-0 bg-white transition-[width] duration-500 ease-out group-hover:w-full" />
      </a>

      <MobileNav />
    </motion.header>
  );
}

function NavLink({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ride to ${label}`}
      aria-current={active ? "true" : undefined}
      className="group relative py-1 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors duration-300"
      style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.45)" }}
    >
      <span className="relative inline-block transition-transform duration-500 ease-out group-hover:-translate-y-[1px]">
        {label}
      </span>
      <span
        className="absolute -bottom-0.5 left-0 h-px bg-white transition-[width] duration-500 ease-out group-hover:w-full"
        style={{ width: active ? "100%" : 0 }}
      />
    </button>
  );
}

function MobileNav() {
  const { scrollTo } = useScroll();
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-[11px] uppercase tracking-widest2 text-white/70"
      >
        {open ? "Close" : "Index"}
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute right-6 top-16 flex flex-col items-end gap-3"
        >
          {stations.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                scrollTo(stationAnchor(s));
                setOpen(false);
              }}
              className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/70"
            >
              {s.nav}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
