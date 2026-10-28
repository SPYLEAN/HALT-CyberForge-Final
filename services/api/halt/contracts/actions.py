"""Candidate response actions. impact, reversibility and authorisation are required (AT-1.3)."""

from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import Field, StringConstraints, model_validator

from halt.contracts.common import Contract, Strength

ActionType = Literal[
    "revoke_oauth_grant",
    "revoke_session",
    "conditional_access_step_up",
    "isolate_api",
    "isolate_database",
    "isolate_subnet",
    "disable_account",
    "block_asn",
    "revoke_all_consents",
    "force_password_reset",
    "quarantine_mailbox",
]

CandidateId = Annotated[str, StringConstraints(pattern=r"^C\d{2}$")]


class Cut(Contract):
    ref: str
    ref_type: Literal["node", "edge"]
    strength: Strength
    rationale: str = Field(min_length=1)


class UserGroupImpact(Contract):
    group_id: str
    users: int = Field(gt=0)


class ProcessDowntime(Contract):
    process_id: str
    downtime_min: int = Field(ge=0)


class Impact(Contract):
    users: list[str] = Field(default_factory=list)  # named user node ids
    groups: list[UserGroupImpact] = Field(default_factory=list)  # bulk impact, counted as disjoint
    processes: list[ProcessDowntime] = Field(default_factory=list)  # computed by SafeCut, empty in fixture
    description: str = Field(min_length=1)


class Reversibility(Contract):
    reversible: bool
    rollback_id: str | None
    method: str = Field(min_length=1)
    seconds: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _rules(self) -> Self:
        if self.reversible and (self.rollback_id is None or self.seconds is None):
            raise ValueError("a reversible action needs rollback_id and seconds")
        return self


class Authorisation(Contract):
    policy_ids: list[str] = Field(min_length=1)
    required_roles: list[str] = Field(min_length=1)
    permission_scope: str = Field(min_length=1)


class ResponseAction(Contract):
    id: CandidateId
    type: ActionType
    title: str = Field(min_length=1)
    targets: list[str] = Field(min_length=1)
    cuts: list[Cut] = Field(default_factory=list)
    impact: Impact
    reversibility: Reversibility
    authorisation: Authorisation
    evidence_preserving: bool
    connector: Literal["simulated"] = "simulated"


class DisplayAction(Contract):
    id: Annotated[str, StringConstraints(pattern=r"^A\d+$")]
    candidate_ids: list[CandidateId] = Field(min_length=1)
    title: str
    blocks_path_ids: list[str]
