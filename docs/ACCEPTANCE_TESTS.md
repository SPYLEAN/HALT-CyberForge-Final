# HALT Acceptance Tests

Every phase in `IMPLEMENTATION_PLAN.md` closes only when its tests below pass in CI. "Measured" values are reported by the test run; nothing is claimed in docs or UI before a test produces it. Test IDs are stable and referenced from test names (`test_AT_4_3_...`).

Tooling: `pytest` (+ `hypothesis` for properties) for the API; Vitest + Testing Library for the web; Playwright (+ `@axe-core/playwright`) for E2E.

## Phase 0 — Repository bootstrap

| ID | Criterion | How measured |
|---|---|---|
| AT-0.1 | `git status` clean after bootstrap; legacy PNG unchanged (SHA-256 equal to pre-bootstrap value) | script |
| AT-0.2 | `assets/halt-package/` byte-identical to the zip contents | checksum manifest test |
| AT-0.3 | `npm run lint`, `npm run typecheck`, `pytest -q` (empty suites) and `ruff` pass | CI job green |
| AT-0.4 | `docker compose up` brings `db`, `api`, `web` healthy within 120 s; `GET /api/v1/health` → `{"status":"ok","db":"ok"}` | CI compose job |
| AT-0.5 | API refuses to start with a missing/invalid `HALT_DB_URL`, with a single readable error | pytest |

## Phase 1 — Contracts and scenario

| ID | Criterion |
|---|---|
| AT-1.1 | All fixture files load and validate against Pydantic models; a corrupted fixture fails startup |
| AT-1.2 | Every observed hostile edge has ≥ 1 evidence ID; every forecast edge has 0 |
| AT-1.3 | Every `ResponseAction` has non-empty `impact`, `reversibility`, `authorisation`; a fixture missing one → 422 / load failure |
| AT-1.4 | Exported OpenAPI → generated `schema.d.ts` equals committed file (drift check) |
| AT-1.5 | Background event generator is deterministic: same seed → identical SHA-256 of output |

## Phase 2 — ThreadGraph and HALT-R1

| ID | Criterion |
|---|---|
| AT-2.1 | Graph snapshot hash identical across 3 builds with seed 2417 |
| AT-2.2 | Path enumeration from attacker entries to `db.finance_ledger` yields exactly P1–P6 + U1 with the node sequences in `DEMO_SCENARIO.md` §3 |
| AT-2.3 | `snapshot(at=t)` contains only nodes/edges with `first_seen ≤ t` |
| AT-2.4 | Correlation links EV-01..EV-06 into one incident and leaves ≥ 99 % of BG events unlinked |
| AT-2.5 | Every `Finding` has ≥ 1 evidence ID and a score with a derivation |
| AT-2.6 | Baseline model: logistic regression PR-AUC on the held-out synthetic set is **reported**; GBM ships only if PR-AUC improves by ≥ 0.02 over LR (otherwise the test asserts LR is the configured model) |

## Phase 3 — EchoLab

| ID | Criterion |
|---|---|
| AT-3.1 | Same seed → identical `SimulationRun.hash` (3 runs) |
| AT-3.2 | With no actions, exactly P1–P6 have `risk ≥ 0.20` and U1 does not |
| AT-3.3 | Reported counts are integers with denominators = rollouts; no bare probabilities in the payload |
| AT-3.4 | Future A (aggressive preset) shows ≥ 1 critical process with downtime > 0; future B shows target reached in > 0 rollouts |
| AT-3.5 | 3 futures × 6,000 rollouts complete in < 3 s on CI (measured, reported) |
| AT-3.6 | Soft cuts: with only C09 applied, P4/P5 target-reach count > 0 (attacker egress switch) |

## Phase 4 — SafeCut

