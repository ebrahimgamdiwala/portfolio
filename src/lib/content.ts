import raw from "@/data/portfolio.json";
import type { BiomeId } from "./world/layout";

/**
 * Typed view over `src/data/portfolio.json`.
 * The JSON is the single source of truth; this file only describes its shape.
 */

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
}

export interface Station {
  id: string;
  biome: BiomeId;
  kind: StationKind;
  chapter: string;
  nav: string;
  label: string;
  title: string;
  subtitle: string;
  body: string;
  weather: string;
  scroll: { enter: number; exit: number };
  items: StationItem[];
}

export interface Portfolio {
  meta: Meta;
  theme: Record<string, string>;
  hero: Hero;
  stations: Station[];
}

export const content = raw as unknown as Portfolio;
export const { meta, hero, stations, theme } = content;

/** Scroll position that best frames a station's copy. */
export function stationAnchor(s: Station) {
  return s.scroll.enter + (s.scroll.exit - s.scroll.enter) * 0.45;
}

/**
 * 0 -> 1 -> 0 envelope across a station's scroll slice, with a flat hold in
 * the middle so the copy is fully readable while the ride passes through.
 */
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Station-local 0..1 position along its own slice of the timeline. */
export function stationT(p: number, s: Station) {
  return (p - s.scroll.enter) / (s.scroll.exit - s.scroll.enter || 1);
}

/**
 * 0 -> 1 -> 0 envelope across a station's scroll slice. The fade-out is held
 * off until the item column has finished drifting through its own overflow,
 * so the last lines of a long panel are always readable before it leaves.
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
