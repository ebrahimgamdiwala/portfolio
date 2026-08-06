"use client";

import { meta, type Station, type StationItem } from "@/lib/content";

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/65 backdrop-blur-sm">
    {children}
  </span>
);

const Bullets = ({ points }: { points?: string[] }) =>
  points?.length ? (
    <ul className="mt-3 space-y-2">
      {points.map((p) => (
        <li key={p} className="flex gap-3 text-[13.5px] leading-relaxed text-white/62">
          <span className="mt-[9px] h-px w-3 shrink-0 bg-white/30" />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  ) : null;

const Tags = ({ tags }: { tags?: string[] }) =>
  tags?.length ? (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <Tag key={t}>{t}</Tag>
      ))}
    </div>
  ) : null;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l border-white/12 pl-5 transition-colors duration-500 hover:border-white/40">
      {children}
    </div>
  );
}

function Row({ item }: { item: StationItem }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[17px] font-medium tracking-tight text-white">
          {item.title}
          {item.current && (
            <span className="ml-2.5 inline-flex items-center gap-1.5 align-middle font-mono text-[9px] uppercase tracking-widest2 text-emerald-300/90">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              now
            </span>
          )}
        </h3>
        {item.period && (
          <span className="font-mono text-[10px] uppercase tracking-widest2 text-white/35">
            {item.period}
          </span>
        )}
      </div>

      {(item.org || item.subtitle || item.place) && (
        <p className="mt-1 text-[13px] text-white/50">
          {[item.org, item.subtitle, item.place].filter(Boolean).join(" · ")}
        </p>
      )}

      {item.badge && (
        <p className="mt-3 inline-block border-l-2 border-amber-300/60 pl-3 text-[12.5px] leading-snug text-amber-100/85">
          {item.badge}
          {item.badgeNote && (
            <span className="block font-mono text-[10px] uppercase tracking-widest2 text-amber-200/50">
              {item.badgeNote}
            </span>
          )}
        </p>
      )}

      {item.metric && (
        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-medium tracking-tight text-white">{item.metric}</span>
          {item.metricNote && (
            <span className="font-mono text-[10px] uppercase tracking-widest2 text-white/40">
              {item.metricNote}
            </span>
          )}
        </p>
      )}

      <Bullets points={item.points} />
      <Tags tags={item.tags} />
    </Card>
  );
}

function SkillGroup({ item }: { item: StationItem }) {
  return (
    <div>
      <h3 className="font-mono text-[10px] uppercase tracking-widest2 text-white/40">
        {item.title}
      </h3>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {item.tags?.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>
    </div>
  );
}

function AwardRow({ item }: { item: StationItem }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="text-[15.5px] font-medium tracking-tight text-white">{item.title}</h3>
        <span className="font-mono text-[10px] uppercase tracking-widest2 text-amber-200/85">
          {item.result}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-white/45">
        {[item.note, item.org].filter(Boolean).join(" · ")}
      </p>
    </Card>
  );
}

function Contact() {
  return (
    <div className="space-y-8">
      <a
        href={`mailto:${meta.email}`}
        className="group inline-block text-[clamp(1.4rem,3.4vw,2.4rem)] font-medium leading-tight tracking-tight text-white"
      >
        {meta.email}
        <span className="block h-px w-0 bg-white transition-[width] duration-700 ease-out group-hover:w-full" />
      </a>

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {meta.socials.map((s) => (
          <a
            key={s.label}
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group font-mono text-[11px] uppercase tracking-widest2 text-white/50 transition-colors hover:text-white"
          >
            {s.label}
            <span className="ml-1.5 inline-block transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
              ↗
            </span>
          </a>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-widest2 text-white/35">
        <span>{meta.location}</span>
        <span>{meta.phone}</span>
        <span className="text-emerald-300/70">{meta.availability}</span>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="space-y-6">
      <p className="max-w-lg text-[15px] leading-relaxed text-white/65">{meta.intro}</p>
      <div className="flex flex-wrap gap-x-7 gap-y-2">
        {meta.socials.slice(0, 3).map((s) => (
          <a
            key={s.label}
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group font-mono text-[11px] uppercase tracking-widest2 text-white/45 transition-colors hover:text-white"
          >
            {s.label}
            <span className="block h-px w-0 bg-white transition-[width] duration-500 group-hover:w-full" />
          </a>
        ))}
      </div>
    </div>
  );
}

/** Renders a station's payload according to its `kind`. */
export function StationContent({ station }: { station: Station }) {
  switch (station.kind) {
    case "intro":
      return <Intro />;
    case "contact":
      return <Contact />;
    case "skills":
      return (
        <div className="grid gap-6 sm:grid-cols-2">
          {station.items.map((i) => (
            <SkillGroup key={i.title} item={i} />
          ))}
        </div>
      );
    case "awards":
      return (
        <div className="space-y-5">
          {station.items.map((i) => (
            <AwardRow key={i.title} item={i} />
          ))}
        </div>
      );
    default:
      return (
        <div className="space-y-7">
          {station.items.map((i) => (
            <Row key={i.title} item={i} />
          ))}
        </div>
      );
  }
}
