"""Live Intake: bring a new log to the existing pipeline from an allowlisted folder or a bounded upload.

Nothing here reads a path from a request: a file is named by its bare name inside `<root>/incoming`, and
anything that resolves elsewhere is refused. A file stays where it is. Starting registers one dataset bound to
the file's SHA-256, then hands over to the existing job system, so there is no second job system and results
stay isolated. Files are read in bounded blocks, never whole. Only formats the pipeline's parser reads are
accepted.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import shutil
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from halt.firex import ENGINE_VERSION, PARSER_VERSION, jobs
from halt.firex.contracts import (
    LiveFile,
    LiveFileList,
    LivePreflight,
    LiveProblem,
    LiveSample,
    UploadRequest,
    UploadState,
)
from halt.firex.jobs import RunError
from halt.firex.parser import event_ns, parse_text
from halt.firex.pipeline import load_rules, rules_hash, run_id_of
from halt.firex.registry import NAME_PATTERN, RegisteredDataset, data_root, datasets, runs_dir
from halt.firex.util import atomic_write_json, read_json

SAMPLE_BYTES = 256 * 1024
SYNC_HASH_BYTES = 64 * 1024 * 1024
HASH_BLOCK = 1 << 20
CHUNK_BYTES = 8 * 1024 * 1024
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
# 32.70 GB of FireX source produced 5.93 GB of output. A margin over that ratio decides "enough disk".
OUTPUT_RATIO = 0.35
FORTIGATE = "fortigate_kv"
ADAPTER = f"FortiGate key-value parser ({PARSER_VERSION})"
SUPPORT_NOTE = "This analysis reads FortiGate key-value logs. No adapter here reads this format."
PRIVACY = (
    "Logs can contain names, addresses and credentials in messages. This file stays on this server, "
    "and HALT stores parsed records from it. The language model is off unless an operator enables it."
)
FORMAT_LABEL = {
    FORTIGATE: "FortiGate key-value log",
    "csv": "CSV",
    "json": "JSON",
    "jsonl": "JSON Lines",
    "empty": "Empty file",
    "unknown": "Unknown format",
}
_registry_lock = threading.Lock()
_upload_lock = threading.Lock()
_hashes: dict[str, dict[str, Any]] = {}
_hash_lock = threading.Lock()


def incoming_dir(root: Path | None = None) -> Path:
    return (root or data_root()) / "incoming"


def _intake_dir(root: Path | None) -> Path:
    return runs_dir(root).parent / "firex-intake"


def _resolve(name: str, root: Path | None) -> Path:
    """The named file inside the incoming folder, or a refusal. A request can name nothing else."""
    if not NAME_PATTERN.fullmatch(name):
        raise RunError(422, "invalid_name", "name a file in the incoming folder, with no path")
    folder = incoming_dir(root).resolve()
    path = folder / name
    if path.is_symlink() or path.resolve().parent != folder:
        raise RunError(422, "invalid_name", "this file is outside the incoming folder")
    if not path.is_file():
        raise RunError(404, "not_found", f"{name} is not in the incoming folder")
    return path


def detect_format(sample: bytes) -> tuple[str, int, int]:
    """(format, sample lines parsed, sample lines read), from the first block of a file."""
    if not sample.strip():
        return "empty", 0, 0
    lines = [ln for ln in sample.split(b"\n") if ln.strip()]
    # The last line of a partial read may be cut short.
    if len(sample) >= SAMPLE_BYTES and len(lines) > 1:
        lines = lines[:-1]
    parsed = sum(1 for ln in lines if parse_text(ln.decode("utf-8", errors="surrogateescape").strip())[0])
    if parsed and parsed / len(lines) >= 0.5:
        return FORTIGATE, parsed, len(lines)
    if b"\x00" in sample[:4096]:
        return "unknown", parsed, len(lines)
    text = sample.decode("utf-8", errors="replace").strip()
    if text[:1] in "{[":
        try:
            json.loads(text)
            return "json", parsed, len(lines)
        except ValueError:
            pass
        try:
            for line in lines[:50]:
                json.loads(line)
            return "jsonl", parsed, len(lines)
        except ValueError:
            return ("json" if text[:1] == "[" else "unknown"), parsed, len(lines)
    try:
        first = text.splitlines()[0]
        if "," in first or "\t" in first or ";" in first:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
            rows = list(csv.reader(io.StringIO(text[:4096]), dialect))
            if len(rows) >= 2 and len({len(r) for r in rows}) == 1 and len(rows[0]) >= 2:
                return "csv", parsed, len(lines)
    except (csv.Error, IndexError):
        pass
    return "unknown", parsed, len(lines)


def _read_sample(path: Path) -> bytes:
    with open(path, "rb") as f:
        return f.read(SAMPLE_BYTES)


def _utc(stamp: float) -> str:
    return datetime.fromtimestamp(stamp, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def list_files(root: Path | None = None) -> LiveFileList:
    folder = incoming_dir(root)
    folder.mkdir(parents=True, exist_ok=True)
    items = []
    try:
        entries = sorted(folder.iterdir(), key=lambda p: p.name.lower())
    except OSError as exc:
        raise RunError(403, "permission_denied", "HALT cannot read the incoming folder") from exc
    for path in entries:
        if path.is_symlink() or not path.is_file():
            continue
        try:
            stat = path.stat()
            kind, _, _ = detect_format(_read_sample(path))
        except OSError:
            items.append(
                LiveFile(
                    name=path.name,
                    size_bytes=0,
                    modified_utc="",
                    detected_format="unknown",
                    format_label="Could not be read",
                    selectable=False,
                    problem="HALT does not have permission to read this file.",
                )
            )
            continue
        problem = None
        if not NAME_PATTERN.fullmatch(path.name):
            problem = "Rename this file: use letters, numbers, dots, dashes or underscores, with no spaces."
        elif kind == "empty":
            problem = "This file is empty."
        elif kind != FORTIGATE:
            problem = SUPPORT_NOTE
        items.append(
            LiveFile(
                name=path.name,
                size_bytes=stat.st_size,
                modified_utc=_utc(stat.st_mtime),
                detected_format=kind,
                format_label=FORMAT_LABEL[kind],
                selectable=problem is None,
                problem=problem,
            )
        )
    return LiveFileList(
        incoming_path=str(folder), items=items, max_upload_bytes=MAX_UPLOAD_BYTES, chunk_bytes=CHUNK_BYTES
    )


def _hash_key(path: Path) -> str:
    stat = path.stat()
    return f"{path.name}-{stat.st_size}-{stat.st_mtime_ns}"


def _hash_worker(path: Path, key: str, cache: Path) -> None:
    digest = hashlib.sha256()
    entry = _hashes[key]
    try:
        with open(path, "rb") as f:
            while block := f.read(HASH_BLOCK):
                digest.update(block)
                entry["bytes"] += len(block)
        entry["sha256"] = digest.hexdigest()
        atomic_write_json(cache, {"sha256": entry["sha256"]})
    except OSError:
        entry["error"] = "The file could not be read while hashing it."
    finally:
        entry["running"] = False


def _source_hash(path: Path, root: Path | None) -> tuple[str | None, int, str | None]:
    """(sha256 when known, bytes hashed so far, error). A large file is hashed once, in the background. After
    an API restart its progress is gone, so hashing simply starts again."""
    key = _hash_key(path)
    cache = _intake_dir(root) / f"{hashlib.sha256(key.encode()).hexdigest()[:24]}.json"
    if cache.is_file():
        return str(read_json(cache)["sha256"]), path.stat().st_size, None
    with _hash_lock:
        entry = _hashes.get(key)
        if entry is None or (not entry["running"] and not entry.get("sha256")):
            entry = {"running": True, "bytes": 0, "sha256": None, "error": None}
            _hashes[key] = entry
            cache.parent.mkdir(parents=True, exist_ok=True)
            if path.stat().st_size <= SYNC_HASH_BYTES:
                _hash_worker(path, key, cache)
            else:
                threading.Thread(target=_hash_worker, args=(path, key, cache), daemon=True).start()
    return entry["sha256"], entry["bytes"], entry["error"]


def _dataset_id(sha256: str) -> str:
    return f"live-{sha256[:16]}"


def _existing_sources(sha256: str, root: Path | None) -> list[dict[str, str]]:
    """Stored runs of the same bytes, by the hash each run recorded."""
    found = []
    for state in jobs.list_runs(root):
        plan = runs_dir(root) / state["run_id"] / "plan.json"
        if not plan.is_file():
            continue
        if read_json(plan).get("source_sha256") == sha256 and not state.get("max_bytes"):
            found.append(
                {"run_id": state["run_id"], "dataset_id": state["dataset_id"], "status": state["status"]}
            )
    return found


def _time_note(fields: dict[str, str] | None) -> str:
    if not fields:
        return "No sample record had a readable time."
    stamp = datetime.fromtimestamp(event_ns(fields["eventtime"]) / 1e9, UTC)
    local = f"{fields['date']} {fields['time']}"
    zone = fields.get("tz")
    if (
        stamp.strftime("%Y-%m-%d %H:%M:%S") == local
        and zone
        and zone not in ("+0000", "-0000", "Z", "UTC", "+00:00")
    ):
        return (
            f"eventtime is read as UTC. The date and time fields equal it, although tz says {zone}. "
            "HALT keeps the original fields and records the conflict."
        )
    return f"eventtime is read as UTC ({stamp.strftime('%Y-%m-%dT%H:%M:%SZ')}). The original fields are kept."


def preflight(name: str, root: Path | None = None) -> LivePreflight:
    path = _resolve(name, root)
    stat = path.stat()
    sample = _read_sample(path)
    kind, parsed, read = detect_format(sample)
    problems: list[LiveProblem] = []
    warnings: list[str] = []
    if kind == "empty":
        problems.append(
            LiveProblem(code="empty_file", message="This file is empty, so there is nothing to analyse.")
        )
    elif kind != FORTIGATE:
        problems.append(
            LiveProblem(code="unsupported_format", message=f"{FORMAT_LABEL[kind]}. {SUPPORT_NOTE}")
        )
    records = []
    first_fields: dict[str, str] | None = None
    for line in sample.split(b"\n"):
        fields, _ = parse_text(line.decode("utf-8", errors="surrogateescape").strip())
        if not fields:
            continue
        first_fields = first_fields or fields
        records.append(
            LiveSample(
                time=f"{fields['date']} {fields['time']}",
                kind=fields.get("type"),
                user=fields.get("user"),
                source=fields.get("srcip"),
                destination=fields.get("dstip"),
                action=fields.get("action"),
                message=(fields.get("msg") or fields.get("logdesc") or "")[:160] or None,
            )
        )
        if len(records) == 5:
            break
    sha256, hashed, hash_error = _source_hash(path, root)
    if hash_error:
        problems.append(LiveProblem(code="read_failed", message=hash_error))
    free = shutil.disk_usage(incoming_dir(root).resolve()).free
    if free < stat.st_size * OUTPUT_RATIO:
        problems.append(
            LiveProblem(
                code="insufficient_disk", message="There may not be enough free disk space for the results."
            )
        )
    duplicates = _existing_sources(sha256, root) if sha256 else []
    if duplicates:
        warnings.append("These exact bytes were already analysed. You can open that result instead.")
    run_id = None
    if sha256 and kind == FORTIGATE:
        dataset = RegisteredDataset(_dataset_id(sha256), name, name, sha256)
        run_id = run_id_of(dataset, stat.st_size, None, rules_hash(load_rules()))
    confidence = "High" if read and parsed / read >= 0.95 else "Medium" if parsed else "None"
    return LivePreflight(
        name=name,
        size_bytes=stat.st_size,
        modified_utc=_utc(stat.st_mtime),
        sha256=sha256,
        hashed_bytes=hashed,
        detected_format=kind,
        format_label=FORMAT_LABEL[kind],
        adapter=ADAPTER if kind == FORTIGATE else None,
        parser_version=PARSER_VERSION,
        engine_version=ENGINE_VERSION,
        parsing_confidence=confidence,
        parsing_detail=f"{parsed} of {read} sample lines parsed." if read else "No lines to sample.",
        time_interpretation=_time_note(first_fields),
        sample_records=records,
        expected_destination=f"results/firex-runs/{run_id}" if run_id else None,
        privacy_warning=PRIVACY,
        duplicates=duplicates,
        problems=problems,
        warnings=warnings,
        can_start=bool(sha256) and not problems,
    )


def _register(dataset_id: str, name: str, sha256: str, root: Path | None) -> None:
    path = (root or data_root()) / "registry.json"
    with _registry_lock:
        registry = read_json(path) if path.is_file() else {}
        registry[dataset_id] = {"filename": name, "title": name, "sha256": sha256, "folder": "incoming"}
        atomic_write_json(path, registry)


def start(name: str, *, confirm_duplicate: bool = False, root: Path | None = None) -> dict[str, Any]:
    check = preflight(name, root)
    if check.problems:
        first = check.problems[0]
        status = (
            415 if first.code == "unsupported_format" else 507 if first.code == "insufficient_disk" else 422
        )
        raise RunError(status, first.code, first.message)
    if not check.sha256:
        raise RunError(409, "hash_pending", "the source hash is still being calculated")
    dataset_id = _dataset_id(check.sha256)
    others = [d for d in check.duplicates if d["dataset_id"] != dataset_id]
    if others and not confirm_duplicate:
        raise RunError(
            409, "duplicate_source", f"these bytes were already analysed as {others[0]['dataset_id']}"
        )
    # The same bytes under another name stay one dataset, bound to the first file while that file exists.
    existing = datasets(root).get(dataset_id)
    if existing is None or not (incoming_dir(root) / existing.filename).is_file():
        _register(dataset_id, name, check.sha256, root)
    return jobs.start_run(dataset_id, None, root)


# ---- uploads: chunks are written straight to a part file, so neither the browser nor the API holds the file.


def _upload_dir(upload_id: str, root: Path | None) -> Path:
    if not re.fullmatch(r"[0-9a-f]{32}", upload_id):
        raise RunError(404, "not_found", "this upload was not found")
    folder = incoming_dir(root) / ".uploads" / upload_id
    if not folder.is_dir():
        raise RunError(404, "not_found", "this upload was not found")
    return folder


def _upload_state(upload_id: str, meta: dict[str, Any]) -> UploadState:
    total = max(1, (meta["size_bytes"] + CHUNK_BYTES - 1) // CHUNK_BYTES)
    received = sorted(meta["received"])
    return UploadState(
        upload_id=upload_id,
        filename=meta["filename"],
        size_bytes=meta["size_bytes"],
        chunk_bytes=CHUNK_BYTES,
        total_chunks=total,
        received_chunks=received,
        received_bytes=min(meta["size_bytes"], len(received) * CHUNK_BYTES),
        complete=len(received) == total,
    )


def create_upload(request: UploadRequest, root: Path | None = None) -> UploadState:
    if not NAME_PATTERN.fullmatch(request.filename):
        raise RunError(
            422, "invalid_name", "use letters, numbers, dots, dashes or underscores in the file name"
        )
    if request.size_bytes <= 0:
        raise RunError(422, "empty_file", "this file is empty, so there is nothing to analyse")
    if request.size_bytes > MAX_UPLOAD_BYTES:
        raise RunError(
            413,
            "too_large",
            "this file is too large to upload. Place it in the incoming folder on the server.",
        )
    free = shutil.disk_usage(_ensure(incoming_dir(root))).free
    if free < request.size_bytes * (1 + OUTPUT_RATIO):
        raise RunError(507, "insufficient_disk", "there is not enough free disk space for this upload")
    upload_id = uuid.uuid4().hex
    folder = incoming_dir(root) / ".uploads" / upload_id
    folder.mkdir(parents=True)
    meta = {"filename": request.filename, "size_bytes": request.size_bytes, "received": []}
    atomic_write_json(folder / "upload.json", meta)
    with open(folder / "data.part", "wb") as f:
        f.truncate(request.size_bytes)
    return _upload_state(upload_id, meta)


def _ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def upload_state(upload_id: str, root: Path | None = None) -> UploadState:
    return _upload_state(upload_id, read_json(_upload_dir(upload_id, root) / "upload.json"))


def write_chunk(
    upload_id: str, index: int, data: bytes, checksum: str | None, root: Path | None = None
) -> UploadState:
    folder = _upload_dir(upload_id, root)
    with _upload_lock:
        meta = read_json(folder / "upload.json")
        state = _upload_state(upload_id, meta)
        if not 0 <= index < state.total_chunks:
            raise RunError(422, "invalid_chunk", "this chunk is outside the file")
        expected = min(CHUNK_BYTES, meta["size_bytes"] - index * CHUNK_BYTES)
        if len(data) != expected:
            raise RunError(422, "invalid_chunk", f"this chunk should be {expected} bytes")
        if checksum and hashlib.sha256(data).hexdigest() != checksum.lower():
            raise RunError(422, "chunk_checksum", "this chunk was damaged in transit. Send it again.")
        if index == 0:
            kind, _, _ = detect_format(data[:SAMPLE_BYTES])
            if kind != FORTIGATE:
                shutil.rmtree(folder, ignore_errors=True)
                raise RunError(415, "unsupported_format", f"{FORMAT_LABEL[kind]}. {SUPPORT_NOTE}")
        with open(folder / "data.part", "r+b") as f:
            f.seek(index * CHUNK_BYTES)
            f.write(data)
        if index not in meta["received"]:
            meta["received"].append(index)
        atomic_write_json(folder / "upload.json", meta)
    return _upload_state(upload_id, meta)


def complete_upload(upload_id: str, root: Path | None = None) -> LiveFile:
    folder = _upload_dir(upload_id, root)
    meta = read_json(folder / "upload.json")
    if not _upload_state(upload_id, meta).complete:
        raise RunError(409, "upload_incomplete", "some chunks have not arrived yet")
    target = incoming_dir(root) / meta["filename"]
    if target.exists():
        stem, dot, suffix = meta["filename"].rpartition(".")
        base = stem if dot else suffix
        target = incoming_dir(root) / f"{base}-{upload_id[:8]}{dot}{suffix if dot else ''}"
    (folder / "data.part").replace(target)
    shutil.rmtree(folder, ignore_errors=True)
    return next(f for f in list_files(root).items if f.name == target.name)


def cancel_upload(upload_id: str, root: Path | None = None) -> None:
    shutil.rmtree(_upload_dir(upload_id, root), ignore_errors=True)
