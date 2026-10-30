# HALT — Proof-Carrying Cyber Response

**Status:** RFC, draft for approval · **Date:** 2026-10-27 · **Scope:** hackathon MVP

> Stop the attack. Not the business.

## 1. Problem

Incident responders choose between two bad defaults. Aggressive containment (isolate the subnet, disable the account, take the database offline) stops the attacker and the organisation with it. Passive monitoring keeps the business running while the attacker reaches the target. The decision is made under time pressure, with no record of *why* a response was enough, and no proof it did not break something critical.

## 2. Promise

HALT calculates and proves the **smallest reversible response** that blocks every high-risk attack path while preserving critical business operations.

## 3. Core invention: the Minimum Safe Containment Envelope

Given:

- a graph of identities, sessions, tokens, applications, APIs, databases and business processes (ThreadGraph);
- a set of high-risk attack paths to critical assets (HALT-R1 + EchoLab);
- a catalogue of authorised, reversible candidate response actions, each with a declared cut set and impact;
- hard constraints on business availability, downtime, user impact, reversibility, evidence preservation and approvals;

find the subset of actions that **interrupts every path the containment policy requires cut with at least one hard cut**, **keeps the reach of the paths it leaves open within the policy's bound**, **satisfies every hard constraint**, and **minimises disruption**. Then prove it: recompute reachability on the post-action graph, recheck every constraint, confirm minimality by an independent method, and seal the result.

The envelope is *derived*. Nothing in the UI or the API hardcodes which actions win.

### 3a. Policy-dependent containment (residual risk)

Containment is a policy decision, not a fact of the graph. INC-2417 shows why: ThreadGraph enumerates **seven** paths to the finance ledger. Six (P1–P6) are at or above the 0.20 high-risk threshold. The seventh, **U1** (AS64500 ⇢ support portal → Finance API → ledger), is below it, but on its own it still reaches the ledger in **502 of 6,000** simulated rollouts (8.37 %), and it rests on an inferred edge. The only actions that hard-cut U1 isolate the Finance API, the ledger or the finance subnet: none is reversible within 5 minutes and each stops three critical processes.

HALT therefore makes the policy explicit and solves under it. A **policy profile** is two constraint limits, nothing else:

| Profile | C-COVER: must cut every enumerated path with simulated risk ≥ | C-RESIDUAL: the paths left open may reach the asset in at most | Stance |
|---|---|---|---|
| **Continuity Balanced** (default) | 0.20 | 600 of 6,000 rollouts (summed own reach) | Minimise disruption; accept explicitly bounded residual risk; show the open routes and the uncertainty; never call the result zero-risk |
| **Critical Asset Zero Tolerance** | 0 (every enumerated path) | 0 | No enumerated path to the ledger may stay open; SafeCut may add reversible actions; business impact still measured under the same limits; proves only what the model and evidence establish |

SafeCut solves again when the profile changes; EchoLab simulates each profile's plan; ProofSeal checks the plan against the profile the plan names (CHK-01 required coverage, CHK-10 residual). In the baseline, Zero Tolerance is **infeasible**, and HALT says so with the reason (only C05, C06 and C07 cut U1, and each breaks reversibility and downtime limits) and the closest option. It never runs a partial plan, and never relabels the Continuity plan as complete containment. The `support_route_blockable` variant (AS64500 can be refused outright on the support route) makes Zero Tolerance feasible: it adds C09 and closes U1, at no extra users or downtime. Measured results: `docs/POLICY_EVALUATION.md`.

## 4. Systems

| System | Responsibility | Output |
|---|---|---|
| **HALT-R1** | Ingest events, correlate entities, score anomalies, map to ATT&CK, identify attack stage | `Finding[]`, incident confidence with derivation |
| **ThreadGraph** | Build the typed graph; enumerate attack paths from attacker entry points to critical targets | `GraphSnapshot`, `AttackPath[]` |
| **EchoLab** | Deterministic seeded Monte Carlo of attacker progression and business availability under candidate plans | `SimulationRun` (counts, never bare probabilities) |
| **SafeCut** | CP-SAT optimisation of the envelope; infeasibility explanation; nearest relaxations | `Plan` (status `optimal` / `infeasible`) |
| **ProofSeal** | Independent verification (graph reachability, constraint recheck, brute-force minimality), canonical hash, signature | `Proof` |
| **Action Gate** | Approvals, authorisation checks, simulated execution, rollback, append-only audit | `GateState`, `Execution`, `AuditEntry[]` |

## 5. Users

