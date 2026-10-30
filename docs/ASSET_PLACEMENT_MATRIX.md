# Asset Placement Matrix (UI v2)

Branch `frontend-rebirth/god-mode`. Stage 0 audit, written on 2026-10-30 before any UI v2 code.

## Inputs found, and inputs that were not

| Referenced in the brief | Found | Used as |
|---|---|---|
| `design-source/claude-design/` | **Not present** in the repository | The supplied package's design canvases (`assets/halt-package/03-product-boards-source/*.dc.html`), its Command Center prototype (`05-command-center/`) and its marketing site (`04-marketing-site/`) are the Claude Design output. They are the wireframe, route map and content inventory only |
| `design-source/references/current-ui-antireference.png` | **Not present** | The anti-reference is the v1 Command Center as built at `d98c0ff`, described in the brief (tiny type, raw ids first, table-first, IDE-style rail, media-player timeline). Screenshots of v1 are captured under `artifacts/ui-v2/before/` for comparison |
| `design-source/brand/`, `3d/`, `motion/` | **Not present** | `assets/halt-package/01-brand-assets`, `02-design-system`, `06-3d-motion-system` (identical to `halt-full-package/`, an untracked duplicate extraction that is ignored) |
| `public/`, `assets/` | Present | Inventoried below |
| `design/`, `models/`, `textures/`, `fonts/` | **Not present** | Fonts are Archivo and IBM Plex Mono via `next/font` (Google). The package supplies no textures; environmental depth is built from the palette (see `UI_V2_SPEC.md` §3) |

No critical input is missing: the logo, palette, typography, motion spec, graph language, 3D core and its fallbacks are all supplied. The redesign proceeds.

## Classification

**Columns.** Classes: hero · transition · product interface · graph element · environmental texture · motion element · presentation · unused. "Perf." is the performance strategy; "Fallback" is what shows when the asset cannot.

### Brand (`assets/halt-package/01-brand-assets` → `apps/web/public/brand`)

| Asset | Class | Where | Purpose | Perf. | Fallback | Responsive |
|---|---|---|---|---|---|---|
| `halt-horizontal-bone.svg` | product interface | Command bar, platform bar, landing bar, report header | Primary lockup on Ink | Inline `<img>`, 2 KB, `priority` | Wordmark text "HALT" (alt) | 112 px wide; never below 100 px (brand rule) |
| `halt-horizontal-ink.svg` | presentation | Report (print, light paper) | Lockup on Bone | Loaded only on print and the light theme | alt text | 112 px |
| `halt-icon-bone.svg` | product interface | Collapsed rail (< 960 px), theatre corner mark | Mark alone where the lockup does not fit | 1 KB | alt text | 28 px |
| `halt-stacked-bone.svg` | hero | Landing hero, centred over the 3D core | Hero identity moment | 2 KB, eager | alt text | 160 px; 112 px below 640 px |
| `paths.json` | motif source | `HaltMark` component; geometry of the **Containment Aperture** motif | The aperture is cut from the mark's own crossbar geometry, so the motif is derived from the identity | Imported once (bundled) | — | Vector |
| `favicon.ico`, `halt-favicon-*`, `apple-touch-icon.png`, `icon-512-maskable.png` | product interface | Browser tab, home screen | Identity outside the page | Static | — | — |
| `halt-*-ink/bone-{16..1024}.png` (raster exports of the SVGs) | unused | — | — | — | — | Reason: the SVG originals serve every size crisply |
| `halt-wordmark-*.svg` | unused | — | — | — | — | Reason: the brand forbids retyping or separating the wordmark from the lockup in product chrome |

### Design system (`02-design-system`)

