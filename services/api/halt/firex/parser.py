"""FortiGate key=value parser and one-chunk worker. A chunk is processed from its bytes alone, so a result
does
not depend on worker count, order or resume. No raw record is ever logged; only quarantine samples keep text,
and
those are escaped, truncated and credential-masked."""

from __future__ import annotations

import calendar
import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq

from halt.firex import PARSER_VERSION
from halt.firex.util import atomic_write_json, peak_memory_mb

TOKEN = re.compile(r'([A-Za-z_][\w.\-]*)=("[^"\\]*(?:\\.[^"\\]*)*"|[^\s"]*)')
DATE_SHAPE = re.compile(r"\d{4}-\d{2}-\d{2}$")
TIME_SHAPE = re.compile(r"\d{2}:\d{2}:\d{2}$")
SECRET = re.compile(
    r"(?i)\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)"
    r"(\s*[=:]\s*)(\"[^\"]*\"|\S+)"
    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b"
)
CORE_FIELDS = ("date", "time", "eventtime", "tz", "devname", "logid", "type", "subtype", "level")
MAX_LINE = 1 << 20
SAMPLE_CHARS = 256
SEGMENT_SAMPLES = 3
MAX_SEGMENTS_PER_CHUNK = 2000
EVENT_NS_SCALE = {19: 1, 16: 1_000, 13: 1_000_000, 10: 1_000_000_000}

# column, source key
STRING_COLUMNS: tuple[tuple[str, str], ...] = (
    ("date", "date"),
    ("time", "time"),
    ("tz", "tz"),
    ("devname", "devname"),
    ("devid", "devid"),
    ("vd", "vd"),
    ("event_type", "type"),
    ("subtype", "subtype"),
    ("logid", "logid"),
    ("level", "level"),
    ("action", "action"),
    ("status", "status"),
    ("reason", "reason"),
    ("user", "user"),
    ("ui", "ui"),
    ("method", "method"),
    ("src_ip", "srcip"),
    ("dst_ip", "dstip"),
    ("src_intf", "srcintf"),
    ("dst_intf", "dstintf"),
    ("src_role", "srcintfrole"),
    ("dst_role", "dstintfrole"),
    ("src_country", "srccountry"),
    ("dst_country", "dstcountry"),
    ("session_id", "sessionid"),
    ("proto", "proto"),
    ("service", "service"),
    ("policy_id", "policyid"),
    ("hostname", "hostname"),
    ("url", "url"),
    ("category", "catdesc"),
    ("app", "app"),
    ("app_category", "appcat"),
    ("app_risk", "apprisk"),
    ("attack", "attack"),
    ("attack_id", "attackid"),
    ("severity", "severity"),
    ("crscore", "crscore"),
    ("virus", "virus"),
    ("message", "msg"),
    ("logdesc", "logdesc"),
)
INT32_COLUMNS: tuple[tuple[str, str], ...] = (("src_port", "srcport"), ("dst_port", "dstport"))
INT64_COLUMNS: tuple[tuple[str, str], ...] = (
    ("sent_bytes", "sentbyte"),
    ("rcvd_bytes", "rcvdbyte"),
    ("sent_pkts", "sentpkt"),
    ("rcvd_pkts", "rcvdpkt"),
    ("duration_s", "duration"),
)
KNOWN_KEYS = {"eventtime"} | {k for _, k in (*STRING_COLUMNS, *INT32_COLUMNS, *INT64_COLUMNS)}

SCHEMA = pa.schema(
    [
        ("evidence_id", pa.string()),
        ("event_ns", pa.int64()),
        ("time_delta_s", pa.int32()),
        ("byte_offset", pa.int64()),
        ("chunk_id", pa.int32()),
        ("line_in_chunk", pa.int32()),
        ("raw_sha256", pa.string()),
        ("canonical_sha256", pa.string()),
        *[(c, pa.string()) for c, _ in STRING_COLUMNS],
        *[(c, pa.int32()) for c, _ in INT32_COLUMNS],
        *[(c, pa.int64()) for c, _ in INT64_COLUMNS],
        ("extra_json", pa.string()),
    ]
)