- **Tier-2 SOC analyst** (primary, demo persona A. Rahman): reviews evidence, runs EchoLab, approves actions within their authority.
- **Business owner** (Finance Ops owner S. Iyer): co-approves actions that affect their users or change controls.
- **Judge / evaluator**: watches the landing narrative flow into the live Command Center and can interrogate any number.

## 6. Goals (MVP)

1. One complete synthetic OAuth-finance incident (INC-2417) replayed deterministically end to end.
2. Seven enumerated attack paths to the ledger derived by ThreadGraph + EchoLab from scenario inputs: six high-risk (P1–P6) and one below threshold (U1), all shown.
3. SafeCut derives the envelope with OR-Tools CP-SAT; ProofSeal independently confirms it is the unique optimum among all 4,096 subsets of the 12-action catalogue.
4. Proof that every path the selected policy requires cut is interrupted, the residual reach of the paths left open is within the policy's bound (and named), finance stays operational, user impact ≤ 5, every action reversible ≤ 5 min, evidence sealed before execution, required approvals enforced.
7. Two containment policies (Continuity Balanced, Critical Asset Zero Tolerance) solved, simulated, proven and compared side by side with the exact trade-off, including a truthful no-feasible-plan.
5. Landing experience transitions into the Command Center without resetting the incident.
6. Scenario variants prove the result is not hardcoded: changing one input changes the plan, or makes it infeasible, with an explanation.

## 7. Non-goals (MVP)

- No integration with real organisational systems (Entra, M365, EDR, SIEM). Execution is simulated against the in-memory graph snapshot.
- No multi-tenant auth, SSO or RBAC beyond the demo personas.
- No claim of real-world detection efficacy. Synthetic-on-synthetic evaluation measures pipeline correctness only.
- No language model in the decision path. An LLM may phrase explanations of evidence; it never scores risk, chooses actions or bypasses SafeCut.

## 8. Principles (binding)

- Never fabricate backend results in the production interface. Every number on screen comes from an API response and carries its derivation.
- Synthetic data is labelled SIMULATED everywhere it appears, including a persistent top-bar chip.
- Every recommendation references evidence IDs (`EV-xx`) or simulation IDs; forecasts never carry evidence IDs.
- Every response action carries reversibility, authorisation and estimated impact fields; the API rejects an action without them.
- Deterministic seeds (`seed = 2417`) everywhere randomness exists.
- Prefer simple, testable models. A more complex model ships only if it beats the simpler baseline on the held-out synthetic set.
- No evaluation target is claimed until a test produces it.

## 9. Success metrics (measured by tests, see `ACCEPTANCE_TESTS.md`)

| Metric | Target |
|---|---|
| SafeCut solve time, INC-2417 baseline | < 1 s (p95 over 20 runs, CI hardware) |
| ProofSeal brute-force agreement with CP-SAT | 100 % across all scenario variants |
| Replay determinism | Identical hashes for graph, simulation and proof across 3 runs with seed 2417 |
| Landing → Command Center | Incident ID and replay cursor unchanged across the transition |
| Demo click path | Full approval → execute → contained → rollback flow with 0 console errors |
| Accessibility | 0 axe-core serious/critical violations on every Command Center view |

## 10. Risks

| Risk | Mitigation |
|---|---|
| A plan that leaves a path open is read as complete containment | Residual risk is a first-class plan field and proof claim (CHK-10); every count is over all enumerated paths ("6 of 7"); the open path is named with its reach and uncertainty |
| Scenario tuned so the "expected" plan wins looks rigged | Variants that flip the answer (§6.6), brute-force cross-check, all inputs in one reviewable scenario file |
| Cytoscape cannot draw proof-ring-in-gap and business pulse natively | SVG overlay layer synced to the Cytoscape viewport |
| Supplied 3D scene targets three.js r128 | Use it unmodified as a client-only island; no React Three Fiber |
| Windows + OneDrive + no Docker on the dev machine | See blockers in `IMPLEMENTATION_PLAN.md` §2 |

## 11. Open questions for approval

1. Canonical incident ID: **INC-2417** (design system, seed) or **HLT-2047** (Command Center prototype)? This RFC assumes INC-2417.
2. The package marks the palette and Archivo / IBM Plex Mono as *provisional*; the brief calls them canonical. This RFC treats them as canonical and final.
3. Action A3 semantics: step-up must require a phishing-resistant method, otherwise the attacker's newly registered authenticator satisfies it (see `DEMO_SCENARIO.md` §6). Approve that wording?
