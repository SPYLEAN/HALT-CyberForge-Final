"""Analyst review of a stored result: an append-only, hash-chained record kept apart from the run.

A decision never touches an incident or a receipt. Reviews live beside the runs, not inside them, and use the
audit log's hash chain, so an edited or removed entry is detectable.
"""

from __future__ import annotations

import json
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from halt.audit.log import GENESIS, entry_hash
from halt.firex.contracts import AnalystReview, ReviewList, ReviewRequest
from halt.firex.jobs import RunError, read_state, run_dir
from halt.firex.registry import runs_dir
from halt.firex.util import read_json

_lock = threading.Lock()
KIND = "firex.analyst_review"


def _path(run_id: str, root: Path | None) -> Path:
    return runs_dir(root).parent / "firex-reviews" / f"{run_id}.jsonl"


def _load(run_id: str, root: Path | None) -> list[dict[str, Any]]:
    path = _path(run_id, root)
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _hash(entry: dict[str, Any]) -> str:
    payload = {
        k: entry[k] for k in ("incident_id", "evidence_id", "original_conclusion", "decision", "reason")
    }
    return entry_hash(
        entry["prev_hash"],
        entry["seq"],
        datetime.fromisoformat(entry["at"]),
        entry["analyst"],
        KIND,
        entry["run_id"],
        payload,
    )


def chain_valid(entries: list[dict[str, Any]]) -> bool:
    prev = GENESIS
    for seq, entry in enumerate(entries):
        if entry["seq"] != seq or entry["prev_hash"] != prev or _hash(entry) != entry["audit_reference"]:
            return False
        prev = entry["audit_reference"]
    return True


def list_reviews(run_id: str, root: Path | None = None) -> list[AnalystReview]:
    entries = _load(run_id, root)
    return [AnalystReview.model_validate({k: v for k, v in e.items() if k != "prev_hash"}) for e in entries]


def review_list(run_id: str, root: Path | None = None) -> ReviewList:
    read_state(run_id, root)
    entries = _load(run_id, root)
    return ReviewList(run_id=run_id, items=list_reviews(run_id, root), chain_valid=chain_valid(entries))


def latest_reviews(run_id: str, root: Path | None = None) -> dict[str, AnalystReview]:
    """The current decision for each incident. Earlier decisions stay in the record."""
    latest: dict[str, AnalystReview] = {}
    for review in list_reviews(run_id, root):
        if review.incident_id:
            latest[review.incident_id] = review
    return latest


def add_review(run_id: str, request: ReviewRequest, root: Path | None = None) -> AnalystReview:
    read_state(run_id, root)
    folder = run_dir(run_id, root)
    original = "Stored record"
    if request.incident_id:
        detail = folder / "incidents" / request.incident_id / "detail.json"
        if not detail.is_file():
            raise RunError(404, "not_found", f"incident {request.incident_id} not found in this run")
        original = str(read_json(detail)["summary"]["status"])
    elif not request.evidence_id:
        raise RunError(422, "subject_required", "a review names an incident or a record")
    path = _path(run_id, root)
    with _lock:
        entries = _load(run_id, root)
        entry: dict[str, Any] = {
            "seq": len(entries),
            "run_id": run_id,
            "incident_id": request.incident_id,
            "evidence_id": request.evidence_id,
            "original_conclusion": original,
            "decision": request.decision,
            "reason": request.reason,
            "analyst": request.analyst,
            "at": datetime.now(UTC).isoformat(),
            "prev_hash": entries[-1]["audit_reference"] if entries else GENESIS,
        }
        entry["audit_reference"] = _hash(entry)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(entry, sort_keys=True) + "\n")
    return AnalystReview.model_validate({k: v for k, v in entry.items() if k != "prev_hash"})
