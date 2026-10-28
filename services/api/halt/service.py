"""Incident runtime: orchestrates HALT-R1, ThreadGraph, EchoLab, SafeCut, ProofSeal and the Action Gate.

One runtime per incident, held in memory and written through to the database (artefacts + audit log).
The operator clock is logical: it starts at plan time (t0 + 15 min) and advances 15 s per state-changing
operation, so repeated demo runs produce identical audit timestamps, proofs and certificates.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from halt.audit.log import AuditLog
from halt.canonical import sha256_hex
from halt.contracts.common import Derivation, Meta
from halt.contracts.events import SecurityEvent
from halt.contracts.findings import AttackPath, Finding
from halt.contracts.gate import Approval, Execution
from halt.contracts.graph import GraphSnapshot
from halt.contracts.incident import Incident, IncidentState, IncidentSummary, LatestArtefacts
from halt.contracts.plan import Plan
from halt.contracts.proof import Proof
from halt.contracts.simulation import SimulationRequest, SimulationRun
from halt.db.repo import DbAuditStore, Repository
from halt.echolab.risk import rank_paths
from halt.echolab.simulate import SimulationError, simulate
from halt.gate.gate import Gate, GateError
from halt.proofseal.checks import ProofError, prove
from halt.proofseal.seal import Sealer
from halt.r1.correlate import enrich, findings, incidents
from halt.r1.model import configured_model
from halt.replay.stream import end_t, forecast_at
from halt.safecut.instance import PLAN_TIME_OFFSET_S
from halt.safecut.solve import solve
from halt.scenario.loader import apply_variant, load_scenario, scenario_hashes
from halt.scenario.models import Scenario, SetConstraintLimit, Variant
from halt.threadgraph.build import snapshot

OPERATOR_TICK = timedelta(seconds=15)


class NotFound(LookupError):
    pass


class Conflict(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class Runtime:
    scenario: Scenario
    repo: Repository
    audit: AuditLog
    sealer: Sealer
    now: datetime
    findings: list[Finding] | None = None
    events: list[SecurityEvent] = field(default_factory=list)
    paths: list[AttackPath] | None = None
    plans: dict[str, Plan] = field(default_factory=dict)
    plan_scenarios: dict[str, Scenario] = field(default_factory=dict)
    gates: dict[str, Gate] = field(default_factory=dict)
    proofs: dict[str, Proof] = field(default_factory=dict)
    simulations: dict[str, SimulationRun] = field(default_factory=dict)
    executions: dict[str, str] = field(default_factory=dict)  # execution id -> plan id
    latest_plan: str | None = None
    latest_simulation: str | None = None

    @property
    def id(self) -> str:
        return self.scenario.incident.id

    def clock(self) -> datetime:
        return self.now

    def tick(self) -> datetime:
        self.now += OPERATOR_TICK
        return self.now


class IncidentService:
    def __init__(self, repo: Repository, sealer: Sealer, scenario_loader: Callable[[str], Scenario]) -> None:
        self.repo, self.sealer, self.load = repo, sealer, scenario_loader
        self.runtimes: dict[str, Runtime] = {}
        self.listeners: dict[str, list[Callable[[dict[str, Any]], None]]] = {}
        self.lock = threading.RLock()
        self.reset(self.load("baseline").incident.id, "baseline")

    # ---- plumbing

    def runtime(self, incident_id: str) -> Runtime:
        rt = self.runtimes.get(incident_id)
        if rt is None:
            raise NotFound(f"no incident {incident_id!r}")
        return rt

    def meta(self, rt: Runtime, **extra: str) -> Meta:
        return Meta(
            incident_id=rt.id,
            seed=rt.scenario.incident.params.seed,
            generated_at=rt.now,
            input_hashes={**scenario_hashes(rt.scenario), **extra},
        )

    def broadcast(self, incident_id: str, message: dict[str, Any]) -> None:
        for listener in list(self.listeners.get(incident_id, [])):
            listener(message)

    def owner(self, kind: str, artefact_id: str) -> Runtime:
        for rt in self.runtimes.values():
            stores: dict[str, dict[str, Any]] = {
                "plan": rt.plans,
                "proof": rt.proofs,
                "simulation": rt.simulations,
                "execution": rt.executions,
            }
            if artefact_id in stores[kind]:
                return rt
        raise NotFound(f"no {kind} {artefact_id!r}")

    # ---- incident

    def reset(self, incident_id: str, variant: str) -> Runtime:
        with self.lock:
            scenario = self.load(variant)
            if scenario.incident.id != incident_id:
                raise NotFound(f"no incident {incident_id!r}")
            now = scenario.incident.t0 + timedelta(seconds=PLAN_TIME_OFFSET_S)
            store = DbAuditStore(self.repo.engine, f"{incident_id}")
            rt = Runtime(scenario, self.repo, AuditLog(store), self.sealer, now)
            # The audit chain spans resets, so the operator clock never runs backwards.
            rt.now = max([now, *(e.at for e in rt.audit)])
            rt.audit.append(rt.tick(), "system", "incident_reset", incident_id, {"variant": variant})
            self.runtimes[incident_id] = rt
            self.repo.save_incident(incident_id, variant, rt.now, scenario.incident)
            self.broadcast(incident_id, {"type": "stage", "state": "new"})
            return rt

    def state(self, rt: Runtime) -> IncidentState:
        if rt.latest_plan:
            plan = rt.plans[rt.latest_plan]
            gate = rt.gates[plan.id]
            if plan.status == "infeasible":
                return "blocked_by_policy" if gate.state == "blocked_by_policy" else "no_safe_plan"
            if gate.state == "applied":
                return "contained"
            if gate.state == "rolled":
                return "rolled_back"
            if gate.state == "executing":
                return "executing"
            return (
                "approval_pending" if plan.id in {p.plan_id for p in rt.proofs.values()} else "plan_available"
            )
        if rt.paths is not None:
            return "forecast_ready"
        if rt.findings:
            return "correlating"
        return "new"

    def incident(self, incident_id: str) -> Incident:
        rt = self.runtime(incident_id)
        return Incident(
            id=rt.id,
            title=rt.scenario.incident.title,
            summary=rt.scenario.incident.summary,
            t0=rt.scenario.incident.t0,
            params=rt.scenario.incident.params,
            state=self.state(rt),
            confidence=self.confidence(rt),
            replay_end_s=end_t(rt.scenario),
            latest=self.latest(rt),
            meta=self.meta(rt),
        )

    def latest(self, rt: Runtime) -> LatestArtefacts:
        plan_id = rt.latest_plan
        gate = rt.gates.get(plan_id) if plan_id else None
        proof = next((p.id for p in reversed(rt.proofs.values()) if p.plan_id == plan_id), None)
        return LatestArtefacts(
            plan_id=plan_id,
            simulation_id=rt.latest_simulation,
            proof_id=proof,
            execution_id=gate.execution.id if gate and gate.execution else None,
        )

    def findings(self, incident_id: str) -> list[Finding]:
        return self.runtime(incident_id).findings or []

    def summaries(self) -> list[IncidentSummary]:
        return [
            IncidentSummary(
                id=rt.id, title=rt.scenario.incident.title, state=self.state(rt), t0=rt.scenario.incident.t0
            )
            for rt in self.runtimes.values()
        ]

    def confidence(self, rt: Runtime) -> Derivation | None:
        if not rt.findings:
            return None
        met = sum(f.score.derivation.numerator or 0 for f in rt.findings)
        checked = sum(f.score.derivation.denominator or 0 for f in rt.findings)
        evidence = sorted({e for f in rt.findings for e in f.evidence_ids})
        return Derivation(
            numerator=met,
            denominator=checked,
            method=f"{met} of {checked} rule conditions met across {len(evidence)} correlated events",
            source_ids=evidence,
        )

    # ---- HALT-R1, ThreadGraph

    def events(self, incident_id: str, until: float | None) -> list[SecurityEvent]:
        rt = self.runtime(incident_id)
        source = rt.events or rt.scenario.events
        if until is None:
            return list(source)
        limit = rt.scenario.incident.t0 + timedelta(seconds=until)
        return [e for e in source if e.ts <= limit]

    def correlate(self, incident_id: str, until: float | None) -> list[Finding]:
        with self.lock:
            rt = self.runtime(incident_id)
            s = rt.scenario
            limit = s.incident.t0 + timedelta(seconds=until) if until is not None else None
            stream = [e for e in [*s.events, *s.background_events] if limit is None or e.ts <= limit]
            found = incidents(stream)
            rt.findings = findings(found[0], configured_model()) if found else []
            rt.events = enrich(list(s.events), found[0]) if found else list(s.events)
            complete = until is None or until >= forecast_at(s)
            rt.paths = rank_paths(s) if found and complete else None
            rt.audit.append(
                rt.tick(),
                "halt-r1",
                "correlated",
                rt.id,
                {"until": until, "findings": [f.id for f in rt.findings]},
            )
            self.broadcast(rt.id, {"type": "stage", "state": self.state(rt)})
            return rt.findings

    def paths(self, incident_id: str) -> list[AttackPath]:
        rt = self.runtime(incident_id)
        if rt.paths is None:
            raise Conflict("not_correlated", "correlate the full incident before requesting paths")
        return rt.paths

    def graph(self, incident_id: str, at: float | None, plan_id: str | None) -> GraphSnapshot:
        rt = self.runtime(incident_id)
        s = rt.scenario
        include_forecast = at is None or at >= forecast_at(s)
        removed = None
        if plan_id is not None:
            if plan_id not in rt.gates:
                raise NotFound(f"no plan {plan_id!r}")
            removed = rt.gates[plan_id].env.removed()
        return snapshot(s, at, include_forecast=include_forecast, removed=removed)

    # ---- SafeCut, EchoLab, ProofSeal

    def plan(self, incident_id: str, overrides: list[tuple[str, Any]]) -> Plan:
        with self.lock:
            rt = self.runtime(incident_id)
            paths = self.paths(incident_id)
            s = rt.scenario
            if overrides:
                ops = [
                    SetConstraintLimit(op="set_constraint_limit", constraint_id=c, limit=v)
                    for c, v in overrides
                ]
                s = apply_variant(
                    s, Variant(key=f"{s.variant}_override", title="override", description="", ops=ops)
                )
            plan = solve(s, paths)
            rt.plans[plan.id], rt.plan_scenarios[plan.id] = plan, s
            rt.latest_plan = plan.id
            rt.tick()
            gate = rt.gates.get(plan.id) or Gate(s, plan, rt.clock, audit=rt.audit)
            rt.gates[plan.id] = gate
            self.repo.save_artefact("plan", plan.id, rt.id, rt.now, plan, plan.meta.input_hashes["plan_body"])
            self.broadcast(rt.id, {"type": "stage", "state": self.state(rt)})
            return plan

    def get_plan(self, plan_id: str) -> Plan:
        return self.owner("plan", plan_id).plans[plan_id]

    def simulate(self, incident_id: str, request: SimulationRequest) -> SimulationRun:
        with self.lock:
            rt = self.runtime(incident_id)
            paths = self.paths(incident_id)
            plan_actions = {pid: p.selected_candidate_ids for pid, p in rt.plans.items()}
            try:
                run = simulate(rt.scenario, paths, request, plan_actions)
            except SimulationError as exc:
                raise Conflict("bad_simulation", str(exc)) from None
            rt.simulations[run.id] = run
            rt.latest_simulation = run.id
            rt.audit.append(
                rt.tick(), "echolab", "simulated", run.id, {"futures": [f.label for f in run.futures]}
            )
            self.repo.save_artefact("simulation", run.id, rt.id, rt.now, run, run.hash)
            return run

    def get_simulation(self, sim_id: str) -> SimulationRun:
        return self.owner("simulation", sim_id).simulations[sim_id]

    def seal(self, plan_id: str) -> Proof:
        with self.lock:
            rt = self.owner("plan", plan_id)
            plan = rt.plans[plan_id]
            try:
                proof = prove(rt.plan_scenarios[plan_id], self.paths(rt.id), plan, self.sealer)
            except ProofError as exc:
                raise Conflict("not_sealable", str(exc)) from None
            rt.proofs[proof.id] = proof
            rt.tick()
            rt.gates[plan_id].attach_proof(proof)
            self.repo.save_artefact("proof", proof.id, rt.id, rt.now, proof, proof.certificate)
            self.broadcast(rt.id, {"type": "stage", "state": self.state(rt)})
            return proof

    def get_proof(self, proof_id: str) -> Proof:
        return self.owner("proof", proof_id).proofs[proof_id]

    def verify(self, proof_id: str) -> tuple[bool, bool, str]:
        return self.sealer.verify(self.get_proof(proof_id))

    # ---- Action Gate

    def approve(
        self, plan_id: str, actor: str, policy_id: str, approver_id: str, decision: str, note: str | None
    ) -> tuple[Approval, list[str]]:
        with self.lock:
            if actor != approver_id:
                raise GateError(403, "actor_mismatch", "an approval must be given by the approver themselves")
            rt = self.owner("plan", plan_id)
            gate = rt.gates[plan_id]
            rt.tick()
            approval = gate.approve(approver_id, policy_id, decision, note)
            self.repo.save_artefact("approval", f"{plan_id}:{approval.id}", rt.id, rt.now, approval, None)
            self._broadcast_gate(rt, gate)
            return approval, sorted(gate.outstanding_roles())

    def approvals(self, plan_id: str) -> tuple[list[Approval], list[str]]:
        gate = self.owner("plan", plan_id).gates[plan_id]
        return list(gate.approvals), sorted(gate.outstanding_roles())

    def execute(self, plan_id: str, actor: str, proof_id: str) -> Execution:
        with self.lock:
            rt = self.owner("plan", plan_id)
            gate = rt.gates[plan_id]
            rt.tick()
            execution = gate.execute(proof_id, actor)
            rt.executions[execution.id] = plan_id
            self.repo.save_artefact("execution", execution.id, rt.id, rt.now, execution, None)
            self._broadcast_gate(rt, gate)
            return execution

    def get_execution(self, execution_id: str) -> Execution:
        rt = self.owner("execution", execution_id)
        execution = rt.gates[rt.executions[execution_id]].execution
        assert execution is not None
        return execution

    def rollback(self, execution_id: str, actor: str) -> Execution:
        with self.lock:
            rt = self.owner("execution", execution_id)
            gate = rt.gates[rt.executions[execution_id]]
            rt.tick()
            execution = gate.rollback(actor)
            self.repo.save_artefact("execution", execution.id, rt.id, rt.now, execution, None)
            self._broadcast_gate(rt, gate)
            return execution

    def new_telemetry(self, incident_id: str, reason: str) -> None:
        with self.lock:
            rt = self.runtime(incident_id)
            rt.tick()
            for gate in rt.gates.values():
                gate.new_telemetry(reason)
            self.broadcast(rt.id, {"type": "stale", "reason": reason})

    def _broadcast_gate(self, rt: Runtime, gate: Gate) -> None:
        if gate.execution is not None:
            self.broadcast(rt.id, {"type": "gate", "execution": gate.execution.model_dump(mode="json")})
        self.broadcast(rt.id, {"type": "stage", "state": self.state(rt)})


def default_loader(directory: Any) -> Callable[[str], Scenario]:
    def load(variant: str) -> Scenario:
        return load_scenario(directory, variant)

    return load


def digest(model: Any) -> str:
    return sha256_hex(model)
