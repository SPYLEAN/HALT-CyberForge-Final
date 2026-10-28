"""EchoLab requests and results. See docs/DATA_CONTRACTS.md §6."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from halt.contracts.common import Contract, Derivation, Meta, Sha256

FutureLabel = Literal["A", "B", "C"]


class PlanRef(Contract):
    label: FutureLabel
    source: Literal["preset_aggressive", "preset_passive", "plan"]
    plan_id: str | None = None


class SimulationRequest(Contract):
    plans: list[PlanRef] = Field(min_length=1, max_length=3)
    rollouts: int = Field(default=6000, ge=100, le=20000)
    horizon_s: int = Field(default=600, gt=0)
    seed: int = 2417


class ProcessAvailability(Contract):
    process_id: str
    down_from_s: int | None  # null = up for the whole horizon


class FutureResult(Contract):
    label: FutureLabel
    action_ids: list[str]
    paths_blocked: Derivation
    target_reached: Derivation
    path_reached: dict[str, int]  # path id -> rollouts that reached the target along it
    users_affected: Derivation
    downtime_min: dict[str, int]
    availability: list[ProcessAvailability]
    reversible: bool
    evidence_preserved: bool


class SimulationRun(Contract):
    id: str
    request: SimulationRequest
    futures: list[FutureResult]
    hash: Sha256
    meta: Meta
