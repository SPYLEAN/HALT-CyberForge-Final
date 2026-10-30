# Policy-aware residual risk: measured before and after

**Date:** 2026-10-30
**Before:** commit `142f368` (single implicit policy)
**After:** this change, on branch `stabilization/god-mode`

All data is synthetic (INC-2417; seed 2417; 6,000 rollouts; 600 s horizon). Every number below was produced by running the engines. `measure.py` called `solve`, `simulate` and `prove` on each tree: the before tree was a git worktree of `142f368`, and both runs used the same Python environment. None of these numbers is a real-world detection or security claim.

## 1. The issue

ThreadGraph enumerates seven paths to `db.finance_ledger`:

| Path | Route | Rollouts reaching the ledger on its own | Risk | Basis |
|---|---|---|---|---|
| P1 | AS64500 → S-1 → Finance API → ledger | 4,335 | 0.7225 | high-risk |
| P2 | DocuSync → grant → Finance API → ledger | 4,050 | 0.675 | high-risk |
| P3 | AS64500 → S-2 → Payment → ledger | 3,431 | 0.5718 | high-risk |
| P4 | M. Verma → S-3 → Payment → ledger | 2,068 | 0.3447 | high-risk, forecast |
| P5 | grant → Reconciliation → ledger | 1,884 | 0.314 | high-risk |
| P6 | grant → Payroll → ledger | 1,480 | 0.2467 | high-risk |
| **U1** | AS64500 ⇢ support → Finance API → ledger | **502** (8.37 %) | 0.0837 | below the 0.20 threshold; forecast; rests on inferred edge `i.asn-support` (confidence 0.55) |

Before this change the plan cut P1–P6, and U1 stayed open. The numbers were true but scoped in a way that hid it:

- EchoLab reported the plan as "6 of 6 paths blocked".
- ProofSeal's first claim said "0 of 6 high-risk paths reachable".
- Overview showed "Paths reachable after plan: 0 of 6".

U1 appeared only in the proof's "not covered" list, as "below the high-risk threshold".

## 2. Before and after: baseline incident

| Measure | Before (`142f368`) | After: Continuity Balanced | After: Critical Asset Zero Tolerance |
|---|---|---|---|
| Policy | implicit (cut high-risk paths only) | explicit: C-COVER ≥ 0.20, C-RESIDUAL ≤ 600 of 6,000 | explicit: C-COVER ≥ 0, C-RESIDUAL = 0 |
| SafeCut status | optimal | optimal | **infeasible** (relaxing C-COVER would restore a plan) |
| Actions | C01, C02, C03, C04 | C01, C02, C03, C04 (unchanged) | none. Closest option: C01–C04, not runnable |
| Objective | 345 | 345 (unchanged) | — |
| C-COVER result | "6 of 6 high-risk paths cut" | "6 of 6 required paths cut" | "0 of 7 required paths cut" |
| Paths left open | not reported on the plan | **U1**, bound 502 of 6,000, within 600 | — |
| EchoLab future C: paths blocked | "6 of 6" | **"6 of 7"**, method names "open: U1" | — |
| EchoLab future A / B: paths blocked | "6 of 6" / "0 of 6" | "7 of 7" / "0 of 7" | — |
| EchoLab future C: ledger reached | 502 of 6,000 | 502 of 6,000 (unchanged) | — |
| ProofSeal claims | 9 of 9 verified | **10 of 10** verified (new CHK-10, residual) | not sealable (refused) |
| CHK-01 text | "0 of 6 high-risk paths reachable after the plan" | "0 of 6 paths Continuity Balanced requires cut are reachable after the plan" | — |
| U1 in the proof | "is below the high-risk threshold and stays open: 502 of 6000…" | "…stays open under Continuity Balanced: 502 of 6,000 simulated rollouts reach db.finance_ledger along it with this plan. **This is accepted residual risk, not containment.**" | — |
| Plan / proof ids | PLAN-10e634719283 / PS-2417-d7c66ecf | PLAN-9ae8f880ad90 / PS-2417-33f20ba2 | PLAN-a07414608682 / — |

The ids changed because the plan body now records its profile and residual. They remain deterministic: the same inputs give the same ids on every run (tested).

**Why Zero Tolerance is infeasible.** These reasons are generated from the plan, not written by hand:

