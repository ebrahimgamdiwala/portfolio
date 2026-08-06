# Ebrahim Gamdiwala — Portfolio

A scroll-driven roller-coaster ride across a procedurally generated floating voxel island.
The landing page opens on a high orbit over the whole world; scrolling puts you on the rails
and carries you through the biomes that tell the story — plains, jungle, city, desert,
caldera, summit — then loops back to the start.

**Next.js 15 · React 19 · three.js / @react-three/fiber · Tailwind · Lenis · Framer Motion**

```bash
npm install
npm run dev      # http://localhost:3000
```

## Branches

| branch | vibe |
| --- | --- |
| `biome` | floating voxel island — biome-per-chapter (this one) |
| _planned_ | amusement park |

Each branch is a self-contained take on the same content. `src/data/portfolio.json` is
intended to stay compatible across them.

## Editing content

Everything you'd normally change lives in **one file**: [`src/data/portfolio.json`](src/data/portfolio.json).

- `meta` — name, role, contact, socials, résumé path
- `hero` — landing copy and headline stats
- `stations[]` — the ride, in order

Each station owns a slice of the scroll timeline and is pinned to a biome:

```jsonc
{
  "id": "projects",
  "biome": "jungle",          // a biome in src/lib/world/layout.ts
  "kind": "projects",         // picks the renderer in StationContent.tsx
  "scroll": { "enter": 0.24, "exit": 0.44 },   // 0 = top of page, 1 = bottom
  "items": [ /* cards */ ]
}
```

`scroll` is the only coupling between copy and camera — the spline re-times itself so each
station's track anchor lands inside its own slice. Ranges should be contiguous and cover 0 → 1.

`kind` selects the renderer: `intro`, `education`, `experience`, `projects`, `skills`,
`awards`, `contact`.

## Changing the world

| What | Where |
| --- | --- |
| Biome positions, elevation, colours, sky | `src/lib/world/layout.ts` |
| Rivers, lava, volcano, mesas | `src/lib/world/layout.ts` |
| Palette | `src/lib/world/palette.ts` |
| Heightfield, water, cliffs | `src/lib/world/terrain.ts` |
| Trees, buildings, wildlife, clouds | `src/lib/world/scatter.ts` |
| Coaster spline & station anchors | `src/lib/world/track.ts` |
| Dawn → night lighting | `src/lib/world/sky.ts` |
| Scroll timing & lap wrap | `src/lib/scroll/timeline.ts` |

The world is deterministic — one seed (`WORLD.seed`) rebuilds the same island every time, so
nothing drifts between server and client. Change the seed to reroll the terrain noise while
keeping the layout.

## Notes

- ~30k voxel columns drawn in roughly a dozen `InstancedMesh` calls with per-instance colour.
- Water, lava and waterfalls animate in patched vertex shaders; weather is GPU-only point fields.
- Nothing scroll-linked goes through React state — `ScrollProvider` exposes refs that both the
  canvas and the DOM overlay read inside their own animation frames.
- `src/lib/scroll/timeline.ts` has no imports on purpose: it sits on the boundary between the
  main bundle and the lazily-loaded renderer.
