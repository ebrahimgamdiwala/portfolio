"use client";

import dynamic from "next/dynamic";
import { ScrollProvider } from "@/lib/scroll/ScrollProvider";
import { usePark } from "@/lib/usePark";
import { Navbar } from "./ui/Navbar";
import { Hero } from "./ui/Hero";
import { StationLayer } from "./ui/StationLayer";
import { Loader } from "./ui/Loader";
import { ExploreLayer } from "./ui/ExploreLayer";
import { useExplore } from "@/lib/explore/store";
import { useBoot } from "@/lib/park/boot";

const ParkCanvas = dynamic(
  () => import("./park/ParkCanvas").then((m) => m.ParkCanvas),
  { ssr: false },
);

/** Total scroll runway. Roughly one viewport per chapter, plus the landing. */
const SCROLL_VH = 1300;

function Stage() {
  const world = usePark();
  const { mode } = useExplore();
  const bootState = useBoot();
  const riding = mode === "ride";

  return (
    <>
      <ParkCanvas world={world} />
      {riding && <Navbar />}
      {riding && <Hero />}
      {riding && <StationLayer />}
      <ExploreLayer />
      <Loader
        ready={!!world && bootState.done && bootState.compiled}
        progress={bootState.stage / bootState.total}
      />
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