| Asset | Class | Where | Purpose |
|---|---|---|---|
| `tokens.json` | product interface | `scripts/build-tokens.mjs` → `tokens.css`, `tailwind-theme.css`, `tokens.ts` | Single colour, type, motion and size source. UI v2 adds **semantic aliases only** (`styles/v2.css`) and no new hues |
| `components/bundle.css` | product interface | `styles/halt-components.css` (17 ported components) | Buttons, chips, approval control, drawer, dialog, toast, skeleton. Re-skinned for v2 by tokens, not replaced |
| `2-layout.md`, `3-graph.md`, `4-motion.md`, `5-handoff.md`, `README.md` | rules | Binding for every pass | Edge forms, elevation without shadows, motion durations, brand don'ts |
| `components/*/preview.html`, `lib/react*.js`, `index.d.ts`, `design-system.json`, `tools/` | unused | — | Reason: previews and tooling; the components are already ported to TSX |

### Product boards and prototypes (Claude Design output: wireframe only)

| Asset | Class | Used as |
|---|---|---|
| `03-product-boards-source/{Main,Incident,ThreadGraph,ThreadScreen,EchoLab,SafeCut,ProofSeal,ActionGate,AppRail,AppTopbar}.dc.html` | reference | Information architecture and per-screen content inventory (`DESIGN_IMPLEMENTATION_MAP.md`) |
| `03-product-boards-source/{Core,Graph,Motion,Rules,Foundations,Lockups,Exports,Spec}.dc.html`, `canvas.json` | reference | Motif and motion vocabulary (`UI_V2_SPEC.md` §4–5) |
| `04-marketing-site/index.html` | reference | Narrative order of the landing (seven beats), kept and extended to the brief's nine |
| `05-command-center/index.html`, `source-parts/` | reference | Approval → execute → rollback flow; the state machine is already served by the Action Gate API |
| `*.js` screenshot and test scripts | unused | Reason: tooling for the prototypes |

### 3D and motion (`06-3d-motion-system` → `apps/web/public/3d`, `public/vendor`)

| Asset | Class | Where | Purpose | Perf. | Fallback | Responsive |
|---|---|---|---|---|---|---|
| `halt-spec.js`, `halt-scene-a.js`, `halt-scene-b.js` + three.js r128 | hero, transition | Landing (fixed layer behind the narrative), Theatre (stage backdrop) | **HALT Core**: one procedural scene with seven states (dormant → verified), driven by the replay and analysis state | Loaded after first paint (`requestIdleCallback`), one WebGL context, paused when off-screen, DPR capped at 1.5 (quality tier), not mounted below 640 px | The matching `halt-fallback-*.svg` poster | Desktop: live; < 640 px or `prefers-reduced-motion`: poster |
| `out/svg/halt-fallback-{dormant,intrusion,reconstruction,business,futures,contained,verified}.svg` | hero, transition (fallback) | Same places, as posters; also the Mission Control "readiness" illustration (`contained` / `verified`) | Static state art, 2–10 KB each | Inline `<img>` | alt text | Scales to container |
| `out/png/halt-core-*.png` (7) | presentation | Report cover image (state at time of the report) and Open Graph image | Raster for print and social | Lazy, 52–129 KB | SVG poster | Print width |
| `out/glb/halt-core.glb` (73 KB), `halt-node-kit.glb` (221 KB) | unused | — | — | — | — | Reason: the procedural scene renders the same core without a GLTF loader (three r128 has none bundled, and adding one would add a dependency for no visual gain). Kept in `public/3d/glb` for a later WebGL graph |
| `halt-3d.html`, `preview.js`, `build.py`, `export-assets.mjs`, `head.html`, `halt-scene.js`, `*test.js` | unused | — | — | — | — | Reason: preview and build tooling; `halt-scene.js` is a + b concatenated |

### Assets the brief asks for that the package does not supply

| Wanted | Decision |
|---|---|
| Environmental texture | Built from palette tones: radial falloff from `surface-raised` to `bg`, plus a 1 px lattice drawn in `line` at 6 % (the **Thread Lattice** motif as backdrop). No bitmap texture, no blur |
| Video | None supplied. The motion is the product's own SVG, Cytoscape and three.js, driven by real state |
| Icons | None supplied beyond `NodeGlyph` (ten entity silhouettes). Navigation icons are drawn on the same 24-unit grid and 2.5 stroke as `NodeGlyph`, from the same shape vocabulary |