| ID | Criterion |
|---|---|
| AT-4.1 | Baseline: `status = optimal`, selected = {C01, C02, C03, C04}; display actions A1 = [C01], A2 = [C02, C03], A3 = [C04] |
| AT-4.2 | Grep test: no source file outside `scenario/*.json` and tests contains the literals `C01`..`C12` as a selection list (prevents a hardcoded answer) |
| AT-4.3 | Every unselected candidate has ≥ 1 rejection reason naming a constraint ID or "dominated"/"no hard cut" |
| AT-4.4 | Variant `verma_not_releaser` → selected = {C01, C02, C03, C08} |
| AT-4.5 | Variants `approver_unavailable` and `no_phish_resistant_mfa` → `infeasible`, ≥ 1 closest option, each listing the constraints it breaks |
| AT-4.6 | Variant `relaxed_users_250` → selection unchanged |
| AT-4.7 | Property test (hypothesis, 200 random small instances): CP-SAT objective = brute-force objective |
| AT-4.8 | Solve wall time p95 < 1 s over 20 runs (measured, reported) |

## Phase 5 — ProofSeal, Action Gate, audit

| ID | Criterion |
|---|---|
| AT-5.1 | Post-action reachability: 0 of the paths the plan's policy requires cut are reachable (6 under Continuity Balanced); every critical process keeps its dependency closure |
| AT-5.2 | Enumeration checks 4,096 subsets; `optimal_count = 1`, `unique = true` for baseline |
| AT-5.3 | Irredundancy: removing any selected candidate leaves ≥ 1 path reachable |
| AT-5.4 | `/proofs/{id}/verify` recomputes the certificate; tampering any byte of the stored proof → `certificate_match = false` |
| AT-5.5 | Execute without all required approvals → 409; without a sealed proof → 409; with a stale proof → 409 |
| AT-5.6 | Approver lacking the required role → 403 |
| AT-5.7 | Execution applies steps in plan order; each step writes one audit entry; final state `applied` |
| AT-5.8 | Rollback restores the pre-action snapshot hash exactly; state `rolled` |
| AT-5.9 | Audit chain verifies; edits, deletions and reordering are detected; the store is append-only. The PostgreSQL trigger half (direct SQL `UPDATE`/`DELETE` on `audit_log` raises) is AT-6.7 |
| AT-5.10 | New telemetry after sealing marks proof `stale` and Gate returns to `review` |

## Phase 6 — API and replay

| ID | Criterion |
|---|---|
| AT-6.1 | Every endpoint in `DATA_CONTRACTS.md` §10 exists with the documented status codes (contract test from OpenAPI) |
| AT-6.2 | WS: `seek(t)` twice yields identical message sequences; `seq` strictly increasing |
| AT-6.3 | REST state at `t` equals WS-accumulated state at `t` (graph hash compare) |
| AT-6.4 | Every response has `meta.simulated = true` and `meta.seed = 2417` |
| AT-6.5 | Logs are valid JSON lines with `request_id` |
| AT-6.7 | On PostgreSQL, a direct SQL `UPDATE` or `DELETE` on `audit_log` raises (migration trigger); runs in the CI postgres job, and was run locally on 2026-10-29 against PostgreSQL 16 (pgserver) |
| AT-6.6 | `/explain` with LLM disabled returns `engine = "template"`; with a stub LLM returning an unknown evidence ID → 422 |

## Phase 7 — Frontend foundations

| ID | Criterion |
|---|---|
| AT-7.1 | `tokens.css` regenerated equals committed; contrast test recomputes 4.5:1 text / 3:1 marks for both themes |
| AT-7.2 | No hex literals in `src/components/**` or `src/app/**` (lint) |
| AT-7.3 | Each of the 17 components has a passing test for the rule listed in `DESIGN_SYSTEM.md` §4 |
| AT-7.4 | Brand files in `public/brand/` byte-identical to `assets/halt-package/01-brand-assets/` |
| AT-7.5 | SIMULATED chip visible in the top bar whenever `meta.simulated` is true |

## Phase 8 — Command Center

