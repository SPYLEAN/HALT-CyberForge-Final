# Incident graph contract

The 2D and 3D views both consume `IncidentGraph` from `GET /api/v1/ps2/incidents/{id}/graph`. Contracts are in
`services/api/halt/firex/contracts.py`; TypeScript types are generated from `services/api/openapi.json`.

## Nodes

`node_id`, `kind` (`event`, `burst`, `account`, `host`, `ip`, `session`, `application`, `service`,
`critical_asset`), `label`, `layer` (`external`, `network_edge`, `endpoint`, `identity`, `application`,
`critical_asset`), `order` (source order), `stage` (kill-chain stage), `count` (records merged),
`on_selected_path`, `is_context`, `evidence_refs`, `detection_id`.

## Edges

| Field | Meaning |
|---|---|
| `relation` | e.g. `involves`, `same_actor_next_step`, `could_reach` |
| `classification` | `observed` (stated by one record), `inferred` (a rule linked records), `reachable` (hypothetical) |
| `confidence` | 0–1, with `components` showing how it was scored |
| `rule`, `rule_version` | what produced the edge |
| `evidence_refs` | cited evidence ids; empty only on `reachable` edges with no connection evidence |
| `contradictions` | reasons the link may be wrong |
| `missing_evidence` | a known gap in the sequence; drawn as a broken segment |

## Rules

- Graphs are capped (`limits.node_cap`); `truncated` says when a cap applied. Repeated activity is one `burst`
  node with a count, not many nodes.
- `reachable` edges are never on the selected path and are never described as observed.
- `graph_hash` is the SHA-256 of the canonical nodes and edges, and is sealed in the `ProofReceipt`.
- Every incident has `status: unconfirmed`.

## Hypotheses

`selected` plus `alternates`, each with a score, components and evidence gaps. `uncertainty_margin` is the score
difference between the selected hypothesis and the best alternate.