> Critical Asset Zero Tolerance must cut U1 (attacker.as64500 → process.support → api.finance → db.finance_ledger). The only actions with a hard cut on it are C05 (Isolate Finance API): C-REVERSIBLE: rollback 14400 s exceeds 300 s, C-DOWNTIME: breaks process.payment, process.payroll, process.reconciliation for 240 min, C-USERS: would raise users affected to 310 (limit 5); C06 …; C07 …. So no plan satisfies every constraint of Critical Asset Zero Tolerance while U1 must be cut. Relaxing C-COVER would restore one; HALT does not run a partial plan without an analyst decision.

## 3. When Zero Tolerance is feasible: the `support_route_blockable` variant

**The variant.** One scenario input changes, and it's labelled: the identity provider can refuse AS64500 sign-ins to the support portal outright. That makes C09's cut on `i.asn-support` hard. No action is added, and no weight changes.

| Measure | Continuity Balanced | Zero Tolerance | Exact trade-off |
|---|---|---|---|
| Actions | C01, C02, C03, C04 | C01, C02, C03, C04, **C09** | adds C09 |
| Objective | 345 | 356 | +11 (one action, one approval) |
| Paths left open | U1 | none | closes U1 |
| Residual bound | 502 of 6,000 (limit 600) | 0 of 6,000 (limit 0) | −502 |
| EchoLab: ledger reached under the plan | 502 of 6,000 | **0 of 6,000** | −502 |
| EchoLab future C: paths blocked | 6 of 7 | 7 of 7 | +1 |
| Users affected | 3 | 3 | 0 |
| Critical-process downtime | 0 min | 0 min | 0 |
| Approval roles | finance ops owner, tier2 analyst | the same | none added |
| ProofSeal | 10 of 10 verified | 10 of 10 verified; CHK-10 "No enumerated path to db.finance_ledger stays open: 0 of 6,000 simulated rollouts reach it" | — |

The Continuity plan is unchanged by the variant. The Zero Tolerance plan differs by exactly the one reversible action that hard-cuts U1.

## 4. Other variants (both profiles)

| Variant | Continuity Balanced | Zero Tolerance |
|---|---|---|
| `verma_not_releaser` | C01, C02, C03, C08 (objective 144) | infeasible (U1); closest option C01, C02, C03, C08 |
| `approver_unavailable` | infeasible (C-COVER, C-DOWNTIME, C-AUTH) | infeasible (C-COVER) |

ProofSeal's independent enumeration of all 4,096 subsets agrees with SafeCut under both profiles for `baseline`, `support_route_blockable` and `verma_not_releaser`. This is tested in `test_policy_profiles.py::test_the_solver_still_follows_scenario_inputs`.

## 5. Timing

Each figure is the median of 20 solves (p95 in brackets), or a single EchoLab or ProofSeal run. Before and after ran a few minutes apart on the same development laptop, under different background load.

| | Before | After: Continuity | After: Zero Tolerance (baseline, infeasible) |
|---|---|---|---|
| SafeCut solve | 55 ms (p95 83) | 26 ms (p95 34) | 85 ms (p95 155) |
| EchoLab, 3 futures × 6,000 | 112 ms | 36 ms | — |
| ProofSeal (incl. 4,096-subset enumeration) | 654 ms | 542 ms | — |

**How to read these timings.**

- The before/after difference is load noise, not a speed-up; the residual constraint adds work, it doesn't remove any.
- The infeasible solve is slower because SafeCut re-solves once per constraint family to find which relaxation restores a plan, and the closest options.
- Every figure stays well under the RFC's < 1 s SafeCut target. That target is meant to be measured on CI hardware, which hasn't run yet.

## 6. What the tests now prove

All of these are in `services/api/tests/test_policy_profiles.py`, plus the web unit tests, and they pass:

- The two profiles produce different constraint limits, and nothing else differs between them.
- The plans can differ: the variant adds C09.
- Weak containment leaves a path Zero Tolerance treats as unacceptable: U1 open, and EchoLab still reaches the ledger.
- Zero Tolerance cuts every enumerated path when that is feasible, and the proof's ten claims are all verified.
- No-feasible-plan is truthful: no residual, C-COVER named, the closest option shown, sealing refused, and reasons that cite C05, C06 and C07.
- Plan and proof claims cite real path ids and event ids.
- U1 is described as accepted residual risk under a named policy, never as contained.

## 7. Limits

- **Reach is simulated**, not measured. The residual bound sums each open path's own count, which is an upper bound; EchoLab's measured count for the plan is reported beside it.
- **Only enumerated paths are proven.** A route outside the modelled graph is not covered, and the proof says so.
- **The 600-rollout allowance is a policy value.** It is a demo default in `profiles.json`, not a recommendation.
- **The `support_route_blockable` variant is a what-if.** Whether a real identity provider can refuse an ASN outright on one application is an assumption, labelled as such.
