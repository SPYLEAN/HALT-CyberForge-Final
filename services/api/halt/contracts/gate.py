"""Action Gate. See docs/DATA_CONTRACTS.md §9."""

from __future__ import annotations

from typing import Literal

from pydantic import AwareDatetime

from halt.contracts.common import Contract, Sha256

GateState = Literal["review", "blocked_by_policy", "executing", "applied", "rolled"]


class Approval(Contract):
    id: str
    plan_id: str
    policy_id: str
    approver_id: str
    decision: Literal["approved", "declined"]
    at: AwareDatetime
    note: str | None = None


class ExecutionStep(Contract):
    display_action_id: str
    candidate_id: str
    status: Literal["pending", "applied", "rolled_back", "failed"]
    at: AwareDatetime | None = None
    post_snapshot_hash: Sha256 | None = None


class Execution(Contract):
    id: str
    plan_id: str
    proof_id: str
    state: GateState
    steps: list[ExecutionStep]
    rollback_window_until: AwareDatetime | None