| ID | Criterion |
|---|---|
| AT-8.1 | All seven nav views render from API data, both from responses recorded from the real backend (`services/api/scripts/record_fixtures.py`, replayed by a fetch stub instead of MSW) and with the real API (Playwright E2E) |
| AT-8.2 | With the API stopped, views show an explicit error/skeleton state — never prototype numbers |
| AT-8.3 | ThreadGraph: observed/forecast/inferred edges distinguished by dash pattern (Cytoscape style assertions); the path table classes U1 as "Below the 0.2 threshold (risk 0.08) · rests on an inferred edge" and, under Continuity Balanced, "Open · accepted residual" |
| AT-8.4 | After `applied`: 6 proof rings in gaps; business thread element present and continuous throughout (never removed from DOM) |
| AT-8.5 | Execute button disabled with visible reason until both approvals are recorded |
| AT-8.6 | Evidence rail shows evidence IDs, source record IDs, confidence with derivation and policy requirements for the selected node/action |
| AT-8.7 | Replay timeline seek updates graph to the same hash as `GET /graph?at=t` |
| AT-8.8 | axe: 0 serious/critical violations on every view, dark and light |

## Phase 9 — Landing and transition

| ID | Criterion |
|---|---|
| AT-9.1 | Scrolling the landing advances the shared replay cursor; clicking "Open Command Center" navigates without full reload, and incident ID + cursor are unchanged |
| AT-9.2 | Reload of `/incidents/INC-2417?t=420&view=graph` restores the same state |
| AT-9.3 | `prefers-reduced-motion` → 3D replaced by supplied SVG poster; no WebGL context created |
| AT-9.4 | Landing LCP < 2.5 s on Playwright desktop profile with local API (measured, reported) |

## Phase 10 — End-to-end demo

| ID | Criterion |
|---|---|
| AT-10.1 | Playwright script: landing → Command Center → correlate → forecast → EchoLab → SafeCut → approve ×2 → execute → contained → rollback; 0 console errors |
| AT-10.2 | Three consecutive runs produce identical proof certificates |
| AT-10.3 | `docker compose up` from a clean clone to working demo in ≤ 10 min (documented, timed once). **Not yet run**: Docker is unavailable on the development machine; see README → Verification status |
| AT-10.4 | Variant switcher (`approver_unavailable`) shows "Blocked by policy" and no Execute path |

## Finalization (FINALIZATION_AUDIT rows 1–10)

| ID | Criterion | Test |
|---|---|---|
| AT-F.1 | Evidence-rail sections have unique ids with a selection active; no serious axe violations | `shell.test.tsx`, `e2e/a11y.spec.ts` |
| AT-F.2 | EchoLab requests use `incident.params`; captions read the threshold and the C-REVERSIBLE limit from the API | `views.test.tsx` |
| AT-F.3 | Landing copy counts events and names outstanding approvers from the API; the enumeration is credited to ProofSeal; infeasible plans promise no approval | `landing.test.tsx` |
| AT-F.4 | "Every action" appears only when a policy covers every action type | `views.test.tsx` |
| AT-F.5 | `GET /variants` matches `variants.json`; `Incident.variant` follows a reset; a reload keeps the running variant selected | `test_api_contract.py`, `views.test.tsx`, `e2e/demo-flow.spec.ts` (AT-10.4) |
| AT-F.6 | The top bar names the operator persona as a demo identity | `shell.test.tsx` |
| AT-F.7 | Overview shows the residual reach under the plan, by route | `views.test.tsx` |
| AT-F.8 | Under reduced motion the cut renders finished: six rings, no running animation | `e2e/command-center.spec.ts` |
| AT-F.9 | Hiding business dependencies never hides the business thread or the rings | `graph-model.test.ts` |

Not covered by an automated test: a missing users count rendering "—" (F-06), the canvas cut fade and mode cross-fade (checked by hand in the browser), and the landing hero not covering the containment ring (checked by hand at 1440 × 900).

## Stabilization (restart safety, audit integrity, dependency failures)

