# PS2 evaluation and acceptance

> **Status: PROVISIONAL.** Every target below is a **development target, not a result.** Nothing is measured yet
> except R1 PR-AUC (synthetic). No number may be shown in the product or the deck unless the harness produced it.

Harness (to build, Phase 10): `python -m halt.eval --scenario {A,B} --split test` → `reports/ps2_eval_<scenario>.json`
with the dataset hash, ground-truth hash, commit, and every metric below. The UI and deck read only that JSON.

| Metric | Formula | Ground truth | Dataset | Procedure | Acceptable failure | Presentation | Status |
|---|---|---|---|---|---|---|---|
| Relevant-event recall | \|attack events in story\| / \|ground-truth attack events\| | GT attack event UIDs | Test A, Test B | run pipeline; compare UIDs | a missed event must appear as a stated gap | "N of M attack events recovered" | target ≥ 90%, **not measured** |
| Correlation precision | \|accepted edges matching GT edges\| / \|accepted edges\| | GT edges | A, B | edge match on (source, target, kind) | — | "N of M links correct" | target ≥ 85%, **not measured** |
| False-link rate | \|accepted edges not in GT\| / \|accepted edges\| | GT edges + rejected list | A, B (incl. bait events) | as above | each false link listed | "N false links of M" | target ≤ 5%, **not measured** |
| ATT&CK precision | \|technique labels matching GT\| / \|labels emitted\| ("unmapped" not counted as emitted) | GT technique per event | A, B | compare | unmapped allowed | per-stage table | target ≥ 85%, **not measured** |
| Root-cause Top-3 | 1 if GT initial-access event ∈ top-3 ranked root-cause candidates | GT stage-1 event | A, B and N generator runs | ranked list | — | "root cause ranked k" | target ≥ 90% over runs, **not measured** |
| Evidence-linked claims | \|story sentences with ≥1 valid citation\| / \|sentences\| | citation checker | A, B | checker | none | "every sentence cites its logs" | target 100%, **not measured** (checker to build) |
| Unsupported claims | \|sentences with a claim not supported by cited events\| / \|sentences\| | manual rubric + checker | A, B | checker + manual review of each sentence | none | "0 unsupported" | target 0%, **not measured** |
| Deterministic replay | identical graph, story and proof hashes over k runs | — | A, B | run k = 3 | none | hash equality | 100% for the existing pipeline (proof certificates, E2E AT-10.2); **PS2 pipeline not measured** |
| SafeCut constraint satisfaction | plans violating a hard constraint / plans | ProofSeal checks | A, B | ProofSeal | none | ProofSeal claims | 100% on existing scenario (tests); **PS2 graph not measured** |
| Reconstruction latency | wall time upload → story, demo dataset | — | A | 5 runs, median | — | "reconstructed in X s" | target < 3 s, **not measured** |
| Forecast calibration | Brier score of forecast reach vs held-out continuations | continuation runs | validation seeds | per target | wide intervals allowed | reliability chart | **not measured**; optional |

## Measured today (for reference only)

| Metric | Value | Dataset | Source |
|---|---|---|---|
| R1 event PR-AUC: rules / logistic regression / gradient boosting | 0.916 / 0.9758 / 0.9822 | held-out synthetic | `docs/HANDOFF.md`, `services/api/reports/r1_eval.json` |

## Acceptance gates

1. A P0 requirement is accepted only when its automated test passes and its metric is recorded in the report.
2. Scenario B must pass with **no scenario-specific code** (enforced by a test that greps the pipeline for scenario
   identifiers, like the existing `test_no_hardcoded_plan.py`).
3. If a target is missed, the product shows the measured value, and the deck says it was missed.
