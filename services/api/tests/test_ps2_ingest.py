"""PS2 intake: JSON / JSONL / CSV adapters, malformed and mixed records, deterministic ids, redaction."""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from halt.ps2.config import load_config
from halt.ps2.intake.intake import IntakeError, check_files, event_id
from halt.ps2.intake.parse import parse
from halt.ps2.intake.redact import preview, redact
from halt.ps2.schema import CANONICAL_SCHEMA, CanonicalEvent, RawFile
from tests.ps2_support import api_file, api_record, ingest_dataset, ingest_files, jsonl


def test_jsonl_records_become_canonical_events() -> None:
    ing = ingest_files(
        [
            api_file(
                [
                    api_record("r1", "2026-10-29T09:00:00Z", "A.User@Org.example", "s1", "10.0.0.5"),
                    api_record("r2", "2026-10-29T09:01:00Z", "a.user@org.example", "s1", "10.0.0.5"),
                ]
            )
        ]
    )
    assert ing.result.accepted == 2 and ing.result.rejected == 0
    e = ing.events[0]
    assert e.canonical_schema == CANONICAL_SCHEMA
    assert e.actor_user == "a.user@org.example"  # identifiers are normalised
    assert e.session == "s1" and e.evidence.source_record_id == "r1" and e.evidence.line == 1
    assert [x.occurred_at for x in ing.events] == sorted(x.occurred_at for x in ing.events)


def test_json_envelope_and_csv_datasets_ingest() -> None:
    ing = ingest_dataset("scenario-b")  # JSON (CloudTrail-like Records), JSONL and CSV
    by_file = {f.filename: f for f in ing.result.files}
    assert by_file["cloud_audit.json"].accepted > 0
    assert by_file["db_audit.csv"].accepted > 0
    assert by_file["idp_signin.jsonl"].accepted > 0
    kinds = {e.source_type for e in ing.events}
    assert len(kinds) >= 4


def test_malformed_and_mixed_records_are_reported_not_fatal() -> None:
    good = api_record("r1", "2026-10-29T09:00:00Z", "u@org.example", "s1", "10.0.0.5")
    no_time = {
        k: v
        for k, v in api_record("r2", "x", "u@org.example", "s1", "10.0.0.5").items()
        if k != "CreationTime"
    }
    content = jsonl([good]) + "{not json\n" + "[1, 2]\n" + jsonl([no_time, good])
    f = RawFile(
        filename="mixed.jsonl", adapter="api_activity", content_type="application/x-ndjson", content=content
    )
    ing = ingest_files([f])
    report = ing.result.files[0]
    assert report.accepted == 1
    codes = [i.code for r in report.records if r.status == "rejected" for i in r.issues]
    assert "malformed_record" in codes
    assert "duplicate_record" in codes
    assert len(ing.events) == 1


def test_csv_wrong_column_count_rejected() -> None:
    rows = parse("a,b,c\n1,2,3\n1,2\n", "csv", 100)
    assert rows[0].data == {"a": "1", "b": "2", "c": "3"}
    assert rows[1].data is None and "expected 3 columns" in (rows[1].error or "")


def test_non_finite_numbers_rejected() -> None:
    rows = parse('{"a": NaN}\n', "jsonl", 10)
    assert rows[0].data is None


def test_hashes_and_event_ids_are_deterministic() -> None:
    rec = api_record("r1", "2026-10-29T09:00:00Z", "u@org.example", "s1", "10.0.0.5")
    a = ingest_files([api_file([rec])])
    reordered = json.dumps(dict(reversed(list(rec.items()))))  # key order differs, content identical
    f = RawFile(
        filename="api.jsonl", adapter="api_activity", content_type="application/x-ndjson", content=reordered
    )
    b = ingest_files([f])
    assert a.events[0].event_id == b.events[0].event_id
    assert a.events[0].raw_sha256 == b.events[0].raw_sha256
    assert event_id("api_activity", a.events[0].raw_sha256) == a.events[0].event_id
    assert ingest_dataset("scenario-a").result == ingest_dataset("scenario-a").result


def test_canonical_event_validation() -> None:
    e = ingest_files(
        [api_file([api_record("r1", "2026-10-29T09:00:00Z", "u@org.example", "s1", "10.0.0.5")])]
    )
    data = e.events[0].model_dump()
    with pytest.raises(ValidationError):
        CanonicalEvent.model_validate({**data, "event_kind": "teleport"})
    with pytest.raises(ValidationError):
        CanonicalEvent.model_validate({**data, "unexpected": 1})
    with pytest.raises(ValidationError):
        CanonicalEvent.model_validate({**data, "occurred_at": "2026-10-29T09:00:00"})  # naive time


def test_timezone_naive_timestamp_warns() -> None:
    ing = ingest_files(
        [api_file([api_record("r1", "2026-10-29T09:00:00", "u@org.example", "s1", "10.0.0.5")])]
    )
    rec = ing.result.files[0].records[0]
    assert rec.status == "normalised_with_warnings"
    assert any(i.code == "timezone_assumed" for i in rec.issues)


def test_secrets_are_redacted_from_previews() -> None:
    secret = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl"
    data = {
        "Authorization": secret,
        "password": "hunter2",
        "note": f"token {secret}",
        "AccessKey": "AKIAABCDEFGHIJKLMNOP",
    }
    text = preview(data)
    assert "hunter2" not in text and "eyJ" not in text and "AKIAABCDEFGHIJKLMNOP" not in text
    assert len(text) <= 240
    assert redact({"ok": "value"}) == {"ok": "value"}
    assert redact({"note": "password=hunter2; next"}) == {"note": "password=[redacted]; next"}


def test_dataset_canary_secret_never_reaches_reports_or_events() -> None:
    ing = ingest_dataset("scenario-b")
    blob = ing.result.model_dump_json() + "".join(e.model_dump_json() for e in ing.events)
    assert "CANARY" not in blob


def test_file_checks() -> None:
    cfg = load_config()
    ok = api_file([api_record("r1", "2026-10-29T09:00:00Z", "u@org.example", "s1", "10.0.0.5")])
    with pytest.raises(IntakeError) as exc:
        check_files([ok.model_copy(update={"adapter": "nope"})], cfg)
    assert exc.value.code == "unknown_adapter"
    with pytest.raises(IntakeError) as exc:
        check_files([ok.model_copy(update={"content_type": "text/csv"})], cfg)
    assert exc.value.status == 415
    with pytest.raises(IntakeError) as exc:
        check_files([ok, ok], cfg)
    assert exc.value.code == "duplicate_filename"
    big = ok.model_copy(update={"content": "x" * (cfg.limits.max_file_bytes + 1)})
    with pytest.raises(IntakeError) as exc:
        check_files([big], cfg)
    assert exc.value.status == 413
    with pytest.raises(IntakeError):
        check_files([], cfg)


@pytest.mark.parametrize(
    "name", ["../etc/passwd", "a/b.jsonl", "..\\x.json", ".hidden", "", "a" * 101, "a b.csv"]
)
def test_unsafe_filenames_rejected(name: str) -> None:
    with pytest.raises(ValidationError):
        RawFile(filename=name, adapter="api_activity", content_type="application/x-ndjson", content="")
