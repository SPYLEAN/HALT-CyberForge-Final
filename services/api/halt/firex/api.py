"""FireX REST boundary under `/api/v1/ps2`. Clients name registered dataset ids and run or incident ids; no
request
can supply a path. Every figure comes from a run's stored files."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Query

from halt.contracts.common import Contract
from halt.firex import jobs
from halt.firex.cases import create_case, list_candidates, read_case
from halt.firex.contracts import (
    BenchmarkReceipt,
    CaseCandidates,
    CaseManifest,
    CaseRequest,
    DatasetHealth,
    DatasetQualitySummary,
    DatasetRun,
    FactsResponse,
    FirexAttackStory,
    FirexHypotheses,
    FirexIncidentList,
    FirexIncidentSummary,
    IncidentDetail,
    IncidentGraph,
    IncidentGuide,
    NarrativeRequest,
    NarrativeResult,
    ProofReceipt,
    QualityCase,
    QuarantineSegment,
    ReachabilityResult,
    RunRequest,
    SealVerification,
    TrustReport,
)
from halt.firex.guide import build_guide
from halt.firex.llm import explain
from halt.firex.receipts import verify_seal
from halt.firex.trust import build_facts, build_health, build_quality_case, build_trust
from halt.firex.util import read_json

router = APIRouter(prefix="/ps2", tags=["firex"])
RunQuery = Annotated[str | None, Query(pattern=r"^frun-[0-9a-f]{16}$")]


class RunList(Contract):
    items: list[DatasetRun]


class QuarantineReport(Contract):
    run_id: str
    items: list[QuarantineSegment]


class ProofView(Contract):
    receipt: ProofReceipt
    verification: SealVerification


class BenchmarkView(Contract):
    receipt: BenchmarkReceipt
    verification: SealVerification


def _load(folder: Path, name: str) -> Any:
    path = folder / f"{name}.json"
    if not path.is_file():
        raise jobs.RunError(404, "not_found", f"{name} is not available for this incident")
    return read_json(path)


@router.get("/runs", response_model=RunList)
def list_runs() -> RunList:
    return RunList(items=[jobs.to_contract(s) for s in jobs.list_runs()])


@router.post("/runs", response_model=DatasetRun)
def create_run(body: RunRequest) -> DatasetRun:
    return jobs.to_contract(jobs.start_run(body.dataset_id, body.max_bytes))


@router.get("/runs/{run_id}", response_model=DatasetRun)
def get_run(run_id: str) -> DatasetRun:
    return jobs.to_contract(jobs.read_state(run_id))


@router.get("/runs/{run_id}/progress", response_model=DatasetRun)
def get_progress(run_id: str) -> DatasetRun:
    return jobs.to_contract(jobs.read_state(run_id))


@router.post("/runs/{run_id}/cancel", response_model=DatasetRun)
def cancel_run(run_id: str) -> DatasetRun:
    return jobs.to_contract(jobs.cancel_run(run_id))


@router.post("/runs/{run_id}/resume", response_model=DatasetRun)
def resume_run(run_id: str) -> DatasetRun:
    return jobs.to_contract(jobs.resume_run(run_id))


@router.get("/runs/{run_id}/incidents", response_model=FirexIncidentList)
def list_incidents(run_id: str) -> FirexIncidentList:
    state = jobs.read_state(run_id)
    folder = jobs.run_dir(run_id)
    index = folder / "incidents" / "index.json"
    items = read_json(index) if index.is_file() and state["status"] == "completed" else []
    quality = read_json(folder / "quality.json") if (folder / "quality.json").is_file() else None
    return FirexIncidentList(
        run_id=run_id,
        items=[FirexIncidentSummary.model_validate(i) for i in items],
        quality=DatasetQualitySummary.model_validate(quality) if quality else None,
    )


@router.get("/runs/{run_id}/quarantine", response_model=QuarantineReport)
def get_quarantine(run_id: str) -> QuarantineReport:
    jobs.read_state(run_id)
    path = jobs.run_dir(run_id) / "quarantine.json"
    items = read_json(path) if path.is_file() else []
    return QuarantineReport(run_id=run_id, items=[QuarantineSegment.model_validate(i) for i in items[:200]])


@router.get("/runs/{run_id}/benchmark", response_model=BenchmarkView)
def get_benchmark(run_id: str) -> BenchmarkView:
    jobs.read_state(run_id)
    path = jobs.run_dir(run_id) / "benchmark_receipt.json"
    if not path.is_file():
        raise jobs.RunError(404, "not_found", "this run has no benchmark receipt yet")
    doc = read_json(path)
    return BenchmarkView(receipt=BenchmarkReceipt.model_validate(doc), verification=verify_seal(doc))


@router.get("/runs/{run_id}/health", response_model=DatasetHealth)
def get_health(run_id: str) -> DatasetHealth:
    return build_health(run_id)[0]


@router.get("/runs/{run_id}/trust", response_model=TrustReport)
def get_trust(run_id: str) -> TrustReport:
    return build_trust(run_id)


@router.get("/runs/{run_id}/quality-case", response_model=QualityCase)
def get_quality_case(run_id: str) -> QualityCase:
    return build_quality_case(run_id)


@router.get("/runs/{run_id}/case-candidates", response_model=CaseCandidates)
def get_case_candidates(run_id: str) -> CaseCandidates:
    return list_candidates(run_id)


@router.post("/cases", response_model=CaseManifest)
def post_case(body: CaseRequest) -> CaseManifest:
    return create_case(body)


@router.get("/cases/{case_id}", response_model=CaseManifest)
def get_case(case_id: str) -> CaseManifest:
    return read_case(case_id)


@router.get("/facts", response_model=FactsResponse)
def get_facts() -> FactsResponse:
    return build_facts()


@router.get("/incidents/{incident_id}", response_model=IncidentDetail)
def get_incident(incident_id: str, run_id: RunQuery = None) -> IncidentDetail:
    return IncidentDetail.model_validate(_load(jobs.find_incident(incident_id, run_id), "detail"))


@router.get("/incidents/{incident_id}/guide", response_model=IncidentGuide)
def get_incident_guide(incident_id: str, run_id: RunQuery = None) -> IncidentGuide:
    return build_guide(jobs.find_incident(incident_id, run_id))


@router.get("/incidents/{incident_id}/graph", response_model=IncidentGraph)
def get_incident_graph(incident_id: str, run_id: RunQuery = None) -> IncidentGraph:
    return IncidentGraph.model_validate(_load(jobs.find_incident(incident_id, run_id), "graph"))


@router.get("/incidents/{incident_id}/story", response_model=FirexAttackStory)
def get_incident_story(incident_id: str, run_id: RunQuery = None) -> FirexAttackStory:
    return FirexAttackStory.model_validate(_load(jobs.find_incident(incident_id, run_id), "story"))


@router.get("/incidents/{incident_id}/hypotheses", response_model=FirexHypotheses)
def get_incident_hypotheses(incident_id: str, run_id: RunQuery = None) -> FirexHypotheses:
    return FirexHypotheses.model_validate(_load(jobs.find_incident(incident_id, run_id), "hypotheses"))


@router.get("/incidents/{incident_id}/reachability", response_model=ReachabilityResult)
def get_incident_reachability(incident_id: str, run_id: RunQuery = None) -> ReachabilityResult:
    return ReachabilityResult.model_validate(_load(jobs.find_incident(incident_id, run_id), "reachability"))


@router.get("/incidents/{incident_id}/proof", response_model=ProofView)
def get_incident_proof(incident_id: str, run_id: RunQuery = None) -> ProofView:
    doc = _load(jobs.find_incident(incident_id, run_id), "proof")
    return ProofView(receipt=ProofReceipt.model_validate(doc), verification=verify_seal(doc))


@router.post("/incidents/{incident_id}/narrative", response_model=NarrativeResult)
def create_narrative(incident_id: str, body: NarrativeRequest, run_id: RunQuery = None) -> NarrativeResult:
    return explain(jobs.find_incident(incident_id, run_id), body)
