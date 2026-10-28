"""HALT-R1 findings and ThreadGraph attack paths. See docs/DATA_CONTRACTS.md §3."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from halt.contracts.common import Contract, Derivation, EvidenceId
from halt.contracts.events import AttackTechnique

Stage = Literal[
    "initial_access", "credential_persistence", "token_abuse", "discovery", "collection", "exfiltration"
]


class FindingScore(Contract):
    value: float = Field(ge=0, le=1)
    derivation: Derivation
    method: Literal["rule", "logreg", "gbm"]


class Finding(Contract):
    id: Annotated[str, StringConstraints(pattern=r"^F-\d{2}$")]
    title: str
    stage: Stage
    evidence_ids: list[EvidenceId] = Field(min_length=1)
    score: FindingScore  # deterministic rule score: the explainable primary
    model_score: FindingScore | None = None  # configured baseline model (AT-2.6), shown alongside
    attack: list[AttackTechnique] = Field(default_factory=list)
    limits: list[str] = Field(default_factory=list)


class AttackPath(Contract):
    id: Annotated[str, StringConstraints(pattern=r"^(P|U)\d+$")]
    node_ids: list[str] = Field(min_length=2)
    edge_ids: list[str] = Field(min_length=1)
    target_id: str
    provenance: Literal["observed", "mixed", "forecast"]
    reach: Derivation
    risk: float = Field(ge=0)
    high_risk: bool
    uncertain: bool
