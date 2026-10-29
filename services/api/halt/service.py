"""Incident runtime: orchestrates HALT-R1, ThreadGraph, EchoLab, SafeCut, ProofSeal and the Action Gate.

One runtime per incident, held in memory and written through to the database (artefacts, audit log and an
operation journal). The operator clock is logical: it starts at plan time (t0 + 15 min) and advances 15 s per
state-changing operation, so repeated demo runs produce identical audit timestamps, proofs and certificates.

Restart safety: every state-changing call is journaled with its outcome. Because the engines are
deterministic, `restore` rebuilds an incident by re-running the journal since the last reset, and checks
each step against what was persisted: every audit entry must come out identical (same hash), the clock must
agree, and every artefact must match. Any difference stops the restore and the incident answers 503
`restore_inconsistent` until it is reset; HALT never substitutes a state it cannot prove matches the record.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Literal, TypeVar

from sqlalchemy.exc import SQLAlchemyError

from halt.audit.log import AuditLog, verify_chain
from halt.canonical import sha256_hex
from halt.contracts.audit import AuditEntry
from halt.contracts.common import Derivation, Meta
from halt.contracts.events import SecurityEvent
from halt.contracts.findings import AttackPath, Finding
from halt.contracts.gate import Approval, Execution
from halt.contracts.graph import GraphSnapshot
from halt.contracts.incident import Incident, IncidentState, IncidentSummary, LatestArtefacts
from halt.contracts.plan import Plan
from halt.contracts.proof import Proof
from halt.contracts.simulation import SimulationRequest, SimulationRun
from halt.db.repo import DbAuditStore, Operation, Repository
from halt.echolab.risk import rank_paths
from halt.echolab.simulate import SimulationError, simulate
from halt.gate.gate import Gate, GateError
from halt.logging import get_logger
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
SEED_VARIANT = "baseline"

T = TypeVar("T")
RuntimeStatus = Literal["seeded", "restored", "restoring", "dropped", "failed"]


class NotFound(LookupError):
    pass


class Unavailable(RuntimeError):
    """The incident cannot be served right now; the API answers 503 with this code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class RestoreError(RuntimeError):
    """The journal, the audit log and the artefacts do not agree; nothing is restored."""


class ReplayAuditStore:
    """Audit store used while restoring: entries up to the reset are history, and every append must be
    identical to the next persisted entry. Nothing is written."""

    def __init__(self, history: Sequence[AuditEntry], expected: Sequence[AuditEntry]) -> None:
        self._entries, self._expected = list(history), list(expected)

    def append(self, entry: AuditEntry) -> None:
        nxt = self._expected[0] if self._expected else None
        if nxt is None or nxt.seq != entry.seq or nxt.hash != entry.hash:
            raise RestoreError(
                f"audit entry {entry.seq} ({entry.kind}) re-ran differently from the persisted log"
                if nxt
                else f"re-running produced audit entry {entry.seq} ({entry.kind}) that was never persisted"
            )
        self._entries.append(self._expected.pop(0))

    def entries(self) -> Sequence[AuditEntry]:
        return tuple(self._entries)

    @property
    def remaining(self) -> int:
        return len(self._expected)


