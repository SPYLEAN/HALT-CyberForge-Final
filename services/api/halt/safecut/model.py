"""CP-SAT model of the Minimum Safe Containment Envelope over an abstract Instance.

Variables: x_c (select candidate), broken_b (process b loses a dependency), u_k (named user affected),
g_j (bulk group affected), and cov_p only when coverage is relaxed.

Hard constraints (each family can be relaxed for the infeasibility report):
  C-COVER       every path the policy requires cut has a selected candidate with a hard cut on it
  C-RESIDUAL    summed simulated reach of the enumerated paths left open <= the policy's limit
  C-DOWNTIME    containment window x critical processes broken <= limit
  C-USERS       named users + bulk group sizes <= limit
  C-REVERSIBLE / C-AUTH / C-EVIDENCE   ineligible candidates are fixed to 0

Objective (integer weights, see instance.WEIGHTS):
  1000 x downtime minutes (all processes) + 100 x users + 10 x actions + 1 x approvals
With C-COVER relaxed, each uncovered path costs UNCOVERED_PENALTY, so coverage is maximised first.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from ortools.sat.python import cp_model

from halt.safecut.instance import WEIGHTS, Instance

UNCOVERED_PENALTY = 10_000_000
FAMILIES = ("C-COVER", "C-RESIDUAL", "C-DOWNTIME", "C-USERS", "C-REVERSIBLE", "C-AUTH", "C-EVIDENCE")


@dataclass(frozen=True)
class SolveResult:
    status: str  # "optimal" | "infeasible"
    chosen: tuple[str, ...]
    objective: int | None
    status_raw: str
    wall_ms: float


def solve_instance(
    inst: Instance, relax: frozenset[str] = frozenset(), seed: int = 2417, time_limit_s: float = 10.0
) -> SolveResult:
    m = cp_model.CpModel()
    x = {c.id: m.new_bool_var(f"x_{c.id}") for c in inst.candidates}

    for c in inst.candidates:
        if (
            ("C-REVERSIBLE" not in relax and not c.reversible_ok)
            or ("C-AUTH" not in relax and not c.auth_ok)
            or ("C-EVIDENCE" not in relax and not c.evidence_ok)
        ):
            m.add(x[c.id] == 0)

    uncovered = []
    for p in inst.paths:
        cutters = [x[c.id] for c in inst.candidates if p in c.covers]
        if "C-COVER" in relax:
            cov = m.new_bool_var(f"cov_{p}")
            m.add(cov <= sum(cutters)) if cutters else m.add(cov == 0)
            uncovered.append(1 - cov)
        else:
            m.add(sum(cutters) >= 1) if cutters else m.add_bool_or([])  # empty OR: infeasible

    # Residual: optional paths may stay open while their summed reach stays within the policy's limit.
    if "C-RESIDUAL" not in relax and inst.optional:
        open_reach = []
        for p in inst.optional:
            cutters = [x[c.id] for c in inst.candidates if p in c.covers]
            cut = m.new_bool_var(f"cut_{p}")
            m.add(cut <= sum(cutters)) if cutters else m.add(cut == 0)
            open_reach.append(inst.reach[p] * (1 - cut))
        m.add(sum(open_reach) <= int(inst.residual_limit))

    broken = {}
    for b in sorted(inst.processes):
        breakers = [x[c.id] for c in inst.candidates if b in c.breaks]
        var = m.new_bool_var(f"broken_{b}")
        for v in breakers:
            m.add(var >= v)
        m.add(var <= sum(breakers)) if breakers else m.add(var == 0)
        broken[b] = var
    if "C-DOWNTIME" not in relax:
        m.add(
            inst.window_min * sum(broken[b] for b in inst.critical if b in broken)
            <= int(inst.downtime_limit_min)
        )

    user_ids = sorted({u for c in inst.candidates for u in c.users})
    users = {}
    for k in user_ids:
        var = m.new_bool_var(f"u_{k}")
        for c in inst.candidates:
            if k in c.users:
                m.add(var >= x[c.id])
        users[k] = var
    groups = {}
    for g in sorted(inst.group_sizes):
        var = m.new_bool_var(f"g_{g}")
        for c in inst.candidates:
            if g in c.groups:
                m.add(var >= x[c.id])
        groups[g] = var
    user_total = sum(users.values()) + sum(inst.group_sizes[g] * v for g, v in groups.items())
    if "C-USERS" not in relax:
        m.add(user_total <= int(inst.users_limit))

    approvals = {c.id: c.approvals for c in inst.candidates}
    m.minimize(
        WEIGHTS["downtime_min"] * inst.window_min * sum(broken.values())
        + WEIGHTS["users"] * user_total
        + WEIGHTS["actions"] * sum(x.values())
        + WEIGHTS["approvals"] * sum(approvals[cid] * v for cid, v in x.items())
        + UNCOVERED_PENALTY * sum(uncovered)
    )

    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1  # deterministic search
    solver.parameters.random_seed = seed
    solver.parameters.max_time_in_seconds = time_limit_s
    start = time.perf_counter()
    status = solver.solve(m)
    wall_ms = (time.perf_counter() - start) * 1000
    raw = solver.status_name(status)
    if status == cp_model.OPTIMAL:
        chosen = tuple(cid for cid, v in x.items() if solver.value(v))
        return SolveResult("optimal", chosen, int(round(solver.objective_value)), raw, wall_ms)
    if status == cp_model.INFEASIBLE:
        return SolveResult("infeasible", (), None, raw, wall_ms)
    raise RuntimeError(f"CP-SAT did not prove optimality or infeasibility: {raw}")
