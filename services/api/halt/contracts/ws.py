"""WebSocket messages for /ws/incidents/{id}. See docs/DATA_CONTRACTS.md §11."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from halt.contracts.common import Contract
from halt.contracts.events import SecurityEvent
from halt.contracts.findings import Finding
from halt.contracts.gate import Execution
from halt.contracts.graph import GraphEdge, GraphNode
from halt.contracts.incident import IncidentState

# client -> server


class PlayCommand(Contract):
    type: Literal["play", "pause"]
    speed: Literal[1, 4, 16] = 1


class SeekCommand(Contract):
    type: Literal["seek"]
    t: float = Field(ge=0)


class SubscribeCommand(Contract):
    type: Literal["subscribe"]


ClientMessage = Annotated[PlayCommand | SeekCommand | SubscribeCommand, Field(discriminator="type")]

# server -> client: every message carries seq and t (replay seconds since incident t0)


class _ServerMessage(Contract):
    seq: int = Field(ge=0)
    t: float = Field(ge=0)


class ClockMessage(_ServerMessage):
    type: Literal["clock"] = "clock"
    playing: bool
    speed: Literal[1, 4, 16]


class EventMessage(_ServerMessage):
    type: Literal["event"] = "event"
    event: SecurityEvent


class GraphDeltaMessage(_ServerMessage):
    type: Literal["graph_delta"] = "graph_delta"
    add_nodes: list[GraphNode]
    add_edges: list[GraphEdge]


class FindingMessage(_ServerMessage):
    type: Literal["finding"] = "finding"
    finding: Finding


class StageMessage(_ServerMessage):
    type: Literal["stage"] = "stage"
    state: IncidentState


class GateMessage(_ServerMessage):
    type: Literal["gate"] = "gate"
    execution: Execution


class StaleMessage(_ServerMessage):
    type: Literal["stale"] = "stale"
    reason: str


ServerMessage = Annotated[
    ClockMessage
    | EventMessage
    | GraphDeltaMessage
    | FindingMessage
    | StageMessage
    | GateMessage
    | StaleMessage,
    Field(discriminator="type"),
]