def _code(exc: Exception) -> str:
    return exc.code if isinstance(exc, Conflict | GateError) else "not_found"


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
    replay_cursor: float | None = None  # last replay position a client sought to; None = the end
    restoring: bool = False  # re-running the journal: verify instead of write, broadcast nothing

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
        self.status: dict[str, RuntimeStatus] = {}
        self.problems: dict[str, str] = {}  # incident id -> why it is not being served
        self.listeners: dict[str, list[Callable[[dict[str, Any]], None]]] = {}
        self.lock = threading.RLock()
        known = repo.incident_ids()
        if not known:  # a fresh database: seed the demo incident
            self.reset(self.load(SEED_VARIANT).incident.id, SEED_VARIANT)
        for incident_id in known:
            self.restore(incident_id)

    # ---- plumbing

    def runtime(self, incident_id: str) -> Runtime:
        rt = self.runtimes.get(incident_id)
        if rt is not None:
            return rt
        with self.lock:
            status = self.status.get(incident_id)
            if status is None:
                raise NotFound(f"no incident {incident_id!r}")
            if status == "dropped":  # an earlier call failed part-way: rebuild from the durable journal
                self.restore(incident_id)
                if incident_id in self.runtimes:
                    return self.runtimes[incident_id]
            raise Unavailable(
                "restore_inconsistent",
                f"{incident_id} cannot be served: "
                f"{self.problems.get(incident_id, 'its state could not be restored')}. "
                f"Reset it to the seed (POST /api/v1/incidents/{incident_id}/reset-to-seed) to start again.",
            )

    def known(self, incident_id: str) -> None:
        """404 for an incident this API has never had; a failed restore is still known (and resettable)."""
        if incident_id not in self.status and incident_id != self.load(SEED_VARIANT).incident.id:
            raise NotFound(f"no incident {incident_id!r}")

    def readiness(self) -> list[tuple[str, RuntimeStatus, str | None]]:
        return [(i, s, self.problems.get(i)) for i, s in sorted(self.status.items())]

    def meta(self, rt: Runtime, **extra: str) -> Meta:
        return Meta(
            incident_id=rt.id,
            seed=rt.scenario.incident.params.seed,
            generated_at=rt.now,
            input_hashes={**scenario_hashes(rt.scenario), **extra},
        )

    def broadcast(self, incident_id: str, message: dict[str, Any]) -> None:
        rt = self.runtimes.get(incident_id)
        if rt is not None and rt.restoring:
            return
        for listener in list(self.listeners.get(incident_id, [])):
            listener(message)

    def owner(self, kind: str, artefact_id: str) -> Runtime:
        for incident_id, status in list(self.status.items()):
            if status == "dropped":
                self.runtime(incident_id)  # revive before searching, so a transient failure is not a 404
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
        """Start the incident again from its seed data (variant applied). Works whatever state the incident is
        in, including after a failed restore. The audit chain is append-only and spans resets, so the operator
        clock never runs backwards; plans, simulations and proofs are identical to a fresh start."""
        with self.lock:
            scenario = self.load(variant)
            if scenario.incident.id != incident_id:
                raise NotFound(f"no incident {incident_id!r}")
            now = scenario.incident.t0 + timedelta(seconds=PLAN_TIME_OFFSET_S)
            store = DbAuditStore(self.repo.engine, f"{incident_id}")
            rt = Runtime(scenario, self.repo, AuditLog(store), self.sealer, now)
            rt.now = max([now, *(e.at for e in rt.audit)])
            with self.repo.transaction():
                entry = rt.audit.append(
                    rt.tick(), "system", "incident_reset", incident_id, {"variant": variant}
                )
                self.repo.save_incident(incident_id, variant, rt.now, scenario.incident)
                self.repo.save_cursor(incident_id, None)
                self.repo.append_operation(
                    incident_id, "reset", {"variant": variant, "audit_seq": entry.seq}, "ok", rt.now
                )
            self.runtimes[incident_id] = rt
            self.status[incident_id] = "seeded"
            self.problems.pop(incident_id, None)
            get_logger().info("incident_reset", incident_id=incident_id, variant=variant)
            self.broadcast(incident_id, {"type": "stage", "state": "new"})
            return rt

    # ---- restart safety

    def restore(self, incident_id: str) -> None:
        """Rebuild the incident from its journal (module docstring). On any disagreement the incident is
        marked failed with the reason; a database error leaves it 'dropped' so a later call retries."""
        with self.lock:
            self.status[incident_id] = "restoring"
            try:
                rt = self._rebuild(incident_id)
            except SQLAlchemyError:
                self.status[incident_id] = "dropped"
                raise
            except Exception as exc:  # RestoreError, or a journal the current engines cannot re-run
                self.status[incident_id] = "failed"
                self.problems[incident_id] = str(exc)
                get_logger().error("restore_failed", incident_id=incident_id, reason=str(exc))
                return
            self.runtimes[incident_id] = rt
            self.status[incident_id] = "restored"
            self.problems.pop(incident_id, None)
            get_logger().info("incident_restored", incident_id=incident_id, at=rt.now.isoformat())

    def _rebuild(self, incident_id: str) -> Runtime:
        ops = self.repo.operations(incident_id)
        resets = [i for i, op in enumerate(ops) if op.kind == "reset"]
        if not resets:
            raise RestoreError(
                "there is no operation journal for it (it was created by an older HALT version)"
            )
        start = ops[resets[-1]]
        persisted = DbAuditStore(self.repo.engine, incident_id).entries()
        if not verify_chain(persisted).valid:
            raise RestoreError("its audit chain does not verify")
        seq = int(start.args["audit_seq"])
        if len(persisted) < seq or persisted[seq - 1].kind != "incident_reset":
            raise RestoreError(f"the journal's last reset points at audit entry {seq}, which is not a reset")
        replay = ReplayAuditStore(persisted[:seq], persisted[seq:])
        rt = Runtime(
            self.load(str(start.args["variant"])), self.repo, AuditLog(replay), self.sealer, start.at
        )
        rt.restoring = True
        self.runtimes[incident_id] = rt
        try:
            for op in ops[resets[-1] + 1 :]:
                self._replay(rt, op)
            if replay.remaining:
                raise RestoreError(
                    f"{replay.remaining} persisted audit entries were not reproduced by the journal"
                )
            self._verify_artefacts(rt)
        finally:
            self.runtimes.pop(incident_id, None)
            rt.restoring = False
        rt.audit.store = DbAuditStore(self.repo.engine, incident_id)
        rt.replay_cursor = self.repo.cursor(incident_id)
        return rt

    def _replay(self, rt: Runtime, op: Operation) -> None:
        a = op.args
        calls: dict[str, Callable[[], object]] = {
            "correlate": lambda: self.correlate(a["incident_id"], a["until"]),
            "plan": lambda: self.plan(a["incident_id"], [(c, v) for c, v in a["overrides"]]),
            "simulate": lambda: self.simulate(
                a["incident_id"], SimulationRequest.model_validate(a["request"])
            ),
            "seal": lambda: self.seal(a["plan_id"]),
            "approve": lambda: self.approve(
                a["plan_id"], a["actor"], a["policy_id"], a["approver_id"], a["decision"], a["note"]
            ),
            "execute": lambda: self.execute(a["plan_id"], a["actor"], a["proof_id"]),
            "rollback": lambda: self.rollback(a["execution_id"], a["actor"]),
        }
        if op.kind not in calls:
            raise RestoreError(f"journal entry {op.seq} is an unknown operation {op.kind!r}")
        try:
            calls[op.kind]()
            outcome = "ok"
        except (Conflict, GateError, NotFound) as exc:
            outcome = _code(exc)
        if outcome != op.outcome:
            raise RestoreError(
                f"journal entry {op.seq} ({op.kind}) re-ran as {outcome!r}, recorded as {op.outcome!r}"
            )
        if rt.now != op.at:
            raise RestoreError(f"journal entry {op.seq} ({op.kind}) re-ran to a different operator clock")

    def _verify_artefacts(self, rt: Runtime) -> None:
        """Every artefact the journal reproduced must equal the stored one (its digest, else its body)."""
        expected: list[tuple[str, str, str | None, Any]] = [
            *(("plan", p.id, p.meta.input_hashes["plan_body"], None) for p in rt.plans.values()),
            *(("simulation", s.id, s.hash, None) for s in rt.simulations.values()),
            *(("proof", p.id, p.certificate, None) for p in rt.proofs.values()),
        ]
        for plan_id, gate in rt.gates.items():
            expected += [("approval", f"{plan_id}:{a.id}", None, a) for a in gate.approvals]
            if gate.execution is not None:
                expected.append(("execution", gate.execution.id, None, gate.execution))
        for kind, artefact_id, digest, body in expected:
            stored = self.repo.artefact(artefact_id)
            if stored is None or stored.kind != kind:
                raise RestoreError(f"{kind} {artefact_id} was re-derived but is missing from the database")
            if digest is not None and stored.hash != digest:
                raise RestoreError(
                    f"{kind} {artefact_id} re-derived to a different digest than the stored one"
                )
            if body is not None and stored.body != body.model_dump(mode="json"):
                raise RestoreError(f"{kind} {artefact_id} re-derived to a different body than the stored one")

    def _journaled(self, rt: Runtime, kind: str, args: dict[str, Any], work: Callable[[], T]) -> T:
        """Run a state-changing call and journal it with its outcome. A call that fails for any other reason
        (a database error part-way, say) drops the in-memory runtime: the next request rebuilds it from the
        journal instead of serving a state that may not match the record."""
        if rt.restoring:
            return work()
        refused: Conflict | GateError | NotFound | None = None
        try:
            with self.repo.transaction():  # audit entries, artefacts and the journal entry: all or nothing
                try:
                    result = work()
                except (Conflict, GateError, NotFound) as exc:
                    refused = exc  # a refusal is a real outcome (it may have moved the clock): journal it
                self.repo.append_operation(rt.id, kind, args, _code(refused) if refused else "ok", rt.now)
        except (
            Exception
        ) as exc:  # rolled back: memory is ahead of the database, so rebuild it from the journal
            self._drop(rt, f"{kind} failed part-way ({type(exc).__name__})")
            raise
        if refused is not None:
            raise refused
        return result

    def _drop(self, rt: Runtime, reason: str) -> None:
        if self.runtimes.get(rt.id) is rt:
            self.runtimes.pop(rt.id)
            self.status[rt.id] = "dropped"
            get_logger().warning("runtime_dropped", incident_id=rt.id, reason=reason)

    def save_cursor(self, incident_id: str, t: float | None) -> None:
        rt = self.runtime(incident_id)
        rt.replay_cursor = t
        self.repo.save_cursor(incident_id, t)

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
            replay_cursor_s=rt.replay_cursor,
            latest=self.latest(rt),
            variant=rt.scenario.variant,
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
            args = {"incident_id": incident_id, "until": until}
            return self._journaled(rt, "correlate", args, lambda: self._correlate(rt, until))

    def _correlate(self, rt: Runtime, until: float | None) -> list[Finding]:
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
            args = {"incident_id": incident_id, "overrides": [[c, v] for c, v in overrides]}
            return self._journaled(rt, "plan", args, lambda: self._plan(rt, overrides))

    def _plan(self, rt: Runtime, overrides: list[tuple[str, Any]]) -> Plan:
        paths = self.paths(rt.id)
        s = rt.scenario
        if overrides:
            ops = [
                SetConstraintLimit(op="set_constraint_limit", constraint_id=c, limit=v) for c, v in overrides
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
        self._save(rt, "plan", plan.id, plan, plan.meta.input_hashes["plan_body"])
        self.broadcast(rt.id, {"type": "stage", "state": self.state(rt)})
        return plan

    def get_plan(self, plan_id: str) -> Plan:
        return self.owner("plan", plan_id).plans[plan_id]

    def simulate(self, incident_id: str, request: SimulationRequest) -> SimulationRun:
        with self.lock:
            rt = self.runtime(incident_id)
            args = {"incident_id": incident_id, "request": request.model_dump(mode="json")}
            return self._journaled(rt, "simulate", args, lambda: self._simulate(rt, request))

    def _simulate(self, rt: Runtime, request: SimulationRequest) -> SimulationRun:
        paths = self.paths(rt.id)
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
        self._save(rt, "simulation", run.id, run, run.hash)
        return run

    def get_simulation(self, sim_id: str) -> SimulationRun:
        return self.owner("simulation", sim_id).simulations[sim_id]

    def seal(self, plan_id: str) -> Proof:
        with self.lock:
            rt = self.owner("plan", plan_id)
            return self._journaled(rt, "seal", {"plan_id": plan_id}, lambda: self._seal(rt, plan_id))

    def _seal(self, rt: Runtime, plan_id: str) -> Proof:
        plan = rt.plans[plan_id]
        try:
            proof = prove(rt.plan_scenarios[plan_id], self.paths(rt.id), plan, self.sealer)
        except ProofError as exc:
            raise Conflict("not_sealable", str(exc)) from None
        rt.proofs[proof.id] = proof
        rt.tick()
        rt.gates[plan_id].attach_proof(proof)
        self._save(rt, "proof", proof.id, proof, proof.certificate)
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
            args = {
                "plan_id": plan_id,
                "actor": actor,
                "policy_id": policy_id,
                "approver_id": approver_id,
                "decision": decision,
                "note": note,
            }

            def work() -> tuple[Approval, list[str]]:
                gate = rt.gates[plan_id]
                rt.tick()
                approval = gate.approve(approver_id, policy_id, decision, note)
                self._save(rt, "approval", f"{plan_id}:{approval.id}", approval, None)
                self._broadcast_gate(rt, gate)
                return approval, sorted(gate.outstanding_roles())

            return self._journaled(rt, "approve", args, work)

    def approvals(self, plan_id: str) -> tuple[list[Approval], list[str]]:
        gate = self.owner("plan", plan_id).gates[plan_id]
        return list(gate.approvals), sorted(gate.outstanding_roles())

    def execute(self, plan_id: str, actor: str, proof_id: str) -> Execution:
        with self.lock:
            rt = self.owner("plan", plan_id)

            def work() -> Execution:
                gate = rt.gates[plan_id]
                rt.tick()
                execution = gate.execute(proof_id, actor)
                rt.executions[execution.id] = plan_id
                self._save(rt, "execution", execution.id, execution, None)
                self._broadcast_gate(rt, gate)
                return execution

            args = {"plan_id": plan_id, "actor": actor, "proof_id": proof_id}
            return self._journaled(rt, "execute", args, work)

    def get_execution(self, execution_id: str) -> Execution:
        rt = self.owner("execution", execution_id)
        execution = rt.gates[rt.executions[execution_id]].execution
        assert execution is not None
        return execution

    def rollback(self, execution_id: str, actor: str) -> Execution:
        with self.lock:
            rt = self.owner("execution", execution_id)

            def work() -> Execution:
                gate = rt.gates[rt.executions[execution_id]]
                rt.tick()
                execution = gate.rollback(actor)
                self._save(rt, "execution", execution.id, execution, None)
                self._broadcast_gate(rt, gate)
                return execution

            return self._journaled(rt, "rollback", {"execution_id": execution_id, "actor": actor}, work)

    def _save(self, rt: Runtime, kind: str, artefact_id: str, body: Any, digest: str | None) -> None:
        """Write an artefact through to the database; while restoring, nothing is written (the stored copy is
        what the re-derived one is checked against)."""
        if not rt.restoring:
            self.repo.save_artefact(kind, artefact_id, rt.id, rt.now, body, digest)

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
