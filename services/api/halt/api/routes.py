"""REST routes (docs/DATA_CONTRACTS.md §10). Handlers translate HTTP into IncidentService calls."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query, Request

from halt.api.state import service_of
from halt.contracts.api import (
    ActionList,
    ApprovalList,
    ApprovalRequest,
    ApprovalResult,
    AuditList,
    AuditVerify,
    CorrelateRequest,
    EventList,
    ExecuteRequest,
    ExecutionResult,
    ExplainRequest,
    ExplainResult,
    FindingList,
    IncidentList,
    PathList,
    PlanRequest,
    PolicySet,
    ProofVerify,
    ResetRequest,
    VariantInfo,
    VariantList,
)
from halt.contracts.common import Meta
from halt.contracts.graph import GraphSnapshot
from halt.contracts.incident import Incident
from halt.contracts.plan import Plan
from halt.contracts.policy import PolicyComparison
from halt.contracts.proof import Proof
from halt.contracts.simulation import SimulationRequest, SimulationRun
from halt.explain.llm import prompt_for
from halt.explain.templates import Context, cited, explain, invalid_citations
from halt.gate.gate import GateError
from halt.service import SEED_VARIANT, IncidentService, NotFound, Runtime, Unavailable

router = APIRouter()

Actor = Annotated[
    str, Header(alias="X-Halt-Actor", description="Demo identity (an approver id). Not authentication.")
]


def svc(request: Request) -> IncidentService:
    return service_of(request.app)


def known_actor(service: IncidentService, rt: Runtime, actor: str) -> str:
    if actor not in {a.id for a in rt.scenario.approvers}:
        raise GateError(403, "actor_unknown", f"{actor!r} is not a known approver")
    return actor


def meta(request: Request, rt: Runtime) -> Meta:
    return svc(request).meta(rt)


# ---- incidents


@router.get("/incidents", response_model=IncidentList)
def list_incidents(request: Request) -> IncidentList:
    service = svc(request)
    rt = next(iter(service.runtimes.values()), None)
    if rt is None:
        raise Unavailable("restore_inconsistent", "no incident could be restored; reset one to its seed")
    return IncidentList(items=service.summaries(), meta=service.meta(rt))


@router.get("/incidents/{incident_id}", response_model=Incident)
def get_incident(request: Request, incident_id: str) -> Incident:
    return svc(request).incident(incident_id)


@router.post("/incidents/{incident_id}/replay/reset", response_model=Incident)
def reset(request: Request, incident_id: str, body: ResetRequest) -> Incident:
    service = svc(request)
    service.known(incident_id)
    service.reset(incident_id, body.variant)
    return service.incident(incident_id)


@router.post("/incidents/{incident_id}/reset-to-seed", response_model=Incident)
def reset_to_seed(request: Request, incident_id: str) -> Incident:
    """The demo's deterministic restart: baseline variant, replay from the start, no plan, no approvals.
    Works after a failed restore. The audit log is append-only, so its history is kept (with this reset
    recorded); everything derived afterwards is identical to a fresh start."""
    service = svc(request)
    service.known(incident_id)
    service.reset(incident_id, SEED_VARIANT)
    return service.incident(incident_id)


@router.get("/incidents/{incident_id}/events", response_model=EventList)
def events(
    request: Request, incident_id: str, until: Annotated[float | None, Query(ge=0)] = None
) -> EventList:
    service = svc(request)
    return EventList(
        items=service.events(incident_id, until), meta=service.meta(service.runtime(incident_id))
    )


@router.post("/incidents/{incident_id}/correlate", response_model=FindingList)
def correlate(request: Request, incident_id: str, body: CorrelateRequest) -> FindingList:
    service = svc(request)
    items = service.correlate(incident_id, body.until)
    rt = service.runtime(incident_id)
    return FindingList(items=items, confidence=service.confidence(rt), meta=service.meta(rt))


@router.get("/incidents/{incident_id}/findings", response_model=FindingList)
def get_findings(request: Request, incident_id: str) -> FindingList:
    service = svc(request)
    rt = service.runtime(incident_id)
    return FindingList(
        items=service.findings(incident_id), confidence=service.confidence(rt), meta=service.meta(rt)
    )


@router.get("/incidents/{incident_id}/graph", response_model=GraphSnapshot)
def graph(
    request: Request,
    incident_id: str,
    at: Annotated[float | None, Query(ge=0)] = None,
    plan_id: str | None = None,
) -> GraphSnapshot:
    return svc(request).graph(incident_id, at, plan_id)


@router.get("/incidents/{incident_id}/paths", response_model=PathList)
def paths(request: Request, incident_id: str) -> PathList:
    service = svc(request)
    return PathList(items=service.paths(incident_id), meta=service.meta(service.runtime(incident_id)))


@router.get("/incidents/{incident_id}/actions", response_model=ActionList)
def actions(request: Request, incident_id: str) -> ActionList:
    service = svc(request)
    rt = service.runtime(incident_id)
    return ActionList(items=rt.scenario.actions, meta=service.meta(rt))


@router.get("/incidents/{incident_id}/policies", response_model=PolicySet)
def policies(request: Request, incident_id: str) -> PolicySet:
    service = svc(request)
    rt = service.runtime(incident_id)
    s = rt.scenario
    return PolicySet(
        policies=s.policies,
        approvers=s.approvers,
        constraints=s.constraints,
        profiles=s.profiles,
        meta=service.meta(rt),
    )


@router.get("/incidents/{incident_id}/policy-comparison", response_model=PolicyComparison)
def policy_comparison(request: Request, incident_id: str) -> PolicyComparison:
    """SafeCut under every policy profile, each plan simulated by EchoLab, and the exact trade-off.
    Read-only (nothing is stored or audited); 409 before correlation, like /paths."""
    return svc(request).compare(incident_id)


@router.get("/incidents/{incident_id}/variants", response_model=VariantList)
def variants(request: Request, incident_id: str) -> VariantList:
    service = svc(request)
    rt = service.runtime(incident_id)
    s = rt.scenario
    return VariantList(
        items=[VariantInfo(key=v.key, title=v.title, description=v.description) for v in s.variants],
        active=s.variant,
        meta=service.meta(rt),
    )


# ---- EchoLab, SafeCut, ProofSeal


@router.post("/incidents/{incident_id}/simulations", response_model=SimulationRun)
def create_simulation(request: Request, incident_id: str, body: SimulationRequest) -> SimulationRun:
    return svc(request).simulate(incident_id, body)


@router.get("/simulations/{sim_id}", response_model=SimulationRun)
def get_simulation(request: Request, sim_id: str) -> SimulationRun:
    return svc(request).get_simulation(sim_id)


@router.post("/incidents/{incident_id}/plans", response_model=Plan)
def create_plan(request: Request, incident_id: str, body: PlanRequest) -> Plan:
    overrides = [(o.constraint_id, o.limit) for o in body.constraint_overrides]
    return svc(request).plan(incident_id, overrides, body.profile_id)


@router.get("/plans/{plan_id}", response_model=Plan)
def get_plan(request: Request, plan_id: str) -> Plan:
    return svc(request).get_plan(plan_id)


@router.post("/plans/{plan_id}/proof", response_model=Proof)
def seal(request: Request, plan_id: str) -> Proof:
    return svc(request).seal(plan_id)


@router.get("/proofs/{proof_id}", response_model=Proof)
def get_proof(request: Request, proof_id: str) -> Proof:
    return svc(request).get_proof(proof_id)


@router.post("/proofs/{proof_id}/verify", response_model=ProofVerify)
def verify(request: Request, proof_id: str) -> ProofVerify:
    service = svc(request)
    cert_ok, sig_ok, recomputed = service.verify(proof_id)
    rt = service.owner("proof", proof_id)
    return ProofVerify(
        certificate_match=cert_ok, signature_valid=sig_ok, recomputed=recomputed, meta=service.meta(rt)
    )


# ---- Action Gate


@router.get("/plans/{plan_id}/approvals", response_model=ApprovalList)
def list_approvals(request: Request, plan_id: str) -> ApprovalList:
    service = svc(request)
    rt = service.owner("plan", plan_id)
    items, outstanding = service.approvals(plan_id)
    return ApprovalList(items=items, outstanding_roles=outstanding, meta=service.meta(rt))


@router.post("/plans/{plan_id}/approvals", response_model=ApprovalResult)
def approve(request: Request, plan_id: str, body: ApprovalRequest, actor: Actor) -> ApprovalResult:
    service = svc(request)
    rt = service.owner("plan", plan_id)
    known_actor(service, rt, actor)
    approval, outstanding = service.approve(
        plan_id, actor, body.policy_id, body.approver_id, body.decision, body.note
    )
    return ApprovalResult(approval=approval, outstanding_roles=outstanding, meta=service.meta(rt))


@router.post("/plans/{plan_id}/execute", response_model=ExecutionResult)
def execute(request: Request, plan_id: str, body: ExecuteRequest, actor: Actor) -> ExecutionResult:
    service = svc(request)
    rt = service.owner("plan", plan_id)
    known_actor(service, rt, actor)
    return ExecutionResult(execution=service.execute(plan_id, actor, body.proof_id), meta=service.meta(rt))


@router.get("/executions/{execution_id}", response_model=ExecutionResult)
def get_execution(request: Request, execution_id: str) -> ExecutionResult:
    service = svc(request)
    rt = service.owner("execution", execution_id)
    return ExecutionResult(execution=service.get_execution(execution_id), meta=service.meta(rt))


@router.post("/executions/{execution_id}/rollback", response_model=ExecutionResult)
def rollback(request: Request, execution_id: str, actor: Actor) -> ExecutionResult:
    service = svc(request)
    rt = service.owner("execution", execution_id)
    known_actor(service, rt, actor)
    return ExecutionResult(execution=service.rollback(execution_id, actor), meta=service.meta(rt))


# ---- audit, explain


@router.get("/incidents/{incident_id}/audit", response_model=AuditList)
def audit(request: Request, incident_id: str) -> AuditList:
    service = svc(request)
    rt = service.runtime(incident_id)
    return AuditList(items=list(rt.audit), meta=service.meta(rt))


@router.get("/incidents/{incident_id}/audit/verify", response_model=AuditVerify)
def audit_verify(request: Request, incident_id: str) -> AuditVerify:
    service = svc(request)
    rt = service.runtime(incident_id)
    check = rt.audit.verify()
    return AuditVerify(
        valid=check.valid,
        length=check.length,
        head_hash=check.head_hash,
        first_bad_seq=check.first_bad_seq,
        enforcement=request.app.state.settings.audit_enforcement,
        meta=service.meta(rt),
    )


@router.post("/incidents/{incident_id}/explain", response_model=ExplainResult)
def explain_subject(request: Request, incident_id: str, body: ExplainRequest) -> ExplainResult:
    service = svc(request)
    rt = service.runtime(incident_id)
    ctx = Context(
        rt.scenario,
        rt.paths or [],
        rt.findings or [],
        rt.plans.get(rt.latest_plan) if rt.latest_plan else None,
    )
    text = explain(body.subject_id, ctx)
    if text is None:
        raise NotFound(f"nothing to explain for {body.subject_id!r}")
    engine: Literal["template", "llm"] = "template"
    llm = getattr(request.app.state, "llm", None)
    if request.app.state.settings.llm_enabled and llm is not None:
        text, engine = llm.complete(prompt_for(body.subject_id, text)), "llm"
        bad = invalid_citations(text, ctx)
        if bad:
            raise GateError(422, "invalid_citations", f"explanation cites unknown ids: {', '.join(bad)}")
    return ExplainResult(
        subject_id=body.subject_id,
        text=text,
        cited_ids=cited(text),
        engine=engine,
        meta=service.meta(rt),
    )
