"""Shared helpers for the Scenario Foundry generators. All data is synthetic: .example domains, RFC 5737 and
RFC 1918 addresses, invented names."""

from __future__ import annotations

import csv
import io
import json
import random
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any


def iso(t: datetime) -> str:
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def at(day: str, hms: str) -> datetime:
    return datetime.fromisoformat(f"{day}T{hms}+00:00")


def rid(rng: random.Random, prefix: str, n: int = 8) -> str:
    return f"{prefix}{rng.getrandbits(4 * n):0{n}x}"


@dataclass
class Builder:
    """Accumulates raw records per file; attack records are tagged for ground truth (never written out)."""

    rng: random.Random
    jsonl: dict[str, list[tuple[datetime, dict[str, Any]]]] = field(default_factory=dict)
    jsondoc: dict[str, list[tuple[datetime, dict[str, Any]]]] = field(default_factory=dict)
    csvrows: dict[str, list[tuple[datetime, dict[str, str]]]] = field(default_factory=dict)
    attack: list[dict[str, Any]] = field(default_factory=list)
    extra_lines: dict[str, list[str]] = field(default_factory=dict)  # deliberately malformed lines

    def add(
        self,
        kind: str,
        filename: str,
        t: datetime,
        record: dict[str, Any],
        record_id: str,
        step: str | None = None,
        **truth: Any,
    ) -> None:
        target = {"jsonl": self.jsonl, "json": self.jsondoc, "csv": self.csvrows}[kind]
        target.setdefault(filename, []).append((t, record))
        if step:
            self.attack.append(
                {"step": step, "file": filename, "record_id": record_id, "time": iso(t), **truth}
            )

    def render(self, envelopes: dict[str, str], columns: dict[str, list[str]]) -> dict[str, str]:
        out: dict[str, str] = {}
        for name, rows in self.jsonl.items():
            lines = [
                json.dumps(r, sort_keys=True)
                for _, r in sorted(rows, key=lambda x: (x[0], json.dumps(x[1], sort_keys=True)))
            ]
            lines.extend(self.extra_lines.get(name, []))
            out[name] = "\n".join(lines) + "\n"
        for name, rows in self.jsondoc.items():
            items = [r for _, r in sorted(rows, key=lambda x: (x[0], json.dumps(x[1], sort_keys=True)))]
            out[name] = json.dumps({envelopes[name]: items}, indent=1, sort_keys=True) + "\n"
        for name, rows in self.csvrows.items():
            buf = io.StringIO()
            w = csv.DictWriter(buf, fieldnames=columns[name], lineterminator="\n")
            w.writeheader()
            for _, r in sorted(rows, key=lambda x: (x[0], json.dumps(x[1], sort_keys=True))):
                w.writerow(r)
            text = buf.getvalue() + "".join(f"{x}\n" for x in self.extra_lines.get(name, []))
            out[name] = text
        return out


def jitter(rng: random.Random, t: datetime, seconds: int) -> datetime:
    return t + timedelta(seconds=rng.randint(0, seconds))
