"""SourceTrace: search a stored run, and trace any claim back to the source record behind it.

Read-only. Everything comes from a run's stored files: canonical Parquet parts, read part by part through
DuckDB with a time budget, and the incident JSON. One raw line can be read by seeking to its stored byte
offset
and is shown as a raw record only if its hash matches. Nothing scans the raw file, writes inside a run folder
or
changes a receipt. A claim that fails a check is reported as failed and never replaced.
"""

from __future__ import annotations

import bisect
import hashlib
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import duckdb

from halt.firex.contracts import (
    GateCheck,
    IncidentProvenance,
    ProvenanceChain,
    ProvenanceStage,
    ProvenanceSummary,
    SearchResponse,
    SearchSuggestions,
    TraceDetection,
    TraceProof,
    TraceRecord,
    TraceRelationship,
    TraceRun,
    TraceStep,
    TraceUse,
)
from halt.firex.jobs import RunError, read_state, run_dir
from halt.firex.parser import INT32_COLUMNS, INT64_COLUMNS, STRING_COLUMNS
from halt.firex.receipts import verify_seal
from halt.firex.registry import datasets, source_path
from halt.firex.reviews import latest_reviews, list_reviews
from halt.firex.store import posix
from halt.firex.trust import build_health
from halt.firex.util import read_json, sha256_file

RAW_RECORD = "RAW RECORD"
STORED_EXCERPT = "STORED SOURCE EXCERPT"
CANONICAL_EVENT = "CANONICAL EVENT"
SOURCE_VERIFIED = "SOURCE VERIFIED"
RELATIONSHIP_OBSERVED = "RELATIONSHIP OBSERVED"
RELATIONSHIP_INFERRED = "RELATIONSHIP INFERRED"
INCIDENT_UNCONFIRMED = "INCIDENT UNCONFIRMED"
ANALYST_CONFIRMED = "ANALYST CONFIRMED"
PROVENANCE_FAILED = "PROVENANCE FAILED"
SOURCE_UNAVAILABLE = "SOURCE UNAVAILABLE"
NOT_APPLICABLE = "NOT APPLICABLE"
NOT_FOUND = (
    "No matching source or canonical evidence was found in this run.\n"
    "HALT has not substituted data from another dataset."
)
SCAN_BUDGET_S = 6.0
PARTS_PER_BATCH = 6
MAX_EXCERPT = 600
MAX_RAW = 4000
MAX_LINE_BYTES = 1 << 20
MAX_CHAIN_RECORDS = 12

TEXT_COLUMNS = (
    "user",
    "message",
    "hostname",
    "devname",
    "devid",
    "service",
    "action",
    "src_ip",
    "dst_ip",
    "url",
    "attack",
    "virus",
    "logdesc",
)
FIELD_COLUMNS: dict[str, tuple[str, ...]] = {
    "user": ("user",),
    "ip": ("src_ip", "dst_ip"),
    "host": ("hostname", "devname"),
    "device": ("devname", "devid"),
    "destination": ("dst_ip", "hostname", "url"),
    "service": ("service",),
    "action": ("action",),
    "message": ("message", "logdesc"),
}
# Fields answered from the incident files alone, with no Parquet scan.
INDEX_FIELDS = {"incident", "detection", "node", "edge", "receipt"}
RECORD_COLUMNS = (
    "evidence_id, event_ns, byte_offset, chunk_id, line_in_chunk, raw_sha256, canonical_sha256, "
    + ", ".join(c for c, _ in (*STRING_COLUMNS, *INT32_COLUMNS, *INT64_COLUMNS))
)
KIND_BY_COLUMN = {
    "user": "account",
    "src_ip": "IP address",
    "dst_ip": "IP address",
    "hostname": "host",
    "devname": "device",
    "devid": "device",
    "service": "service",
    "action": "action",
}
EVIDENCE_ID = re.compile(r"^ev-[0-9a-f]{8,}$")
LINE_NUMBER = re.compile(r"^\d[\d,]*$")
TIMESTAMP = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2}))?)?)?Z?$")


@dataclass
class RunView:
    run_id: str
    root: Path | None
    folder: Path
    state: dict[str, Any]
    plan: dict[str, Any]
    receipt: dict[str, Any]
    quality: dict[str, Any]
    quarantine: list[dict[str, Any]]
    incidents: list[dict[str, Any]] = field(default_factory=list)
    uses: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    bursts: dict[str, list[str]] = field(default_factory=dict)

    def has_parts(self) -> bool:
        return any((self.folder / "parts").glob("*.parquet"))


def _optional(path: Path, fallback: Any) -> Any:
    return read_json(path) if path.is_file() else fallback


def load_run(run_id: str, root: Path | None = None) -> RunView:
    state = read_state(run_id, root)
    if state["status"] != "completed":
        raise RunError(409, "run_not_completed", "SourceTrace reads completed runs only")
    folder = run_dir(run_id, root)
    view = RunView(
        run_id=run_id,
        root=root,
        folder=folder,
        state=state,
        plan=read_json(folder / "plan.json"),
        receipt=_optional(folder / "benchmark_receipt.json", {}),
        quality=_optional(folder / "quality.json", {}),
        quarantine=_optional(folder / "quarantine.json", []),
    )
    for summary in _optional(folder / "incidents" / "index.json", []):
        base = folder / "incidents" / summary["incident_id"]
        incident = {"summary": summary}
        for name in ("detail", "graph", "story", "hypotheses", "proof"):
            incident[name] = _optional(base / f"{name}.json", {})
        view.incidents.append(incident)
        for event in incident["detail"].get("evidence", []):
            view.uses.setdefault(event["evidence_id"], []).append(incident)
        for detection in incident["detail"].get("detections", []):
            for ref in detection["evidence_refs"]:
                users = view.uses.setdefault(ref, [])
                if incident not in users:
                    users.append(incident)
    for burst in _optional(folder / "bursts.json", {"items": []})["items"]:
        for ref in burst["evidence_refs"]:
            view.bursts.setdefault(ref, []).append(burst["burst_id"])
    return view


def _connection() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    con.execute("SET memory_limit='1GB'")
    con.execute("SET threads=4")
    return con


def _line_of(view: RunView, chunk_id: int, line_in_chunk: int) -> int:
    return int(_bases(view)[chunk_id]) + line_in_chunk + 1


