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
| AT-5.1 | Post-action reachability: 0 of 6 high-risk paths reachable; every critical process keeps its dependency closure |
| AT-5.2 | Enumeration checks 4,096 subsets; `optimal_count = 1`, `unique = true` for baseline |
| AT-5.3 | Irredundancy: removing any selected candidate leaves ≥ 1 path reachable |
| AT-5.4 | `/proofs/{id}/verify` recomputes the certificate; tampering any byte of the stored proof → `certificate_match = false` |
| AT-5.5 | Execute without all required approvals → 409; without a sealed proof → 409; with a stale proof → 409 |
| AT-5.6 | Approver lacking the required role → 403 |
| AT-5.7 | Execution applies steps in plan order; each step writes one audit entry; final state `applied` |
| AT-5.8 | Rollback restores the pre-action snapshot hash exactly; state `rolled` |
| AT-5.9 | Audit chain verifies; a direct SQL `UPDATE`/`DELETE` on `audit_log` raises (Postgres) |
| AT-5.10 | New telemetry after sealing marks proof `stale` and Gate returns to `review` |

## Phase 6 — API and replay

| ID | Criterion |
|---|---|
| AT-6.1 | Every endpoint in `DATA_CONTRACTS.md` §10 exists with the documented status codes (contract test from OpenAPI) |
| AT-6.2 | WS: `seek(t)` twice yields identical message sequences; `seq` strictly increasing |
| AT-6.3 | REST state at `t` equals WS-accumulated state at `t` (graph hash compare) |
| AT-6.4 | Every response has `meta.simulated = true` and `meta.seed = 2417` |
| AT-6.5 | Logs are valid JSON lines with `request_id` |
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
| AT-8.1 | All seven nav views render from API data with the API mocked by recorded fixtures (MSW) and with the real API (E2E) |
| AT-8.2 | With the API stopped, views show an explicit error/skeleton state — never prototype numbers |
| AT-8.3 | ThreadGraph: observed/forecast/inferred edges distinguished by dash pattern (Cytoscape style assertions); U1 rendered as uncertain |
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
| AT-10.3 | `docker compose up` from a clean clone to working demo in ≤ 10 min (documented, timed once) |
| AT-10.4 | Variant switcher (`approver_unavailable`) shows "Blocked by policy" and no Execute path |
