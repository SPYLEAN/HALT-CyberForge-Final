"""Solve one incident under every policy profile and state the exact trade-off between the answers.

Nothing here chooses actions: each outcome is SafeCut's plan under that profile's constraint limits, simulated
by EchoLab with the incident's own parameters. The trade-off is the difference of the two outcomes, and each
reason is assembled from the plans' own data: the selected actions, the paths they cut, and the rejection
reasons of the actions that could have cut a path.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta

from halt.contracts.common import Meta
from halt.contracts.findings import AttackPath
from halt.contracts.plan import Plan
from halt.contracts.policy import PolicyComparison, PolicyTradeoff, ProfileOutcome
from halt.contracts.simulation import PlanRef, SimulationRequest
from halt.echolab.simulate import simulate
from halt.safecut.instance import PLAN_TIME_OFFSET_S, required_roles
from halt.safecut.solve import solve
from halt.scenario.loader import scenario_hashes
from halt.scenario.models import Scenario
from halt.scenario.profiles import apply_profile, profile
from halt.threadgraph.cuts import blocks, removal_for


def outcome(s: Scenario, paths: Sequence[AttackPath], plan: Plan) -> ProfileOutcome:
    s = apply_profile(s, plan.profile_id)
    params = s.incident.params
    actions = {a.id: a for a in s.actions}
    simulated = None
    if plan.status == "optimal":
        run = simulate(
            s,
            paths,
            SimulationRequest(
                plans=[PlanRef(label="C", source="plan", plan_id=plan.id)],
                rollouts=params.rollouts,
                horizon_s=params.horizon_s,
                seed=params.seed,
            ),
            {plan.id: plan.selected_candidate_ids},
        )
        simulated = run.futures[0].target_reached
    downtime = next(c for c in plan.constraints if c.constraint_id == "C-DOWNTIME").derivation.numerator
    at = plan.meta.generated_at
    roles = sorted({r for cid in plan.selected_candidate_ids for r in required_roles(s, actions[cid], at)})
    return ProfileOutcome(
        profile=profile(s),
        plan_id=plan.id,
        status=plan.status,
        selected_candidate_ids=plan.selected_candidate_ids,
        display_actions=plan.display_actions,
        constraints=plan.constraints,
        residual=plan.residual,
        simulated_reach=simulated,
        users_affected=plan.objective.terms["users"] if plan.objective else None,
        critical_downtime_min=downtime if plan.status == "optimal" else None,
        approval_roles=roles,
        infeasibility=plan.infeasibility,
    )


def _diff(a: int | None, b: int | None) -> int | None:
    return None if a is None or b is None else b - a


def _required(s: Scenario, plan: Plan, paths: Mapping[str, AttackPath]) -> set[str]:
    """Paths the plan's profile requires cut, read from its C-COVER limit."""
    threshold = profile(s, plan.profile_id).cover_min_risk
    return {
        pid for pid, p in paths.items() if p.target_id == s.incident.params.target_id and p.risk >= threshold
    }


