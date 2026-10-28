"""Business side of a future: which processes a response breaks, for how long, and whom it affects.

Actions are applied at the start of the future and stay in force for the containment window, so a
process whose dependency closure they break is down from t = 0 for containment_window_min.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from halt.contracts.actions import ResponseAction
from halt.contracts.simulation import ProcessAvailability
from halt.scenario.models import Scenario
from halt.threadgraph.cuts import broken_processes, removal_for


@dataclass(frozen=True)
class UserImpact:
    total: int
    named: list[str]
    groups: dict[str, int]


def users_affected(actions: Sequence[ResponseAction]) -> UserImpact:
    """Distinct named users plus bulk groups (groups are counted as disjoint: a conservative overcount)."""
    named = sorted({u for a in actions for u in a.impact.users})
    groups: dict[str, int] = {}
    for a in actions:
        for g in a.impact.groups:
            groups[g.group_id] = max(groups.get(g.group_id, 0), g.users)
    return UserImpact(len(named) + sum(groups.values()), named, dict(sorted(groups.items())))


def availability(
    s: Scenario, actions: Sequence[ResponseAction]
) -> tuple[list[ProcessAvailability], dict[str, int]]:
    broken = broken_processes(s.topology.nodes, s.topology.edges, removal_for(actions))
    window = s.incident.params.containment_window_min
    processes = sorted(n.id for n in s.topology.nodes if n.kind == "process")
    avail = [ProcessAvailability(process_id=p, down_from_s=0 if p in broken else None) for p in processes]
    downtime = {p: window for p in processes if p in broken}
    return avail, downtime
