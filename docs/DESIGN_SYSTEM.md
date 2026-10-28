# HALT Design System — Implementation Guide

The supplied package is canonical. This document says **how** it is carried into the Next.js app, not what it looks like; for the rules themselves read the originals, vendored verbatim at `assets/halt-package/02-design-system/` (`README.md`, `2-layout.md`, `3-graph.md`, `4-motion.md`, `5-handoff.md`).

## 1. Non-negotiables (from the package)

- Four colours. Ink `#0E1214` ground, Bone `#F1F0EA` structure/text/proof/primary action, **Ember `#D4572F` hostile only**, **Verdigris `#3E9C86` business only**. No other hue; warning and success add none.
- No shadows, no blur, no glass. Elevation = surface step + 1 px ring.
- Radius 4 px containers/controls, 2 px chips, circular only for graph nodes.
- 44 px hit targets; `focus-ring` on every interactive element, never removed.
- Form before colour: observed solid, forecast dotted 2 6, inferred dashed 6 4 neutral, held Ember 30 %, business 8 px continuous.
- Hostile line ≤ 3 px; business line never broken, dashed or paused.
- Every figure has a derivation; every simulated figure and the top bar say SIMULATED.
- Logo: use the supplied SVGs only. Never recolour, stretch, glow, outline, enclose in a shield/lock/circle. Mark animates only in the containment loop.
- Avoid: shields, hacker silhouettes, Matrix rain, AI brains, globes, particles, fake terminals, decorative charts, disconnected card grids.

Note: `tokens.json` and the package README describe the palette and fonts as provisional placeholders. Per the brief they are treated as canonical. If an approved replacement arrives, it changes `tokens.json` only.

## 2. Asset inventory and destination

| Supplied | Count | Destination | Use |
|---|---|---|---|
| `01-brand-assets/*.svg` | 10 | `apps/web/public/brand/` (copied byte-for-byte, checksum test) | Logo lockups, favicon cuts, wordmark |
| `01-brand-assets/*.png` (incl. `apple-touch-icon.png`, `icon-512-maskable.png`) + `favicon.ico` | 44 + 1 | `apps/web/public/brand/` + `app/icon.*` | Favicons, touch and PWA icons |
| `01-brand-assets/paths.json` | 1 | `apps/web/src/components/halt/HaltMark.tsx` (imported) | Mark geometry for the inline component |
| `02-design-system/tokens.json` | 1 | Source for generated `src/styles/tokens.css` + Tailwind theme | All values |
| `02-design-system/components/bundle.css` | 1 | `src/styles/halt-components.css` (font `@import` removed; fonts via `next/font`) | Component styling |
| `02-design-system/components/bundle.js` + `index.d.ts` | 17 components | Ported to TSX in `src/components/halt/` with identical props | See §4 |
| `02-design-system/components/lib/react*.js` | 2 | **Not used** (Next ships React) | — |
| `02-design-system/components/*/preview.html` | 22 | Reference for component tests (visual parity) | — |
| `02-design-system/tools/tools/*.py, render.js` | 5 | **Not used** — paths hardcoded to `/tmp` and `../site/vend` | Replaced by `scripts/build-tokens.mjs` |
| `03-product-boards-source/*.dc.html` | 18 | Reference only; they need a missing `support.js` canvas runtime | Screen layouts per system |
| `04-marketing-site/index.html` | 1 | Reference for landing sections, copy and scroll choreography | Ported into React sections |
| `05-command-center/index.html` + `source-parts/` | 1 + 15 | Reference for views, copy, state list; **data and hardcoded results discarded** | Ported into views |
| `06-3d-motion-system/halt-spec.js`, `halt-scene-a.js`, `halt-scene-b.js` | 3 | `apps/web/src/vendor/halt-3d/` verbatim + ESM shim | Landing hero 3D island |
| `06-3d-motion-system/halt-scene.js` | 1 | Not used (appears to be a + b concatenated) | — |
| `06-3d-motion-system/out/png|svg|glb` | 7 + 7 + 2 | `apps/web/public/3d/` | SVG posters = reduced-motion / no-WebGL fallback and OG image |
| `SentinelRoute shield emblem.png` (repo root, pre-existing) | 1 | Untouched, unused | Off-brand (shield imagery, old name) |

## 3. Token pipeline

`apps/web/scripts/build-tokens.mjs` reads `assets/halt-package/02-design-system/tokens.json` and writes:

- `src/styles/tokens.css`: `:root[data-theme="dark"]` (default) and `:root[data-theme="light"]` custom properties, resolving `{alias}` references; spacing, radius, border, z-index, durations, easings, layout sizes.
- `src/styles/tokens.ts`: typed constants for JS consumers (Cytoscape style, motion durations).
- `src/styles/tailwind-theme.css`: a Tailwind v4 `@theme inline` block that sets `--color-*: initial` (the default palette is gone) and exposes only HALT roles (`bg-surface`, `text-threat-text`, `border-business` …), radii, breakpoints, `font-ui` and `font-data`. Theme keys never reuse a token's variable name, so nothing refers to itself.

Guards: an ESLint rule (`no-restricted-syntax` on hex literals in `src/components/**` and `src/app/**`) plus a unit test that scans the same folders, CSS included (AT-7.2). Generated files are committed; `tests/unit/tokens.test.ts` fails if they are stale and recomputes contrast for both themes (AT-7.1).

`src/styles/halt-components.css` is `bundle.css` with only its Google Fonts `@import` removed. `scripts/copy-brand.mjs` copies the brand files, the 3D exports, the app icons and `paths.json` (as `src/components/halt/mark-paths.json`, so the Docker build has it); `tests/unit/brand.test.ts` checks every copy byte-for-byte (AT-7.4).

