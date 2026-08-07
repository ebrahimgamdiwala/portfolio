import raw from "@/data/park.json";

/**
 * Typed view over `src/data/park.json`.
 *
 * The JSON is the single source of truth; this file only describes its shape and
 * fills in the fields an author is allowed to leave out. Nothing here reads the
 * DOM or three.js, so it is safe to import from the server components that build
 * page metadata as well as from the renderer.
 */

/* ── park ─────────────────────────────────────────────────────────────────── */

/** A zone of the park. Positions and radii live in `src/lib/park/layout.ts`. */
export type ZoneId =
  | "plaza"
  | "gardens"
  | "attractionRow"
  | "works"
  | "midway"
  | "pyro"
  | "brakeRun";

/** Which structure gets built for an item. */
export type AttractionKind =
  | "dropTower"
  | "ferrisWheel"
  | "machineHall"
  | "mainStage"
  | "scoreboard"
  | "stall"
  | "plinth";

/**
 * Camera rigs. A station lists a sequence of these in `shots`, and the ride
 * cuts between them across that station's slice of the scroll.
 *
 *   onboard  front seat — the track rushing under you
 *   chase    behind and above the train
 *   flank    flying alongside, train in profile against the park
 *   drone    high and ahead, looking back down as the train comes on
 *   pyro     low and behind, aimed up into the sky over the train
 *   crane    a fixed camera planted by the rails that the train sweeps past
 *   orbit    the landing plate, high over the whole park
 */
export type CameraRig =
  | "onboard"
  | "chase"
  | "flank"
  | "drone"
  | "pyro"
  | "crane"
  | "orbit";

/** One keyframe of the dusk -> night arc, sampled on ride progress. */
export interface SkyKey {
  at: number;
  /** Sun/moon disc and directional light colour. */
  sun: string;
  /** Zenith colour of the dome. */
  sky: string;
  /** Horizon colour — the warm band the sun leaves behind. */
  haze: string;
  fog: string;
  /** Degrees above the horizon. Negative once the sun has set. */
  elev: number;
  /** Compass bearing, degrees. */
  azim: number;
  sunI: number;
  ambI: number;
  /** 0..1 star visibility. */
  stars: number;
  /** 0..1 how hard the park's own lights are driven. */
  neon: number;
  exposure: number;
}

/** Where the coaster dives into the water flume, relative to a station anchor. */
export interface Splash {
  station: string;
  offset: number;
  length: number;
}

export interface Park {
  name: string;
  est: string;
  gateMotto: string;
  seed: number;
  splash: Splash;
  sky: SkyKey[];
}

/* ── content ──────────────────────────────────────────────────────────────── */

export interface Social {
  label: string;
  handle: string;
  url: string;
}

export interface Meta {
  name: string;
  shortName: string;
  role: string;
  focus: string;
  tagline: string;
  intro: string;
  location: string;
  email: string;
  phone: string;
  availability: string;
  resumeUrl: string;
  socials: Social[];
}

export interface Hero {
  eyebrow: string;
  titleLines: string[];
  subtitle: string;
  blurb: string;
  scrollHint: string;
  stats: { value: string; label: string }[];
}

/** What gets painted onto a hoarding out in the park. */
export interface Poster {
  kicker?: string;
  headline: string;
  ride?: string;
  sub?: string;
  stat?: string;
}

export type StationKind =
  | "intro"
  | "education"
  | "projects"
  | "experience"
  | "skills"
  | "awards"
  | "contact";

export interface StationItem {
  title: string;
  subtitle?: string;
  org?: string;
  period?: string;
  place?: string;
  metric?: string;
  metricNote?: string;
  badge?: string;
  badgeNote?: string;
  result?: string;
  note?: string;
  current?: boolean;
  points?: string[];
  tags?: string[];
  links?: { label: string; url: string }[];
  attraction?: AttractionKind;
  poster?: Poster;
}

