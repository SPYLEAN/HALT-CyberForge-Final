"""Policy comparison: one incident solved under each policy profile, and the trade-off between them.
See docs/DATA_CONTRACTS.md §7a."""

from __future__ import annotations

from typing import Literal

from halt.contracts.actions import DisplayAction
from halt.contracts.common import Contract, Derivation, Meta
from halt.contracts.constraints import ConstraintResult, PolicyProfile, ProfileId
from halt.contracts.plan import Infeasibility, ResidualRisk


class ProfileOutcome(Contract):
    """SafeCut's answer under one profile, with EchoLab's simulation of that answer."""

    profile: PolicyProfile
    plan_id: str  # deterministic: the id POST /plans {profile_id} returns for the same inputs
    status: Literal["optimal", "infeasible"]
    selected_candidate_ids: list[str]
    display_actions: list[DisplayAction]
    constraints: list[ConstraintResult]
    residual: ResidualRisk | None
    simulated_reach: Derivation | None  # EchoLab, plan applied: rollouts still reaching the asset
    users_affected: int | None
    critical_downtime_min: int | None
    approval_roles: list[str]  # roles that must approve the selected actions at plan time
    infeasibility: Infeasibility | None


class PolicyTradeoff(Contract):
    """What moving from one profile to the other costs and buys. Every number is a difference of the two
    outcomes; every reason names the actions and paths it rests on."""

    from_profile: ProfileId
    to_profile: ProfileId
    added_candidate_ids: list[str]
    removed_candidate_ids: list[str]
    newly_cut_path_ids: list[str]
    reopened_path_ids: list[str]
    delta_users: int | None
    delta_critical_downtime_min: int | None
    delta_actions: int | None
    added_roles: list[str]
    delta_reach_bound: int | None
    delta_simulated_reach: int | None
    reasons: list[str]


class PolicyComparison(Contract):
    outcomes: list[ProfileOutcome]
    tradeoff: PolicyTradeoff
    meta: Meta
