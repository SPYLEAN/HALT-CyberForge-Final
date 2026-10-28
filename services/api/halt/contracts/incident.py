"""Incident spec (fixture) and incident state (API)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints

from halt.contracts.common import Contract, Derivation, Meta

IncidentId = Annotated[str, StringConstraints(pattern=r"^INC-\d{4}$")]

IncidentState = Literal[
    "new",
    "correlating",
    "forecast_ready",
    "simulating",
    "plan_available",
    "approval_pending",
    "executing",
    "contained",
    "rollback_available",
    "blocked_by_policy",
    "no_safe_plan",
]


class IncidentParams(Contract):
    target_id: str
    seed: int
    horizon_s: int = Field(gt=0)
    rollouts: int = Field(gt=0)
    high_risk_threshold: float = Field(gt=0, le=1)
    # How long actions stay in force; a process whose dependencies they break is down this long.
    containment_window_min: int = Field(gt=0)


class IncidentSpec(Contract):
    id: IncidentId
    title: str
    summary: str
    t0: AwareDatetime  # replay clock zero
    params: IncidentParams
    synthetic: Literal[True] = True


class IncidentSummary(Contract):
    id: IncidentId
    title: str
    state: IncidentState
    t0: AwareDatetime


class Incident(Contract):
    id: IncidentId
    title: str
    summary: str
    t0: AwareDatetime
    params: IncidentParams
    state: IncidentState
    confidence: Derivation | None
    meta: Meta
