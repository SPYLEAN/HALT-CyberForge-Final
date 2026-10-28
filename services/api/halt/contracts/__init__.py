"""Contract models: the single schema source for the API, OpenAPI and the generated TypeScript types."""

from __future__ import annotations

from pydantic import BaseModel

from halt.contracts.actions import DisplayAction, ResponseAction
from halt.contracts.audit import AuditEntry
from halt.contracts.common import ApiError, Derivation, Meta
from halt.contracts.constraints import Approver, Constraint, ConstraintResult, Policy
from halt.contracts.events import SecurityEvent
from halt.contracts.findings import AttackPath, Finding
from halt.contracts.gate import Approval, Execution
from halt.contracts.graph import GraphEdge, GraphNode, GraphSnapshot
from halt.contracts.incident import Incident, IncidentSpec, IncidentSummary
from halt.contracts.plan import Plan
from halt.contracts.proof import Proof
from halt.contracts.simulation import SimulationRequest, SimulationRun
from halt.contracts.ws import (
    ClockMessage,
    EventMessage,
    FindingMessage,
    GateMessage,
    GraphDeltaMessage,
    PlayCommand,
    SeekCommand,
    StageMessage,
    StaleMessage,
    SubscribeCommand,
)

# Published in OpenAPI components even before a route uses them, so the frontend types exist from Phase 1.
CONTRACT_MODELS: list[type[BaseModel]] = [
    ApiError,
    Approval,
    Approver,
    AttackPath,
    AuditEntry,
    ClockMessage,
    Constraint,
    ConstraintResult,
    Derivation,
    DisplayAction,
    EventMessage,
    Execution,
    Finding,
    FindingMessage,
    GateMessage,
    GraphDeltaMessage,
    GraphEdge,
    GraphNode,
    GraphSnapshot,
    Incident,
    IncidentSpec,
    IncidentSummary,
    Meta,
    Plan,
    PlayCommand,
    Policy,
    Proof,
    ResponseAction,
    SecurityEvent,
    SeekCommand,
    SimulationRequest,
    SimulationRun,
    StageMessage,
    StaleMessage,
    SubscribeCommand,
]

__all__ = ["CONTRACT_MODELS"]
