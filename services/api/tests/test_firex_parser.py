"""Parser, canonical records, byte accounting, quarantine and chunking."""

from __future__ import annotations

from pathlib import Path

import pyarrow.parquet as pq
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from halt.firex.parser import (
    ChunkTask,
    canonical_hash,
    event_ns,
    evidence_id,
    parse_text,
    process_chunk,
    safe_sample,
)
from halt.firex.pipeline import Runner, build_plan
from halt.firex.registry import RegisteredDataset
from halt.firex.util import read_json
from tests.firex_support import DAY, background, line, run_fixture, traffic, write_dataset

CORE = (
    'date=2026-10-23 time=08:48:26 eventtime=1792745306000000000 tz="+0530" devname="F" logid="1" '
    'type="event" subtype="system" level="alert"'
)


def test_quoted_values_with_spaces_and_equals() -> None:
    fields, reason = parse_text(f'{CORE} msg="Administrator admin login failed from a=b because of x"')
    assert reason is None and fields is not None
    assert fields["msg"] == "Administrator admin login failed from a=b because of x"


def test_unquoted_empty_and_unknown_fields() -> None:
    fields, _ = parse_text(f'{CORE} srcip=10.0.0.1 unknown_field=abc empty="" novalue=')
    assert fields is not None
    assert (fields["srcip"], fields["unknown_field"], fields["empty"], fields["novalue"]) == (
        "10.0.0.1",
        "abc",
        "",
        "",
    )


def test_escaped_quote_stays_in_one_value() -> None:
    fields, _ = parse_text(f'{CORE} msg="said \\"hi\\" there"')
    assert fields is not None and fields["msg"] == 'said \\"hi\\" there'


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ('name"', "not_log_prefix"),
        ("\x90\x90garbage date=2026-10-23 time=08:48:26", "embedded_log_token"),
        (f'{CORE} msg="unterminated', "unparsed_residue"),
        (CORE.replace("eventtime=1792745306000000000", "eventtime=abc"), "invalid_timestamp"),
        (CORE.replace(' subtype="system"', ""), "missing_core_field"),
        (f"{CORE} level=x", "duplicate_key"),
    ],
)
def test_rejections_name_their_reason(text: str, reason: str) -> None:
    assert parse_text(text) == (None, reason)


@given(st.binary(max_size=300))
@settings(max_examples=200)
def test_arbitrary_bytes_never_raise(data: bytes) -> None:
    parse_text(data.decode("utf-8", "surrogateescape").strip())


@pytest.mark.parametrize(
    "stamp,expected",
    [
        ("1792745306", 1792745306 * 10**9),
        ("1792745306000", 1792745306 * 10**9),
        ("1792745306000000", 1792745306 * 10**9),
        ("1792745306000000000", 1792745306 * 10**9),
    ],
)
def test_eventtime_scales_to_nanoseconds(stamp: str, expected: int) -> None:
    assert event_ns(stamp) == expected


def test_evidence_id_depends_on_source_offset_and_content() -> None:
    a = evidence_id("aa", 10, "h")
    assert a == evidence_id("AA", 10, "h")
    assert (
        a != evidence_id("bb", 10, "h")
        and a != evidence_id("aa", 11, "h")
        and a != evidence_id("aa", 10, "i")
    )


def test_canonical_hash_ignores_field_order() -> None:
    assert canonical_hash({"a": "1", "b": "2"}) == canonical_hash({"b": "2", "a": "1"})


def test_safe_sample_is_bounded_ascii_and_masks_credentials() -> None:
    masked = safe_sample("password=hunter2 \udc90 x" + "y" * 1000)
    assert "hunter2" not in masked and masked.isascii() and len(masked) < 1000


def _manifest(tmp: Path, lines: list[str | bytes]) -> tuple[dict, Path]:
    path = write_dataset(tmp, lines)
    task = ChunkTask(0, str(path), 0, path.stat().st_size, "s" * 64, str(tmp / "out"))
    return process_chunk(task), tmp / "out" / "parts" / "part-000000.parquet"


def test_canonical_row_preserves_originals_and_keeps_missing_null(tmp_path: Path) -> None:
    _, part = _manifest(tmp_path, [traffic(DAY, "10.0.0.1", "198.51.100.1", weird="v")])
    row = pq.read_table(part).to_pylist()[0]
    assert row["tz"] == "+0530" and row["date"] and row["time"]
    assert row["src_ip"] == "10.0.0.1" and row["dst_port"] == 443 and row["sent_bytes"] == 100
    assert row["user"] is None and row["attack"] is None and row["virus"] is None
    assert row["extra_json"] == '{"weird": "v"}'
    assert row["event_ns"] == DAY * 10**9 and row["time_delta_s"] is None
    assert row["evidence_id"].startswith("ev-") and len(row["raw_sha256"]) == 32


