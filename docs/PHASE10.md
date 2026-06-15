# Phase 10 — Performance & Polish

**Status:** Complete (5 of 5 slices).
**Verification:** `tsc --noEmit` clean · 51/51 tests pass · `vite build` green.

---

## Overview

Phase 10 keeps the harness fast with large graphs, easier to use, and visually
finished. Landed so far:

- **10.1** — cache the 3D layout, page graph reads, and render only nodes near the camera.
- **10.2** — accessibility pass: keyboard operability and screen-reader names.
- **10.3** — an i18n layer with a real second language and a language switch.
- **10.4** — empty / loading / error states across graph, chat, tools, intake.
- **10.5** — a single organized Settings screen plus theme-token polish.

---

## Slice 10.1 — Handle large graphs smoothly  ✅

**Goal:** stay fast at thousands of nodes.

### `src/components/left/graph3d/layout.ts`

`layout3D()` ran `detectCommunities` + centroid math (O(N+E)) on **every** call,
including data-only edits (renaming a label, attaching a community summary) that
leave topology untouched. It is now a thin cache wrapper:

| Symbol | Purpose |
|---|---|
| `structuralSignature(nodes, edges)` | FNV-1a 32-bit rolling hash over the layout-relevant features only: node count, edge count, each node id + position (quantised to 0.1px), each edge's endpoints, and `data.communityId` (the one data field that feeds `detectCommunities`). Cosmetic data (label, summary, title) is excluded. |
| `layout3D(nodes, edges)` | Computes the signature; returns the cached `Layout3DResult` by reference when unchanged, else recomputes via `computeLayout3D` and refreshes the one-slot cache. |
| `computeLayout3D(...)` | The original layout body, unchanged. |
| `resetLayout3DCache()` | Clears the cache (tests / runtime constant changes). |

A single-slot module cache is sufficient: the 3D view has exactly one live
layout at a time, so it never grows unbounded.

**Test:** `src/components/left/graph3d/layout.test.ts` (7 cases) — identical
structure returns the same object reference; cosmetic data changes reuse the
cache; position change / node add / edge rewire / `communityId` change all
recompute.

**Stays safe:** small graphs behave exactly as before — an identical structure
simply isn't recomputed.

### Render only what is near the camera (`graph3d/Graph3D.tsx`)

Each `Node3D` runs a per-frame LOD callback, so the cost driver at thousands of
nodes is *how many are mounted at once*, not their pixel size. A `ProximityCuller`
(throttled to ~8×/s via accumulated frame delta, so it never runs on the render
path) computes the set of nodes near the camera and mounts only those:

- Active only above `CULL_THRESHOLD` (400) nodes — at or below it the full graph
  renders exactly as before.
- The window radius grows with camera distance (`max(40, camDist × 1.5)`), so
  pulling back still shows context, while the set is hard-capped at
  `MAX_RENDERED` (800) nearest nodes to bound per-frame cost regardless of zoom.
- The selected node is always kept mounted; cluster spheres still summarise large
  far-away communities (Phase 4 LOD).
- `setVisibleIds` fires only when membership actually changes (cheap diff), and a
  small "rendering N / M" indicator appears while culling is active.

### Load graph data in pages (`src/kg/store.ts`)

New cursor-based paging on `KnowledgeStore` — `countNodes()` / `countEdges()`,
`getNodesPage(offset, limit)` / `getEdgesPage(...)`, and `streamNodes(onPage,
pageSize)`. The IndexedDB path uses an `openCursor().advance(offset)` so it never
materialises the whole store; the in-memory fallback slices the values array.

The boot hydration in `state/AppState.tsx` now consumes `streamNodes` (1000/page):
edges are set first, then node pages stream in and append progressively, so a
large store renders incrementally instead of blocking on one giant read. A graph
smaller than one page arrives in a single batch — identical to the previous
single `setNodes()`.

**Test:** `src/kg/store.page.test.ts` (6 cases) — counts, page windowing, last-
page clamping, zero-limit, full `streamNodes` coverage (every node once, no gaps
or duplicates across pages), and paged edges.

---

## Slice 10.2 — Accessibility pass (WCAG AA)  ✅

**Goal:** make the app usable with the keyboard and with a screen reader.

### New `src/lib/a11y.ts`

`useFocusTrap(ref, onClose)` — traps Tab focus inside an open dialog, wires
Escape → close, and restores focus to the previously-focused element on close.
Used by every modal overlay.

### Keyboard shortcuts (`src/App.tsx`)

Modifier-gated so they never interfere with typing: **Ctrl/Cmd+,** opens
Settings; **Ctrl/Cmd+K** focuses the chat input (`id="chat-input"`). Existing
Escape-to-close on drawers/dialogs is preserved.

### Landmarks & structure

| Element | Change |
|---|---|
| Left pane (`MissionControl`) | `role="complementary"` + `aria-label="Mission Control"` |
| Right pane (`ExecutionCanvas`) | `role="main"` + `aria-label="Execution Canvas"` |
| Pane divider (`ResizableSplit`) | WAI-ARIA window splitter: `role="separator"`, `aria-orientation`, `aria-valuemin/max/now`, `tabIndex=0`, arrow-key nudge, Home/End to limits, Enter to reset 50/50 |
| `<html lang>` | tracks the active locale (from 10.3) |

