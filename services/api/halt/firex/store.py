"""Disk-backed views over a run's Parquet parts, exact-duplicate detection and data-quality accounting.

DuckDB runs with a memory limit and an on-disk temp directory, so grouping can spill. No query loads the data
set into
Python: results returned to Python are aggregates or capped lists.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

import duckdb

from halt.firex import PARSER_VERSION
from halt.firex.util import atomic_write_json, read_json, stable_hash, utc_text

if TYPE_CHECKING:
    from halt.firex.pipeline import Runner

NON_UTC_EXCLUDED = ("+0000", "-0000", "Z", "UTC", "+00:00")
MAX_SAVED_SEGMENTS = 10_000
MERGED_SAMPLES = 5


def posix(path: Path) -> str:
    return path.as_posix().replace("'", "''")


def connect(run_dir: Path, memory_limit_gb: float) -> duckdb.DuckDBPyConnection:
    temp = run_dir / "duck_tmp"
    temp.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(":memory:")
    con.execute(f"SET memory_limit='{float(memory_limit_gb)}GB'")
    con.execute(f"SET temp_directory='{posix(temp)}'")
    con.execute("SET preserve_insertion_order=false")
    con.execute(
        f"CREATE VIEW raw_events AS SELECT * FROM read_parquet('{posix(run_dir / 'parts')}/*.parquet')"
    )
    dup = run_dir / "duplicates.parquet"
    if dup.is_file():
        con.execute(
            f"CREATE VIEW events AS SELECT r.* FROM raw_events r ANTI JOIN "
            f"read_parquet('{posix(dup)}') d ON r.byte_offset = d.byte_offset"
        )
    else:
        con.execute("CREATE VIEW events AS SELECT * FROM raw_events")
    collapsed = run_dir / "quality.json"
    values = ""
    if collapsed.is_file():
        stamps = [int(c["event_ns"]) for c in read_json(collapsed).get("collapsed_timestamps", [])]
        values = ",".join(str(s) for s in stamps)
    predicate = f"event_ns NOT IN ({values})" if values else "TRUE"
    # Time-window rules read this view: a collapsed timestamp has no usable rate or duration.
    con.execute(f"CREATE VIEW timed_events AS SELECT * FROM events WHERE {predicate}")
    return con


def merge_segments(plan: dict[str, Any], manifests: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Whole-file quarantine segments, with neighbours across chunk boundaries coalesced."""
    merged: list[dict[str, Any]] = []
    truncated = sum(m.get("segments_truncated", 0) for m in manifests)
    bases = {c["chunk_id"]: c["line_base"] for c in plan["chunks"]}
    for manifest in manifests:
        base = bases[manifest["chunk_id"]]
        for seg in manifest["segments"]:
            start_line, end_line = base + seg["start_index"] + 1, base + seg["end_index"] + 1
            samples = [
                {
                    "offset": s["offset"],
                    "line": base + s["index"] + 1,
                    "length": s["length"],
                    "text": s["text"],
                }
                for s in seg["samples"]
            ]
            if merged and merged[-1]["end_offset"] == seg["start_offset"]:
                last = merged[-1]
                last["end_offset"], last["end_line"] = seg["end_offset"], end_line
                last["rejected_records"] += seg["rejected"]
                last["blank_lines"] += seg["blank"]
                for reason, n in seg["reasons"].items():
                    last["reasons"][reason] = last["reasons"].get(reason, 0) + n
                last["samples"] = (last["samples"] + samples)[:MERGED_SAMPLES]
            else:
                merged.append(
                    {
                        "start_offset": seg["start_offset"],
                        "end_offset": seg["end_offset"],
                        "start_line": start_line,
                        "end_line": end_line,
                        "rejected_records": seg["rejected"],
                        "blank_lines": seg["blank"],
                        "reasons": dict(seg["reasons"]),
                        "samples": samples,
                    }
                )
    return merged, truncated


def _finish_segment(seg: dict[str, Any], source_sha256: str) -> dict[str, Any]:
    reasons = seg.pop("reasons")
    reason = max(sorted(reasons), key=lambda r: reasons[r]) if reasons else "blank"
    if len(reasons) > 1:
        reason = f"mixed:{reason}"
    return {
        "segment_id": "qseg-" + stable_hash([source_sha256, seg["start_offset"], seg["end_offset"]]),
        "reason": reason,
        **seg,
        "source_sha256": source_sha256,
        "parser_version": PARSER_VERSION,
    }


