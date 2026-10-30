# UI v2 Specification: The Living Containment Fabric

This applies to the presentation layer only. The backend, contracts, solver, replay and policy behaviour are the protected foundation (`d98c0ff`). This document governs every UI v2 pass; `DESIGN_IMPLEMENTATION_MAP.md` gives the data behind each screen, and `ASSET_PLACEMENT_MATRIX.md` the assets.

## 1. Source order and resolved conflicts

1. HALT's product invention and story.
2. The approved logo, palette, typography and assets (`assets/halt-package`).
3. The Visual Supremacy override.
4. The supplied 3D, motion and SVG assets.
5. The Claude Design output (the package's boards and prototypes), as wireframe only.
6. The v1 frontend, as the data-binding reference.

Conflicts resolved by that order:

| Brief asks | Brand rule (higher) | Resolution |
|---|---|---|
| Depth through "restrained shadow" and "controlled blur" | "No shadows and no blur. Separate with a surface step and a 1px ring." | Depth comes from **tonal steps** (`bg` → `surface` → `surface-raised`), hairline rings, **radial light falloff** built from those same tones, and parallax of graph layers. No `box-shadow`, no `backdrop-filter`, no glass |
| A colour for proof | Four brand colours only; proof = Bone ring + Verdigris core | Proof keeps the brand's own proof signal (`proof-ring` + `proof-core`). No new hue, and no generic green check |
| Warning / critical colours | `warning = text`; Ember is reserved for hostile activity | Warning is shown by **form** (a hollow diamond and a hairline Bone rule), not hue. "Critical" business status is Verdigris with a filled bar, never Ember. Ember appears only on the attacker's routes |

## 2. Modes

| Mode | Where | Chrome | Density | Type |
|---|---|---|---|---|
| **Theatre** | `/` (scroll) and `/incidents/{id}/theatre` (keys) | Logo and one control row; no rail or drawer | One idea per frame | Display 56–88 px; statement 22–28 px |
| **Command** (default) | Mission Control, Incident Rooms, every Command Center view, Architecture | Command bar, icon rail, stage track, evidence drawer | One dominant visual (55–70 %), one decision, detail on demand | Title 32–36 px, section 22–24 px, decision 18 px, body 15–16 px, meta ≥ 12.5 px |
| **Forensic** | Command Center with `mode=forensic` | Same shell, compact | The v1 dense views (tables, constraint indicators, raw solver output, claim methods, audit hashes) | Body 14 px, meta ≥ 12.5 px (v1's 9–10.5 px micro-labels raised) |

Command ⇄ Forensic is one control in the command bar, kept in the URL (`mode=`) so a reload or a shared link keeps it. Raw ids (`C01`, `P3`, `EV-04`, `CHK-07`) appear in Command mode only **after** the human-readable label, in mono, smaller. In Forensic mode they lead.

## 3. Semantic tokens (`styles/v2.css`)

These are aliases over `tokens.css` only; no raw colour appears in any component (enforced by the existing no-hex lint and test).

| Token | = | Meaning |
|---|---|---|
| `--v2-page` | `bg` | Page background |
| `--v2-elevated` | `surface` | Panels that sit on the page |
| `--v2-command` | `surface-raised` | The one surface that holds the decision (banner, chamber core, drawer) |
| `--v2-forensic` | `surface` with `line` hairline grid | Forensic tables |
| `--v2-border` / `--v2-border-strong` | `line` / `border-strong` | Hairlines |
| `--v2-text`, `--v2-text-2`, `--v2-text-3` | `text`, `text-secondary`, `text-disabled` (meta only, never body) | Text |
| `--v2-threat`, `--v2-threat-text`, `--v2-threat-wash` | `threat-observed`, `threat-text`, `threat-soft` | Hostile pathways, only |
| `--v2-continuity`, `--v2-continuity-text`, `--v2-continuity-wash` | `business`, `business-text`, `business-soft` | Business pathways and preserved services |
| `--v2-proof-ring`, `--v2-proof-core` | `proof-ring`, `proof-core` | Proof Signal, only after verification |
| `--v2-uncertain` | `neutral-evidence` | Inferred and forecast, never equal to observed |
| `--v2-warning` | `text` (form-coded) | Warnings |
| `--v2-focus` | `focus-ring` | Focus |
| `--v2-light` | radial gradient `surface-raised` → transparent | Environmental light falloff |
| `--v2-radius-s/m/l` | 2 / 4 / 8 px | 8 px only on the large canvases |
| `--v2-space-*` | the token scale | Spacing |
| `--v2-dur-*`, `--v2-ease-*` | `duration-*`, `ease-*` | Motion |

Dark (Ink) is the product theme. The light theme (Bone) is used for the printed report and remains accessible.

## 4. Proprietary motifs (`components/v2/motifs.tsx`)

| Motif | Form | Appears when | Data |
|---|---|---|---|
| **Containment Aperture** | Cut from the HALT mark's crossbar: two Bone jaws closing on a gap, with a proof ring seated in the gap once verified | SafeCut has a plan (open aperture = proposed); execution applied (closed + ring); infeasible (jaws apart, dashed: "no safe cut") | `plan.status`, `execution.state`, `proof` |
| **Thread Lattice** | The graph itself (Cytoscape, preset layout), plus a faint 1 px lattice backdrop in `line` | Everywhere the incident is | replay nodes and edges |
| **Continuity Pulse** | An 8 px Verdigris thread with a travelling 24/96 dash, never broken | The business thread and preserved services | `isThread` edges; preserved = not in `C-DOWNTIME` |
| **Proof Signal** | Bone ring + Verdigris core; draws clockwise (600 ms) | Only on a verified claim or a sealed cut | `proof.claims[].status === "verified"` |
| **Decision Horizon** | One origin point, three futures fanning to the right; each lane's thickness and break are set by its numbers | EchoLab, landing §5, Theatre 4 | `simulation.futures` |
| **Safe Envelope** | A Verdigris hairline boundary drawn around the preserved services after containment | SafeCut, ProofSeal, Mission Control readiness | preserved processes (`C-DOWNTIME` = 0) |

## 5. Motion (tied to state; `prefers-reduced-motion` shows end states)

| Stage | Trigger (real state) | Motion | Duration |
|---|---|---|---|
| 1 Telemetry appears | replay `event` message | Evidence square scales from 50 %, stage track tick fills | 240 ms |
| 2 ThreadGraph resolves | `graph_delta` | Nodes slide 14 px and fade, 60 ms stagger | 480 ms |
| 3 Threat propagates | stage `forecast_ready` | Forecast march (existing) | 1800 ms loop |
| 4 Business illuminates | Overview / Business overlay on | Continuity pulse starts | 3000 ms loop |
| 5 Futures separate | `simulation` arrives | Decision Horizon lanes draw from the origin | 900 ms |
| 6 SafeCut resolves | `plan` arrives | Aperture jaws travel in; action tokens enter the gap | 900 ms `ease-cut` |
| 7 Actions enter | `plan.display_actions` | Tokens step in, 120 ms stagger | 360 ms |
| 8 Hostile paths break | `execution.state = applied` (or Theatre's simulated cut view) | Gap opens, held tone (existing) | 900 ms |
| 9 Continuity survives | same | Pulse continues uninterrupted | — |
| 10 Proof verifies | `proof` arrives | Proof signals draw clockwise, one by one | 600 ms each, 120 ms stagger |

No generic fade-up on scroll. Nothing animates before its state exists.

## 6. Layout

- **Command Center grid:** 72 px icon rail · workspace (dominant canvas ≥ 60 % of the workspace width at ≥ 1280 px) · evidence drawer 360 px (collapsible to a 48 px tab) · 64 px command bar · 56 px stage track.
- **≤ 1280 px:** the drawer overlays on demand.
- **≤ 960 px:** the rail becomes a bottom bar and the drawer a sheet.
- **≤ 640 px:** single column; the canvas stays first.
- **No horizontal scroll** on any primary screen at 390–1440 px (tested).
- **One focal point per screen:** the dominant visual has the only `--v2-light` falloff and the only full-strength colour.

## 7. 3D

- **One WebGL context:** the supplied procedural core (three r128) on the landing and in Theatre only, never behind dense Command content.
- **Load timing:** loaded after first paint, paused off-screen.
- **Quality tiers:** DPR ≤ 1.5 at ≥ 1280 px, ≤ 1 below; no WebGL below 640 px.
- **Fallbacks:** the matching SVG poster under reduced motion and when WebGL is missing. These are the existing `HaltScene3D` behaviours, kept.

## 8. Acceptance (checked in `VISUAL_QA_REPORT.md`)

These rules are absolute:

- No primary horizontal scroll.
- No body text below 14 px; no meta text below 12.5 px.
- Raw ids never lead in Command mode.
- The evidence drawer is never empty.
- Every number traces to an API field.
- U1 is visible and never shown as contained.
- Reduced motion shows end states.
- axe has no serious or critical issues on every route.
- `npm run check` and E2E pass.
