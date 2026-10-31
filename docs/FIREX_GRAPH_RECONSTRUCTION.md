# FireX graph reconstruction

Code: `services/api/halt/firex/reconstruct.py`. No global graph exists: only incident subgraphs are built, each capped
at `limits.node_cap` nodes.

## Forming incidents

Detections join only through entities, never on time alone:

| Link | Rule |
|---|---|
| Shared account | Same user on both detections |
| Shared source | Same source address on both detections |
| Pivot | An internal target of one detection is the source of another |
| Shared destination alone | Does not join |
| Session id alone | Does not join, and is not used as a join key at all |

Bounds: an entity on more than `max_entity_detections` detections is too common to join on, and joined detections
must start within `max_join_gap_seconds`.

## Ordering

Primary order is `eventtime` as UTC, then byte offset. When two steps share a timestamp, the edge records that its
order comes from file position.

## Selected path

The chain of a detection group's steps in order. Each consecutive pair has one `next_step` edge, classified `inferred`
because a rule linked two records. There are no all-to-all temporal edges. A pair with no shared entity is marked
`missing_evidence` and draws as a broken segment.

## Context and bounded neighbours

Other activity from an incident's source addresses is grouped, capped per address, and added as context bursts. It
is labelled observed and is not on the selected path.

## Hypotheses

- **Selected:** one connected sequence, scored from rule confidence, entity continuity, stage coverage and evidence
  volume.
- **Alternates:** for several detections, unrelated activity sharing an entity. Always, a benign explanation, scored
  from `1 − confidence`. The logs cannot rule it out without change or ticket data, and the gap says so.

`uncertainty_margin` is the selected score minus the best alternate. These scores rank explanations for an analyst.
They are not probabilities.

## Reachable next

Internal systems an affected internal host has accepted connections to, excluding anything the activity already
touched. It is always labelled hypothetical, never on the selected path, and never described as observed.

## Attack Story

Each observed statement cites evidence ids that exist in the incident's stored evidence. A statement without a citation
counts in `unsupported_claims`, which is sealed in the proof receipt.
