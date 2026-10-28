"""ThreadGraph nodes, edges and snapshots. See docs/DATA_CONTRACTS.md §2."""

from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, Field, StringConstraints, model_validator

from halt.contracts.common import Contract, EvidenceId, Meta, Provenance, Sha256

NodeKind = Literal[
    "user", "device", "session", "token", "application", "api", "service", "database", "process", "attacker"
]
EdgeKind = Literal["hostile", "dependency", "identity"]

NodeId = Annotated[str, StringConstraints(pattern=r"^[a-z]+\.[a-z0-9_]+$")]
EdgeId = Annotated[str, StringConstraints(pattern=r"^[a-z]\.[a-z0-9-]+$")]


class Layout(Contract):
    x: float
    y: float


class BusinessInfo(Contract):
    users: int = Field(ge=0)
    deadline: str | None = None  # e.g. "16:00Z"
    owner: str | None = None


class GraphNode(Contract):
    id: NodeId
    kind: NodeKind
    label: str = Field(min_length=1)
    provenance: Provenance
    attacker_controlled: bool = False
    criticality: Literal["none", "standard", "critical"] = "none"
    business: BusinessInfo | None = None
    evidence_ids: list[EvidenceId] = Field(default_factory=list)
    origin: str | None = None  # source of a structural fact, e.g. "Dependency map v14"
    first_seen: AwareDatetime | None = None  # null = visible from the start of the replay
    layout: Layout

    @model_validator(mode="after")
    def _rules(self) -> Self:
        if self.provenance == "observed" and not self.evidence_ids:
            raise ValueError(f"{self.id}: observed node needs at least one evidence id")
        if self.provenance == "forecast" and self.evidence_ids:
            raise ValueError(f"{self.id}: forecast node must not carry evidence ids")
        if self.provenance == "structural" and not self.origin:
            raise ValueError(f"{self.id}: structural node needs an origin")
        if (self.kind == "attacker") != self.attacker_controlled:
            raise ValueError(f"{self.id}: kind 'attacker' and attacker_controlled must agree")
        return self


class Inference(Contract):
    confidence: float = Field(gt=0, lt=1)
    rationale: str = Field(min_length=1)


class Transition(Contract):
    """EchoLab input: per rollout the hop succeeds with probability p after a uniform delay."""

    p: float = Field(gt=0, le=1)
    delay_s: tuple[int, int]

    @model_validator(mode="after")
    def _delay(self) -> Self:
        lo, hi = self.delay_s
        if lo < 0 or hi < lo:
            raise ValueError("delay_s must be [lo, hi] with 0 <= lo <= hi")
        return self


class GraphEdge(Contract):
    id: EdgeId
    source: NodeId
    target: NodeId
    kind: EdgeKind
    relation: str = Field(min_length=1)
    provenance: Provenance
    evidence_ids: list[EvidenceId] = Field(default_factory=list)
    origin: str | None = None
    inference: Inference | None = None
    transition: Transition | None = None
    historical: bool = False  # already happened; cannot be cut
    first_seen: AwareDatetime | None = None

    @model_validator(mode="after")
    def _rules(self) -> Self:
        if self.source == self.target:
            raise ValueError(f"{self.id}: self-loop")
        if self.kind == "hostile" and self.provenance == "observed" and not self.evidence_ids:
            raise ValueError(f"{self.id}: observed hostile edge needs at least one evidence id")
        if self.provenance == "forecast" and self.evidence_ids:
            raise ValueError(f"{self.id}: forecast edge must not carry evidence ids")
        if (self.provenance == "inferred") != (self.inference is not None):
            raise ValueError(f"{self.id}: inference is required for inferred edges and only for them")
        if self.provenance == "structural" and not self.origin:
            raise ValueError(f"{self.id}: structural edge needs an origin")
        if self.historical and self.kind != "hostile":
            raise ValueError(f"{self.id}: only hostile edges can be historical")
        live_hostile = self.kind == "hostile" and not self.historical
        if live_hostile != (self.transition is not None):
            raise ValueError(f"{self.id}: transition is required for live hostile edges and only for them")
        return self


class Removed(Contract):
    node_ids: list[str] = Field(default_factory=list)
    edge_ids: list[str] = Field(default_factory=list)


class GraphSnapshot(Contract):
    id: str
    hash: Sha256
    at: AwareDatetime
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    removed: Removed = Removed()
    meta: Meta
