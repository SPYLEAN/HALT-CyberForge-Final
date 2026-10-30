"""PS2 REST boundary (`/api/v1/ps2`). Independent of the incident database: batches and runs are held in a
bounded in-memory store (a restart clears them; bundled datasets reproduce identically in fixture mode).

Security: JSON bodies only (no multipart, no URL fetching), a request-size guard before parsing, allow-listed
adapters and content types, filename pattern (no path separators), per-file and per-batch size limits, record
caps, json/csv standard-library parsing only, secret redaction in previews, structured ApiError responses.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field, model_validator

from halt.contracts.common import Contract
from halt.ps2.config import load_config
from halt.ps2.datasets import dataset_ids, load_dataset
from halt.ps2.engine import Reconstruction, reconstruct
from halt.ps2.evaluate import GROUND_TRUTH_DIR, evaluate_dataset, load_truth, score_run
from halt.ps2.intake.adapters import ADAPTERS, CONTENT_TYPES
from halt.ps2.intake.intake import Ingestion, IntakeError, ingest
from halt.ps2.schema import (
    CANONICAL_SCHEMA,
    AttackStory,
    CanonicalEvent,
    Entity,
    EvaluationReport,
    Hypotheses,
    IngestionResult,
    OrgContext,
    RawFile,
    ReconstructedGraph,
    ReconstructionReceipt,
    ReconstructionSummary,
    StageAssignment,
)
from halt.service import NotFound

router = APIRouter(prefix="/ps2", tags=["ps2"])
MAX_ITEMS = 32
_ENVELOPE_BYTES = 256 * 1024  # JSON quoting and field overhead allowed on top of the content limit


class DatasetInfo(Contract):
    dataset_id: str
    title: str
    seed: int
    files: list[str]
    adapters: list[str]
    has_ground_truth: bool
    synthetic: bool = True


class DatasetList(Contract):
    items: list[DatasetInfo]


class IngestionRequest(Contract):
    """Exactly one of: a bundled dataset id (fixture mode) or uploaded files with an organisation context."""

    dataset_id: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")
    files: list[RawFile] = Field(default_factory=list, max_length=10)
    context: OrgContext | None = None

    @model_validator(mode="after")
    def _one_source(self) -> IngestionRequest:
        if (self.dataset_id is None) == (not self.files):
            raise ValueError("provide either dataset_id or files, not both")
        return self


class ReconstructionRequest(Contract):
    batch_id: str = Field(pattern=r"^batch-[0-9a-f]{16}$")


class CanonicalEventPage(Contract):
    batch_id: str
    total: int
    offset: int
    limit: int
    items: list[CanonicalEvent]


class AdapterInfo(Contract):
    adapter_id: str
    version: str
    format: str
    content_types: list[str]
    source_type: str
    description: str


class IntakeLimits(Contract):
    max_files: int
    max_file_bytes: int
    max_total_bytes: int
    max_records_per_file: int


class IntakeCapabilities(Contract):
    """What an upload may contain, read from the adapter registry and the reconstruction config."""

    canonical_schema: str
    adapters: list[AdapterInfo]
    limits: IntakeLimits


class EntityList(Contract):
    run_id: str
    items: list[Entity]


class StageList(Contract):
    run_id: str
    items: list[StageAssignment]  # events kept in the reconstructed graph, in time order


class AttackFlowExport(Contract):
    run_id: str
    conformance: str
    bundle: dict[str, Any]


class _Store:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.batches: OrderedDict[str, Ingestion] = OrderedDict()
        self.runs: OrderedDict[str, Reconstruction] = OrderedDict()

    def put(self, table: OrderedDict[str, Any], key: str, value: Any) -> None:
        with self.lock:
            table[key] = value
            table.move_to_end(key)
            while len(table) > MAX_ITEMS:
                table.popitem(last=False)


def store_of(request: Request) -> _Store:
    app = request.app
    if getattr(app.state, "ps2", None) is None:
        app.state.ps2 = _Store()
    return app.state.ps2  # type: ignore[no-any-return]


def size_guard(request: Request) -> None:
    limit = load_config().limits.max_total_bytes + _ENVELOPE_BYTES
    length = request.headers.get("content-length")
    if length is not None and (not length.isdigit() or int(length) > limit):
        raise IntakeError(413, "request_too_large", f"request body exceeds {limit} bytes")


Store = Annotated[_Store, Depends(store_of)]


def _batch(store: _Store, batch_id: str) -> Ingestion:
    if batch_id not in store.batches:
        raise NotFound(f"batch {batch_id} not found (batches are kept in memory; re-submit after a restart)")
    return store.batches[batch_id]


def _run(store: _Store, run_id: str) -> Reconstruction:
    if run_id not in store.runs:
        raise NotFound(f"reconstruction {run_id} not found (runs are kept in memory; re-run after a restart)")
    return store.runs[run_id]


@router.get("/datasets", response_model=DatasetList)
def datasets() -> DatasetList:
    items = []
    for d in dataset_ids():
        ds = load_dataset(d)
        items.append(
            DatasetInfo(
                dataset_id=d,
                title=ds.title,
                seed=ds.seed,
                files=[f.filename for f in ds.files],
                adapters=sorted({f.adapter for f in ds.files}),
                has_ground_truth=(GROUND_TRUTH_DIR / f"{d}.json").is_file(),
            )
        )
    return DatasetList(items=items)


@router.get("/intake", response_model=IntakeCapabilities)
def intake_capabilities() -> IntakeCapabilities:
    lim = load_config().limits
    return IntakeCapabilities(
        canonical_schema=CANONICAL_SCHEMA,
        adapters=[
            AdapterInfo(
                adapter_id=a.adapter_id,
                version=a.version,
                format=a.fmt,
                content_types=sorted(CONTENT_TYPES[a.fmt]),
                source_type=a.source_type,
                description=a.description,
            )
            for a in sorted(ADAPTERS.values(), key=lambda a: a.adapter_id)
        ],
        limits=IntakeLimits(
            max_files=lim.max_files,
            max_file_bytes=lim.max_file_bytes,
            max_total_bytes=lim.max_total_bytes,
            max_records_per_file=lim.max_records_per_file,
        ),
    )


@router.post("/ingestions", response_model=IngestionResult, dependencies=[Depends(size_guard)])
def create_ingestion(body: IngestionRequest, store: Store) -> IngestionResult:
    config = load_config()
    if body.dataset_id is not None:
        try:
            ds = load_dataset(body.dataset_id)
        except KeyError as exc:
            raise NotFound(f"dataset {body.dataset_id} not found") from exc
        ing = ingest(
            ds.files, ds.context, config=config, ingested_at=ds.captured_at, dataset_id=ds.dataset_id
        )
    else:
        ing = ingest(
            body.files,
            body.context or OrgContext(organisation="unspecified"),
            config=config,
            ingested_at=datetime.now(UTC),
        )
    store.put(store.batches, ing.result.batch_id, ing)
    return ing.result


@router.get("/ingestions/{batch_id}", response_model=IngestionResult)
def get_ingestion(batch_id: str, store: Store) -> IngestionResult:
    return _batch(store, batch_id).result


@router.get("/ingestions/{batch_id}/events", response_model=CanonicalEventPage)
def get_events(
    batch_id: str,
    store: Store,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> CanonicalEventPage:
    events = _batch(store, batch_id).events
    return CanonicalEventPage(
        batch_id=batch_id,
        total=len(events),
        offset=offset,
        limit=limit,
        items=events[offset : offset + limit],
    )


@router.post("/reconstructions", response_model=ReconstructionSummary)
def create_reconstruction(body: ReconstructionRequest, store: Store) -> ReconstructionSummary:
    ing = _batch(store, body.batch_id)
    rec = reconstruct(ing, load_config())
    dataset = ing.result.dataset_id
    if dataset and (GROUND_TRUTH_DIR / f"{dataset}.json").is_file():
        # Evaluation is attached outside the engine: the engine never sees ground truth.
        metrics = list(score_run(rec, ing, load_truth(dataset)).values())
        rec = Reconstruction(
            **{**rec.__dict__, "receipt": rec.receipt.model_copy(update={"metrics": metrics})}
        )
    store.put(store.runs, rec.summary.run_id, rec)
    return rec.summary


@router.get("/reconstructions/{run_id}", response_model=ReconstructionSummary)
def get_reconstruction(run_id: str, store: Store) -> ReconstructionSummary:
    return _run(store, run_id).summary


@router.get("/reconstructions/{run_id}/graph", response_model=ReconstructedGraph)
def get_graph(run_id: str, store: Store) -> ReconstructedGraph:
    return _run(store, run_id).graph


@router.get("/reconstructions/{run_id}/story", response_model=AttackStory)
def get_story(run_id: str, store: Store) -> AttackStory:
    return _run(store, run_id).story


@router.get("/reconstructions/{run_id}/hypotheses", response_model=Hypotheses)
def get_hypotheses(run_id: str, store: Store) -> Hypotheses:
    return _run(store, run_id).hypotheses


@router.get("/reconstructions/{run_id}/entities", response_model=EntityList)
def get_entities(run_id: str, store: Store) -> EntityList:
    return EntityList(run_id=run_id, items=_run(store, run_id).entities)


@router.get("/reconstructions/{run_id}/stages", response_model=StageList)
def get_stages(run_id: str, store: Store) -> StageList:
    rec = _run(store, run_id)
    kept = {n.node_id for n in rec.graph.nodes if n.node_kind == "event"}
    order = {e.event_id: i for i, e in enumerate(rec.events)}  # events are already in time order
    items = sorted((s for s in rec.stages.values() if s.event_id in kept), key=lambda s: order[s.event_id])
    return StageList(run_id=run_id, items=items)


@router.get("/reconstructions/{run_id}/receipt", response_model=ReconstructionReceipt)
def get_receipt(run_id: str, store: Store) -> ReconstructionReceipt:
    return _run(store, run_id).receipt


@router.get("/reconstructions/{run_id}/attack-flow", response_model=AttackFlowExport)
def get_attack_flow(run_id: str, store: Store) -> AttackFlowExport:
    bundle = _run(store, run_id).attack_flow
    return AttackFlowExport(run_id=run_id, conformance=bundle["x_halt_conformance"], bundle=bundle)


@router.get("/reconstructions/{run_id}/evaluation", response_model=EvaluationReport)
def get_evaluation(run_id: str, store: Store) -> EvaluationReport:
    rec = _run(store, run_id)
    dataset = rec.summary.dataset_id
    if not dataset or not (GROUND_TRUTH_DIR / f"{dataset}.json").is_file():
        raise NotFound(
            "no ground truth exists for this input; evaluation is available for bundled datasets only"
        )
    return evaluate_dataset(dataset)
