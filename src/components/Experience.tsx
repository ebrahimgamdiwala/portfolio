"use client";

import dynamic from "next/dynamic";
import { ScrollProvider } from "@/lib/scroll/ScrollProvider";
import { usePark } from "@/lib/usePark";
import { Navbar } from "./ui/Navbar";
import { Hero } from "./ui/Hero";
import { StationLayer } from "./ui/StationLayer";
import { Loader } from "./ui/Loader";

const ParkCanvas = dynamic(
  () => import("./park/ParkCanvas").then((m) => m.ParkCanvas),
  { ssr: false },
);

/** Total scroll runway. Roughly one viewport per chapter, plus the landing. */
const SCROLL_VH = 1300;

function Stage() {
  const world = usePark();

  return (
    <>
      <ParkCanvas world={world} />
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