export interface Station {
  id: string;
  kind: StationKind;
  zone: ZoneId;
  chapter: string;
  nav: string;
  label: string;
  title: string;
  subtitle: string;
  body: string;
  marquee: string;
  accent: string;
  /** Shot sequence across this station's slice. Falls back to `camera`. */
  shots?: CameraRig[];
  camera?: CameraRig;
  scroll: { enter: number; exit: number };
  items: StationItem[];
}

/** One camera setup and the slice of scroll it covers. */
export interface Shot {
  rig: CameraRig;
  stationId: string;
  from: number;
  to: number;
}

/**
 * The whole ride's shot list, flattened. Built once and walked by scroll
 * position, so a cut at a station boundary crossfades exactly like a cut
 * inside one.
 */
export function buildShotList(): Shot[] {
  const out: Shot[] = [];
  for (const s of stations) {
    const rigs = s.shots?.length ? s.shots : [s.camera ?? "onboard"];
    const span = (s.scroll.exit - s.scroll.enter) / rigs.length;
    rigs.forEach((rig, i) => {
      out.push({
        rig,
        stationId: s.id,
        from: s.scroll.enter + i * span,
        to: s.scroll.enter + (i + 1) * span,
      });
    });
  }
  return out;
}

export interface Content {
  meta: Meta;
  park: Park;
  theme: Record<string, string>;
  hero: Hero;
  stations: Station[];
}

export const content = raw as unknown as Content;
export const { meta, park, hero, stations, theme } = content;

/* ── derived ──────────────────────────────────────────────────────────────── */

/**
 * The poster for an item, derived when the author has not written one.
 *
 * Every item is allowed to carry a hoarding, but only the ones worth a billboard
 * need to spell it out — this keeps `park.json` editable without ceremony.
 */
export function posterOf(item: StationItem, station: Station): Poster {
  if (item.poster) return item.poster;
  return {
    kicker: station.marquee,
    headline: item.title.toUpperCase(),
    ride: item.subtitle?.toUpperCase() ?? item.org?.toUpperCase(),
    sub: item.badgeNote?.toUpperCase() ?? item.note?.toUpperCase(),
    stat: item.metric ?? item.result,
  };
}

/**
 * Items that get a full-size roadside hoarding.
 *
 * Requires an explicit `poster`, which is how an entry opts out of the 3D park
 * entirely: drop `poster` and `attraction` from an item and it lives in the
 * copy overlay only, with nothing built for it in the world.
 */
export function hoardingItems(station: Station) {
  return station.items.filter(
    (i) => i.poster && i.attraction !== "stall" && i.attraction !== "plinth",
  );
}

/** Scroll position that best frames a station's copy. */
export function stationAnchor(s: Station) {
  return s.scroll.enter + (s.scroll.exit - s.scroll.enter) * 0.45;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Station-local 0..1 position along its own slice of the timeline. */
export function stationT(p: number, s: Station) {
  return (p - s.scroll.enter) / (s.scroll.exit - s.scroll.enter || 1);
}

/**
 * 0 -> 1 -> 0 envelope across a station's scroll slice. The fade-out is held
 * off until the item column has finished drifting through its own overflow, so
 * the last lines of a long panel are always readable before it leaves.
 */
export function stationOpacity(p: number, s: Station) {
  const t = stationT(p, s);
  if (t < -0.12 || t > 1.05) return 0;
  const fadeIn = clamp01((t + 0.04) / 0.18);
  const fadeOut = clamp01((1.0 - t) / 0.15);
  // nothing competes with the landing plate
  const gate = clamp01((p - 0.028) / 0.032);
  return Math.min(fadeIn, fadeOut) * gate;
}

/** How far the item column has scrolled through its own overflow, 0..1. */
export function stationDrift(p: number, s: Station) {
  return clamp01((stationT(p, s) - 0.14) / 0.62);
}

/** The station covering a scroll position. Never returns undefined. */
export function stationAt(p: number) {
  return (
    stations.find((s) => p >= s.scroll.enter && p < s.scroll.exit) ??
    stations[stations.length - 1]
  );
}
