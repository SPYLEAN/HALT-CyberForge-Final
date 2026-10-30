# PS2 requirement traceability matrix

> **Status: PROVISIONAL.** Only the short official statement exists:
> **"PS2 — Kill Chain Attack Path Reconstruction. Turn raw logs into attack stories."**
> Everything beyond it is classified **INFERRED** (a reasonable reading of the statement) or **OPTIONAL** (a HALT
> differentiator). Team product direction (Signal Intake … Action Gate) is **not** an organiser requirement and is
> marked as such. No assumption below is a requirement until the detailed statement confirms it.

Legend. Class: **OFF** official · **INF** inferred · **OPT** optional differentiator.
Status today: ✅ satisfied · ◐ partial · ✗ missing. Priority: P0 must for a credible PS2 answer · P1 should · P2 could.

## 1. Official requirements (from the short statement only)

| ID | Exact requirement | Class | HALT capability | Backend | Frontend | Dataset | Measurable acceptance | Automated test | Live-demo evidence | Failure state | Today | Prio | Open question |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OFF-1 | Accept **raw logs** as input | OFF | Signal Intake | new `halt/intake/` adapters + upload endpoint | Raw Log Explorer, upload | raw logs for scenario A and B (see data plan) | every supported source file parses; unparseable lines are counted and quarantined with reasons, never dropped silently | pytest per adapter, golden files; E2E upload | drop a raw file, see parsed/quarantined counts | "N lines quarantined: reasons" | ✗ (only pre-normalised synthetic fixtures; `synthetic: Literal[True]`) | P0 | which log formats count as "raw"? are we given logs? |
| OFF-2 | **Reconstruct the attack path** (kill chain) | OFF | entity resolution → correlation → ThreadGraph | new `halt/resolve/`, `halt/correlate/` feeding existing `halt/threadgraph` | ThreadGraph, Timeline | ground-truth graphs for A and B | relevant-event recall, correlation precision, false-link rate vs ground truth (see evaluation doc) | pytest metric harness; regression thresholds once measured | graph assembles from the uploaded logs | "insufficient evidence to link X → Y" (rejected hypothesis shown) | ◐ (path engine exists; graph is a hand-authored fixture, not reconstructed) | P0 | is a specific output format expected (graph, list, STIX)? |
| OFF-3 | Produce **attack stories** | OFF | Attack Story | `halt/explain` extended with cited sentences | Attack Story view | same | 100% of sentences cite ≥ 1 event ID; 0 unsupported claims (checker) | pytest citation checker; E2E story view | read the story, click a citation, land on the raw log line | "HALT will not state this: evidence below threshold" | ◐ (deterministic templates cite IDs; not sentence-level, not from reconstruction) | P0 | narrative length, audience (analyst vs executive)? |
| OFF-4 | The story follows **kill-chain stages** | OFF (implied by "Kill Chain") | ATT&CK / kill-chain mapping | `halt/r1/attack_map.py` → evidence-scored mapping | ATT&CK Mapping view | ground-truth stage labels | stage-assignment accuracy; ATT&CK precision | pytest | stages shown in order with techniques | "stage unknown" with reason | ◐ (fixed table by event kind) | P0 | Lockheed kill chain, MITRE ATT&CK, or either? |

## 2. Inferred requirements

| ID | Requirement | Class | Capability | Acceptance | Today | Prio | Note |
|---|---|---|---|---|---|---|---|
| INF-1 | Multiple log sources are correlated (identity, OAuth/app audit, endpoint, cloud, network) | INF | adapters + entity resolution | ≥ 3 source types correlated in scenario A; ≥ 2 in B | ✗ (4 sources exist but pre-normalised, all Microsoft-identity flavoured) | P0 | endpoint/network absent today |
| INF-2 | Benign noise does not enter the story | INF | R1 scoring + correlation threshold | false-link rate ≤ target on noise-heavy data | ◐ (405 benign events; correlation measured only by PR-AUC on events) | P0 | |
| INF-3 | Every link is explainable | INF | edge evidence (event IDs, method, confidence) | 100% of edges carry evidence | ◐ (fixture edges carry evidence fields, authored) | P0 | |
| INF-4 | Works on more than one attack | INF | second scenario | scenario B reconstructed with no scenario-specific code | ✗ | P0 | proves "not hardcoded" |
| INF-5 | Timeline of the attack | INF | Timeline Replay | ordered, timestamp-normalised | ✅ (replay, deterministic) | P1 | |
| INF-6 | Reasonable speed | INF | — | reconstruction < 3 s on demo data | not measured | P1 | target only |
| INF-7 | Uncertainty is visible | INF | inferred vs observed edges, rejected hypotheses | rejected hypotheses listed with reason | ◐ (inferred edge i.asn-support exists; no rejected-hypothesis list) | P1 | |

## 3. Optional differentiators (keep only if they serve the story)

| ID | Capability | Class | Why keep | Today | Risk | Decision |
|---|---|---|---|---|---|---|
| OPT-1 | EchoLab next-target forecast | OPT | answers "what comes next" without claiming it happened | ✅ engine; calibration ✗ | medium (must label forecasts clearly) | **keep** as differentiator |
| OPT-2 | SafeCut minimum-disruption containment | OPT | unique; proven solver | ✅ | low | **keep**, but after the reconstruction in the demo |
| OPT-3 | ProofSeal verifiable report | OPT | makes the story auditable | ✅ (add reconstruction claims) | low | **keep** |
| OPT-4 | Action Gate approvals + simulated execution | OPT | completes the loop | ✅ | low | keep, short in demo |
| OPT-5 | Cinematic landing | OPT | first impression | ◐ (incident-response landing exists) | high (time) | keep, scheduled last (Phase 9) |
| OPT-6 | Streaming ingestion | OPT | realism | ✗ | high | **defer**: batch + replay only |
| OPT-7 | LLM narrative rewording | OPT | readability | ◐ (off by default) | medium (unsupported claims) | **defer**; templates are enough |
| OPT-8 | Policy profiles (Continuity Balanced / Zero Tolerance) | OPT | shows trade-offs | ✅ | low | keep, not demoed unless asked |
| OPT-9 | Theatre Mode | OPT | presentation | ✅ (incident version) | low | keep only with real state |

## 4. Summary

| Bucket | Items |
|---|---|
| Already satisfied | INF-5 (timeline replay), OPT-2/3/4/8/9 (response side) |
| Partially satisfied | OFF-2 (path engine without reconstruction), OFF-3 (templates), OFF-4 (static mapping), INF-2, INF-3, INF-7, OPT-1 (no calibration) |
| Missing | **OFF-1 raw ingestion**, entity resolution from logs, edge inference, INF-1 (endpoint/network sources), **INF-4 second scenario**, evaluation harness |
| To remove from PS2 messaging | anything connector/integration-shaped from PS3; "Proof-Carrying Cyber Response" positioning on the landing (replace with kill-chain reconstruction) |
| Keep as differentiators | EchoLab, SafeCut, ProofSeal, Action Gate |
| Too risky for the timeframe | streaming ingestion, LLM-generated narrative, real vendor connectors, learned graph inference (GNN), more than two scenarios |

**Rule:** no capability appears in the PS2 product only because it looks impressive. Each must map to a row
above, and P0 rows are built and measured before any P2 visual work.
