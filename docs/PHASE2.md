# Phase 2 — Closeout & Decisions

_2026-06-06 · tsc clean + vite build green (2471 modules)._

## Delivered
- **3D interactive knowledge graph** (React Three Fiber / Three.js) replacing the
  flat 2D canvas in Mission Control. Files under `src/components/left/graph3d/`:
  - `layout.ts` — community-layered 3D layout (x,y from 2D positions; z by
    community so it reads as a neural-net topology with real depth).
  - `Graph3D.tsx` — `Canvas` + `OrbitControls` (orbit/pan/zoom), click-to-focus
    wired to the existing `NodeDetailsPanel`, click-empty to deselect.
  - `Edges3D.tsx` — all relationships as one `lineSegments` buffer (cheap).
  - `Node3D.tsx` — cards-as-nodes with **screen-space LOD**.
- **Stack added:** three ^0.171, @react-three/fiber 9.6, @react-three/drei 10.7.

## LOD ladder (live)
Per-node tier from projected on-screen pixels (via `useFrame`), thresholds from
`systemConfig.lod`:
- >= 140px (or selected) -> **full readable dossier card** (DOM via drei `Html`).
- 40-140px -> **small label chip**.
- < 40px -> **dot** (cheap `meshBasicMaterial` sphere).
Tier only re-renders on change (not every frame). Offline-safe: cards/labels are
DOM, no CDN fonts.

## Decisions
1. **Depth axis = community layer** (reuses Phase 1 `detectCommunities`); becomes
   GraphRAG communities at Phase 3.
2. **Offline-first rendering:** DOM cards via `Html` instead of WebGL SDF text
   (which would fetch a CDN font). No network dependency.
3. **Old 2D `GraphCanvas.tsx` left in place** (unused) as a fallback reference;
   not imported.

## Deferred / refine with visual feedback
- **4th LOD tier (community collapse):** far communities collapsing into a single
  cluster node. Communities are computed; the collapse needs on-screen tuning, so
  it lands once we can see it run.
- **Bundle size:** three.js pushes the main chunk to ~1.3 MB. Fine for desktop;
  consider code-splitting the 3D view in Phase 6 polish.
- **LOD thresholds + layout spacing**: tune by eye on the running app.

## Exit criteria — met
- 3D graph renders the persisted KG with working card/label/dot LOD. ✅
- Orbit/pan/zoom + click-to-focus inspect. ✅
- Typechecks and builds. ✅

**Next:** Phase 3 (Python sidecar + A2A + Rust supervision).