| ID | Criterion | Test |
|---|---|---|
| AT-S.1 | After an API restart the incident is restored exactly: state, latest artefacts, approvals, audit chain, operator clock; it can carry on (approve, execute, roll back) and survives a second restart | `test_restart.py::test_restart_restores_the_incident_exactly` |
| AT-S.2 | A journal that disagrees with the record is refused: 503 `restore_inconsistent` with the reason, `/ready` 503; `reset-to-seed` recovers | `test_restart.py::test_restore_refuses_a_journal_that_disagrees_with_the_record` |
| AT-S.3 | `reset-to-seed` is deterministic: same plan, simulation and proof ids and certificate; the audit chain stays valid | `test_restart.py::test_reset_to_seed_is_deterministic` |
| AT-S.4 | The replay position survives a restart; a reset clears it | `test_restart.py::test_replay_position_survives_a_restart` |
| AT-S.5 | With PostgreSQL unreachable the API starts; `/health` degraded, `/ready` 503, routes 503 `dependency_unavailable`, the socket closes | `test_restart.py::test_unreachable_database_answers_503_not_a_crash` |
| AT-S.6 | A database failure part-way through a call rolls the whole call back; the next request rebuilds the incident from the journal | `test_restart.py::test_database_failure_mid_call_is_rebuilt_from_the_journal` |
| AT-S.7 | The API recovers on its own when the database comes back | `test_restart.py::test_api_recovers_on_its_own_when_the_database_comes_back` |
| AT-S.8 | On PostgreSQL the application role can read and append but cannot UPDATE, DELETE, TRUNCATE or disable triggers on `audit_log` or `operations`; the owner is refused by the trigger | `test_pg_audit.py::test_app_role_can_read_and_append_but_never_change_the_record` (needs `HALT_TEST_PG_URL`) |
| AT-S.9 | Restore works on PostgreSQL | `test_pg_audit.py::test_restart_restores_from_postgres` (needs `HALT_TEST_PG_URL`) |
| AT-S.10 | The replay socket reconnects with backoff, never after a final close or a page close, and re-seeks to the client's cursor | `tests/unit/ws-recovery.test.tsx` |
| AT-S.11 | A 503 from the API shows its reason and no figures | `views.test.tsx` (AT-8.2 block) |

## Policy-aware residual risk

| ID | Criterion | Test |
|---|---|---|
| AT-P.1 | Continuity Balanced and Critical Asset Zero Tolerance are different C-COVER / C-RESIDUAL limits and nothing else | `test_policy_profiles.py::test_the_two_profiles_are_different_constraint_limits` |
| AT-P.2 | Continuity Balanced leaves U1 open as bounded residual risk (502 ≤ 600) with its uncertainty stated | `…::test_continuity_leaves_u1_open_as_bounded_residual_risk` |
| AT-P.3 | Weak containment leaves a path Zero Tolerance finds unacceptable, and EchoLab still reaches the ledger through it | `…::test_weak_containment_leaves_a_path_zero_tolerance_finds_unacceptable` |
| AT-P.4 | Zero Tolerance is truthfully infeasible in the baseline: C-COVER named, closest option shown, sealing refused, reasons cite C05/C06/C07 | `…::test_zero_tolerance_is_truthfully_infeasible_in_the_baseline` |
| AT-P.5 | When feasible (`support_route_blockable`), Zero Tolerance cuts every enumerated path and all ten proof claims verify; the plans differ by C09 | `…::test_zero_tolerance_cuts_every_enumerated_path_when_feasible` |
| AT-P.6 | ProofSeal judges the plan by the profile the plan names; its 4,096-subset enumeration agrees with SafeCut under both profiles and three variants | `…::test_proofseal_checks_the_plans_own_profile`, `…::test_the_solver_still_follows_scenario_inputs` |
| AT-P.7 | Plan residuals, constraint results, proof claims and comparison reasons cite real path ids and event ids | `…::test_claims_reference_graph_paths_and_evidence` |
| AT-P.8 | U1 is never presented as contained: "required paths", "6 of 7, open: U1", "accepted residual risk, not containment" | `…::test_u1_is_no_longer_mislabelled` |
| AT-P.9 | The comparison states the exact trade-off (adds C09, −502 reach, 0 users, 0 downtime); with no feasible plan nothing is "added" or "dropped" | `…::test_comparison_states_the_exact_tradeoff` |
| AT-P.10 | The API re-solves under the chosen profile, the comparison ids match, and a restart restores the profile | `…::test_api_resolves_under_the_chosen_profile_and_restores_it` |
| AT-P.11 | The UI shows both profiles, the residual left open (not zero-risk), the comparison and the reasons; choosing a profile re-solves | `views.test.tsx` (policy-aware residual risk block) |

Measured before/after: `POLICY_EVALUATION.md`.
