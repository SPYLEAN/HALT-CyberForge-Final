"""Constraints, policies and approvers. See docs/DATA_CONTRACTS.md §5."""

from __future__ import annotations

from datetime import time
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from halt.contracts.actions import ActionType
from halt.contracts.common import Contract, Derivation

ConstraintId = Literal[
    "C-COVER", "C-RESIDUAL", "C-DOWNTIME", "C-USERS", "C-REVERSIBLE", "C-AUTH", "C-EVIDENCE"
]
ProfileId = Literal["continuity_balanced", "critical_asset_zero_tolerance"]
PolicyId = Annotated[str, StringConstraints(pattern=r"^IR-[A-Z]+-\d{2}$")]


class Constraint(Contract):
    id: ConstraintId
    label: str
    kind: Literal["hard", "soft"]
    limit: float | bool | None
    unit: Literal["min", "users", "s", "paths", "risk", "rollouts"] | None = None


class ConstraintResult(Contract):
    constraint_id: ConstraintId
    state: Literal["met", "binding", "violated"]
    value: str
    limit: str
    derivation: Derivation


class PolicyProfile(Contract):
    """A containment policy for one protected asset. It is expressed entirely as two constraint limits,
    applied to the scenario before SafeCut, EchoLab and ProofSeal run (halt/scenario/profiles.py):

    - C-COVER: every enumerated path to the asset whose simulated risk is at least `cover_min_risk` must have
      a hard cut on its live route (0 = every enumerated path);
    - C-RESIDUAL: the paths left open may together reach the asset in at most `residual_reach_limit`
      simulated rollouts (an upper bound: the sum of each open path's own reach count).
    """

    id: ProfileId
    title: str
    summary: str
    protected_asset_id: str
    cover_min_risk: float = Field(ge=0, le=1)
    residual_reach_limit: int = Field(ge=0)


class PolicyWindow(Contract):
    """A UTC window (e.g. a change freeze) during which the exception role must also approve."""

    start: time
    end: time
    exception_role: str


class Policy(Contract):
    id: PolicyId
    title: str
    applies_to_action_types: list[ActionType] = Field(default_factory=list)
    required_roles: list[str] = Field(default_factory=list)
    window: PolicyWindow | None = None
    rationale: str


class Approver(Contract):
    id: str
    name: str
    roles: list[str] = Field(min_length=1)
    available: bool
    user_node_id: str | None = None
