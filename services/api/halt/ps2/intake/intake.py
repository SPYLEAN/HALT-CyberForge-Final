"""Batch intake: raw files → ingested-record reports + canonical events.

A malformed record is reported (with its hash and a redacted preview) and skipped; it never stops the batch.
File-level problems (unknown adapter, wrong content type, size) are structured errors for the whole request.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime

from pydantic import ValidationError

from halt.canonical import sha256_hex
from halt.ps2.config import ReconstructionConfig
from halt.ps2.intake.adapters import ADAPTERS, CONTENT_TYPES, Mapped
from halt.ps2.intake.parse import parse
from halt.ps2.intake.redact import preview
from halt.ps2.schema import (
    CanonicalEvent,
    EvidenceRef,
    FileReport,
    IngestedRecord,
    IngestionResult,
    OrgContext,
    RawFile,
    RecordIssue,
)


class IntakeError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


@dataclass(frozen=True)
class Ingestion:
    result: IngestionResult
    events: list[CanonicalEvent]
    context: OrgContext


def event_id(adapter_id: str, raw_sha256: str) -> str:
    """Deterministic: the same raw record through the same adapter always gets the same id."""
    return "ce-" + hashlib.sha256(f"{adapter_id}|{raw_sha256}".encode()).hexdigest()[:20]


def _enrich(fields: dict[str, object], context: OrgContext) -> None:
    assets = {a.resource.lower(): a for a in context.assets}
    resource = fields.get("resource")
    if isinstance(resource, str) and resource in assets:
        fields["business_service"] = assets[resource].business_service
        fields.setdefault("resource_type", assets[resource].resource_type)
        if fields.get("resource_type") is None:
            fields["resource_type"] = assets[resource].resource_type
    actor = fields.get("actor_user")
    if isinstance(actor, str) and actor in {s.lower() for s in context.service_accounts}:
        fields["actor_kind"] = "service"


def check_files(files: list[RawFile], config: ReconstructionConfig) -> None:
    lim = config.limits
    if not files:
        raise IntakeError(422, "no_files", "at least one file is required")
    if len(files) > lim.max_files:
        raise IntakeError(413, "too_many_files", f"at most {lim.max_files} files per batch")
    total = 0
    for f in files:
        size = len(f.content.encode("utf-8"))
        total += size
        if size > lim.max_file_bytes:
            raise IntakeError(413, "file_too_large", f"{f.filename} exceeds {lim.max_file_bytes} bytes")
        adapter = ADAPTERS.get(f.adapter)
        if adapter is None:
            raise IntakeError(
                422, "unknown_adapter", f"{f.filename}: adapter {f.adapter!r} is not registered"
            )
        if f.content_type not in CONTENT_TYPES[adapter.fmt]:
            raise IntakeError(
                415,
                "unsupported_content_type",
                f"{f.filename}: {f.content_type} does not match {adapter.parser} ({adapter.fmt})",
            )
    if total > lim.max_total_bytes:
        raise IntakeError(413, "batch_too_large", f"batch exceeds {lim.max_total_bytes} bytes")
    names = [f.filename for f in files]
    if len(set(names)) != len(names):
        raise IntakeError(422, "duplicate_filename", "file names must be unique within a batch")


def ingest(
    files: list[RawFile],
    context: OrgContext,
    *,
    config: ReconstructionConfig,
    ingested_at: datetime,
    dataset_id: str | None = None,
) -> Ingestion:
    check_files(files, config)
    reports: list[FileReport] = []
    events: dict[str, CanonicalEvent] = {}
    input_hashes: dict[str, str] = {}
    for f in sorted(files, key=lambda x: x.filename):
        adapter = ADAPTERS[f.adapter]
        file_sha = hashlib.sha256(f.content.encode("utf-8")).hexdigest()
        input_hashes[f.filename] = file_sha
        records: list[IngestedRecord] = []
        for row in parse(f.content, adapter.fmt, config.limits.max_records_per_file):
            record_id = str(row.data.get(adapter.record_id_field) or "") if row.data else ""
            base = {
                "source_name": f.filename,
                "source_record_id": record_id or f"line-{row.line}",
                "line": row.line,
                "raw_sha256": row.raw_sha256,
                "parser": adapter.parser,
                "ingested_at": ingested_at,
                "preview": preview(row.data),
            }
            if row.data is None:
                records.append(
                    IngestedRecord(
                        **base,
                        occurred_at=None,
                        status="rejected",
                        issues=[RecordIssue(code="malformed_record", message=row.error or "malformed")],
                    )
                )
                continue
            m = adapter.mapper(row.data, Mapped())
            if not record_id:
                m.warn(
                    "missing_record_id",
                    f"{adapter.record_id_field} missing; line number used",
                    adapter.record_id_field,
                )
            occurred = m.fields.get("occurred_at")
            if m.reject:
                records.append(
                    IngestedRecord(
                        **base,
                        occurred_at=occurred if isinstance(occurred, datetime) else None,
                        status="rejected",
                        issues=m.issues,
                    )
                )
                continue
            eid = event_id(adapter.adapter_id, row.raw_sha256)
            if eid in events:
                records.append(
                    IngestedRecord(
                        **base,
                        occurred_at=occurred,
                        status="rejected",
                        issues=[
                            *m.issues,
                            RecordIssue(
                                code="duplicate_record", message=f"identical to {eid}; ingested once"
                            ),
                        ],
                        event_id=eid,
                    )
                )
                continue
            fields = {k: v for k, v in m.fields.items() if v is not None and v != []}
            _enrich(fields, context)
            try:
                event = CanonicalEvent(
                    event_id=eid,
                    source_type=adapter.source_type,
                    source_name=f.filename,
                    evidence=EvidenceRef(
                        source_name=f.filename,
                        source_record_id=base["source_record_id"],
                        line=row.line,
                        raw_sha256=row.raw_sha256,
                        parser=adapter.parser,
                    ),
                    raw_sha256=row.raw_sha256,
                    **fields,
                )
            except ValidationError as exc:
                issues = [
                    *m.issues,
                    *(
                        RecordIssue(
                            code="invalid_field", message=e["msg"], field=".".join(str(p) for p in e["loc"])
                        )
                        for e in exc.errors()
                    ),
                ]
                records.append(
                    IngestedRecord(
                        **base,
                        occurred_at=occurred if isinstance(occurred, datetime) else None,
                        status="rejected",
                        issues=issues,
                    )
                )
                continue
            events[eid] = event
            status = "normalised_with_warnings" if m.issues else "normalised"
            records.append(
                IngestedRecord(
                    **base, occurred_at=event.occurred_at, status=status, issues=m.issues, event_id=eid
                )
            )
        reports.append(
            FileReport(
                filename=f.filename,
                adapter=adapter.parser,
                file_sha256=file_sha,
                accepted=sum(r.status != "rejected" for r in records),
                rejected=sum(r.status == "rejected" for r in records),
                warnings=sum(r.status == "normalised_with_warnings" for r in records),
                records=records,
            )
        )
    context_sha = sha256_hex(context)
    batch_id = "batch-" + sha256_hex({"inputs": sorted(input_hashes.values()), "context": context_sha})[:16]
    ordered = sorted(events.values(), key=lambda e: (e.occurred_at, e.event_id))
    result = IngestionResult(
        batch_id=batch_id,
        dataset_id=dataset_id,
        files=reports,
        accepted=sum(r.accepted for r in reports),
        rejected=sum(r.rejected for r in reports),
        warnings=sum(r.warnings for r in reports),
        event_count=len(ordered),
        context_sha256=context_sha,
        input_hashes=input_hashes,
    )
    return Ingestion(result=result, events=ordered, context=context)