def test_quarantine_coalesces_a_binary_run_into_one_segment(tmp_path: Path) -> None:
    junk: list[str | bytes] = [b"\x90\xff\x00garbage " + str(i).encode() + b"\n" for i in range(5000)]
    manifest, _ = _manifest(
        tmp_path, [*background(DAY, 3), *junk, b"\n", b"more\n", *background(DAY + 10, 2)]
    )
    assert manifest["valid"] == 5 and manifest["rejected"] == 5001 and manifest["blank"] == 1
    [segment] = manifest["segments"]
    assert segment["rejected"] == 5001 and segment["blank"] == 1
    assert len(segment["samples"]) == 3
    assert all(s["text"].isascii() for s in segment["samples"])


def test_overlong_line_does_not_stay_in_memory_and_is_fully_counted(tmp_path: Path) -> None:
    big = b"x" * (3 * (1 << 20)) + b"\n"
    manifest, _ = _manifest(tmp_path, [big, *background(DAY, 1)])
    assert manifest["rejected"] == 1 and manifest["rejected_bytes"] == len(big)
    assert len(manifest["segments"][0]["samples"][0]["text"]) < 2000


def test_every_byte_is_accounted_for_including_a_binary_tail_without_newline(tmp_path: Path) -> None:
    lines: list[str | bytes] = [
        *background(DAY, 400),
        b"\n",
        b"\xff\xfe binary",
        b"\n\n",
        b"\x00\x01tail no newline",
    ]
    runner = run_fixture(tmp_path, lines, chunk_bytes=4096)
    quality = read_json(runner.dir / "quality.json")
    assert quality["bytes_accounted"] is True
    assert quality["bytes_total"] == runner.path.stat().st_size
    assert (
        quality["bytes_valid"] + quality["bytes_quarantined"] + quality["bytes_blank"]
        == quality["bytes_total"]
    )
    assert quality["records_valid"] == 400


def test_quarantine_segment_spanning_chunks_is_coalesced(tmp_path: Path) -> None:
    junk: list[str | bytes] = [b"\x90\xff junk line " + str(i).encode() + b"\n" for i in range(4000)]
    runner = run_fixture(tmp_path, [*background(DAY, 2), *junk], chunk_bytes=8192)
    segments = read_json(runner.dir / "quarantine.json")
    plan = read_json(runner.dir / "plan.json")
    assert len(plan["chunks"]) > 2
    assert len(segments) == 1
    assert (
        segments[0]["rejected_records"] == 4000
        and segments[0]["start_line"] == 3
        and segments[0]["end_line"] == 4002
    )
    assert segments[0]["source_sha256"] == plan["source_sha256"] and segments[0]["parser_version"]


def test_chunk_boundaries_lose_and_repeat_nothing_and_results_match_one_big_chunk(tmp_path: Path) -> None:
    lines = background(DAY, 1500)
    small = run_fixture(tmp_path / "a", list(lines), chunk_bytes=2048)
    large = run_fixture(tmp_path / "b", list(lines), chunk_bytes=1 << 26)
    assert len(read_json(small.dir / "plan.json")["chunks"]) > 5

    def read(runner: Runner) -> list[str]:
        return sorted(pq.read_table(runner.dir / "parts", columns=["evidence_id"]).column(0).to_pylist())

    assert read(small) == read(large) and len(read(small)) == 1500


def test_line_numbers_come_from_the_plan_across_chunks(tmp_path: Path) -> None:
    lines = background(DAY, 800)
    path = write_dataset(tmp_path, list(lines))
    plan = build_plan(path, RegisteredDataset("fixture", "F", path.name, None), None, 4096)
    assert plan["chunks"][0]["line_base"] == 0
    offset = 0
    offsets = {}
    for number, text in enumerate(lines):
        offsets[offset] = number
        offset += len(text) + 1
    for chunk in plan["chunks"]:
        assert offsets[chunk["start"]] == chunk["line_base"]
    assert plan["chunks"][-1]["end"] == path.stat().st_size


def test_controlled_range_ends_on_a_line_end_and_records_the_full_hash_unverified(tmp_path: Path) -> None:
    lines = background(DAY, 100)
    path = write_dataset(tmp_path, list(lines))
    plan = build_plan(path, RegisteredDataset("fixture", "F", path.name, "a" * 64), 5000, 1 << 20)
    assert plan["end"] <= 5000
    with open(path, "rb") as f:
        assert f.read(plan["end"]).endswith(b"\n")
    assert plan["source_sha256"] == "a" * 64 and plan["source_sha256_verified"] is False


def test_utc_clock_conflict_is_recorded_once_per_dataset(tmp_path: Path) -> None:
    conflict = line(DAY, srcip="10.0.0.1").replace(f"eventtime={DAY}", f"eventtime={DAY + 60}")
    runner = run_fixture(tmp_path, [*background(DAY, 10), conflict])
    quality = read_json(runner.dir / "quality.json")
    assert quality["timezone_conflict"]["affected_records"] == 10
    assert quality["timezone_conflict"]["declared_tz"] == ["+0530"]
    assert quality["records_with_conflicting_time"] == 1
    assert "timezone_conflict" not in pq.read_table(runner.dir / "parts").column_names


def test_no_timezone_conflict_when_tz_is_utc(tmp_path: Path) -> None:
    runner = run_fixture(tmp_path, [line(DAY, tz="+0000", srcip="10.0.0.1")])
    assert read_json(runner.dir / "quality.json")["timezone_conflict"] is None
