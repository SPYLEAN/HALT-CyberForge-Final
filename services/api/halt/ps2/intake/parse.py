"""Format parsers. Each record is parsed independently: a malformed record becomes an error row, never an
exception that stops the batch. Only json and csv from the standard library are used (no unsafe
deserialisation).
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from dataclasses import dataclass
from typing import Any, Literal

from halt.canonical import canonical_json

Format = Literal["json", "jsonl", "csv"]


@dataclass(frozen=True)
class ParsedRow:
    line: int | None
    raw_sha256: str
    data: dict[str, Any] | None
    error: str | None = None


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _reject_constant(name: str) -> float:
    raise ValueError(f"non-finite number {name} is not allowed")


def _loads(text: str) -> Any:
    return json.loads(text, parse_constant=_reject_constant)


def _row(line: int | None, value: Any, raw_text: str) -> ParsedRow:
    if not isinstance(value, dict):
        return ParsedRow(line, _sha(raw_text), None, "record is not a JSON object")
    return ParsedRow(line, hashlib.sha256(canonical_json(value)).hexdigest(), value)


def parse(content: str, fmt: Format, max_records: int) -> list[ParsedRow]:
    rows: list[ParsedRow] = []
    if fmt == "json":
        try:
            doc = _loads(content)
        except (ValueError, RecursionError) as exc:
            return [ParsedRow(None, _sha(content), None, f"malformed JSON document: {exc}")]
        # A bare array, or an envelope with one list of records (CloudTrail "Records", Graph "value").
        items = doc
        if isinstance(doc, dict):
            lists = [
                v
                for k, v in sorted(doc.items())
                if isinstance(v, list) and k in ("Records", "value", "records", "events")
            ]
            items = lists[0] if lists else [doc]
        if not isinstance(items, list):
            return [ParsedRow(None, _sha(content), None, "JSON document is neither an object nor an array")]
        for i, item in enumerate(items[:max_records]):
            rows.append(_row(i + 1, item, json.dumps(item, sort_keys=True)))
    elif fmt == "jsonl":
        for i, text in enumerate(content.splitlines()):
            if not text.strip():
                continue
            if len(rows) >= max_records:
                break
            try:
                rows.append(_row(i + 1, _loads(text), text))
            except (ValueError, RecursionError) as exc:
                rows.append(ParsedRow(i + 1, _sha(text), None, f"malformed JSON line: {exc}"))
    else:
        reader = csv.reader(io.StringIO(content))
        header: list[str] | None = None
        for i, cells in enumerate(reader):
            if header is None:
                header = [h.strip() for h in cells]
                continue
            if not cells or not any(c.strip() for c in cells):
                continue
            if len(rows) >= max_records:
                break
            text = ",".join(cells)
            if len(cells) != len(header):
                rows.append(
                    ParsedRow(i + 1, _sha(text), None, f"expected {len(header)} columns, found {len(cells)}")
                )
                continue
            record = dict(zip(header, cells, strict=True))
            rows.append(ParsedRow(i + 1, hashlib.sha256(canonical_json(record)).hexdigest(), record))
    return rows
