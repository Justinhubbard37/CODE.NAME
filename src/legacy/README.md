# Legacy (reference only — not used by the app)

These files are kept for reference and are **not imported anywhere** in the
running application:

- `GraphCanvas.tsx` — the original flat 2D knowledge-graph view (React Flow).
- `CustomNodes.tsx` — the 2D node card renderers used by `GraphCanvas`.

The live knowledge graph is the **3D** one in
`src/components/left/graph3d/` (rendered by `MissionControl`).

They remain only as a quick reference/fallback while the 3D graph matures.
They can be deleted at any time with no effect on the app.
