"""Constraints, policies and approvers. See docs/DATA_CONTRACTS.md §5."""

from __future__ import annotations

from datetime import time
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from halt.contracts.actions import ActionType
from halt.contracts.common import Contract, Derivation

ConstraintId = Literal["C-COVER", "C-DOWNTIME", "C-USERS", "C-REVERSIBLE", "C-AUTH", "C-EVIDENCE"]
PolicyId = Annotated[str, StringConstraints(pattern=r"^IR-[A-Z]+-\d{2}$")]


class Constraint(Contract):
    id: ConstraintId
    label: str
    kind: Literal["hard", "soft"]
    limit: float | bool | None
    unit: Literal["min", "users", "s", "paths"] | None = None


class ConstraintResult(Contract):
    constraint_id: ConstraintId
    state: Literal["met", "binding", "violated"]
    value: str
    limit: str
    derivation: Derivation


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