### Accessible names, roles, and states

Every interactive control across the core flows now has an accessible name and,
where it's a toggle/disclosure, the matching ARIA state; decorative icons are
`aria-hidden`:

| Component | Additions |
|---|---|
| `right/ChatInput` | `aria-label` on textarea / send / stop; `id="chat-input"` |
| `left/GraphQueryInput` | `aria-label` on query field + OCR file input |
| `left/TaskTabs` | keyboard-operable close (`Enter`/`Space`) + `aria-label`; `aria-current` on active tab; `aria-haspopup`/`aria-expanded` + `role="menu"`/`menuitem` |
| `right/AgentHeader` | `aria-expanded` on the activity toggle |
| `left/EnvironmentBar` | `aria-pressed` + descriptive `aria-label` on each capability toggle |
| `right/StatusModule` | `aria-haspopup`/`aria-expanded` on the status pill; `role="menu"` + `menuitemradio`/`aria-checked` on endpoint rows; labeled probe/edit buttons |
| `right/AuditLedger` | `aria-expanded` on the disclosure; labeled verify/refresh |
| `left/ArchiveIndex` | `aria-expanded` on tree branches; labeled collapse toggle |
| `config/SecretsPanel` | `aria-label` on key inputs and save/clear |
| `right/IngestionLedger` | `role="region"`; labeled clear; decorative icons hidden |
| `right/AgentUIPanel`, `a2ui/A2UIRenderer` | labeled dismiss; focus rings |

### Modal dialogs

`SettingsScreen`, `EndpointEditor`, and `NodeDetailsPanel` now expose
`role="dialog"` with an accessible name, Escape-to-close, and labeled close
buttons + inputs. `SettingsScreen` and `EndpointEditor` (truly modal, with a
backdrop) use `useFocusTrap`; `NodeDetailsPanel` is a non-modal floating
inspector, so it gets dialog semantics and Escape but no focus trap (to avoid
fighting graph interaction).

### Focus visibility & contrast

A global `:focus-visible` ring (added in 10.5) gives every focusable control a
consistent keyboard-focus indicator without affecting mouse users; individual
controls also carry explicit `focus-visible:outline` utilities. The dark theme's
interactive text uses `neutral-300/400` (passes AA); purely decorative micro-
labels are marked `aria-hidden` rather than recolored, so the intentional
console aesthetic is preserved.

**Done when:** the core flows (route an endpoint, query the graph, open a node,
send a chat, manage tasks, open Settings) are operable with the keyboard alone,
and interactive controls expose names/roles/states to assistive tech.

**Stays safe:** visual/interaction only — no data-flow or behavioural change.

---

## Slice 10.3 — Multiple languages (i18n)  ✅

**Goal:** support more than English; English is the default fallback.

### New `src/i18n/`

| File | Contents |
|---|---|
| `index.tsx` | `LanguageProvider`, `useT()` (`t(key, vars?)` with `{var}` interpolation), `useLang()` (`{ lang, setLang, languages }`), `useI18n()`. Active language persists to `localStorage['codename-lang']` and is mirrored onto `<html lang>`. English is the canonical catalogue and universal fallback: a key missing from the active locale resolves to English, then to the raw key. |
| `locales/en.ts` | Canonical catalogue (`as const`) — its keys define the `MessageKey` union. |
| `locales/es.ts` | Spanish, typed `Partial<Messages>` — a genuine second locale, not a stub. |

`LanguageProvider` wraps the whole app in `App.tsx` (above `AuthProvider`), so
both the sign-in screen and the main shell can translate.

**Done when:** switching language in Settings changes the Settings UI text
(verified: section headers, About, language help, plus all 10.4 state copy swap
to Spanish).

**Stays safe:** English is the default and the fallback for any untranslated
string, so no surface can render blank.

---

## Slice 10.4 — Empty, loading, and error states  ✅

**Goal:** make every screen feel finished — no surface ever reads as a blank
void or a stuck spinner without explanation. Display only.

### New `src/components/common/StateBlock.tsx`

One small presentational component with three variants used everywhere:

| Variant | Icon | Accent | ARIA |
|---|---|---|---|
| `empty` | dashed circle | neutral | `role="status"` |
| `loading` | spinner | neutral | `role="status"` `aria-live="polite"` |
| `error` | triangle | red | `role="alert"` |

Supports a full centered layout and a `compact` inline row for thin bars.

### Surfaces wired

