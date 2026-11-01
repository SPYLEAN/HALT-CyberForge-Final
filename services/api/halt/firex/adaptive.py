"""Adaptive Intake: a read-only structural profile of a file HALT's parser may not read.

From the Adaptive Intake Lab. It samples bounded regions, then proposes how fields could map. It reads no
whole file, writes nothing and feeds nothing into the pipeline: nothing here creates evidence, an incident or
a run. A confident mapping is a proposal for a person to review, not an analysis.
"""

from __future__ import annotations

import csv
import hashlib
import io
import ipaddress
import json
import re
import shlex
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

MAX_SAMPLE_LINE_BYTES = 1_048_576
SUPPORTED_FORMATS = {"jsonl", "csv", "tsv", "key_value", "syslog_key_value"}


CANONICAL_ALIASES: dict[str, tuple[str, ...]] = {
    "event.timestamp": (
        "timestamp",
        "time",
        "datetime",
        "eventtime",
        "event_time",
        "created_at",
        "occurred_at",
        "date_time",
    ),
    "event.id": ("event_id", "eventid", "id", "record_id", "recordid", "uuid"),
    "source.ip": (
        "source_ip",
        "src_ip",
        "srcip",
        "client_ip",
        "remote_ip",
        "origin_ip",
        "ip_address",
    ),
    "destination.ip": (
        "destination_ip",
        "dest_ip",
        "dst_ip",
        "dstip",
        "server_ip",
        "target_ip",
    ),
    "actor.user": (
        "user",
        "username",
        "user_name",
        "account",
        "account_name",
        "principal",
        "actor",
        "subject_user",
    ),
    "host.name": (
        "host",
        "hostname",
        "device",
        "device_name",
        "computer",
        "endpoint",
        "machine",
    ),
    "activity.action": (
        "action",
        "operation",
        "activity",
        "event_action",
        "command",
        "verb",
    ),
    "activity.outcome": (
        "outcome",
        "result",
        "status",
        "success",
        "decision",
        "disposition",
    ),
    "service.name": (
        "service",
        "service_name",
        "application",
        "app",
        "protocol",
        "process",
    ),
    "resource.name": (
        "resource",
        "resource_name",
        "object",
        "target",
        "asset",
        "file",
        "path",
    ),
    "event.message": (
        "message",
        "msg",
        "description",
        "detail",
        "details",
        "log",
        "raw_message",
    ),
}


@dataclass
class SampleOrigin:
    region: str
    byte_offset: int
    line: str


@dataclass
class FormatDetection:
    format: str
    confidence: float
    delimiter: str | None = None
    reasons: list[str] = field(default_factory=list)


@dataclass
class FieldProfile:
    name: str
    presence: int
    total_records: int
    type_counts: dict[str, int]
    examples: list[str]

    @property
    def presence_ratio(self) -> float:
        return self.presence / self.total_records if self.total_records else 0.0


@dataclass
class MappingProposal:
    source_field: str
    canonical_field: str
    confidence: float
    reasons: list[str]
    requires_confirmation: bool