def prepare_run(runner: Runner, plan: dict[str, Any], manifests: list[dict[str, Any]]) -> dict[str, Any]:
    """Duplicates, collapsed timestamps, timezone conflict and byte accounting. Returns
    DatasetQualitySummary."""
    run_dir = runner.dir
    quality_path = run_dir / "quality.json"
    if quality_path.is_file():
        done: dict[str, Any] = read_json(quality_path)
        return done
    threshold = int(runner.rules["collapse"]["threshold_records"])
    con = connect(run_dir, runner.memory_limit_gb)
    dup_path = run_dir / "duplicates.parquet"
    temp_dup = dup_path.with_suffix(".tmp")
    con.execute(
        f"""
        COPY (
          SELECT r.byte_offset
          FROM raw_events r
          JOIN (SELECT raw_sha256 AS h, min(byte_offset) AS first_offset
                FROM raw_events GROUP BY raw_sha256 HAVING count(*) > 1) d ON r.raw_sha256 = d.h
          WHERE r.byte_offset <> d.first_offset
        ) TO '{posix(temp_dup)}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )
    temp_dup.replace(dup_path)
    row = con.execute(f"SELECT count(*) FROM read_parquet('{posix(dup_path)}')").fetchone()
    duplicates = int(row[0]) if row else 0

    bases = {c["chunk_id"]: c["line_base"] for c in plan["chunks"]}
    rows = con.execute(
        """
        SELECT event_ns, count(*) AS n, min(byte_offset), max(byte_offset),
               arg_min(chunk_id, byte_offset), arg_min(line_in_chunk, byte_offset),
               arg_max(chunk_id, byte_offset), arg_max(line_in_chunk, byte_offset)
        FROM raw_events GROUP BY event_ns HAVING count(*) >= ? ORDER BY n DESC, event_ns LIMIT 1000
        """,
        [threshold],
    ).fetchall()
    collapsed = [
        {
            "event_ns": int(r[0]),
            "event_utc": utc_text(int(r[0])),
            "affected_records": int(r[1]),
            "first_offset": int(r[2]),
            "last_offset": int(r[3]),
            "first_line": bases[r[4]] + int(r[5]) + 1,
            "last_line": bases[r[6]] + int(r[7]) + 1,
            "threshold_records": threshold,
            "config_version": runner.rules["collapse"]["config_version"],
        }
        for r in rows
    ]
    placeholders = ",".join("?" for _ in NON_UTC_EXCLUDED)
    row = con.execute(
        f"SELECT count(*) FROM raw_events WHERE tz NOT IN ({placeholders}) AND time_delta_s IS NULL",
        list(NON_UTC_EXCLUDED),
    ).fetchone()
    tz_affected = int(row[0]) if row else 0
    con.close()

    tz_totals: dict[str, int] = {}
    reasons: dict[str, int] = {}
    for manifest in manifests:
        for tz, n in manifest["tz_counts"].items():
            tz_totals[tz] = tz_totals.get(tz, 0) + n
        for reason, n in manifest["reasons"].items():
            reasons[reason] = reasons.get(reason, 0) + n
    segments, truncated = merge_segments(plan, manifests)
    finished = [_finish_segment(s, plan["source_sha256"]) for s in segments]
    atomic_write_json(run_dir / "quarantine.json", finished[:MAX_SAVED_SEGMENTS])

    total = plan["end"] - plan["start"]
    valid_bytes = sum(m["valid_bytes"] for m in manifests)
    rejected_bytes = sum(m["rejected_bytes"] for m in manifests)
    blank_bytes = sum(m["blank_bytes"] for m in manifests)
    lows = [m["min_ns"] for m in manifests if m["min_ns"] is not None]
    highs = [m["max_ns"] for m in manifests if m["max_ns"] is not None]
    quality: dict[str, Any] = {
        "bytes_total": total,
        "bytes_valid": valid_bytes,
        "bytes_quarantined": rejected_bytes,
        "bytes_blank": blank_bytes,
        "bytes_accounted": valid_bytes + rejected_bytes + blank_bytes == total,
        "lines_total": sum(m["lines"] for m in manifests),
        "records_valid": sum(m["valid"] for m in manifests),
        "records_rejected": sum(m["rejected"] for m in manifests),
        "lines_blank": sum(m["blank"] for m in manifests),
        "quarantine_segments": len(finished),
        "quarantine_segments_truncated": truncated,
        "reject_reasons": reasons,
        "timezone_conflict": {
            "declared_tz": sorted(k for k in tz_totals if k not in NON_UTC_EXCLUDED),
            "interpretation": "date and time equal eventtime when read as UTC, although tz declares "
            "another offset. "
            "eventtime is used as UTC; the original fields are preserved.",
            "affected_records": tz_affected,
        }
        if tz_affected
        else None,
        "collapsed_timestamps": collapsed,
        "records_in_collapsed_timestamps": sum(c["affected_records"] for c in collapsed),
        "records_with_conflicting_time": sum(m["time_conflicts"] for m in manifests),
        "exact_duplicates": duplicates,
        "earliest_utc": utc_text(min(lows)) if lows else None,
        "latest_utc": utc_text(max(highs)) if highs else None,
    }
    atomic_write_json(quality_path, quality)
    return quality