def parse_text(text: str) -> tuple[dict[str, str] | None, str | None]:
    """(fields, None) for a valid record, (None, reason) otherwise. `text` has no surrounding whitespace."""
    if not text.startswith("date="):
        return None, "embedded_log_token" if "date=20" in text else "not_log_prefix"
    tokens = TOKEN.findall(text)
    covered = sum(len(k) + len(v) for k, v in tokens) + 2 * len(tokens) - 1
    if covered != len(text):
        return None, "unparsed_residue"
    fields = {k: v[1:-1] if v[:1] == '"' else v for k, v in tokens}
    if len(fields) != len(tokens):
        return None, "duplicate_key"
    for name in CORE_FIELDS:
        if not fields.get(name):
            return None, "missing_core_field"
    stamp = fields["eventtime"]
    if not (
        stamp.isdigit()
        and len(stamp) in EVENT_NS_SCALE
        and DATE_SHAPE.match(fields["date"])
        and TIME_SHAPE.match(fields["time"])
    ):
        return None, "invalid_timestamp"
    return fields, None


def event_ns(stamp: str) -> int:
    return int(stamp) * EVENT_NS_SCALE[len(stamp)]


def canonical_hash(fields: dict[str, str]) -> str:
    joined = "\x1f".join(f"{k}\x1e{fields[k]}" for k in sorted(fields))
    return hashlib.sha256(joined.encode("utf-8", "surrogateescape")).hexdigest()[:32]


def evidence_id(source_sha256: str, offset: int, canonical: str) -> str:
    return "ev-" + hashlib.sha256(f"{source_sha256.lower()}|{offset}|{canonical}".encode()).hexdigest()[:24]


def safe_sample(text: str) -> str:
    """Printable ASCII, single line, truncated, credentials masked."""
    ascii_text = text[:SAMPLE_CHARS].encode("ascii", "backslashreplace").decode("ascii")
    escaped = "".join(c if 32 <= ord(c) < 127 else f"\\x{ord(c):02x}" for c in ascii_text)
    return SECRET.sub("<REDACTED_CREDENTIAL>", escaped)


def _to_int(value: str | None) -> int | None:
    return int(value) if value and value.isdigit() and len(value) < 19 else None


@dataclass(frozen=True)
class ChunkTask:
    chunk_id: int
    path: str
    start: int
    end: int
    source_sha256: str
    out_dir: str


class _Rows:
    def __init__(self) -> None:
        self.columns: dict[str, list[Any]] = {f.name: [] for f in SCHEMA}

    def add(
        self, fields: dict[str, str], chunk: ChunkTask, offset: int, index: int, raw: bytes, delta: int | None
    ) -> None:
        canonical = canonical_hash(fields)
        cols = self.columns
        cols["evidence_id"].append(evidence_id(chunk.source_sha256, offset, canonical))
        cols["event_ns"].append(event_ns(fields["eventtime"]))
        cols["time_delta_s"].append(delta)
        cols["byte_offset"].append(offset)
        cols["chunk_id"].append(chunk.chunk_id)
        cols["line_in_chunk"].append(index)
        cols["raw_sha256"].append(hashlib.sha256(raw).hexdigest()[:32])
        cols["canonical_sha256"].append(canonical)
        get = fields.get
        for column, key in STRING_COLUMNS:
            cols[column].append(get(key))
        for column, key in INT32_COLUMNS:
            value = _to_int(get(key))
            cols[column].append(value if value is None or value < 2**31 else None)
        for column, key in INT64_COLUMNS:
            cols[column].append(_to_int(get(key)))
        unknown = fields.keys() - KNOWN_KEYS
        cols["extra_json"].append(json.dumps({k: fields[k] for k in sorted(unknown)}) if unknown else None)


class _Segments:
    """Coalesces contiguous rejected and blank lines in one chunk."""

    def __init__(self, source_sha256: str) -> None:
        self.source_sha256 = source_sha256
        self.items: list[dict[str, Any]] = []
        self.current: dict[str, Any] | None = None
        self.truncated = 0

    def reject(self, offset: int, length: int, index: int, reason: str, text: str) -> None:
        seg = self.current
        if seg is None:
            seg = self.current = {
                "start_offset": offset,
                "end_offset": offset,
                "start_index": index,
                "end_index": index,
                "rejected": 0,
                "blank": 0,
                "reasons": {},
                "samples": [],
            }
        seg["end_offset"] = offset + length
        seg["end_index"] = index
        seg["rejected"] += 1
        seg["reasons"][reason] = seg["reasons"].get(reason, 0) + 1
        if len(seg["samples"]) < SEGMENT_SAMPLES:
            seg["samples"].append(
                {"offset": offset, "index": index, "length": length, "text": safe_sample(text)}
            )

    def blank(self, offset: int, length: int, index: int) -> None:
        if self.current is not None:
            self.current["end_offset"] = offset + length
            self.current["end_index"] = index
            self.current["blank"] += 1

    def close(self) -> None:
        if self.current is not None:
            if len(self.items) < MAX_SEGMENTS_PER_CHUNK:
                self.items.append(self.current)
            else:
                self.truncated += 1
            self.current = None