def _bases(view: RunView) -> dict[int, int]:
    return {c["chunk_id"]: c["line_base"] for c in view.plan["chunks"]}


def _chunk_for_line(view: RunView, line: int) -> tuple[int, int] | None:
    chunks = view.plan["chunks"]
    index = bisect.bisect_right([c["line_base"] for c in chunks], line - 1) - 1
    if index < 0:
        return None
    return chunks[index]["chunk_id"], line - 1 - chunks[index]["line_base"]


def _chunk_for_offset(view: RunView, offset: int) -> int | None:
    chunks = view.plan["chunks"]
    index = bisect.bisect_right([c["start"] for c in chunks], offset) - 1
    if index < 0 or offset >= chunks[index]["end"]:
        return None
    return int(chunks[index]["chunk_id"])


def _parts(view: RunView) -> list[tuple[int, Path]]:
    found = [(int(p.stem.split("-")[1]), p) for p in (view.folder / "parts").glob("part-*.parquet")]
    return sorted(found)


def _rows(
    con: duckdb.DuckDBPyConnection, paths: list[Path], where: str, params: list[Any], limit: int
) -> Any:
    files = ", ".join(f"'{posix(p)}'" for p in paths)
    query = (
        f"SELECT {RECORD_COLUMNS} FROM read_parquet([{files}]) WHERE {where} "
        f"ORDER BY chunk_id, line_in_chunk LIMIT {int(limit)}"
    )
    result = con.execute(query, params)
    names = [d[0] for d in result.description]
    return [dict(zip(names, row, strict=True)) for row in result.fetchall()]


