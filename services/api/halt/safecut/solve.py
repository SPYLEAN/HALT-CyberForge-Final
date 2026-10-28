"""SafeCut entry point: scenario + ranked paths -> Plan (optimal, or infeasible with closest options)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta
from importlib.metadata import version

from halt.canonical import sha256_hex
from halt.contracts.common import Derivation, Meta
from halt.contracts.constraints import ConstraintResult
from halt.contracts.findings import AttackPath
from halt.contracts.plan import (
    ClosestOption,
    Infeasibility,
    Objective,
    Plan,
    PlanInputHashes,
    Rejection,
    SolverInfo,
)
from halt.safecut.group import group
from halt.safecut.instance import PLAN_TIME_OFFSET_S, Candidate, Instance, build_instance, evaluate
from halt.safecut.model import FAMILIES, solve_instance
from halt.scenario.loader import scenario_hashes
from halt.scenario.models import Scenario

MAX_OPTIONS = 3
ORTOOLS_VERSION = version("ortools")


def constraint_results(s: Scenario, inst: Instance, chosen: Sequence[Candidate]) -> list[ConstraintResult]:
    ev = evaluate(inst, list(chosen))
    ids = [c.id for c in chosen]
    critical_down = sorted(ev.broken & inst.critical)
    downtime = inst.window_min * len(critical_down)
    uncovered = [p for p in inst.paths if p not in ev.covered]
    slowest = max((c.rollback_s or 0 for c in chosen), default=0)
    not_reversible = [c.id for c in chosen if not c.reversible_ok]
    unauthorised = {c.id: c.missing_roles for c in chosen if not c.auth_ok}
    destroys = [c.id for c in chosen if not c.evidence_ok]
    approvers = sorted(
        f"{ap.name} ({r})"
        for ap in s.approvers
        if ap.available
        for r in ap.roles
        if any(r in roles_of(s, cid) for cid in ids)
    )

    def state(ok: bool, at_limit: bool = False) -> str:
        return "violated" if not ok else ("binding" if at_limit else "met")

    return [
        ConstraintResult(
            constraint_id="C-COVER",
            state=state(not uncovered),
            value=f"{len(inst.paths) - len(uncovered)} of {len(inst.paths)} high-risk paths cut",
            limit=f"all {len(inst.paths)}",
            derivation=Derivation(
                numerator=len(inst.paths) - len(uncovered),
                denominator=len(inst.paths),
                method="Hard cuts intersected with each path's live route"
                + (f"; open: {', '.join(uncovered)}" if uncovered else ""),
                source_ids=ids,
            ),
        ),
        ConstraintResult(
            constraint_id="C-DOWNTIME",
            state=state(
                downtime <= inst.downtime_limit_min,
                inst.downtime_limit_min > 0 and downtime == inst.downtime_limit_min,
            ),
            value=f"{downtime} min",
            limit=f"≤ {inst.downtime_limit_min:g} min",
            derivation=Derivation(
                numerator=downtime,
                method="Critical processes whose dependency closure the cuts break, x containment window "
                f"({inst.window_min} min)" + (f": {', '.join(critical_down)}" if critical_down else ": none"),
                source_ids=critical_down,
            ),
        ),
        ConstraintResult(
            constraint_id="C-USERS",
            state=state(ev.users <= inst.users_limit, ev.users == inst.users_limit),
            value=f"{ev.users} users",
            limit=f"≤ {inst.users_limit:g} users",
            derivation=Derivation(
                numerator=ev.users,
                method="Distinct named users plus bulk groups (groups counted as disjoint)",
                source_ids=sorted(frozenset().union(*(c.users for c in chosen))) if chosen else [],
            ),
        ),
        ConstraintResult(
            constraint_id="C-REVERSIBLE",
            state=state(not not_reversible),
            value=f"slowest rollback {slowest} s"
            if not not_reversible
            else f"not reversible: {', '.join(not_reversible)}",
            limit=f"≤ {inst.reversible_limit_s:g} s each",
            derivation=Derivation(
                numerator=len(chosen) - len(not_reversible),
                denominator=len(chosen) or None,
                method="Actions with a rollback plan inside the limit",
                source_ids=ids,
            ),
        ),
        ConstraintResult(
            constraint_id="C-AUTH",
            state=state(not unauthorised),
            value="approvers available: " + (", ".join(approvers) or "none needed")
            if not unauthorised
            else "missing: " + "; ".join(f"{k} needs {', '.join(v)}" for k, v in unauthorised.items()),
            limit="every required role has an available approver",
            derivation=Derivation(
                numerator=len(chosen) - len(unauthorised),
                denominator=len(chosen) or None,
                method="Required roles (policies plus active freeze exceptions) vs available approvers",
                source_ids=ids,
            ),
        ),
        ConstraintResult(
            constraint_id="C-EVIDENCE",
            state=state(not destroys),
            value=f"{len(chosen) - len(destroys)} of {len(chosen)} preserve evidence; seal before execution",
            limit="all; seal first (IR-DATA-07)",
            derivation=Derivation(
                numerator=len(chosen) - len(destroys),
                denominator=len(chosen) or None,
                method="Action evidence flags; the Gate refuses to execute an unsealed plan",
                source_ids=ids,
            ),
        ),
    ]


def roles_of(s: Scenario, cid: str) -> set[str]:
    a = next(a for a in s.actions if a.id == cid)
    return set(a.authorisation.required_roles)


def rejections(inst: Instance, chosen: Sequence[Candidate]) -> list[Rejection]:
    chosen_ids = {c.id for c in chosen}
    base = evaluate(inst, list(chosen))
    out = []
    for c in inst.candidates:
        if c.id in chosen_ids:
            continue
        reasons = []
        if not c.covers and c.soft_covers:
            reasons.append(
                f"Only soft cuts on {', '.join(sorted(c.soft_covers))}: the attacker can evade them"
            )
        elif not c.covers:
            reasons.append("No hard cut on any high-risk path")
        if not c.reversible_ok:
            reasons.append(
                "C-REVERSIBLE: not reversible"
                if c.rollback_s is None
                else f"C-REVERSIBLE: rollback {c.rollback_s} s exceeds {inst.reversible_limit_s:g} s"
            )
        if not c.auth_ok:
            reasons.append(f"C-AUTH: no available approver for {', '.join(c.missing_roles)}")
        if not c.evidence_ok:
            reasons.append("C-EVIDENCE: does not preserve evidence")
        if c.breaks & inst.critical:
            reasons.append(
                f"C-DOWNTIME: breaks {', '.join(sorted(c.breaks & inst.critical))} for {inst.window_min} min"
            )
        with_c = evaluate(inst, [*chosen, c])
        if with_c.users > inst.users_limit:
            reasons.append(
                f"C-USERS: would raise users affected to {with_c.users} (limit {inst.users_limit:g})"
            )
        if not reasons:
            reasons.append(
                f"Dominated: every path it cuts ({', '.join(sorted(c.covers))}) is already cut; "
                f"adding it raises the objective by {with_c.objective - base.objective}"
            )
        out.append(Rejection(candidate_id=c.id, reasons=reasons))
    return out


def _options(s: Scenario, inst: Instance, seed: int) -> tuple[list[str], list[ClosestOption]]:
    by_id = {c.id: c for c in inst.candidates}
    found: list[tuple[int, int, tuple[str, ...], list[ConstraintResult]]] = []
    restoring = []
    for family in FAMILIES:
        r = solve_instance(inst, frozenset({family}), seed=seed)
        if r.status != "optimal":
            continue
        restoring.append(family)
        results = constraint_results(s, inst, [by_id[i] for i in r.chosen])
        broken = [cr for cr in results if cr.state == "violated"]
        if r.chosen not in {f[2] for f in found}:
            found.append((len(broken), r.objective or 0, r.chosen, broken))
    found.sort(key=lambda f: (f[0], f[1], f[2]))
    options = [
        ClosestOption(candidate_ids=list(ids), breaks=broken) for _, _, ids, broken in found[:MAX_OPTIONS]
    ]
    return restoring, options


def solve(
    s: Scenario, paths: Sequence[AttackPath], plan_time: datetime | None = None, seed: int | None = None
) -> Plan:
    plan_time = plan_time or s.incident.t0 + timedelta(seconds=PLAN_TIME_OFFSET_S)
    seed = s.incident.params.seed if seed is None else seed
    inst = build_instance(s, list(paths), plan_time)
    result = solve_instance(inst, seed=seed)
    by_id = {c.id: c for c in inst.candidates}
    chosen = [by_id[i] for i in result.chosen]

    infeasibility = None
    if result.status == "infeasible":
        restoring, options = _options(s, inst, seed)
        infeasibility = Infeasibility(
            violated_constraint_ids=restoring or list(FAMILIES),
            closest_options=options,
        )
    ev = evaluate(inst, chosen)
    hashes = scenario_hashes(s)
    body = {
        "status": result.status,
        "selected": list(result.chosen),
        "display": group(s, inst, result.chosen, paths),
        "objective": ev.objective if chosen else None,
        "constraints": constraint_results(s, inst, chosen),
        "rejected": rejections(inst, chosen),
        "infeasibility": infeasibility,
        "plan_time": plan_time,
        "paths": [p.id + ":" + ">".join(p.edge_ids) for p in paths],
        "inputs": hashes,
    }
    digest = sha256_hex(body)
    return Plan(
        id=f"PLAN-{digest[:12]}",
        status=result.status,
        selected_candidate_ids=list(result.chosen),
        display_actions=body["display"],
        objective=Objective(value=ev.objective, terms=ev.terms) if result.status == "optimal" else None,
        constraints=body["constraints"],
        rejected=body["rejected"],
        infeasibility=infeasibility,
        solver=SolverInfo(
            version=ORTOOLS_VERSION, wall_ms=round(result.wall_ms, 2), status_raw=result.status_raw
        ),
        input_hashes=PlanInputHashes(
            graph=hashes["graph"],
            paths=sha256_hex(list(paths)),
            actions=hashes["actions"],
            policies=hashes["policies"],
        ),
        meta=Meta(
            incident_id=s.incident.id,
            seed=seed,
            generated_at=plan_time,
            input_hashes={**hashes, "plan_body": digest},
        ),
    )