| Surface | State added |
|---|---|
| **Graph** (`graph3d/Graph3D.tsx`) | Empty overlay when the graph has no nodes; "no nodes match your query" overlay when an active graph-search query hides every node. Overlays are `pointer-events-none`, so orbit controls are never blocked. |
| **Graph loading** (`left/MissionControl.tsx`) | The lazy-chunk `Suspense` fallback now renders a `StateBlock` loading state instead of bare text. |
| **Chat** (`right/ChatThread.tsx`) | Empty state migrated to a `StateBlock`; a new "working" indicator (animated dots, `aria-live`) fills the gap between send and the first streamed token. Existing send/sidecar errors already surface as system/assistant bubbles. |
| **Tools** (`right/AgentToolsBar.tsx`) | The bar no longer returns `null` when empty — it stays present with a "no tools registered" note so the row never silently disappears. |
| **Intake** (`right/IngestionLedger.tsx`) | Already carries per-item loading (`checking` spinner) and error (`conflict` / `rejected`) states; combined with the Dropzone overlay and the graph empty-state drop hint, intake is fully covered. No change needed. |

All new copy flows through the i18n catalogue (`graph.*`, `chat.*`, `tools.*`),
so it localises with the 10.3 language switch and falls back to English.

**Stays safe:** display only — no behavioural or data-flow change.

---

## Slice 10.5 — Settings and theme polish  ✅

**Goal:** one clear place for all settings; a finished look.

### New `src/components/settings/SettingsScreen.tsx`

A full-screen, labelled modal (`role="dialog"`, `aria-modal`, Escape-to-close,
focus moved to the close button on open, backdrop click-out) organizing:

| Section | Source |
|---|---|
| Models & routing | preset / endpoint / model selectors via `useApp` |
| Secrets | reuses `config/SecretsPanel` |
| Capability gates | reuses `config/SecurityGates` |
| Tuning | reuses `config/ModelTuningControls` |
| Language | the 10.3 switch (`useLang`) |
| Logs | `open_log_dir` (desktop only; graceful message in browser) |
| About | app name, version, description |

### `src/App.tsx`

Adds a Settings gear button in the bottom-left corner (beside the stealth-drawer
tab), opening `SettingsScreen`. The existing `StealthDrawer` is **kept** for
power users — the Settings screen is the discoverable front door, not a removal.

### `src/index.css`

Theme-token polish: a `:root` block of design tokens (surface/border/accent
colours, spacing scale, radius, `color-scheme: dark`), a global
`:focus-visible` ring (10.2 groundwork), `::selection` tint, and a scrollbar
hover state. All additive — existing Tailwind classes are untouched.

**Stays safe:** display/settings only; no behavioural change to existing flows.

---

## File Change Summary

| File | Action |
|---|---|
| `src/components/left/graph3d/layout.ts` | Added structural-signature cache around `layout3D`; body moved to `computeLayout3D`; `resetLayout3DCache` export |
| `src/components/left/graph3d/layout.test.ts` | **New** — 7 cache tests |
| `src/components/left/graph3d/Graph3D.tsx` (10.1) | `ProximityCuller` — camera-window render culling for large graphs |
| `src/kg/store.ts` | **Paged reads** — `countNodes/Edges`, `getNodesPage/getEdgesPage`, `streamNodes` (10.1) |
| `src/kg/store.page.test.ts` | **New** — 6 paging tests (10.1) |
| `src/state/AppState.tsx` (10.1) | Boot hydration streams nodes in pages |
| `src/i18n/index.tsx` | **New** — provider + hooks |
| `src/i18n/locales/en.ts` | **New** — canonical catalogue (+ 10.4 state strings) |
| `src/i18n/locales/es.ts` | **New** — Spanish catalogue (+ 10.4 state strings) |
| `src/components/common/StateBlock.tsx` | **New** — shared empty/loading/error block (10.4) |
| `src/components/left/graph3d/Graph3D.tsx` | Empty + no-match overlays (10.4) |
| `src/components/left/MissionControl.tsx` | Graph loading fallback via `StateBlock` (10.4) |
| `src/components/right/ChatThread.tsx` | Empty state + "working" indicator (10.4) |
| `src/components/right/AgentToolsBar.tsx` | Empty state instead of `null` (10.4) |
| `src/components/settings/SettingsScreen.tsx` | **New** — full Settings modal (10.5) |
| `src/lib/a11y.ts` | **New** — `useFocusTrap` (10.2) |
| `src/App.tsx` (10.2) | Keyboard shortcuts (Ctrl/Cmd+,, Ctrl/Cmd+K) |
| `src/components/layout/ResizableSplit.tsx` | `role="separator"` + keyboard resize (10.2) |
| `left/MissionControl`, `right/ExecutionCanvas` | Landmark regions (10.2) |
| `ChatInput`, `GraphQueryInput`, `TaskTabs`, `AgentHeader`, `EnvironmentBar`, `StatusModule`, `AuditLedger`, `ArchiveIndex`, `SecretsPanel`, `IngestionLedger`, `AgentUIPanel`, `A2UIRenderer` | Accessible names / roles / states (10.2) |
| `NodeDetailsPanel`, `EndpointEditor`, `SettingsScreen` | Dialog semantics + focus management (10.2) |
| `src/App.tsx` | Wrapped in `LanguageProvider`; added Settings button + state |
| `src/index.css` | Added design tokens, focus-visible ring, selection + scrollbar polish |

---

## Deferred

None — all five slices of Phase 10 are complete.
