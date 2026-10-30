# PS2 implementation sequence

> **Status: PROVISIONAL.** Every phase requires **separate explicit approval** and ends with a review pause.
> Phases never continue automatically. Hours assume a 48-hour event (the real duration is unknown).
>
> **Leads:** the split assumes one person owns backend/data (**B**) and one owns front-end/presentation (**F**).
> Proposed default: **Tanvir = B, Farhana = F.** This is a placeholder, not a judgement of skills; swap freely.

| Phase | Objective | Files expected to change | Tests required | Acceptance gate | Rollback | Depends on | Est. | Risk | Lead | Pause for review |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 Requirement lock | Detailed PS2 statement → update the matrix; answer organiser questions | `docs/PS2_*` only | — | matrix rows OFF-* confirmed; no PROVISIONAL left on P0 rows | revert docs | statement received | 1 h | scope change | B+F | after the matrix update |
| 1 Ground truth + canonical schema | Scenario A raw logs + ground truth; scenario B generator + ground truth; `CanonicalEvent` | `services/api/halt/scenario/*`, new `halt/intake/schema.py`, data files | schema tests; ground-truth hash test; B generator determinism | both scenarios regenerate byte-identically; GT reviewed by the other person | delete new files | 0 | 5 h | GT quality | B | after GT review |
| 2 Ingestion + normalisation | adapters per source; batch upload; quarantine; provenance | `halt/intake/*`, `halt/api/routes.py` (new endpoints), OpenAPI regen via HANDOFF commands | golden-file tests per adapter; upload limits; idempotency | every scenario line parsed or quarantined with a reason | revert branch commits | 1 | 6 h | format edge cases | B | after adapter golden files pass |
| 3 Entity resolution | entities + links with method/confidence/evidence | new `halt/resolve/*` | rule tests; GT entity match | entity recall/precision on A recorded | revert | 2 | 4 h | identifier ambiguity | B | after first measured numbers |
| 4 Correlation + ThreadGraph | edge inference, rejected hypotheses, graph from evidence | new `halt/correlate/*`, `halt/threadgraph/build.py` (source switch) | edge tests; existing ThreadGraph tests; `test_no_hardcoded_*` for B | recall, precision, false-link measured on A and B | keep fixture path behind a flag until green | 3 | 6 h | false links | B | after metrics |
| 5 ATT&CK + Attack Story | evidence-scored mapping; cited sentences; refusal | `halt/r1/attack_map.py`, `halt/explain/*` | citation checker; mapping precision | 100% cited sentences; 0 unsupported (checker + manual) | revert | 4 | 4 h | narrative quality | B | after story review |
| 6 EchoLab forecasting | run on reconstructed graph; calibration check | `halt/echolab/*` (small) | existing + calibration test | forecasts labelled; counts reproducible | revert | 4 | 2 h | low | B | after review |
| 7 SafeCut + ProofSeal integration | reconstruction claims; evidence-preservation constraint if required | `halt/proofseal/checks.py`, `halt/safecut/model.py` (if needed) | proofseal + safecut tests | all claims verified on A and B | revert | 5, 6 | 3 h | low | B | after review |
| 8 Command Center adaptation | Raw Log Explorer, Attack Story, ATT&CK views; re-sourced ThreadGraph; copy | `apps/web/src/components/v2/*`, new views, `lib/api` (regenerated types) | unit + E2E + axe for each new view | views show only API data; existing 41 E2E green | revert | 2–7 (API) | 8 h | scope | F | after E2E |
| 9 Cinematic landing | 8 scenes per storyboard; Thread Core; posters | new `components/landing-ps2/*`, `lib/spatial/*` (ported from PS3 in its own commit) | camera framing tests; reduced motion; fallback; overflow; axe; perf probes | storyboard acceptance checks; 0 idle frames; LCP < 2.5 s | keep current landing behind a route until approved | 8 | 8 h | **high (time)** | F | after poster review, before scroll work |
| 10 Evaluation, a11y, performance | eval harness JSON; metrics in UI/deck; full verification | `halt/eval/*`, `reports/*`, docs | `npm run check`, full E2E, eval run | every displayed metric traced to the report | — | 4–9 | 4 h | missed targets (report honestly) | B+F | after report |
| 11 Deck, recording, rehearsal | slides, backup video, two rehearsals | `docs/`, deck file | — | 5-minute run under time twice | — | 10 | 3 h | demo failure | F (+B for Q&A) | final |

**Order of risk:** P0 reconstruction (phases 1–5) before any visual work. If time runs short, phase 9 drops to
posters + DOM (no live 3D); the reconstruction is never cut for visuals.