Fonts: Archivo (variable, wdth 100–125, wght 400–800) and IBM Plex Mono (400, 500) via `next/font/google`, exposed as `--font-sans` / `--font-mono`.

## 4. Component port

Each `window.HALT` component becomes a typed React component with the props in `index.d.ts`, the same class names as `bundle.css`, and a Vitest + Testing Library test that checks role, accessible name and the rule in the "Notes" column.

| Component | File | Test asserts |
|---|---|---|
| HaltMark | `halt/HaltMark.tsx` | uses `currentColor`; refuses `size < 24` |
| Button | `halt/Button.tsx` | disabled requires `reason`, rendered as text |
| Nav | `halt/Nav.tsx` | `aria-current` on active |
| Tabs | `halt/Tabs.tsx` | arrow-key navigation |
| StatusChip | `halt/StatusChip.tsx` | glyph + word for every kind |
| MetricBlock | `halt/MetricBlock.tsx` | `derivation` required; SIMULATED when `simulated` |
| EvidenceRow | `halt/EvidenceRow.tsx` | ID links to source; inferred styling |
| ConstraintIndicator | `halt/ConstraintIndicator.tsx` | met/binding/violated text |
| TimelineEvent | `halt/TimelineEvent.tsx` | kind → stroke form |
| ApprovalControl | `halt/ApprovalControl.tsx` | `aria-pressed`; impact/reversibility/authorisation present |
| Tooltip, Drawer, Dialog, Toast, Skeleton | `halt/*.tsx` | focus trap (Dialog), Escape, no shimmer |
| NodeGlyph, EdgeStroke | `halt/NodeGlyph.tsx`, `halt/EdgeStroke.tsx` | 10 kinds / 6 strokes render; legend parity with Cytoscape style |

## 5. Graph rendering (Cytoscape.js + overlay)

| Graph language | Cytoscape implementation |
|---|---|
| 10 node silhouettes | `shape` where native (ellipse, round-rectangle, diamond, hexagon, triangle, barrel for cylinder, round-tag for capsule); cross, pentagon-right and process base bar via `background-image` data-URI SVG generated from `NodeGlyph` |
| Observed / forecast / inferred / held node states | `border-style` solid / dashed / dashed (long) + classes; held = `opacity` + `.held` |
| Observed hostile edge | `line-style: solid; width: 3; line-color: var(--threat-observed)` resolved from tokens at init |
| Inferred | `dashed`, `line-dash-pattern: [6,4]`, width 1.5, neutral |
| Forecast | `dotted`, `line-dash-pattern: [2,6]`, width 2, `line-dash-offset` animated (march 1800 ms) |
| Business dependency | solid 2 px Verdigris, `source/target-arrow-shape: circle` hollow |
| Preserved business thread | drawn in the **SVG overlay** as an 8 px Verdigris path with a 3 s pulse, so it is never broken by Cytoscape redraws |
| Blocked path, proof ring in the gap, downstream 30 % | overlay draws ring at 0.22 × edge length from the cut point; Cytoscape edge split into `.upstream` + `.held` |
| Focus dimming 14 % | `.dimmed { opacity: .14 }` on non-focused paths; never `display: none` |
| Text equivalent | `<GraphA11y>` renders the six-path table + evidence chain and an `aria-live` state summary |

Layout uses `preset` coordinates from `GraphNode.layout`; no force layout (determinism, and the cut point must not move).

## 6. Motion

Durations and easings come from `tokens.ts` (`duration-approach` 2200, `-evidence` 240, `-expand` 480/60 stagger, `-cut` 900, `-proof` 600, `-switch` 360, `-approval` 240, `-march` 1800, `-pulse` 3000, `-loop` 8000). Every animation is authored from-state → end-state; `prefers-reduced-motion` and the in-app motion toggle render end states. The cut never animates before the Gate reports `applied`.

## 7. Layout

- Command Center: rail 232 px · top bar 64 px · main 12 columns · evidence rail (inspector) 360 px · replay timeline bottom. Graph ≥ 8 of 12 main columns on every system view.
- Breakpoints 640 / 960 / 1280 / 1600 per `2-layout.md`; at < 640 the rail becomes a bottom bar and the evidence rail a full-screen sheet.
- No panel may cover the cut point or the business thread; dialogs dim via `scrim` but never hide it.

## 8. Screens

| Nav item | View component | Board reference |
|---|---|---|
| Incident Overview | `views/OverviewView.tsx` | `Incident.dc.html` |
| ThreadGraph | `views/ThreadGraphView.tsx` | `ThreadScreen.dc.html`, `ThreadGraph.dc.html` |
| EchoLab | `views/EchoLabView.tsx` | `EchoLab.dc.html` |
| SafeCut | `views/SafeCutView.tsx` | `SafeCut.dc.html` |
| ProofSeal | `views/ProofSealView.tsx` | `ProofSeal.dc.html` |
| Timeline | `views/TimelineView.tsx` | prototype `p7_views2.js` |
| Policies | `views/PoliciesView.tsx` | prototype policies view |
| (drawer) Action Gate | `gate/ActionGateDrawer.tsx` | `ActionGate.dc.html` |

## 9. Accessibility

axe-core in Playwright on every view (0 serious/critical). Text 4.5:1, marks 3:1 in both themes (contrast already validated in the token set; a unit test recomputes it from `tokens.json`). Keyboard: every action reachable, focus visible, Dialog traps focus, Drawer does not.
