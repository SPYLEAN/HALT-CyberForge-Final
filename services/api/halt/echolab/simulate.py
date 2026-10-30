"""Run futures A / B / C over the same seeded draws and report counts, never bare probabilities."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np

from halt.canonical import sha256_hex
from halt.contracts.actions import ResponseAction
from halt.contracts.common import Derivation, Meta
from halt.contracts.findings import AttackPath
from halt.contracts.simulation import FutureResult, PlanRef, SimulationRequest, SimulationRun
from halt.echolab.attacker import draw, route_reached
from halt.echolab.business import availability, users_affected
from halt.scenario.loader import scenario_hashes
from halt.scenario.models import Scenario
from halt.threadgraph.cuts import blocks, removal_for


class SimulationError(ValueError):
    pass


def resolve_actions(
    s: Scenario, ref: PlanRef, plan_actions: Mapping[str, Sequence[str]] | None
) -> list[ResponseAction]:
    by_id = {a.id: a for a in s.actions}
    if ref.source == "plan":
        if ref.plan_id is None or plan_actions is None or ref.plan_id not in plan_actions:
            raise SimulationError(f"future {ref.label}: unknown plan {ref.plan_id!r}")
        ids = plan_actions[ref.plan_id]
    else:
        ids = next(p.action_ids for p in s.presets if p.key == ref.source)
    unknown = [i for i in ids if i not in by_id]
    if unknown:
        raise SimulationError(f"future {ref.label}: unknown actions {unknown}")
    return [by_id[i] for i in ids]


def simulate(
    s: Scenario,
    paths: Sequence[AttackPath],
    request: SimulationRequest,
    plan_actions: Mapping[str, Sequence[str]] | None = None,
) -> SimulationRun:
    n, horizon = request.rollouts, request.horizon_s
    draws = draw(s.topology.edges, n, request.seed, s.incident.params.soft_cut_evasion_p)
    reversible_limit = next(c.limit for c in s.constraints if c.id == "C-REVERSIBLE")
    # Every enumerated path to the target counts, not only the high-risk ones: a future that leaves a
    # below-threshold path open must say so (it is reported as 6 of 7, never as 6 of 6).
    enumerated = [p for p in paths if p.target_id == s.incident.params.target_id]

    futures = []
    for ref in request.plans:
        actions = resolve_actions(s, ref, plan_actions)
        hard = removal_for(actions)
        soft = removal_for(actions, strengths=("soft",)).edge_ids
        per_path = {p.id: route_reached(p, draws, hard, soft, horizon, n)[0] for p in paths}
        any_reached = np.zeros(n, dtype=bool)
        for reached in per_path.values():
            any_reached |= reached
        blocked = [p.id for p in enumerated if blocks(p, hard)]
        impact = users_affected(actions)
        avail, downtime = availability(s, actions)
        futures.append(
            FutureResult(
                label=ref.label,
                action_ids=[a.id for a in actions],
                paths_blocked=Derivation(
                    numerator=len(blocked),
                    denominator=len(enumerated),
                    method=f"Enumerated paths to {s.incident.params.target_id} "
                    "with a hard cut on their live route"
                    + (
                        f"; open: {', '.join(p.id for p in enumerated if p.id not in blocked)}"
                        if len(blocked) < len(enumerated)
                        else ""
                    ),
                    source_ids=blocked,
                ),
                target_reached=Derivation(
                    numerator=int(any_reached.sum()),
                    denominator=n,
                    method=f"Rollouts reaching {s.incident.params.target_id} by any route within {horizon} s "
                    f"(seed {request.seed}; soft cuts evaded with p={s.incident.params.soft_cut_evasion_p})",
                ),
                path_reached={pid: int(r.sum()) for pid, r in per_path.items()},
                users_affected=Derivation(
                    numerator=impact.total,
                    method=f"{len(impact.named)} named user(s) plus "
                    f"{sum(impact.groups.values())} in bulk groups, counted as disjoint",
                    source_ids=[*impact.named, *impact.groups],
                ),
                downtime_min=downtime,
                availability=avail,
                reversible=all(
                    a.reversibility.reversible
                    and a.reversibility.seconds is not None
                    and isinstance(reversible_limit, int | float)
                    and a.reversibility.seconds <= reversible_limit
                    for a in actions
                ),
                evidence_preserved=all(a.evidence_preserving for a in actions),
            )
        )

    body = {
        "request": request,
        "paths": [p.id + ":" + ">".join(p.edge_ids) for p in paths],
        "futures": futures,
    }
    digest = sha256_hex(body)
    hashes = scenario_hashes(s)
    return SimulationRun(
        id=f"SIM-{digest[:12]}",
        request=request,
        futures=futures,
        hash=digest,
        meta=Meta(
            incident_id=s.incident.id,
            seed=request.seed,
            generated_at=s.incident.t0,
            input_hashes={"graph": hashes["graph"], "actions": hashes["actions"]},
        ),
    )
