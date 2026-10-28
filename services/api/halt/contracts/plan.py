"""SafeCut plan. See docs/DATA_CONTRACTS.md §7."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from halt.contracts.actions import DisplayAction
from halt.contracts.common import Contract, Meta, Sha256
from halt.contracts.constraints import ConstraintId, ConstraintResult


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


class Plan(Contract):
    id: str
    status: Literal["optimal", "infeasible"]
    selected_candidate_ids: list[str]
    display_actions: list[DisplayAction]
    objective: Objective | None
    constraints: list[ConstraintResult]
    rejected: list[Rejection]
    infeasibility: Infeasibility | None = None
    solver: SolverInfo
    input_hashes: PlanInputHashes
    meta: Meta
