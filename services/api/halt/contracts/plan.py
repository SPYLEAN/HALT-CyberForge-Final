"""SafeCut plan. See docs/DATA_CONTRACTS.md §7."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from halt.contracts.actions import DisplayAction
from halt.contracts.common import Contract, Derivation, Meta, Sha256
from halt.contracts.constraints import ConstraintId, ConstraintResult, ProfileId


class Objective(Contract):
    value: int
    terms: dict[str, int]


class Rejection(Contract):
    candidate_id: str
    reasons: list[str] = Field(min_length=1)


class ClosestOption(Contract):
    candidate_ids: list[str]
    breaks: list[ConstraintResult]


class Infeasibility(Contract):
    violated_constraint_ids: list[ConstraintId] = Field(min_length=1)
    closest_options: list[ClosestOption] = Field(max_length=3)


class SolverInfo(Contract):
    engine: Literal["ortools-cp-sat"] = "ortools-cp-sat"
    version: str
    wall_ms: float
    status_raw: str


class PlanInputHashes(Contract):
    graph: Sha256
    paths: Sha256
    actions: Sha256
    policies: Sha256


class ResidualRisk(Contract):
    """What a plan leaves open on the way to the protected asset, judged by its policy profile.

    `reach_bound` sums each open path's own simulated reach count: an upper bound on the rollouts that can
    still reach the asset through them (EchoLab's future C measures the actual count). Never a claim of zero
    real-world risk: only enumerated paths in the modelled graph are counted.
    """

    protected_asset_id: str
    enumerated_path_ids: list[str]  # every path to the asset ThreadGraph enumerated
    required_path_ids: list[str]  # those the policy requires cut (C-COVER)
    open_path_ids: list[str]  # those left without a hard cut
    reach_bound: Derivation  # numerator: summed reach of the open paths; denominator: rollouts
    limit: int  # C-RESIDUAL
    within_limit: bool
    uncertainty: list[str]  # why the open paths' numbers are estimates (inferred edges, simulation)


class Plan(Contract):
    id: str
    status: Literal["optimal", "infeasible"]
    profile_id: ProfileId  # the policy profile whose limits this plan was solved under
    selected_candidate_ids: list[str]
    display_actions: list[DisplayAction]
    objective: Objective | None
    constraints: list[ConstraintResult]
    rejected: list[Rejection]
    infeasibility: Infeasibility | None = None
    residual: ResidualRisk | None  # null when infeasible: there is no plan to leave anything open
    solver: SolverInfo
    input_hashes: PlanInputHashes
    meta: Meta
