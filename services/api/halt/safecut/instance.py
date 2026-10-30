"""Turn a scenario into an abstract solver instance. Nothing here knows which actions should win.

The policy profile arrives as constraint limits (scenario/profiles.py): C-COVER's limit is the risk threshold
above which an enumerated path to the protected asset must be cut, C-RESIDUAL's the simulated reach the
paths left open may keep together.

Per candidate action, derived from the graph and the fixture:
- covers: enumerated paths to the protected asset whose live route contains one of its HARD cuts (soft cuts
  never count);
- breaks: processes whose dependency closure its hard cuts hit (down for the containment window);
- users / groups: who it affects;
- eligibility: reversible within the limit (C-REVERSIBLE), every required role has an available approver
  at plan time (C-AUTH, including change-freeze exceptions), evidence-preserving (C-EVIDENCE).

The same instance is what the brute-force cross-check (tests, ProofSeal) evaluates.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from halt.contracts.actions import ResponseAction
from halt.contracts.findings import AttackPath
from halt.scenario.models import Scenario
from halt.scenario.profiles import with_profile
from halt.threadgraph.cuts import blocks, broken_processes, removal_for

PLAN_TIME_OFFSET_S = 900  # default plan time: 15 min after incident t0 (09:56Z), inside the IR-CHG-03 freeze


@dataclass(frozen=True)
class Candidate:
    id: str
    covers: frozenset[str]
    soft_covers: frozenset[str]
    breaks: frozenset[str]
    users: frozenset[str]
    groups: frozenset[str]  # bulk user groups; sizes live on the Instance
    approvals: int  # distinct roles that must approve
    reversible_ok: bool
    auth_ok: bool
    evidence_ok: bool
    missing_roles: tuple[str, ...] = ()
    rollback_s: int | None = None

    @property
    def eligible(self) -> bool:
        return self.reversible_ok and self.auth_ok and self.evidence_ok


@dataclass(frozen=True)
class Instance:
    candidates: tuple[Candidate, ...]
    paths: tuple[str, ...]  # path ids the policy requires cut (C-COVER)
    critical: frozenset[str]  # processes under C-DOWNTIME
    processes: frozenset[str]
    window_min: int
    downtime_limit_min: float
    users_limit: float
    reversible_limit_s: float
    group_sizes: dict[str, int] = field(default_factory=dict)
    authorised_roles: frozenset[str] = field(default_factory=frozenset)
    reach: dict[str, int] = field(default_factory=dict)  # every enumerated path -> simulated reach count
    residual_limit: float = 0.0  # C-RESIDUAL: summed reach the open paths may keep
    rollouts: int = 0
    cover_min_risk: float = 0.0
    profile_id: str = ""

    @property
    def optional(self) -> tuple[str, ...]:
        """Enumerated paths the policy lets stay open, as long as C-RESIDUAL holds."""
        return tuple(p for p in self.reach if p not in self.paths)


def _limit(s: Scenario, cid: str) -> float:
    value = next(c.limit for c in s.constraints if c.id == cid)
    if isinstance(value, bool) or value is None:
        raise ValueError(f"{cid} needs a numeric limit")
    return float(value)


def required_roles(s: Scenario, action: ResponseAction, plan_time: datetime) -> set[str]:
    policies = {p.id: p for p in s.policies}
    roles = set(action.authorisation.required_roles)
    for pid in action.authorisation.policy_ids:
        pol = policies[pid]
        roles |= set(pol.required_roles)
        if pol.window and pol.window.start <= plan_time.time() < pol.window.end:
            roles.add(pol.window.exception_role)
    return roles


def build_instance(s: Scenario, paths: list[AttackPath], plan_time: datetime | None = None) -> Instance:
    s = with_profile(s)
    plan_time = plan_time or s.incident.t0 + timedelta(seconds=PLAN_TIME_OFFSET_S)
    asset = s.incident.params.target_id
    enumerated = [p for p in paths if p.target_id == asset]
    cover_min_risk = _limit(s, "C-COVER")
    required = [p for p in enumerated if p.risk >= cover_min_risk]
    nodes, edges = s.topology.nodes, s.topology.edges
    available = {r for ap in s.approvers if ap.available for r in ap.roles}
    reversible_limit = _limit(s, "C-REVERSIBLE")

    candidates = []
    for a in s.actions:
        hard, soft = removal_for([a]), removal_for([a], strengths=("soft",))
        roles = required_roles(s, a, plan_time)
        rev = a.reversibility
        candidates.append(
            Candidate(
                id=a.id,
                covers=frozenset(p.id for p in enumerated if blocks(p, hard)),
                soft_covers=frozenset(p.id for p in enumerated if blocks(p, soft)),
                breaks=frozenset(broken_processes(nodes, edges, hard)),
                users=frozenset(a.impact.users),
                groups=frozenset(g.group_id for g in a.impact.groups),
                approvals=len(roles),
                reversible_ok=rev.reversible and rev.seconds is not None and rev.seconds <= reversible_limit,
                auth_ok=roles <= available,
                evidence_ok=a.evidence_preserving,
                missing_roles=tuple(sorted(roles - available)),
                rollback_s=rev.seconds,
            )
        )
    processes = {n.id for n in nodes if n.kind == "process"}
    group_sizes: dict[str, int] = {}
    for a in s.actions:
        for g in a.impact.groups:
            group_sizes[g.group_id] = max(group_sizes.get(g.group_id, 0), g.users)
    return Instance(
        candidates=tuple(candidates),
        paths=tuple(p.id for p in required),
        critical=frozenset(n.id for n in nodes if n.kind == "process" and n.criticality == "critical"),
        processes=frozenset(processes),
        window_min=s.incident.params.containment_window_min,
        downtime_limit_min=_limit(s, "C-DOWNTIME"),
        users_limit=_limit(s, "C-USERS"),
        reversible_limit_s=reversible_limit,
        group_sizes=group_sizes,
        authorised_roles=frozenset(available),
        reach={p.id: p.reach.numerator or 0 for p in enumerated},
        residual_limit=_limit(s, "C-RESIDUAL"),
        rollouts=s.incident.params.rollouts,
        cover_min_risk=cover_min_risk,
        profile_id=s.profile_id or "",
    )


# ---- evaluation shared by the solver report and the brute-force cross-check ----


@dataclass(frozen=True)
class Evaluation:
    covered: frozenset[str]
    broken: frozenset[str]
    users: int
    objective: int
    terms: dict[str, int]
    open_paths: tuple[str, ...] = ()  # enumerated paths with no hard cut
    residual_bound: int = 0  # their summed simulated reach (an upper bound on the reach they keep)


WEIGHTS = {"downtime_min": 1000, "users": 100, "actions": 10, "approvals": 1}


def evaluate(inst: Instance, chosen: list[Candidate]) -> Evaluation:
    covered = frozenset().union(*(c.covers for c in chosen)) if chosen else frozenset()
    broken = frozenset().union(*(c.breaks for c in chosen)) if chosen else frozenset()
    named = frozenset().union(*(c.users for c in chosen)) if chosen else frozenset()
    group_ids = frozenset().union(*(c.groups for c in chosen)) if chosen else frozenset()
    users = len(named) + sum(inst.group_sizes[g] for g in group_ids)
    terms = {
        "downtime_min": inst.window_min * len(broken),
        "users": users,
        "actions": len(chosen),
        "approvals": sum(c.approvals for c in chosen),
    }
    open_paths = tuple(p for p in inst.reach if p not in covered)
    return Evaluation(
        covered,
        broken,
        users,
        sum(WEIGHTS[k] * v for k, v in terms.items()),
        terms,
        open_paths,
        sum(inst.reach[p] for p in open_paths),
    )


def feasible(inst: Instance, chosen: list[Candidate]) -> bool:
    ev = evaluate(inst, chosen)
    critical_down = inst.window_min * len(ev.broken & inst.critical)
    return (
        all(c.eligible for c in chosen)
        and set(inst.paths) <= ev.covered
        and ev.residual_bound <= inst.residual_limit
        and critical_down <= inst.downtime_limit_min
        and ev.users <= inst.users_limit
    )