def _normalise_name(value: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def _decode(raw: bytes) -> str:
    return raw.decode("utf-8-sig", errors="replace").rstrip("\r\n")


def _read_region(path: Path, offset: int, count: int, label: str) -> list[SampleOrigin]:
    rows: list[SampleOrigin] = []
    with path.open("rb", buffering=8 * 1024 * 1024) as source:
        source.seek(max(0, offset))
        if offset > 0:
            source.readline(MAX_SAMPLE_LINE_BYTES)
        for _ in range(count):
            position = source.tell()
            raw = source.readline(MAX_SAMPLE_LINE_BYTES)
            if not raw:
                break
            if len(raw) >= MAX_SAMPLE_LINE_BYTES and not raw.endswith((b"\n", b"\r")):
                continue
            line = _decode(raw)
            if line.strip():
                rows.append(SampleOrigin(label, position, line))
    return rows


def stratified_sample(path: Path, lines_per_region: int = 80) -> list[SampleOrigin]:
    size = path.stat().st_size
    if size == 0:
        return []
    offsets = [
        (0, "start"),
        (size // 4, "quarter"),
        (size // 2, "middle"),
        ((size * 3) // 4, "three_quarters"),
        (max(0, size - 8 * 1024 * 1024), "end"),
    ]
    seen: set[tuple[int, str]] = set()
    samples: list[SampleOrigin] = []
    for offset, label in offsets:
        for row in _read_region(path, offset, lines_per_region, label):
            key = (row.byte_offset, row.line)
            if key not in seen:
                samples.append(row)
                seen.add(key)
    return samples


def _json_object_ratio(lines: list[str]) -> tuple[float, list[dict[str, Any]]]:
    parsed: list[dict[str, Any]] = []
    attempted = 0
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        attempted += 1
        try:
            value = json.loads(stripped)
        except (ValueError, RecursionError):
            continue
        if isinstance(value, dict):
            parsed.append(value)
    return (len(parsed) / attempted if attempted else 0.0), parsed


def _kv_record(line: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    try:
        tokens = shlex.split(line, posix=True)
    except ValueError:
        tokens = line.split()
    for token in tokens:
        if "=" not in token:
            continue
        key, value = token.split("=", 1)
        key = key.strip()
        if key:
            result[key] = value.strip('"')
    return result


def detect_format(samples: list[SampleOrigin]) -> FormatDetection:
    lines = [sample.line for sample in samples[:400] if sample.line.strip()]
    if not lines:
        return FormatDetection("unsupported", 0.0, reasons=["No non-blank sample lines"])

    json_ratio, _ = _json_object_ratio(lines)
    if json_ratio >= 0.8:
        return FormatDetection(
            "jsonl",
            round(json_ratio, 3),
            reasons=[f"{json_ratio:.0%} of sampled lines are JSON objects"],
        )

    kv_records = [_kv_record(line) for line in lines]
    kv_ratio = sum(len(record) >= 3 for record in kv_records) / len(lines)
    syslog_prefix_ratio = sum(
        bool(re.match(r"^(?:<\d+>)|(?:[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})", line)) for line in lines
    ) / len(lines)
    if kv_ratio >= 0.65:
        detected = "syslog_key_value" if syslog_prefix_ratio >= 0.5 else "key_value"
        return FormatDetection(
            detected,
            round(min(0.99, kv_ratio), 3),
            reasons=[
                f"{kv_ratio:.0%} of sampled lines contain at least three key-value pairs",
                f"{syslog_prefix_ratio:.0%} have a syslog prefix",
            ],
        )

    head_lines = [sample.line for sample in samples if sample.region == "start"][:40]
    text = "\n".join(head_lines)
    for delimiter, name in ((",", "csv"), ("\t", "tsv")):
        try:
            reader = csv.reader(io.StringIO(text), delimiter=delimiter)
            rows = [row for row in reader if row]
        except csv.Error:
            continue
        if len(rows) >= 3:
            widths = Counter(len(row) for row in rows)
            width, count = widths.most_common(1)[0]
            consistency = count / len(rows)
            if width >= 2 and consistency >= 0.8:
                return FormatDetection(
                    name,
                    round(consistency, 3),
                    delimiter=delimiter,
                    reasons=[f"{consistency:.0%} of sampled rows have {width} columns"],
                )

    return FormatDetection(
        "unsupported",
        round(max(json_ratio, kv_ratio), 3),
        reasons=["Sample does not match a supported structured format"],
    )


def _flatten(value: Any, prefix: str = "") -> dict[str, Any]:
    flattened: dict[str, Any] = {}
    if isinstance(value, dict):
        for key, item in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            if isinstance(item, dict):
                flattened.update(_flatten(item, path))
            else:
                flattened[path] = item
    return flattened


def parse_sample_records(samples: list[SampleOrigin], detection: FormatDetection) -> list[dict[str, Any]]:
    lines = [sample.line for sample in samples if sample.line.strip()]
    if detection.format == "jsonl":
        records: list[dict[str, Any]] = []
        for line in lines:
            try:
                value = json.loads(line)
                if isinstance(value, dict):
                    records.append(_flatten(value))
            except (ValueError, RecursionError):
                continue
        return records

    if detection.format in {"key_value", "syslog_key_value"}:
        return [record for line in lines if len(record := _kv_record(line)) >= 1]

    if detection.format in {"csv", "tsv"}:
        start_lines = [sample.line for sample in samples if sample.region == "start"]
        if not start_lines:
            return []
        delimiter = detection.delimiter or ("\t" if detection.format == "tsv" else ",")
        try:
            header = next(csv.reader([start_lines[0]], delimiter=delimiter), [])
        except csv.Error:
            return []
        if not header:
            return []
        records = []
        for line in lines[1:]:
            try:
                row = next(csv.reader([line], delimiter=delimiter), [])
            except csv.Error:
                continue
            if len(row) == len(header):
                records.append(dict(zip(header, row, strict=True)))
        return records

    return []


def _looks_like_timestamp(value: str) -> bool:
    if re.fullmatch(r"\d{10,19}", value):
        return True
    candidate = value.replace("Z", "+00:00")
    try:
        datetime.fromisoformat(candidate)
        return True
    except ValueError:
        pass
    return bool(
        re.match(
            r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}(?::\d{2})?",
            value,
        )
    )


def _value_type(value: Any) -> str:
    if value is None or value == "":
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "float"
    text = str(value).strip()
    try:
        ipaddress.ip_address(text)
        return "ip"
    except ValueError:
        pass
    if _looks_like_timestamp(text):
        return "timestamp"
    if text.lower() in {"true", "false", "yes", "no", "success", "failure"}:
        return "boolean_like"
    return "string"


def profile_fields(records: list[dict[str, Any]]) -> list[FieldProfile]:
    type_counts: dict[str, Counter[str]] = defaultdict(Counter)
    presence: Counter[str] = Counter()
    examples: dict[str, list[str]] = defaultdict(list)
    for record in records:
        for name, value in record.items():
            presence[name] += 1
            type_counts[name][_value_type(value)] += 1
            rendered = str(value)
            if rendered not in examples[name] and len(examples[name]) < 5:
                examples[name].append(rendered[:200])
    total = len(records)
    return [
        FieldProfile(
            name=name,
            presence=count,
            total_records=total,
            type_counts=dict(type_counts[name]),
            examples=examples[name],
        )
        for name, count in sorted(presence.items())
    ]


def _name_score(source: str, aliases: Iterable[str]) -> tuple[float, str]:
    normalised = _normalise_name(source.split(".")[-1])
    best_alias = ""
    best = 0.0
    for alias in aliases:
        alias_normalised = _normalise_name(alias)
        if normalised == alias_normalised:
            return 1.0, alias
        score = SequenceMatcher(None, normalised, alias_normalised).ratio()
        if alias_normalised in normalised or normalised in alias_normalised:
            score = max(score, 0.82)
        if score > best:
            best = score
            best_alias = alias
    return best, best_alias


def _value_score(profile: FieldProfile, canonical: str) -> tuple[float, str]:
    counts = profile.type_counts
    total = max(1, sum(counts.values()))
    ip_ratio = counts.get("ip", 0) / total
    timestamp_ratio = counts.get("timestamp", 0) / total
    if canonical == "event.timestamp":
        return timestamp_ratio, f"{timestamp_ratio:.0%} timestamp-shaped values"
    if canonical in {"source.ip", "destination.ip"}:
        return ip_ratio, f"{ip_ratio:.0%} IP-shaped values"
    if canonical == "activity.outcome":
        ratio = counts.get("boolean_like", 0) / total
        return max(0.25, ratio), f"{ratio:.0%} outcome-like values"
    if canonical in {
        "actor.user",
        "host.name",
        "activity.action",
        "service.name",
        "resource.name",
        "event.message",
        "event.id",
    }:
        string_ratio = counts.get("string", 0) / total
        return max(0.25, string_ratio * 0.65), f"{string_ratio:.0%} string values"
    return 0.0, "No value evidence"


def propose_mappings(profiles: list[FieldProfile]) -> list[MappingProposal]:
    candidates: list[MappingProposal] = []
    for canonical, aliases in CANONICAL_ALIASES.items():
        best: tuple[float, FieldProfile, list[str]] | None = None
        for profile in profiles:
            name_score, alias = _name_score(profile.name, aliases)
            # Value shapes alone cannot distinguish two IP roles or turn generic
            # text into a user, host or resource. Weak fuzzy names are omitted
            # instead of presented as plausible semantic mappings.
            if name_score < 0.75:
                continue
            value_score, value_reason = _value_score(profile, canonical)
            presence_bonus = min(0.08, profile.presence_ratio * 0.08)
            confidence = min(0.99, name_score * 0.68 + value_score * 0.24 + presence_bonus)
            reasons = [
                f"field name resembles '{alias or canonical}' ({name_score:.2f})",
                value_reason,
                f"present in {profile.presence_ratio:.0%} of sampled records",
            ]
            if best is None or confidence > best[0]:
                best = (confidence, profile, reasons)
        if best and best[0] >= 0.55:
            confidence, profile, reasons = best
            candidates.append(
                MappingProposal(
                    source_field=profile.name,
                    canonical_field=canonical,
                    confidence=round(confidence, 3),
                    reasons=reasons,
                    requires_confirmation=confidence < 0.9,
                )
            )
    return sorted(candidates, key=lambda item: (-item.confidence, item.canonical_field))


def schema_fingerprint(detection: FormatDetection, profiles: list[FieldProfile]) -> str:
    payload = {
        "format": detection.format,
        "delimiter": detection.delimiter,
        "fields": [{"name": item.name, "types": sorted(item.type_counts)} for item in profiles],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def quality_state(
    detection: FormatDetection, proposals: list[MappingProposal]
) -> tuple[str, list[str], list[str]]:
    if detection.format not in SUPPORTED_FORMATS:
        return "unsupported", [], ["No supported parser matched the sample"]
    mapped = {proposal.canonical_field: proposal for proposal in proposals}
    missing: list[str] = []
    if "event.timestamp" not in mapped:
        missing.append("trustworthy timestamp")
    entities = {"source.ip", "destination.ip", "actor.user", "host.name"}
    if not entities.intersection(mapped):
        missing.append("stable identity, host, or network entity")
    if "activity.action" not in mapped and "event.message" not in mapped:
        missing.append("action or event message")
    if missing:
        if "trustworthy timestamp" in missing:
            return "reconstruction_withheld", [], missing
        return "searchable_only", [], missing
    confirmations = [
        proposal.canonical_field
        for proposal in proposals
        if proposal.requires_confirmation
        and proposal.canonical_field
        in {
            "event.timestamp",
            "source.ip",
            "destination.ip",
            "actor.user",
            "host.name",
            "activity.action",
        }
    ]
    if confirmations:
        return "mapping_required", confirmations, []
    return "supported", [], []


# The lab's names, and the HALT canonical column each would become if a parser ever used it.
HALT_FIELD: dict[str, str | None] = {
    "event.timestamp": "event_ns",
    "event.id": None,
    "source.ip": "src_ip",
    "destination.ip": "dst_ip",
    "actor.user": "user",
    "host.name": "hostname",
    "activity.action": "action",
    "activity.outcome": "status",
    "service.name": "service",
    "resource.name": None,
    "event.message": "message",
}


def analyse(path: Path, *, lines_per_region: int = 80) -> dict[str, Any]:
    samples = stratified_sample(path, lines_per_region=lines_per_region)
    detection = detect_format(samples)
    records = parse_sample_records(samples, detection)
    profiles = profile_fields(records)
    proposals = propose_mappings(profiles)
    state, confirmations, missing = quality_state(detection, proposals)
    return {
        "detection": detection,
        "regions": dict(Counter(sample.region for sample in samples)),
        "sampled_lines": len(samples),
        "parsed_records": len(records),
        "profiles": profiles,
        "proposals": proposals,
        "state": state,
        "confirmations": confirmations,
        "missing": missing,
        "fingerprint": schema_fingerprint(detection, profiles),
    }
