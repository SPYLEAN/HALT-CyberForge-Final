"""Rank ThreadGraph paths by simulated risk with no response, and assign path ids.

risk = (rollouts reaching the target along the route / rollouts) x target criticality weight.
High-risk paths (risk >= threshold) become P1.. in descending risk; the rest U1.. Ties break on the
route key, so ids are deterministic for a given seed.
"""

from __future__ import annotations

from halt.contracts.common import Derivation
from halt.contracts.findings import AttackPath
from halt.echolab.attacker import draw, route_reached
from halt.scenario.models import Scenario
from halt.threadgraph.cuts import Removal
from halt.threadgraph.paths import enumerate_paths

CRITICALITY_WEIGHT = {"critical": 1.0, "standard": 0.5, "none": 0.0}


def rank_paths(
    s: Scenario, rollouts: int | None = None, horizon_s: int | None = None, seed: int | None = None
) -> list[AttackPath]:
    params = s.incident.params
    n = rollouts or params.rollouts
    horizon = horizon_s or params.horizon_s
    seed = params.seed if seed is None else seed
    nodes, edges = s.topology.nodes, s.topology.edges
    target = next(x for x in nodes if x.id == params.target_id)
    weight = CRITICALITY_WEIGHT[target.criticality]

    candidates = enumerate_paths(nodes, edges, params.target_id)
    draws = draw(edges, n, seed, params.soft_cut_evasion_p)
    scored = []
    for c in candidates:
        reached, _ = route_reached(c, draws, Removal(), frozenset(), horizon, n)
        count = int(reached.sum())
        scored.append((c, count, round(count / n * weight, 4)))

    high = sorted((x for x in scored if x[2] >= params.high_risk_threshold), key=lambda x: (-x[2], x[0].key))
    low = sorted((x for x in scored if x[2] < params.high_risk_threshold), key=lambda x: (-x[2], x[0].key))
    out = []
    for prefix, group in (("P", high), ("U", low)):
        for i, (c, count, risk) in enumerate(group, start=1):
            out.append(
                AttackPath(
                    id=f"{prefix}{i}",
                    node_ids=c.node_ids,
                    edge_ids=c.edge_ids,
                    entry_edge_ids=c.entry_edge_ids,
                    target_id=c.target_id,
                    provenance=c.provenance,
                    reach=Derivation(
                        numerator=count,
                        denominator=n,
                        method=f"EchoLab rollouts reaching {c.target_id} along this route within "
                        f"{horizon} s, no response (seed {seed}). Simulated, not a measured probability.",
                    ),
                    risk=risk,
                    high_risk=prefix == "P",
                    uncertain=c.uncertain,
                )
            )
    return out
