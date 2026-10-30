"""Scenario fixture models: the incident, its graph, the action catalogue, policies and variants."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from halt.contracts.actions import ResponseAction
from halt.contracts.common import Contract, Strength
from halt.contracts.constraints import Approver, Constraint, ConstraintId, Policy, PolicyProfile, ProfileId
from halt.contracts.events import SecurityEvent
from halt.contracts.graph import GraphEdge, GraphNode
from halt.contracts.incident import IncidentSpec


class Topology(Contract):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class RemoveEdge(Contract):
    op: Literal["remove_edge"]
    edge_id: str


class SetApproverAvailability(Contract):
    op: Literal["set_approver_availability"]
    approver_id: str
    available: bool


class SetCutStrength(Contract):
    op: Literal["set_cut_strength"]
    action_id: str
    ref: str
    strength: Strength


class SetConstraintLimit(Contract):
    op: Literal["set_constraint_limit"]
    constraint_id: ConstraintId
    limit: float | bool | None


VariantOp = Annotated[
    RemoveEdge | SetApproverAvailability | SetCutStrength | SetConstraintLimit, Field(discriminator="op")
]


class Variant(Contract):
    key: str = Field(pattern=r"^[a-z0-9_]+$")
    title: str
    description: str
    ops: list[VariantOp]


class Preset(Contract):
    """A fixed comparison response for EchoLab (futures A and B); never an input to SafeCut."""

    key: Literal["preset_aggressive", "preset_passive"]
    title: str
    description: str
    action_ids: list[str]


class Scenario(Contract):
    incident: IncidentSpec
    events: list[SecurityEvent]
    background_events: list[SecurityEvent]
    topology: Topology
    actions: list[ResponseAction]
    policies: list[Policy]
    approvers: list[Approver]
    constraints: list[Constraint]
    variants: list[Variant]
    presets: list[Preset]
    profiles: list[PolicyProfile]
    variant: str = "baseline"
    profile_id: ProfileId | None = None  # set by profiles.apply_profile; None = limits not yet applied
