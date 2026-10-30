# PS2 measured results

> **Read this first.** These are **synthetic-on-synthetic** results. The two scenarios were written by the same
> team, in the same pass as the engine, and some weights were adjusted with scenario A in view (see
> `PS2_RECONSTRUCTION_ENGINE.md` § Configuration and tuning disclosure). The numbers show that the pipeline
> recovers what the generator planted. They are **not** evidence of real-world detection efficacy, and they
> must not be quoted as such.

- **Source:** `services/api/reports/ps2_eval.json`, written by
  `cd services/api && .venv/Scripts/python -m halt.ps2.evaluate`.
- **Config SHA-256:** `81e0ce4e…cd1360`.
- **Ground truth:** `halt/ps2/ground_truth/<id>.json`, produced by the Scenario Foundry next to the raw logs and
  never readable by the engine.
- **Run:** three repeats per dataset plus a replay check; latency is the median of the three.

Every value below has status `measured`. **Target** is a development target, not a result. **Met** compares
the two. A metric with no target is reported without one. No value in a measured field was copied from a
target.

## Scenario A: OAuth consent phishing (seed 2417)

| Metric | Value | Count | Target | Met |
|---|---|---|---|---|
| relevant_event_precision | 0.875 | 7/8 | — | — |
| relevant_event_recall | 1.0 | 7/7 | ≥ 0.90 | yes |
| edge_precision | 1.0 | 10/10 | ≥ 0.85 | yes |
| false_link_rate | 0.0 | 0/10 | ≤ 0.05 | yes |
| edge_recall (consecutive steps) | 1.0 | 6/6 | — | — |
| path_node_precision | 1.0 | 7/7 | — | — |
| path_node_recall | 1.0 | 7/7 | — | — |
| stage_mapping_accuracy (tactic) | 1.0 | 7/7 | ≥ 0.85 | yes |
| root_cause_top3 | 1.0 | 1/1 | ≥ 0.90 | yes |
| evidence_coverage (selected edges with evidence) | 1.0 | 10/10 | 1.0 | yes |
| unsupported_story_claims | 0 | 0/10 | 0 | yes |
| deterministic_replay | 1.0 | 1/1 | 1.0 | yes |
| reconstruction_latency_ms (median) | 242 | — | ≤ 3000 | yes |

The one false-positive event is the young-domain marketing mail, a distractor. HALT-R1 scores it 0.80, so it
becomes a seed and is kept in the graph. It is not linked to the selected path, and the story lists it under
missing evidence ("not linked to the selected path by sufficient evidence").

## Scenario B: service-account abuse in a cloud data platform (seed 7310)

| Metric | Value | Count | Target | Met |
|---|---|---|---|---|
| relevant_event_precision | 1.0 | 7/7 | — | — |
| relevant_event_recall | 1.0 | 7/7 | ≥ 0.90 | yes |
| edge_precision | 1.0 | 19/19 | ≥ 0.85 | yes |
| false_link_rate | 0.0 | 0/19 | ≤ 0.05 | yes |
| edge_recall (consecutive steps) | 1.0 | 6/6 | — | — |
| path_node_precision | 1.0 | 7/7 | — | — |
| path_node_recall | 1.0 | 7/7 | — | — |
| stage_mapping_accuracy (tactic) | 1.0 | 7/7 | ≥ 0.85 | yes |
| root_cause_top3 | 1.0 | 1/1 | ≥ 0.90 | yes |
| evidence_coverage | 1.0 | 19/19 | 1.0 | yes |
| unsupported_story_claims | 0 | 0/9 | 0 | yes |
| deterministic_replay | 1.0 | 1/1 | 1.0 | yes |
| reconstruction_latency_ms (median) | 115 | — | ≤ 3000 | yes |

## Seed variants

`root_cause_top3` over 5 regenerated noise variants per scenario (10 runs, different seeds, same attack
template): **1.0 (10/10)**, measured. Between variants, the background noise, the record ids and the timing
jitter change, while the attack template stays fixed. This is a robustness check against noise and jitter, not
against different attacks.

## How to read these numbers

- **Latency is noisy.** It is single-machine wall-clock time on a Windows laptop with the repository under
  OneDrive. The same code has measured between 183 and 410 ms (A) and between 72 and 138 ms (B) across runs. Treat it as
  "well under the target", not as a benchmark.
- **The denominators are tiny.** Each scenario has one attack chain of 7 steps. A single wrong edge would move
  precision by 5–10 points.
- **"Correct edge" is generous by design.** An edge counts as correct if both endpoints are attack steps
  sharing an attacker artefact (`valid_edges` in the ground truth). It does not have to be the exact
  consecutive pair. `edge_recall` is the stricter consecutive-step measure.
- **Two coverage figures.** The receipt's `evidence_coverage` is a different figure from the metric of the same
  name: it is the share of selected-path *hops* classified `observed`. That is 5/6 = 0.83 on A (the mail →
  sign-in hop is `inferred`) and 1.0 on B.
- **Close margins.** The selected path's score margin over the best alternate is 0.024 on A and 0.0036 on B.
  The ranking is correct on these data, but on B it is fragile.
- **Unavailable metrics.** Uploaded batches have no ground truth: their receipts carry no metrics, and
  `/evaluation` returns 404. Nothing is estimated.

## What is not measured yet

- Real or third-party public datasets.
- Attacks the generator did not plant (unknown-unknowns).
- Adversarial log tampering.
- Larger volumes (more than 20,000 records per file).
- Inter-rater agreement on the stage labels.
- Analyst usefulness.
