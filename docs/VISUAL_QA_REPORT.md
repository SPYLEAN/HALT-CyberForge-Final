# Visual QA report: UI v2

Branch `frontend-rebirth/god-mode`. Every screenshot is of the running product driven into a known state
through the real API (`reset-to-seed → correlate → plan → simulate → seal`); nothing is mocked.

| Set | Where | How it was made |
|---|---|---|
| Before (v1) | `artifacts/ui-v2/before/` | `node scripts/shoot.mjs <out> v1`, 7 routes × 4 sizes |
| After (v2) | `artifacts/ui-v2/after/` | `node scripts/shoot.mjs <out> v2`, 14 routes × 4 sizes |
| Landing, per section | `artifacts/ui-v2/after/landing/` | `node scripts/shoot-landing.mjs <out>`, 9 sections × 2 sizes |

Sizes: 1440×900, 1280×800, 1024×768, 390×844. `overflow.json` next to each set records horizontal overflow
per page. After screenshots are quantised to 256 colours to keep the repository small (4.2 MB).

## Horizontal overflow (the no-scroll rule)

| | Pages with overflow |
|---|---|
| Before | landing @ 390 (+38 px) |
| After | none of 56 |

The rule is now enforced by tests: `e2e/platform.spec.ts` asserts zero horizontal scroll at 390 × 844 on
seven routes (landing, Mission Control, Incident Rooms, Architecture, Overview, SafeCut, Theatre).

## Iterations

Each iteration was a full screenshot pass, a review against `docs/UI_V2_SPEC.md`, and fixes.

### Pass 2 review (1440)

| Found | Fixed |
|---|---|
| Stage-track event numbers collide ("■1 ■■■4") where events 1–4 land seconds apart | Events within 10 % of the track form one tick labelled "1–4" |
| SafeCut chamber: long attacker holdings run into the aperture | Two-entity limit with "+N"; the full list stays in the figure's accessible name |
| Residual U1 label crosses its own bypass arc and the Safe Envelope label | Label below the lane; the lane enters the envelope beside the target |
| Metric values and Decision Horizon counts in monospace | Display face; monospace is now only for IDs, timestamps and hashes |
| Graph canvas draws a second box inside the v2 stage | Frame styled by class; transparent inside v2 surfaces |

### Pass 3 review (landing)

| Found | Fixed |
|---|---|
| The 3D scene's floating labels poke out beside the wide Horizon and chamber panels | Scene labels step back while a wide figure is on screen |
| Hero and HALT-moment titles in the condensed theatre stretch, section titles in the brand stretch | One stretch (110 %) for every landing headline |
| Chamber unreadable at 390 px | On phones the chamber yields to the action list, which carries the same plan |

### Iteration 1 (all routes, four sizes)

| Found | Fixed |
|---|---|
| 1024: the evidence drawer opens over the main column and clips the SafeCut statement and chamber | Below 1280 px the drawer starts closed as a 48 px tab; selecting anything to inspect opens it |
| 390: the evidence drawer is the first thing on the screen; the decision is hidden behind it | Same fix: the decision comes first on phones |
| 390: the Command bar is clipped (mode switch, Theatre, Reset off-screen) | Two-row bar on phones: logo, state, Theatre, Reset; then SIMULATED and the mode switch |
| 390: landing, platform and theatre bars overflow by 25–27 px (found by the new E2E test) | Compact bars; button labels hidden visually but kept as accessible names |
| 390: Theatre hid the SIMULATED marker | SIMULATED and the step count stay; only the keyboard hint goes |
| Incident Rooms: invalid `<dl>` (axe `definition-list`, serious) | Button moved out of the list |

### Iteration 2 (1024 and 390 re-shot, then the final set)

| Found | Fixed |
|---|---|
| 1024: "Incident INC-2417" wraps in the bar | Kept on one line |
| — | No horizontal overflow at any size; the final set above is from this iteration |

## Known limitations (left as they are, on purpose)

- **Figures at phone width.** The Decision Horizon and ThreadGraph scale down to fit 390 px rather than
  scroll sideways. They are legible but small; the per-future columns and the action list below them carry
  the same numbers in full-size text.
- **Graph labels** in the Cytoscape canvas use the shared v1 stylesheet (monospace, small). They are shared
  with Forensic mode and its tests, so they were not restyled.
- **Raw entity IDs before the replay reaches them.** At replay T+00:00 the chamber shows entity IDs
  (`token.grant_docusync`) because their graph nodes have not been observed yet. This is the honest
  behaviour; labels appear as the replay delivers the nodes.
- **Incident title hidden in the phone Command bar.** The view heads state the incident's position; the
  title is on Mission Control and Incident Rooms.
- **Supplied GLB models are unused.** The repository has no GLTF loader; the supplied procedural three.js
  scene and its SVG posters are used instead (see `docs/ASSET_PLACEMENT_MATRIX.md`).
