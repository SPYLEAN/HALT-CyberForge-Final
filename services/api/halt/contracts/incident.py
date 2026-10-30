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
    "rolled_back",
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
    # EchoLab: chance the attacker gets round a soft cut (e.g. replays from another network).
    soft_cut_evasion_p: float = Field(ge=0, le=1)


Severity = Literal["low", "medium", "high", "critical"]


class IncidentSpec(Contract):
    id: IncidentId
    title: str
    summary: str
    severity: Severity  # scenario input (synthetic), shown as given; HALT does not score it
    t0: AwareDatetime  # replay clock zero
    params: IncidentParams
    synthetic: Literal[True] = True


class IncidentSummary(Contract):
    id: IncidentId
    title: str
    state: IncidentState
    t0: AwareDatetime


class LatestArtefacts(Contract):
    """Ids of the incident's current artefacts, so a client can rehydrate after a reload."""

    plan_id: str | None = None
    simulation_id: str | None = None
    proof_id: str | None = None
    execution_id: str | None = None


class Incident(Contract):
    id: IncidentId
    title: str
    summary: str
    t0: AwareDatetime
    params: IncidentParams
    state: IncidentState
    confidence: Derivation | None
    severity: Severity
    replay_end_s: float  # last timeline message (replay seconds); the scrubber's range
    replay_cursor_s: float | None  # last position a client sought to (persisted); null = start at the end
    latest: LatestArtefacts
    variant: str  # active demo variant key (scenario variants.json); "baseline" unless reset to another
    meta: Meta
