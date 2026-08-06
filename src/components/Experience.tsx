"use client";

import dynamic from "next/dynamic";
import { ScrollProvider } from "@/lib/scroll/ScrollProvider";
import { useWorld } from "@/lib/useWorld";
import { Navbar } from "./ui/Navbar";
import { Hero } from "./ui/Hero";
import { StationLayer } from "./ui/StationLayer";
import { Loader } from "./ui/Loader";

const WorldCanvas = dynamic(
  () => import("./world/WorldCanvas").then((m) => m.WorldCanvas),
  { ssr: false },
);

/** Total scroll runway. Roughly one viewport per station, plus the landing. */
const SCROLL_VH = 820;

function Stage() {
  const world = useWorld();

  return (
    <>
      <WorldCanvas world={world} />
      <Navbar />
      <Hero />
      <StationLayer />
      <Loader ready={!!world} />
      <div style={{ height: `${SCROLL_VH}vh` }} aria-hidden />
    </>
  );
}

export function Experience() {
  return (
    <ScrollProvider>
      <Stage />
    </ScrollProvider>
  );
}
