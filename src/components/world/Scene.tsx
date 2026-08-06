"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import portfolio from "@/data/portfolio.json";
import { useScroll } from "@/lib/scroll/ScrollProvider";
import { makeProgressMap } from "@/lib/world/track";
import type { SkyState } from "@/lib/world/sky";
import type { World } from "@/lib/useWorld";
import { Terrain } from "./Terrain";
import { VoxelBatch } from "./primitives/VoxelBatch";
import { City } from "./City";
import { Fauna } from "./Fauna";
import { Track } from "./Track";
import { Waterfalls } from "./Waterfalls";
import { Fragments } from "./Fragments";
import { Clouds } from "./Clouds";
import { Weather } from "./Weather";
import { Sky } from "./Sky";
import { RideCamera } from "./RideCamera";

const stations = portfolio.stations;

/** Reads the shared progress ref and re-renders only when the station changes. */
function Director({ onStation }: { onStation: (id: string) => void }) {
  const { eased } = useScroll();
  const current = useRef("");

  useFrame(() => {
    const p = eased.current;
    const st =
      stations.find((s) => p >= s.scroll.enter && p < s.scroll.exit) ??
      stations[stations.length - 1];
    if (st.id !== current.current) {
      current.current = st.id;
      onStation(st.id);
    }
  });

  return null;
}

export function Scene({ world }: { world: World }) {
  const { terrain, scatter, track } = world;
  const { eased } = useScroll();
  const [focus, setFocus] = useState(stations[0].id);
  const [night, setNight] = useState(0);
  const nightRef = useRef(0);

  const progressToU = useMemo(
    () => makeProgressMap(stations, track.stationU),
    [track.stationU],
  );

  const onSky = useCallback((s: SkyState) => {
    // throttle: the city glow only needs to change in visible steps
    if (Math.abs(s.night - nightRef.current) > 0.06) {
      nightRef.current = s.night;
      setNight(s.night);
    }
  }, []);

  return (
    <>
      <Sky progress={eased} terrain={terrain} onState={onSky} />
      <RideCamera track={track} progressToU={progressToU} />
      <Director onStation={setFocus} />

      <Terrain terrain={terrain} />
      <VoxelBatch boxes={scatter.boxes} />
      <City buildings={scatter.buildings} nightFactor={night} />
      <Fauna creatures={scatter.creatures} />
      <Track track={track} />
      <Waterfalls terrain={terrain} />
      <Fragments fragments={scatter.fragments} />
      <Clouds clouds={scatter.clouds} />
      <Weather focus={focus} />
    </>
  );
}