def _time_delta(fields: dict[str, str], ns: int, days: dict[str, int]) -> int | None:
    date = fields["date"]
    midnight = days.get(date)
    if midnight is None:
        try:
            year, month, day = (int(p) for p in date.split("-"))
            midnight = days[date] = calendar.timegm((year, month, day, 0, 0, 0))
        except ValueError:
            return None
    clock = fields["time"]
    delta = ns // 1_000_000_000 - (midnight + int(clock[:2]) * 3600 + int(clock[3:5]) * 60 + int(clock[6:8]))
    return delta if delta and abs(delta) < 2**31 else None


def process_chunk(task: ChunkTask) -> dict[str, Any]:
    """Parse one byte range and write its part and manifest atomically. Returns the manifest."""
    out = Path(task.out_dir)
    rows = _Rows()
    segments = _Segments(task.source_sha256)
    days: dict[str, int] = {}
    tz_counts: dict[str, int] = {}
    reasons: dict[str, int] = {}
    valid = rejected = blank = lines = 0
    valid_bytes = rejected_bytes = blank_bytes = 0
    conflicts = 0
    low: int | None = None
    high: int | None = None
    offset = task.start
    with open(task.path, "rb", buffering=1 << 20) as f:
        f.seek(task.start)
        while offset < task.end:
            raw = f.readline(MAX_LINE)
            if not raw:
                break
            length = len(raw)
            if length == MAX_LINE and raw[-1:] != b"\n":
                # An overlong line is non-log data: only its start is kept in memory.
                while True:
                    more = f.readline(MAX_LINE)
                    length += len(more)
                    if not more or more[-1:] == b"\n":
                        break
            index = lines
            lines += 1
            text = raw.decode("utf-8", "surrogateescape")
            if index == 0 and task.start == 0:
                text = text.lstrip("\ufeff")
            text = text.strip()
            if not text:
                blank += 1
                blank_bytes += length
                segments.blank(offset, length, index)
                offset += length
                continue
            fields, reason = parse_text(text)
            if fields is None:
                rejected += 1
                rejected_bytes += length
                key = reason or "unknown"
                reasons[key] = reasons.get(key, 0) + 1
                segments.reject(offset, length, index, key, text)
                offset += length
                continue
            segments.close()
            valid += 1
            valid_bytes += length
            ns = event_ns(fields["eventtime"])
            low = ns if low is None or ns < low else low
            high = ns if high is None or ns > high else high
            tz = fields["tz"]
            tz_counts[tz] = tz_counts.get(tz, 0) + 1
            delta = _time_delta(fields, ns, days)
            if delta is not None:
                conflicts += 1
            rows.add(fields, task, offset, index, raw.rstrip(b"\r\n"), delta)
            offset += length
    segments.close()

    part = out / "parts" / f"part-{task.chunk_id:06d}.parquet"
    part.parent.mkdir(parents=True, exist_ok=True)
    temp = part.with_suffix(f".{os.getpid()}.tmp")
    table = pa.table({f.name: pa.array(rows.columns[f.name], type=f.type) for f in SCHEMA}, schema=SCHEMA)
    pq.write_table(table, temp, compression="zstd", row_group_size=100_000)
    os.replace(temp, part)
    manifest: dict[str, Any] = {
        "chunk_id": task.chunk_id,
        "start": task.start,
        "end": offset,
        "lines": lines,
        "valid": valid,
        "rejected": rejected,
        "blank": blank,
        "valid_bytes": valid_bytes,
        "rejected_bytes": rejected_bytes,
        "blank_bytes": blank_bytes,
        "reasons": reasons,
        "tz_counts": tz_counts,
        "time_conflicts": conflicts,
        "min_ns": low,
        "max_ns": high,
        "segments": segments.items,
        "segments_truncated": segments.truncated,
        "part_bytes": part.stat().st_size,
        "worker_peak_mb": peak_memory_mb(),
        "parser_version": PARSER_VERSION,
    }
    atomic_write_json(out / "chunks" / f"chunk-{task.chunk_id:06d}.json", manifest)
    return manifest
