"""Request bodies and response envelopes for the HTTP API. Every response envelope carries Meta."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from halt.contracts.actions import ResponseAction
from halt.contracts.audit import AuditEntry
from halt.contracts.common import Contract, Derivation, Meta
from halt.contracts.constraints import Approver, Constraint, ConstraintId, Policy, PolicyProfile, ProfileId
from halt.contracts.events import SecurityEvent
from halt.contracts.findings import AttackPath, Finding
from halt.contracts.gate import Approval, Execution
from halt.contracts.incident import IncidentSummary

# ---- requests


class CorrelateRequest(Contract):
    until: float | None = Field(default=None, ge=0)  # replay seconds; null = everything


class ConstraintOverride(Contract):
    constraint_id: ConstraintId
    limit: float | bool | None


class PlanRequest(Contract):
    constraint_overrides: list[ConstraintOverride] = Field(default_factory=list)
    # The policy profile to solve under (GET /policies lists them); null = the default, Continuity Balanced.
    profile_id: ProfileId | None = None


class ApprovalRequest(Contract):
    policy_id: str
    approver_id: str
    decision: Literal["approved", "declined"] = "approved"
    note: str | None = None


class ExecuteRequest(Contract):
    proof_id: str


class ResetRequest(Contract):
    variant: str = "baseline"


class ExplainRequest(Contract):
    subject_id: str


# ---- responses


class IncidentList(Contract):
    items: list[IncidentSummary]
    meta: Meta


class EventList(Contract):
    items: list[SecurityEvent]
    meta: Meta


class FindingList(Contract):
    items: list[Finding]
    confidence: Derivation | None
    meta: Meta


class PathList(Contract):
    items: list[AttackPath]
    meta: Meta


class ActionList(Contract):
    items: list[ResponseAction]
    meta: Meta


class PolicySet(Contract):
    policies: list[Policy]
    approvers: list[Approver]
    constraints: list[Constraint]  # C-COVER and C-RESIDUAL carry no limit here: each profile sets them
    profiles: list[PolicyProfile]
    meta: Meta


class VariantInfo(Contract):
    """A demo scenario variant: one changed input that shows the plan is derived, not scripted."""

    key: str
    title: str
    description: str


class VariantList(Contract):
    items: list[VariantInfo]
    active: str
    meta: Meta


class ApprovalResult(Contract):
    approval: Approval
    outstanding_roles: list[str]
    meta: Meta


class ApprovalList(Contract):
    items: list[Approval]
    outstanding_roles: list[str]
    meta: Meta


class ExecutionResult(Contract):
    execution: Execution
    meta: Meta


class AuditList(Contract):
    items: list[AuditEntry]
    meta: Meta


class AuditVerify(Contract):
    valid: bool
    length: int
    head_hash: str
    first_bad_seq: int | None
    enforcement: Literal["db", "app"]
    meta: Meta


class ProofVerify(Contract):
    certificate_match: bool
    signature_valid: bool
    recomputed: str
    meta: Meta


class ExplainResult(Contract):
    subject_id: str
    text: str
    cited_ids: list[str]
    engine: Literal["template", "llm"]
    meta: Meta