def tradeoff(
    s: Scenario,
    paths: Mapping[str, AttackPath],
    base: ProfileOutcome,
    other: ProfileOutcome,
    other_plan: Plan,
) -> PolicyTradeoff:
    titles = {a.id: a.title for a in s.actions}
    both = base.status == other.status == "optimal"
    # Added and removed actions only mean something when both profiles have a plan to run.
    added = sorted(set(other.selected_candidate_ids) - set(base.selected_candidate_ids)) if both else []
    removed = sorted(set(base.selected_candidate_ids) - set(other.selected_candidate_ids)) if both else []
    base_open = set(base.residual.open_path_ids) if base.residual else set()
    other_open = set(other.residual.open_path_ids) if other.residual else set()
    newly_cut = sorted(base_open - other_open) if other.residual else []
    reopened = sorted(other_open - base_open) if base.residual else []
    reach = {pid: p.reach for pid, p in paths.items()}
    reasons: list[str] = []

    if base.status == other.status == "optimal":
        if not added and not removed:
            reasons.append(
                f"{other.profile.title} selects the same actions as {base.profile.title}: every path it "
                "requires cut is already cut."
            )
        for cid in added:
            cuts = sorted(
                {p for d in other.display_actions if cid in d.candidate_ids for p in d.blocks_path_ids}
            )
            reasons.append(
                f"{cid} ({titles[cid]}) is added because it hard-cuts {', '.join(cuts)}, which "
                f"{other.profile.title} requires cut."
            )
        for pid in newly_cut:
            r = reach[pid]
            reasons.append(
                f"{pid} was open under {base.profile.title} as accepted residual risk ({r.numerator:,} of "
                f"{r.denominator:,} simulated rollouts reach the target along it on its own); "
                f"{other.profile.title} does not allow any enumerated path to stay open."
            )
    if other.status == "infeasible":
        rejected = {r.candidate_id: r.reasons for r in other_plan.rejected}
        must = sorted(_required(s, other_plan, paths) - (set(paths) - base_open))
        for pid in must:
            cutters = [a.id for a in s.actions if blocks(paths[pid], removal_for([a]))]
            if not cutters:
                reasons.append(
                    f"{other.profile.title} must cut {pid}, and no action in the catalogue hard-cuts it."
                )
                continue
            reasons.append(
                f"{other.profile.title} must cut {pid} ({' → '.join(paths[pid].node_ids)}). "
                "The only actions with a "
                "hard cut on it are "
                + "; ".join(f"{c} ({titles[c]}): {', '.join(rejected.get(c, ['excluded']))}" for c in cutters)
                + "."
            )
        if other.infeasibility:
            reasons.append(
                f"So no plan satisfies every constraint of {other.profile.title} while "
                f"{', '.join(must) or 'its required paths'} must be cut. Relaxing "
                f"{', '.join(other.infeasibility.violated_constraint_ids)} would restore one; "
                "HALT does not run a partial plan without an analyst decision."
            )
    if base.status == "infeasible":
        reasons.append(
            f"{base.profile.title} has no feasible plan either, so there is no trade-off to price."
        )

    return PolicyTradeoff(
        from_profile=base.profile.id,
        to_profile=other.profile.id,
        added_candidate_ids=added,
        removed_candidate_ids=removed,
        newly_cut_path_ids=newly_cut,
        reopened_path_ids=reopened,
        delta_users=_diff(base.users_affected, other.users_affected),
        delta_critical_downtime_min=_diff(base.critical_downtime_min, other.critical_downtime_min),
        delta_actions=len(other.selected_candidate_ids) - len(base.selected_candidate_ids) if both else None,
        added_roles=sorted(set(other.approval_roles) - set(base.approval_roles)) if both else [],
        delta_reach_bound=_diff(
            base.residual.reach_bound.numerator if base.residual else None,
            other.residual.reach_bound.numerator if other.residual else None,
        ),
        delta_simulated_reach=_diff(
            base.simulated_reach.numerator if base.simulated_reach else None,
            other.simulated_reach.numerator if other.simulated_reach else None,
        ),
        reasons=reasons,
    )


def compare(s: Scenario, paths: Sequence[AttackPath], plan_time: datetime | None = None) -> PolicyComparison:
    """Every profile in fixture order; the trade-off runs from the first (the default) to the last. With the
    default plan time, each outcome's plan_id is the id POST /plans {profile_id} returns."""
    plan_time = plan_time or s.incident.t0 + timedelta(seconds=PLAN_TIME_OFFSET_S)
    plans = [solve(apply_profile(s, p.id), paths, plan_time) for p in s.profiles]
    outcomes = [outcome(s, paths, plan) for plan in plans]
    return PolicyComparison(
        outcomes=outcomes,
        tradeoff=tradeoff(s, {p.id: p for p in paths}, outcomes[0], outcomes[-1], plans[-1]),
        meta=Meta(
            incident_id=s.incident.id,
            seed=s.incident.params.seed,
            generated_at=plan_time,
            input_hashes=scenario_hashes(s),
        ),
    )