def _utc(ns: int | None) -> str | None:
    if ns is None:
        return None
    return datetime.fromtimestamp(ns / 1e9, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_raw(view: RunView, offset: int) -> bytes | None:
    """One line, by seeking to its stored offset. None when the source file is not on this server."""
    dataset = datasets(view.root).get(view.state["dataset_id"])
    if not dataset:
        return None
    path = source_path(dataset, view.root)
    if not path.is_file():
        return None
    with open(path, "rb") as f:
        f.seek(offset)
        return f.readline(MAX_LINE_BYTES).rstrip(b"\r\n")


def _source_available(view: RunView) -> bool:
    dataset = datasets(view.root).get(view.state["dataset_id"])
    if not dataset:
        return False
    path = source_path(dataset, view.root)
    return path.is_file() and path.stat().st_size == view.plan["source_size"]


def _raw_check(view: RunView, row: dict[str, Any]) -> tuple[str, str | None]:
    """('verified' | 'unavailable' | 'mismatch', text)."""
    raw = _read_raw(view, row["byte_offset"]) if _source_available(view) else None
    if raw is None:
        return "unavailable", None
    if hashlib.sha256(raw).hexdigest()[:32] != row["raw_sha256"]:
        return "mismatch", None
    return "verified", raw.decode("utf-8", errors="replace")


def _fields(row: dict[str, Any]) -> dict[str, str]:
    columns = (c for c, _ in (*STRING_COLUMNS, *INT32_COLUMNS, *INT64_COLUMNS))
    return {c: str(row[c]) for c in columns if row.get(c) is not None}


def _duplicates(view: RunView, con: duckdb.DuckDBPyConnection, offsets: list[int]) -> set[int]:
    path = view.folder / "duplicates.parquet"
    if not offsets or not path.is_file():
        return set()
    marks = ",".join("?" * len(offsets))
    found = con.execute(
        f"SELECT byte_offset FROM read_parquet('{posix(path)}') WHERE byte_offset IN ({marks})", offsets
    )
    return {int(r[0]) for r in found.fetchall()}


def _uses(view: RunView, evidence_id: str) -> list[TraceUse]:
    return [
        TraceUse(
            incident_id=i["summary"]["incident_id"],
            title=i["summary"]["title"],
            status=i["summary"]["status"],
        )
        for i in view.uses.get(evidence_id, [])
    ]


def _detections_of(view: RunView, evidence_id: str) -> list[str]:
    return [
        d["detection_id"]
        for i in view.uses.get(evidence_id, [])
        for d in i["detail"].get("detections", [])
        if evidence_id in d["evidence_refs"]
    ]


def _record(view: RunView, row: dict[str, Any], duplicates: set[int], *, raw_limit: int) -> TraceRecord:
    outcome, text = _raw_check(view, row)
    if text is not None:
        label, excerpt = RAW_RECORD, text[:raw_limit]
    else:
        label, excerpt = CANONICAL_EVENT, None
    return TraceRecord(
        state="canonical",
        evidence_id=row["evidence_id"],
        line=_line_of(view, row["chunk_id"], row["line_in_chunk"]),
        byte_offset=row["byte_offset"],
        event_utc=_utc(row["event_ns"]),
        label=label,
        excerpt=excerpt,
        truncated=bool(text and len(text) > raw_limit),
        raw_status=outcome,
        fields=_fields(row),
        raw_sha256=row["raw_sha256"],
        canonical_sha256=row["canonical_sha256"],
        duplicate=row["byte_offset"] in duplicates,
        bursts=view.bursts.get(row["evidence_id"], []),
        detections=_detections_of(view, row["evidence_id"]),
        incidents=_uses(view, row["evidence_id"]),
        quarantine_reason=None,
    )


def _quarantined_line(view: RunView, line: int) -> TraceRecord | None:
    for segment in view.quarantine:
        if segment["start_line"] <= line <= segment["end_line"]:
            sample = next((s for s in segment["samples"] if s["line"] == line), None)
            return TraceRecord(
                state="quarantined",
                evidence_id=None,
                line=line,
                byte_offset=sample["offset"] if sample else None,
                event_utc=None,
                label=STORED_EXCERPT if sample else None,
                excerpt=sample["text"][:MAX_EXCERPT] if sample else None,
                truncated=bool(sample and len(sample["text"]) > MAX_EXCERPT),
                raw_status="not_applicable",
                fields={},
                raw_sha256=None,
                canonical_sha256=None,
                duplicate=None,
                bursts=[],
                detections=[],
                incidents=[],
                quarantine_reason=segment["reason"],
            )
    return None


def _timestamp_range(match: re.Match[str]) -> tuple[int, int] | None:
    year, month, day, hour, minute, second = match.groups()
    try:
        start = datetime(
            int(year), int(month), int(day), int(hour or 0), int(minute or 0), int(second or 0), tzinfo=UTC
        )
    except ValueError:
        return None
    span = (
        timedelta(days=1) if hour is None else timedelta(hours=1) if minute is None else timedelta(minutes=1)
    )
    if second is not None:
        span = timedelta(seconds=1)
    return int(start.timestamp()) * 10**9, int((start + span).timestamp()) * 10**9 - 1


def _interpret(query: str, field_name: str | None) -> tuple[str, str | None, list[Any]]:
    """(what the query was read as, a WHERE clause or None for no Parquet scan, its parameters)."""
    q = query.strip()
    wanted = field_name or ""
    if wanted in INDEX_FIELDS or (not wanted and re.match(r"^(finc|fdet|fedge|fprf|fbmk|fhyp)-", q)):
        return wanted or "identifier", None, []
    if not wanted and q.startswith(("step:", "entity:")):
        return "graph node", None, []
    if wanted == "event_id" or (not wanted and EVIDENCE_ID.match(q)):
        return "event id", "evidence_id = ?", [q]
    if wanted == "line" or (not wanted and LINE_NUMBER.match(q)):
        return "source line", None, []
    stamp = TIMESTAMP.match(q)
    if wanted == "timestamp" or (not wanted and stamp):
        bounds = _timestamp_range(stamp) if stamp else None
        if not bounds:
            return "timestamp", "FALSE", []
        return "timestamp", "event_ns BETWEEN ? AND ?", list(bounds)
    columns = FIELD_COLUMNS.get(wanted, TEXT_COLUMNS)
    needle = q.lower()
    clause = " OR ".join(f"contains(lower({c}), ?)" for c in columns)
    return wanted or "text", clause, [needle] * len(columns)


def _value_kind(query: str, rows: list[dict[str, Any]], view: RunView) -> tuple[str | None, str | None]:
    """What the searched value is, from the fields that actually hold it. Never guessed from its spelling."""
    q = query.strip().lower()
    for column, kind in KIND_BY_COLUMN.items():
        if any(str(r.get(column) or "").lower() == q for r in rows):
            note = (
                f"This is an account or object name, held in the {column} field of a stored record. It is "
                "not a file."
                if kind == "account"
                else f"Found in the {column} field of a stored record."
            )
            return kind, note
    for incident in view.incidents:
        for node in incident["graph"].get("nodes", []):
            if node["label"].lower() == q and node["kind"] != "event":
                return node["kind"], "From this value's node in a stored incident graph."
    return None, None


def _matches(query: str, *values: Any) -> bool:
    q = query.lower()
    return any(q in str(v).lower() for v in values if v is not None)


def _incident_groups(
    view: RunView, query: str, field_name: str | None, relationship: str | None, cited: set[str]
) -> tuple[list[TraceDetection], list[TraceStep], list[TraceRelationship], list[TraceProof]]:
    detections: list[TraceDetection] = []
    steps: list[TraceStep] = []
    relations: list[TraceRelationship] = []
    proofs: list[TraceProof] = []
    only = field_name or ""
    for incident in view.incidents:
        summary = incident["summary"]
        iid, title = summary["incident_id"], summary["title"]
        whole = (only in ("", "incident")) and iid.lower() == query.lower()
        touched = whole
        graph = incident["graph"]
        for det in incident["detail"].get("detections", []):
            hit = whole or set(det["evidence_refs"]) & cited
            if only in ("", "detection"):
                exact = det["detection_id"].lower() == query.lower()
                hit = (
                    hit
                    or exact
                    or (not only and _matches(query, det["rule_id"], det["reason"], det["entities"]))
                )
            if hit:
                touched = True
                detections.append(
                    TraceDetection(
                        detection_id=det["detection_id"],
                        rule_id=det["rule_id"],
                        rule_version=det["rule_version"],
                        title=det["title"],
                        reason=det["reason"],
                        basis=det["basis"],
                        incident_id=iid,
                        status=det["status"],
                    )
                )
        for node in graph.get("nodes", []):
            refs = set(node["evidence_refs"])
            exact = only in ("", "node") and node["node_id"].lower() == query.lower()
            named = not only and _matches(query, node["label"])
            on_path = node["on_selected_path"]
            if on_path and (whole or exact or named or refs & cited):
                touched = True
                steps.append(
                    TraceStep(
                        incident_id=iid,
                        incident_title=title,
                        node_id=node["node_id"],
                        label=node["label"],
                        stage=node["stage"],
                        count=node["count"],
                        evidence_refs=node["evidence_refs"][:5],
                    )
                )
            if (
                not on_path
                and (exact or named or (not relationship and refs & cited))
                and relationship != "inferred"
            ):
                touched = True
                relations.append(
                    TraceRelationship(
                        incident_id=iid,
                        kind="node",
                        element_id=node["node_id"],
                        label=f"{node['kind']}: {node['label']}",
                        classification="reachable"
                        if node["attributes"].get("hypothetical") is True
                        else "observed",
                        on_selected_path=False,
                        missing_evidence=False,
                        rule=None,
                        rule_version=None,
                        evidence_refs=node["evidence_refs"][:5],
                    )
                )
        for edge in graph.get("edges", []):
            refs = set(edge["evidence_refs"])
            exact = only in ("", "edge") and edge["edge_id"].lower() == query.lower()
            if not (whole or exact or refs & cited):
                continue
            if relationship and edge["classification"] != relationship:
                continue
            touched = True
            relations.append(
                TraceRelationship(
                    incident_id=iid,
                    kind="edge",
                    element_id=edge["edge_id"],
                    label=f"{edge['source']} {edge['relation'].replace('_', ' ')} {edge['target']}",
                    classification=edge["classification"],
                    on_selected_path=edge["on_selected_path"],
                    missing_evidence=edge["missing_evidence"],
                    rule=edge["rule"],
                    rule_version=edge["rule_version"],
                    evidence_refs=edge["evidence_refs"][:5],
                )
            )
        proof = incident["proof"]
        if proof and (touched or (only in ("", "receipt") and proof["receipt_id"].lower() == query.lower())):
            proofs.append(
                TraceProof(
                    receipt_id=proof["receipt_id"],
                    kind="incident",
                    incident_id=iid,
                    seal_valid=verify_seal(proof).valid,
                    graph_hash=proof["graph_hash"],
                )
            )
    if view.receipt and only in ("", "receipt") and view.receipt["receipt_id"].lower() == query.lower():
        proofs.append(
            TraceProof(
                receipt_id=view.receipt["receipt_id"],
                kind="benchmark",
                incident_id=None,
                seal_valid=verify_seal(view.receipt).valid,
                graph_hash=None,
            )
        )
    return detections, steps, relations, proofs


def _trace_run(view: RunView) -> TraceRun:
    health, _, _ = build_health(view.run_id, view.root)
    return TraceRun(
        dataset_id=view.state["dataset_id"],
        run_id=view.run_id,
        source_filename=view.plan["filename"],
        source_sha256=view.plan["source_sha256"],
        source_hash_verified=view.plan["source_sha256_verified"],
        source_available=_source_available(view),
        health_state=health.state,
        narrative=health.narrative,
    )


def search(
    run_id: str,
    query: str,
    *,
    field_name: str | None = None,
    relationship: str | None = None,
    cursor: str | None = None,
    limit: int = 20,
    root: Path | None = None,
) -> SearchResponse:
    view = load_run(run_id, root)
    read_as, where, params = _interpret(query, field_name)
    parts = _parts(view)
    rows: list[dict[str, Any]] = []
    quarantined: list[TraceRecord] = []
    next_cursor: str | None = None
    complete = True
    scanned = 0
    start_chunk, start_line = -1, -1
    if cursor:
        match = re.match(r"^(\d+):(-?\d+)$", cursor)
        if not match:
            raise RunError(422, "invalid_cursor", "this search cursor is not valid")
        start_chunk, start_line = int(match.group(1)), int(match.group(2))
    con = _connection()
    try:
        if read_as == "source line":
            digits = query.strip().replace(",", "")
            line = int(digits) if digits.isdigit() else 0
            located = _chunk_for_line(view, line) if line >= 1 else None
            found = []
            if located:
                path = view.folder / "parts" / f"part-{located[0]:06d}.parquet"
                if path.is_file():
                    found = _rows(con, [path], "line_in_chunk = ?", [located[1]], 1)
            rows = found
            scanned = len(parts)
            if not found and line >= 1 and (gone := _quarantined_line(view, line)):
                quarantined.append(gone)
        elif where is not None and view.has_parts():
            remaining = [(c, p) for c, p in parts if c >= start_chunk]
            scanned = len(parts) - len(remaining)
            began = time.monotonic()
            while remaining and len(rows) <= limit:
                batch, remaining = remaining[:PARTS_PER_BATCH], remaining[PARTS_PER_BATCH:]
                clause = f"({where})"
                bound = list(params)
                if cursor and batch[0][0] == start_chunk:
                    clause += " AND (chunk_id > ? OR line_in_chunk > ?)"
                    bound += [start_chunk, start_line]
                rows += _rows(con, [p for _, p in batch], clause, bound, limit + 1 - len(rows))
                scanned += len(batch)
                if time.monotonic() - began > SCAN_BUDGET_S and len(rows) <= limit:
                    if remaining:
                        # The budget ran out: the caller may continue from the next part.
                        next_cursor = f"{remaining[0][0]}:-1"
                        complete = False
                    break
            if len(rows) > limit:
                rows = rows[:limit]
                last = rows[-1]
                next_cursor = f"{last['chunk_id']}:{last['line_in_chunk']}"
                complete = False
        offsets = [r["byte_offset"] for r in rows]
        duplicates = _duplicates(view, con, offsets)
    finally:
        con.close()
    records = [_record(view, r, duplicates, raw_limit=MAX_EXCERPT) for r in rows]
    canonical = [
        r.model_copy(update={"excerpt": None, "label": CANONICAL_EVENT, "truncated": False}) for r in records
    ]
    sources = [r.model_copy(update={"fields": {}}) for r in records]
    if where is not None and read_as == "text" and not cursor:
        for segment in view.quarantine:
            for sample in segment["samples"]:
                if query.lower() in sample["text"].lower() and (
                    hit := _quarantined_line(view, sample["line"])
                ):
                    quarantined.append(hit)
    cited = {r["evidence_id"] for r in rows}
    if where is not None and read_as == "text":
        cited |= {e for e in view.uses if e == query.strip()}
    if read_as == "event id":
        cited.add(query.strip())
    detections, steps, relations, proofs = _incident_groups(
        view, query.strip(), field_name, relationship, cited
    )
    kind, note = _value_kind(query, rows, view)
    nothing = not (records or quarantined or detections or steps or relations or proofs)
    return SearchResponse(
        run=_trace_run(view),
        query=query.strip(),
        field=field_name,
        read_as=read_as,
        value_kind=kind,
        value_note=note,
        source_records=[*sources, *quarantined],
        canonical_events=canonical,
        detections=detections,
        incident_steps=steps,
        graph_relationships=relations,
        proof_receipts=proofs,
        next_cursor=next_cursor,
        scanned_parts=min(scanned, len(parts)),
        total_parts=len(parts),
        complete=complete and next_cursor is None,
        not_found=NOT_FOUND if nothing and complete and next_cursor is None else None,
    )


def suggest(run_id: str, query: str, root: Path | None = None) -> SearchSuggestions:
    """Values already named by this run's incidents. It reads no Parquet, so it answers as the analyst
    types."""
    view = load_run(run_id, root)
    q = query.strip().lower()
    seen: dict[str, str] = {}
    for incident in view.incidents:
        seen.setdefault(incident["summary"]["incident_id"], "incident")
        for values in incident["detail"].get("affected_entities", {}).values():
            for value in values:
                seen.setdefault(str(value), "entity")
        for detection in incident["detail"].get("detections", []):
            for step in detection["steps"]:
                if step.get("actor"):
                    seen.setdefault(step["actor"], "entity")
                if step.get("target"):
                    seen.setdefault(step["target"], "entity")
    hits = sorted(v for v in seen if q in v.lower())
    return SearchSuggestions(run_id=run_id, values=hits[:8])


# ---- provenance


def _load_records(
    view: RunView, con: duckdb.DuckDBPyConnection, refs: list[str], located: dict[str, dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    """Canonical rows by evidence id, reading only the parts that hold them."""
    chunks = {_chunk_for_offset(view, located[r]["byte_offset"]) for r in refs if r in located}
    unknown = [r for r in refs if r not in located]
    paths = [p for c, p in _parts(view) if unknown or c in chunks]
    if not paths or not refs:
        return {}
    marks = ",".join("?" * len(refs))
    found = _rows(con, paths, f"evidence_id IN ({marks})", list(refs), len(refs) + 1)
    return {r["evidence_id"]: r for r in found}


def _check(check_id: str, label: str, ok: bool | None, detail: str) -> GateCheck:
    status = "not_applicable" if ok is None else "passed" if ok else "failed"
    return GateCheck(id=check_id, label=label, status=status, detail=detail)


def _artifact_hashes_ok(view: RunView) -> tuple[bool | None, str]:
    expected = view.receipt.get("artifact_hashes")
    if not expected:
        return None, "The benchmark receipt lists no artifact hashes."
    wrong = [
        name
        for name, digest in expected.items()
        if not (view.folder / name).is_file() or sha256_file(view.folder / name) != digest
    ]
    if wrong:
        return False, f"These artifacts do not match the receipt: {', '.join(sorted(wrong))}."
    return True, f"{len(expected)} artifacts match the hashes in the benchmark receipt."


def _gate(
    view: RunView,
    incident: dict[str, Any] | None,
    refs: list[str],
    rows: dict[str, dict[str, Any]],
    statement: dict[str, Any] | None,
    element: dict[str, Any] | None,
    artifacts: tuple[bool | None, str],
) -> tuple[list[GateCheck], str]:
    plan, receipt = view.plan, view.receipt
    dataset = datasets(view.root).get(view.state["dataset_id"])
    proof = incident["proof"] if incident else {}
    detail = incident["detail"] if incident else {}
    stored = {e["evidence_id"]: e for e in detail.get("evidence", [])}
    checks = [
        _check(
            "dataset",
            "The dataset matches the run",
            view.state["dataset_id"] == plan["dataset_id"]
            and (not proof or proof["dataset_id"] == plan["dataset_id"])
            and (not receipt or receipt["dataset_id"] == plan["dataset_id"]),
            f"Dataset {plan['dataset_id']}.",
        ),
        _check(
            "run",
            "The run matches the incident",
            None if not incident else proof.get("run_id") == view.run_id == incident["summary"].get("run_id"),
            f"Run {view.run_id}." if incident else "This record is not part of an incident.",
        ),
        _check(
            "filename",
            "The source filename matches the dataset",
            bool(dataset) and dataset is not None and plan["filename"] == dataset.filename,
            f"{plan['filename']}.",
        ),
        _check(
            "source_hash",
            "The source hash matches the stored run",
            plan["source_sha256"] == receipt.get("source_sha256", plan["source_sha256"])
            and (not proof or proof["source_sha256"] == plan["source_sha256"])
            and all(e.get("source_sha256") == plan["source_sha256"] for r, e in stored.items() if r in refs),
            f"Plan, receipts and cited records agree on {plan['source_sha256'][:16]}…. "
            "The whole file was hashed during the run, and is not hashed again here.",
        ),
    ]
    missing = [r for r in refs if r not in rows]
    wrong_line = [
        r
        for r in refs
        if r in rows
        and r in stored
        and (
            stored[r]["line"] != _line_of(view, rows[r]["chunk_id"], rows[r]["line_in_chunk"])
            or stored[r]["byte_offset"] != rows[r]["byte_offset"]
        )
    ]
    checks.append(
        _check(
            "origin",
            "The cited line resolves",
            None if not refs else not wrong_line and not missing,
            "No record is cited."
            if not refs
            else f"{len(wrong_line)} cited record(s) give a line or offset unlike the stored event."
            if wrong_line
            else f"{len(refs) - len(missing)} of {len(refs)} cited record(s) resolve to a stored line.",
        )
    )
    changed = [
        r
        for r in refs
        if r in rows and r in stored and stored[r]["canonical_sha256"] != rows[r]["canonical_sha256"]
    ]
    checks.append(
        _check(
            "canonical",
            "The canonical event exists",
            None if not refs else not missing and not changed,
            "No record is cited."
            if not refs
            else f"Not found in the stored events: {', '.join(missing[:3])}."
            if missing
            else "The cited events exist, and their canonical hashes match."
            if not changed
            else f"Canonical hash differs for {', '.join(changed[:3])}.",
        )
    )
    outcomes = [_raw_check(view, rows[r])[0] for r in refs if r in rows]
    mismatch = outcomes.count("mismatch")
    unavailable = outcomes.count("unavailable")
    checks.append(
        GateCheck(
            id="source_record",
            label="The source line matches its stored hash",
            status="failed"
            if mismatch
            else "unavailable"
            if unavailable
            else "passed"
            if outcomes
            else "not_applicable",
            detail=(
                f"{mismatch} line(s) at the stored offset do not match the stored hash."
                if mismatch
                else "The source file is not on this server, so the raw line cannot be read."
                if unavailable
                else f"{len(outcomes)} line(s) read at the stored offset match their stored hash."
                if outcomes
                else "No record is cited."
            ),
        )
    )
    if incident:
        known = {d["detection_id"]: d for d in detail.get("detections", [])}
        stored_ids = {d["detection_id"] for d in _optional(view.folder / "detections.json", [])}
        bad = [d for d in known if d not in stored_ids]
        empty = [d["detection_id"] for d in known.values() if not d["evidence_refs"]]
        checks.append(
            _check(
                "detection",
                "The detection references valid evidence",
                not bad and not empty,
                f"{len(known)} detection(s) are stored and cite evidence."
                if not bad and not empty
                else f"Not valid: {', '.join((bad + empty)[:3])}.",
            )
        )
    else:
        checks.append(
            _check(
                "detection", "The detection references valid evidence", None, "No incident uses this record."
            )
        )
    if element is not None and incident:
        ends = {n["node_id"] for n in incident["graph"].get("nodes", [])}
        is_edge = "edge_id" in element
        ok = bool(element["evidence_refs"]) and (
            not is_edge or {element["source"], element["target"]} <= ends
        )
        checks.append(
            _check(
                "graph",
                "The graph element cites the expected evidence",
                ok,
                "It cites evidence and joins stored nodes."
                if ok
                else "It cites no evidence, or joins a node not in the graph.",
            )
        )
    else:
        checks.append(
            _check(
                "graph",
                "The graph element cites the expected evidence",
                None,
                "No graph element was asked about.",
            )
        )
    if statement is not None:
        known_refs = set(stored) | {r for d in detail.get("detections", []) for r in d["evidence_refs"]}
        cites = statement.get("evidence_ids", [])
        ok = bool(cites) and set(cites) <= known_refs
        checks.append(
            _check(
                "statement",
                "The story statement cites stored evidence",
                ok,
                "Every citation resolves to stored evidence."
                if ok
                else "This statement cites no evidence."
                if not cites
                else "This statement cites evidence that is not stored for the incident.",
            )
        )
    else:
        checks.append(
            _check(
                "statement",
                "The story statement cites stored evidence",
                None,
                "No statement was asked about.",
            )
        )
    if incident:
        cited = set(proof.get("cited_evidence", []))
        graph_ok = proof.get("graph_hash") == incident["graph"].get("graph_hash")
        seal = verify_seal(proof).valid if proof else False
        statement_cites = set(statement.get("evidence_ids", [])) if statement else set()
        ok = seal and graph_ok and statement_cites <= cited and artifacts[0] is not False
        checks.append(
            _check(
                "proof",
                "The proof contains the expected hashes",
                ok,
                f"Seal valid, graph hash matches. {artifacts[1]}"
                if ok
                else (
                    ("The proof seal does not verify. " if not seal else "")
                    + ("The graph hash differs from the proof. " if not graph_ok else "")
                    + (artifacts[1] if artifacts[0] is False else "")
                ).strip()
                or "The proof does not list this statement's citations.",
            )
        )
    else:
        checks.append(_check("proof", "The proof contains the expected hashes", artifacts[0], artifacts[1]))

    failed = [c for c in checks if c.status == "failed"]
    if failed:
        return checks, PROVENANCE_FAILED
    if any(c.status == "unavailable" for c in checks):
        return checks, SOURCE_UNAVAILABLE
    if not refs:
        return checks, NOT_APPLICABLE
    return checks, SOURCE_VERIFIED


def _mapping(row: dict[str, Any] | None) -> str:
    if not row:
        return "Not available."
    pairs = [
        f"{key} → {column}"
        for column, key in (*STRING_COLUMNS, *INT32_COLUMNS, *INT64_COLUMNS)
        if row.get(column) is not None
    ]
    return ", ".join(["eventtime → event_ns", *pairs])


def build_provenance(
    run_id: str,
    *,
    incident_id: str | None = None,
    evidence_id: str | None = None,
    statement_id: str | None = None,
    node_id: str | None = None,
    edge_id: str | None = None,
    root: Path | None = None,
) -> ProvenanceChain:
    view = load_run(run_id, root)
    if evidence_id and not EVIDENCE_ID.match(evidence_id):
        raise RunError(422, "invalid_evidence_id", "this is not an evidence id")
    incident = next((i for i in view.incidents if i["summary"]["incident_id"] == incident_id), None)
    if incident_id and incident is None:
        raise RunError(404, "not_found", f"incident {incident_id} not found in this run")
    if evidence_id and incident is None and view.uses.get(evidence_id):
        incident = view.uses[evidence_id][0]
    if incident is None and not evidence_id:
        raise RunError(422, "subject_required", "name an incident or a record to trace")

    statement: dict[str, Any] | None = None
    element: dict[str, Any] | None = None
    kind = "incident"
    label = incident["summary"]["title"] if incident else ""
    subject = incident_id or ""
    refs = [e["evidence_id"] for e in incident["detail"].get("evidence", [])] if incident else []
    if statement_id and incident:
        statement = next(
            (s for s in incident["story"].get("statements", []) if s["statement_id"] == statement_id), None
        )
        if statement is None:
            raise RunError(404, "not_found", f"statement {statement_id} not found in this incident")
        refs, kind, label, subject = (
            list(statement["evidence_ids"]),
            "statement",
            statement["text"],
            statement_id,
        )
    elif node_id and incident:
        element = next((n for n in incident["graph"].get("nodes", []) if n["node_id"] == node_id), None)
        if element is None:
            raise RunError(404, "not_found", f"node {node_id} not found in this incident")
        refs, kind, label, subject = list(element["evidence_refs"]), "node", element["label"], node_id
    elif edge_id and incident:
        element = next((e for e in incident["graph"].get("edges", []) if e["edge_id"] == edge_id), None)
        if element is None:
            raise RunError(404, "not_found", f"edge {edge_id} not found in this incident")
        refs, kind = list(element["evidence_refs"]), "edge"
        label, subject = element["relation"].replace("_", " "), edge_id
    elif evidence_id:
        refs, kind, label, subject = [evidence_id], "record", evidence_id, evidence_id

    located = {e["evidence_id"]: e for e in incident["detail"].get("evidence", [])} if incident else {}
    con = _connection()
    try:
        rows = _load_records(view, con, refs, located)
        duplicates = _duplicates(view, con, [r["byte_offset"] for r in rows.values()])
    finally:
        con.close()
    if evidence_id and not rows:
        raise RunError(
            404, "not_found", "this record is not in this run. HALT has not looked in any other run."
        )

    checks, source_status = _gate(view, incident, refs, rows, statement, element, _artifact_hashes_ok(view))
    failed = [c for c in checks if c.status == "failed"]
    shown = [rows[r] for r in refs if r in rows][:MAX_CHAIN_RECORDS]
    records = [_record(view, r, duplicates, raw_limit=MAX_RAW) for r in shown]
    first = shown[0] if shown else None
    first_ref = first["evidence_id"] if first else None

    # Relationship
    classification = element.get("classification") if element else None
    if statement is not None and statement.get("kind") == "inferred":
        classification = "inferred"
    links = [
        e
        for e in (incident["graph"].get("edges", []) if incident else [])
        if e["relation"] == "next_step" and e["on_selected_path"]
    ]
    if classification == "observed":
        relationship_status = RELATIONSHIP_OBSERVED
    elif classification == "inferred":
        relationship_status = RELATIONSHIP_INFERRED
    elif classification == "reachable":
        relationship_status = NOT_APPLICABLE
    elif links:
        relationship_status = RELATIONSHIP_INFERRED
    else:
        relationship_status = NOT_APPLICABLE

    review_rows = list_reviews(run_id, root=root)
    latest = latest_reviews(run_id, root=root)
    incident_status = NOT_APPLICABLE
    if incident:
        iid = incident["summary"]["incident_id"]
        decision = latest.get(iid)
        incident_status = (
            ANALYST_CONFIRMED if decision and decision.decision == "Confirmed" else INCIDENT_UNCONFIRMED
        )
        review_rows = [r for r in review_rows if r.incident_id == iid]
    else:
        review_rows = [r for r in review_rows if r.evidence_id == evidence_id]

    # The stages. Each states what went in, what happened, what came out, and where it can be checked.
    detail = incident["detail"] if incident else {}
    detection = next((d for d in detail.get("detections", []) if first_ref in d["evidence_refs"]), None)
    if detection is None and detail.get("detections"):
        detection = detail["detections"][0]
    is_dup = bool(first and first["byte_offset"] in duplicates)
    bursts = view.bursts.get(first_ref or "", [])
    raw_outcome, raw_text = _raw_check(view, first) if first else ("unavailable", None)
    filename = view.plan["filename"]
    line = _line_of(view, first["chunk_id"], first["line_in_chunk"]) if first else None
    hypotheses = incident["hypotheses"] if incident else {}
    selected = hypotheses.get("selected") if hypotheses else None
    proof = incident["proof"] if incident else {}
    stage_failed = {c.id for c in failed}

    def stage(
        stage_id: str,
        title: str,
        plain: str,
        input_text: str,
        transformation: str,
        output: str,
        rule: str | None,
        version: str | None,
        refs_shown: list[str],
        state: str,
        status: str,
    ) -> ProvenanceStage:
        return ProvenanceStage(
            id=stage_id,
            title=title,
            plain=plain,
            input=input_text,
            transformation=transformation,
            output=output,
            rule=rule,
            version=version,
            evidence_refs=refs_shown[:5],
            state=state,
            status=status,
        )

    ok = "ok"
    head = [first_ref] if first_ref else []
    stages = [
        stage(
            "source",
            "Source record",
            (
                f"Line {line:,} of {filename} holds this record, and its stored hash matches."
                if first and raw_outcome == "verified"
                else f"Line {line:,} of {filename} holds this record. The file is not here to re-read."
                if first and raw_outcome == "unavailable"
                else f"The line at the stored offset of {filename} does not match its stored hash."
                if first
                else "No source record is cited here."
            ),
            f"{filename}, SHA-256 {view.plan['source_sha256']}",
            "One line, read by seeking to its stored byte offset." if first else "None.",
            f"Line {line:,}, byte offset {first['byte_offset']:,}." if first else "None.",
            None,
            None,
            head,
            "observed" if first else "not_applicable",
            "failed"
            if raw_outcome == "mismatch"
            else ("unavailable" if raw_outcome == "unavailable" else ok)
            if first
            else "not_applicable",
        ),
        stage(
            "parser",
            "Parser mapping",
            "The parser read the record's key=value pairs and mapped each known key to a named field. It "
            "does not guess values.",
            "The raw key=value text.",
            "Each known key is mapped to one canonical field. Unknown keys are kept in extra_json.",
            _mapping(first),
            "Field mapping",
            view.plan.get("parser_version"),
            head,
            "observed" if first else "not_applicable",
            ok if first else "not_applicable",
        ),
        stage(
            "canonical",
            "Canonical event",
            f"It became stored event {first_ref}, and its time was read from eventtime."
            if first
            else "No canonical event is cited here.",
            "The mapped fields.",
            "Hashed into a canonical hash and an evidence id. eventtime gives the time. Other fields are "
            "unchanged.",
            f"evidence_id {first_ref}, canonical hash {first['canonical_sha256']}" if first else "None.",
            None,
            view.plan.get("parser_version"),
            head,
            "observed" if first else "not_applicable",
            ("failed" if "canonical" in stage_failed else ok) if first else "not_applicable",
        ),
        stage(
            "dedupe",
            "Duplicate and burst handling",
            (
                "This record repeats an earlier identical line, so it was removed from detection."
                if is_dup
                else f"This record is not a duplicate. It belongs to {len(bursts)} stored burst(s)."
                if bursts
                else "This record is not a duplicate, and no stored burst sample lists it."
                if first
                else "Not applicable."
            ),
            "All canonical events.",
            "Lines with the same raw hash count once. Repeated behaviour is grouped into bursts, and each "
            "burst keeps only a sample of its citations.",
            "Duplicate." if is_dup else f"Kept. Bursts: {', '.join(bursts) or 'none listed'}.",
            "burst.repeated_behaviour" if bursts else None,
            None,
            head,
            "observed" if first else "not_applicable",
            ok if first else "not_applicable",
        ),
        stage(
            "detection",
            "Detection rule",
            f"Rule {detection['rule_id']} {detection['rule_version']} included it. {detection['reason']}"
            if detection
            else "No detection in this run cites this record.",
            "Canonical events and bursts.",
            detection["title"] if detection else "None.",
            f"Detection {detection['detection_id']}, status {detection['status']}, basis "
            f"{detection['basis']}."
            if detection
            else "None.",
            detection["rule_id"] if detection else None,
            detection["rule_version"] if detection else None,
            detection["evidence_refs"] if detection else [],
            "observed"
            if detection and detection["basis"] == "observed"
            else "inferred"
            if detection
            else "not_applicable",
            ("failed" if "detection" in stage_failed else ok) if detection else "not_applicable",
        ),
        stage(
            "relationship",
            "Evidence relationship",
            (
                "A record states this relationship directly."
                if classification == "observed"
                else "A rule connected these records, and no single record states the connection."
                if relationship_status == RELATIONSHIP_INFERRED
                else "This is hypothetical: a network path seen in the log, not activity."
                if classification == "reachable"
                else "No relationship applies here."
            ),
            "Detection steps and the entities they name.",
            "Steps are joined only through a shared account, source or pivot.",
            f"{len(links)} inferred link(s) on the selected path." if links else "No link between steps.",
            element.get("rule") if element else (links[0]["rule"] if links else None),
            element.get("rule_version") if element else (links[0]["rule_version"] if links else None),
            element["evidence_refs"] if element else [r for e in links for r in e["evidence_refs"]],
            "observed"
            if classification == "observed"
            else "inferred"
            if relationship_status == RELATIONSHIP_INFERRED
            else "not_applicable",
            ("failed" if "graph" in stage_failed else ok) if incident else "not_applicable",
        ),
        stage(
            "hypothesis",
            "Hypothesis",
            f"HALT's leading explanation is: {selected['title']}. It ranks explanations. It does not prove "
            "one."
            if selected
            else "No hypothesis applies here.",
            "The connected steps.",
            "Candidate explanations are scored from the evidence. Scores rank them and are not "
            "probabilities.",
            f"Selected {selected['hypothesis_id']}, score {selected['score']}, margin "
            f"{hypotheses.get('uncertainty_margin')}."
            if selected
            else "None.",
            None,
            None,
            [],
            "inferred" if selected else "not_applicable",
            ok if selected else "not_applicable",
        ),
        stage(
            "statement",
            "Incident statement",
            (
                f"The incident states: {statement['text']}"
                if statement
                else "This incident's statements cite this record."
                if incident
                else "No incident statement uses this record."
            ),
            "The selected path and its citations.",
            "Each statement is written from a template and must cite evidence.",
            f"{incident['story'].get('checked_statements', 0)} statements checked, "
            f"{incident['story'].get('unsupported_claims', 0)} unsupported."
            if incident
            else "None.",
            None,
            None,
            statement.get("evidence_ids", []) if statement else [],
            (statement.get("kind", "observed") if statement else "inferred")
            if incident
            else "not_applicable",
            ("failed" if "statement" in stage_failed else ok) if incident else "not_applicable",
        ),
        stage(
            "proof",
            "Proof receipt",
            (
                f"Receipt {proof['receipt_id']} seals this incident. A seal shows the receipt has not "
                "changed. It does not show the conclusion is true."
                if proof
                else "No incident proof applies. The run's benchmark receipt covers its stored artifacts."
            ),
            "The graph, the cited evidence and the versions.",
            "SHA-256 over canonical JSON.",
            f"Graph hash {proof['graph_hash']}, seal {proof['seal']}"
            if proof
            else str(view.receipt.get("receipt_id", "None.")),
            proof.get("seal_algorithm") if proof else view.receipt.get("seal_algorithm"),
            proof.get("schema_version") if proof else view.receipt.get("schema_version"),
            [],
            "observed",
            "failed" if "proof" in stage_failed else ok,
        ),
    ]

    # Plain language first.
    opening = (
        "This record exists in the source: "
        f"{first.get('message') or first.get('logdesc') or first.get('action') or 'see its fields'}."
        if first and source_status == SOURCE_VERIFIED
        else "This record is in the stored events. The source file is not on this server to re-read."
        if first and source_status == SOURCE_UNAVAILABLE
        else ""
    )
    if failed:
        plain = f"This claim is not verified. The check that failed: {failed[0].label}. {failed[0].detail}"
    else:
        link = (
            "The connection to other records is inferred by a rule."
            if relationship_status == RELATIONSHIP_INFERRED
            else "A record states this relationship directly."
            if relationship_status == RELATIONSHIP_OBSERVED
            else ""
        )
        intent = (
            "An analyst has confirmed this incident. The sealed result stays as it was."
            if incident_status == ANALYST_CONFIRMED
            else "The incident is unconfirmed: this shows what the evidence holds, not malicious intent."
            if incident
            else "No incident uses this record."
        )
        plain = " ".join(p for p in (opening, link, intent) if p)
    statuses = [source_status]
    if relationship_status != NOT_APPLICABLE:
        statuses.append(relationship_status)
    if incident_status != NOT_APPLICABLE:
        statuses.append(incident_status)
    return ProvenanceChain(
        run=_trace_run(view),
        subject_kind=kind,
        subject_id=subject,
        subject_label=label,
        incident_id=incident["summary"]["incident_id"] if incident else None,
        original_conclusion=incident["summary"]["status"] if incident else None,
        plain=plain,
        statuses=statuses,
        source_status=source_status,
        relationship_status=relationship_status,
        incident_status=incident_status,
        failed_link=failed[0].label if failed else None,
        gate=checks,
        stages=stages,
        records=records,
        cited_records=len(refs),
        proof_receipt_id=proof.get("receipt_id"),
        reviews=review_rows,
    )


def build_summary(run_id: str, root: Path | None = None) -> ProvenanceSummary:
    """The gate over every incident's citations. A failed claim is counted as failed and never as verified."""
    view = load_run(run_id, root)
    artifacts = _artifact_hashes_ok(view)
    results: list[IncidentProvenance] = []
    con = _connection()
    try:
        for incident in view.incidents:
            refs = [e["evidence_id"] for e in incident["detail"].get("evidence", [])]
            located = {e["evidence_id"]: e for e in incident["detail"].get("evidence", [])}
            rows = _load_records(view, con, refs, located)
            checks, status = _gate(view, incident, refs, rows, None, None, artifacts)
            unsupported = [
                s["statement_id"]
                for s in incident["story"].get("statements", [])
                if not s["evidence_ids"] or not set(s["evidence_ids"]) <= set(located)
            ]
            failures = [c.label for c in checks if c.status == "failed"]
            if unsupported:
                failures.append(f"Statements without stored citations: {', '.join(unsupported)}")
                status = PROVENANCE_FAILED
            unreadable = status == SOURCE_UNAVAILABLE
            results.append(
                IncidentProvenance(
                    incident_id=incident["summary"]["incident_id"],
                    title=incident["summary"]["title"],
                    status=status,
                    cited_records=len(refs),
                    verified_records=len(rows) if status == SOURCE_VERIFIED else 0,
                    unavailable_records=len(rows) if unreadable else 0,
                    failed_links=failures,
                )
            )
    finally:
        con.close()
    verified = sum(r.verified_records for r in results)
    failed = [r for r in results if r.status == PROVENANCE_FAILED]
    return ProvenanceSummary(
        run_id=run_id,
        status=NOT_APPLICABLE
        if not results
        else PROVENANCE_FAILED
        if failed
        else SOURCE_UNAVAILABLE
        if any(r.status == SOURCE_UNAVAILABLE for r in results)
        else SOURCE_VERIFIED,
        incidents=results,
        verified_records=verified,
        cited_records=sum(r.cited_records for r in results),
        failed_incidents=len(failed),
        note=(
            "No incident exists in this run, so no incident claim needs tracing."
            if not results
            else "Source verified means each cited record resolves to its source line. "
            "It does not mean an incident is true: every incident stays unconfirmed until an analyst "
            "reviews it."
        ),
    )
