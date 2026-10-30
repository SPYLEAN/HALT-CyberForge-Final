"""Independent re-implementation of the envelope's feasibility and objective, plus 2^n enumeration.

Written against the documented rules (docs/ARCHITECTURE.md §5), not against SafeCut's code:
- a path is cut when a hard cut hits a node or edge of its live route;
- the policy profile's limits decide feasibility: every enumerated path to the target with risk at or above
  C-COVER must be cut, and the paths left open may together reach the target in at most C-RESIDUAL
  simulated rollouts (the sum of their own reach counts);
- a process is broken when a removed node or edge lies in its dependency closure (networkx descendants
  over dependency edges);
- objective = 1000 x window x processes broken + 100 x users + 10 x actions + 1 x approvals.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from itertools import combinations

import networkx as nx

from halt.contracts.actions import ResponseAction
from halt.contracts.findings import AttackPath
from halt.scenario.models import Scenario


@dataclass(frozen=True)
class Effects:
    covers: frozenset[str]
    breaks: frozenset[str]
    users: frozenset[str]
    groups: frozenset[str]
    roles: frozenset[str]
    eligible: bool


def hard_refs(a: ResponseAction) -> set[str]:
    return {c.ref for c in a.cuts if c.strength == "hard"}


def closure_of(s: Scenario, process_id: str) -> set[str]:
    """Node and edge ids a process depends on (itself excluded)."""
    g: nx.DiGraph[str] = nx.DiGraph()
    edge_ids: dict[tuple[str, str], set[str]] = {}
    for e in s.topology.edges:
        if e.kind == "dependency":
            g.add_edge(e.source, e.target)
            edge_ids.setdefault((e.source, e.target), set()).add(e.id)
    if process_id not in g:
        return set()
    reach = nx.descendants(g, process_id)
    ids = set(reach)
    for u in {process_id} | reach:
        for v in g.successors(u):
            ids |= edge_ids[(u, v)]
    return ids


def roles_needed(s: Scenario, a: ResponseAction, at: datetime) -> set[str]:
    roles = set(a.authorisation.required_roles)
    for pol in s.policies:
        if pol.id in a.authorisation.policy_ids:
            roles |= set(pol.required_roles)
            if pol.window and pol.window.start <= at.time() < pol.window.end:
                roles.add(pol.window.exception_role)
    return roles


def limit(s: Scenario, cid: str) -> float:
    value = next(c.limit for c in s.constraints if c.id == cid)
    assert isinstance(value, int | float) and not isinstance(value, bool)
    return float(value)


def enumerated(s: Scenario, paths: list[AttackPath]) -> list[AttackPath]:
    return [p for p in paths if p.target_id == s.incident.params.target_id]


def required(s: Scenario, paths: list[AttackPath]) -> set[str]:
    return {p.id for p in enumerated(s, paths) if p.risk >= limit(s, "C-COVER")}


def open_reach(s: Scenario, paths: list[AttackPath], covered: set[str]) -> tuple[list[str], int]:
    left = [p for p in enumerated(s, paths) if p.id not in covered]
    return [p.id for p in left], sum(p.reach.numerator or 0 for p in left)


def effects(s: Scenario, paths: list[AttackPath], at: datetime) -> dict[str, Effects]:
    every = enumerated(s, paths)
    processes = [n.id for n in s.topology.nodes if n.kind == "process"]
    closures = {p: closure_of(s, p) for p in processes}
    available = {r for ap in s.approvers if ap.available for r in ap.roles}
    rev_limit = limit(s, "C-REVERSIBLE")
    out = {}
    for a in s.actions:
        refs = hard_refs(a)
        roles = roles_needed(s, a, at)
        rev = a.reversibility
        out[a.id] = Effects(
            covers=frozenset(p.id for p in every if refs & (set(p.node_ids) | set(p.edge_ids))),
            breaks=frozenset(p for p in processes if refs & closures[p]),
            users=frozenset(a.impact.users),
            groups=frozenset(g.group_id for g in a.impact.groups),
            roles=frozenset(roles),
            eligible=rev.reversible
            and rev.seconds is not None
            and rev.seconds <= rev_limit
            and roles <= available
            and a.evidence_preserving,
        )
    return out


@dataclass(frozen=True)
class Enumerated:
    checked: int
    feasible: int
    best: int | None
    optimal: list[tuple[str, ...]]


def enumerate_subsets(
    s: Scenario, paths: list[AttackPath], at: datetime
) -> tuple[Enumerated, dict[str, Effects]]:
    eff = effects(s, paths, at)
    must = required(s, paths)
    residual_limit = limit(s, "C-RESIDUAL")
    critical = {n.id for n in s.topology.nodes if n.kind == "process" and n.criticality == "critical"}
    group_size: dict[str, int] = {}
    for a in s.actions:
        for g in a.impact.groups:
            group_size[g.group_id] = max(group_size.get(g.group_id, 0), g.users)
    window = s.incident.params.containment_window_min
    down_limit, user_limit = limit(s, "C-DOWNTIME"), limit(s, "C-USERS")

    ids = sorted(eff)
    checked = feasible = 0
    best: int | None = None
    optimal: list[tuple[str, ...]] = []
    for k in range(len(ids) + 1):
        for subset in combinations(ids, k):
            checked += 1
            es = [eff[i] for i in subset]
            if not all(e.eligible for e in es):
                continue
            covered = set().union(*(e.covers for e in es)) if es else set()
            broken = set().union(*(e.breaks for e in es)) if es else set()
            users = len(set().union(*(e.users for e in es)) if es else set()) + sum(
                group_size[g] for g in (set().union(*(e.groups for e in es)) if es else set())
            )
            if (
                not must <= covered
                or open_reach(s, paths, covered)[1] > residual_limit
                or window * len(broken & critical) > down_limit
                or users > user_limit
            ):
                continue
            feasible += 1
            objective = (
                1000 * window * len(broken) + 100 * users + 10 * len(es) + sum(len(e.roles) for e in es)
            )
            if best is None or objective < best:
                best, optimal = objective, [subset]
            elif objective == best:
                optimal.append(subset)
    return Enumerated(checked, feasible, best, optimal), eff
