"""Shared helpers for the PS2 tests: small synthetic records and cached dataset reconstructions."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

from halt.ps2.config import load_config
from halt.ps2.datasets import load_dataset
from halt.ps2.engine import Reconstruction, reconstruct
from halt.ps2.intake.intake import Ingestion, ingest
from halt.ps2.schema import OrgContext, RawFile

AT = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)
CONTEXT = OrgContext(organisation="Test Org", internal_cidrs=["10.0.0.0/8"])


def api_record(rid: str, ts: str, user: str, session: str, ip: str, **extra: Any) -> dict[str, Any]:
    return {
        "RecordId": rid,
        "CreationTime": ts,
        "UserId": user,
        "SessionId": session,
        "ClientIP": ip,
        "Operation": "FileAccessed",
        "ObjectId": "shared-docs",
        "ResultStatus": "Succeeded",
        "AppId": "app-docs",
        **extra,
    }


def jsonl(records: list[dict[str, Any]]) -> str:
    return "".join(json.dumps(r, sort_keys=True) + "\n" for r in records)


def api_file(records: list[dict[str, Any]], name: str = "api.jsonl") -> RawFile:
    return RawFile(
        filename=name, adapter="api_activity", content_type="application/x-ndjson", content=jsonl(records)
    )


def ingest_files(files: list[RawFile], context: OrgContext = CONTEXT) -> Ingestion:
    return ingest(files, context, config=load_config(), ingested_at=AT)


def ingest_dataset(dataset_id: str, files: list[RawFile] | None = None) -> Ingestion:
    ds = load_dataset(dataset_id)
    return ingest(
        files if files is not None else ds.files,
        ds.context,
        config=load_config(),
        ingested_at=ds.captured_at,
        dataset_id=dataset_id,
    )


@lru_cache(maxsize=4)
def dataset_run(dataset_id: str) -> tuple[Ingestion, Reconstruction]:
    ing = ingest_dataset(dataset_id)
    return ing, reconstruct(ing, load_config())
