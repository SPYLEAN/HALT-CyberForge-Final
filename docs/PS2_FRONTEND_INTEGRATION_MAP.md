# PS2 frontend integration map

> **Scope:** the functional PS2 workspace over the reconstruction engine (`/api/v1/ps2`). This is not the
> cinematic landing or the final art-direction pass. Every value shown comes from a PS2 API response. When the
> API cannot answer, the page shows no figures.

## Routes (App Router, `apps/web/src/app`)

| Route | File | Notes |
|---|---|---|
| `/reconstruct` | `app/reconstruct/page.tsx` | intake: bundled datasets or an upload, then ingestion results, then "Reconstruct" |
| `/reconstructions/[reconstructionId]` | `app/reconstructions/[reconstructionId]/page.tsx` | workspace for one run. `params` is a Promise (Next 16), as in the existing incident route. Ids that are not `run-<16 hex>` return `notFound()` |

The existing routes (`/`, `/incidents/...`, `/mission`, `/architecture`) are unchanged. The empty `(ps3)` folder
left by a branch switch is untracked and is not touched.

## Reused, adapted, new

| Piece | Status | What |
|---|---|---|
| `lib/api/client.ts` (`api`, `unwrap`, `ApiFailure`) | **reused** | every PS2 call goes through the generated openapi-fetch client. A failure is never replaced by a fallback value |
| `lib/api/schema.d.ts` | **reused (regenerated)** | PS2 types come from OpenAPI (`npm run gen:api`), never written by hand |
| `PlatformShell` | **adapted** | one nav item added, "Reconstruct" with a new `reconstruct` icon in `v2/icons.tsx`. Nothing else changes |
| `components/halt` (`StatusChip`, `Button`, `NodeGlyph`) and `v2.css` type roles (`v2-title`, `v2-kicker`, `v2-meta`, `v2-id`, `v2-details`, `v2-tag`, `v2-btn-row`) | **reused** | same type scale, chips with glyph + word (never colour alone), same focus ring and 44 px hit target |
| `graph/glyphs.ts` (`glyphUri`) | **reused** | entity nodes use the existing NodeGlyph silhouettes on the canvas |
| Cytoscape (existing dependency) | **reused** | new `Ps2GraphCanvas` with a deterministic preset layout computed from the API graph. The incident `ThreadGraphCanvas` (business-thread overlay, proof rings) is incident-specific, so it is not forced onto PS2 |
| `incident-store`, `ops`, the incident WebSocket and replay timeline | **not used** | PS2 runs have no replay stream. The stage rail shows real request states instead |
| Evidence drawer pattern | **adapted** | the PS2 inspector is a right rail on desktop and a non-modal drawer below 1280 px. Focus moves to it on open and returns on close |
| `Unavailable` pattern (`v2-unavailable`) | **adapted** | PS2 variants: service unavailable (retry, selected files kept) and run expired |
| `lib/ps2/` (`api.ts`, `graph.ts`, `upload.ts`, `session.ts`) and `styles/ps2-palette.ts` | **new** | typed calls, graph model, upload validation, in-tab session store, palette |
| `components/ps2/*` + `ps2.module.css` | **new** | intake, pipeline stages, workspace regions; scoped CSS Module (Next guidance for scoped CSS) |
| `services/api/scripts/record_ps2_fixtures.py` → `tests/fixtures/api/ps2.json` | **new** | real backend responses for unit tests, checked for drift by `npm run check` |

## Palette

The brand tokens (`styles/tokens.css`) are generated and unchanged. The PS2 brief names Proof Cyan, Forecast
Violet and Continuity Gold. `PS2_LANDING_MATERIAL_LIGHTING_SPEC.md` §2 already proposed these as a PS2 extension
palette.

`styles/ps2-palette.ts` (a token source beside `tokens.ts`) is the single source for those three values plus brand Ember and Bone. It is applied as CSS
variables on the PS2 workspace root only, and given to Cytoscape as literals. It is not a second design system:
type, spacing, chips and controls are the existing ones. Every colour is paired with a non-colour cue:

| Meaning | Colour | Cue |
|---|---|---|
| observed edge | Proof Cyan, solid | "OBSERVED" chip |
| inferred edge | Bone 60 %, dashed | "INFERRED" chip |
| selected path | Threat Ember, thick | "selected path" label |
| alternate path | Forecast Violet, long dash | "alternate" label |
| forecast | Violet, dotted | "FORECAST" chip |
| critical service | Continuity Gold | criticality word |
| missing evidence | dashed gap marker | "missing evidence" text |

## Backend additions

These are read-only additions. Algorithms, weights and existing responses are unchanged.

| Endpoint / field | Why |
|---|---|
| `GET /ps2/intake` | adapters (id, format, content types, description) and configured limits. The upload form must name an adapter per file, and the limits come from the API, not the UI |
| `GET /ps2/reconstructions/{id}/entities` | aliases, contradictions, matching fields and resolution method for the evidence inspector. These were not exposed before |
| `GET /ps2/reconstructions/{id}/stages` | technique id, name, basis and candidates per kept event, for ATT&CK progression |
| `Hypotheses.selected` | the selected path (score, components, missing evidence), for comparison with the alternates |
| `ThreadNode.criticality` (engine `1.0.1`) | a business-service node's criticality, from the organisation context. Without it the UI cannot say which services are critical. It changes the graph hash, so the engine version is bumped and no replay id ever maps to two graphs. Algorithms, weights and metrics are unchanged |

## Pipeline stages (no timers)

| Stage | Done when |
|---|---|
| 1 Files selected | a dataset is chosen or files pass client checks |
| 2 Ingestion started | the `POST /ingestions` request is sent |
| 3 Records parsed | `POST /ingestions` returns 200 |
| 4 Canonical events created | `GET /ingestions/{id}/events` returns 200 |
| 5 Reconstruction requested | `POST /reconstructions` returns 200 (navigates to the workspace) |
| 6 Graph ready | `GET …/graph` returns 200 |
| 7 Story verified | `GET …/story` returns 200 **and** `unsupported_claims == 0`; otherwise the stage reads "claims unsupported" |
| 8 Receipt sealed | `GET …/receipt` returns 200 (hashes recorded; the receipt is not signed and the UI says so) |

## State and URLs

- `reconstructionId` is in the URL. Raw logs, contexts and secrets never go into the URL.
- `lib/ps2/session.ts` keeps the last ingestion and run for the browser tab (memory only), so browser back
  shows the earlier result instead of posting again. Nothing is posted on mount.
- A refresh refetches by run id. Bundled-dataset runs are regenerated identically by the API after a restart
  (see `PS2_DEMO_RUNBOOK.md`). An uploaded run that is gone returns 404, and the page shows "This demo-session
  reconstruction has expired" with a link to start again. A network failure shows "service unavailable" with
  retry.

## SafeCut handoff: not implemented

SafeCut (`halt/safecut/instance.py`) needs a `Scenario`: response actions with impact on users and groups,
reversibility, approvers and roles, policies, constraint limits, and a topology with business processes. A PS2
reconstruction produces none of these, and `OrgContext` has no action catalogue. A converter would have to
author actions, impacts and approvers per scenario, which is exactly the scenario-specific assumption the brief
rules out. So there is **no "Continue to SafeCut" button**. Scenario A is not linked to INC-2417.

**Next integration task:** add a response-action catalogue and approver roster to `OrgContext`, so that a
scenario-independent adapter can map selected-path entities (sessions, tokens, apps, roles) to candidate
actions. Then add backend tests that SafeCut's covers and breaks follow from the reconstruction, not from
authored data.

## UI constants (presentation only)

- **Near-tie margin, 0.01 score units.** Below this, the hypothesis panel says "ambiguous". The margin itself
  is `receipt.uncertainty.score_margin`.
- **Mobile breakpoint, 640 px** (guided sequence). **Drawer breakpoint, 1280 px.** Both match `v2.css`.
