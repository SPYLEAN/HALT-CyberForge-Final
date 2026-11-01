"""Live Intake with small deterministic files. Nothing official is read, and every root is temporary."""

from __future__ import annotations

import hashlib
import json
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from halt.config import Settings
from halt.firex.cases import create_case
from halt.firex.contracts import CaseRequest, UploadRequest
from halt.firex.jobs import RunError, list_runs, read_state, resume_run, run_dir
from halt.firex.live import (
    CHUNK_BYTES,
    MAX_UPLOAD_BYTES,
    cancel_upload,
    complete_upload,
    create_upload,
    detect_format,
    incoming_dir,
    list_files,
    preflight,
    profile,
    start,
    upload_state,
    write_chunk,
)
from halt.firex.pipeline import Runner
from halt.firex.registry import datasets, source_path
from halt.firex.trace import build_provenance, search
from halt.firex.trust import build_health
from halt.main import create_app
from tests.firex_support import DAY, admin, background, traffic

SRC = "203.0.113.9"


def lifecycle() -> list[str]:
    return [
        admin(DAY, "ops", SRC, action="Add", status=None, msg="Add system.admin temp1", logid="0100044547"),
        admin(DAY + 60, "temp1", SRC),
        admin(
            DAY + 120,
            "ops",
            SRC,
            action="Delete",
            status=None,
            msg="Delete system.admin temp1",
            logid="0100044547",
        ),
    ]


def log_bytes(lines: list[str] | None = None) -> bytes:
    rows = lines if lines is not None else [*background(DAY - 100, 20), *lifecycle()]
    return ("\n".join(rows) + "\n").encode()


@pytest.fixture
def root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setenv("HALT_FIREX_DATA_ROOT", str(data))
    yield data


def place(root: Path, name: str = "new.log", content: bytes | None = None) -> Path:
    folder = incoming_dir(root)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_bytes(log_bytes() if content is None else content)
    return path


def run_inline(root: Path, name: str = "new.log") -> Runner:
    """Registers through the real start path, then executes in this process instead of a spawned one."""
    check = preflight(name)
    assert check.sha256
    from halt.firex import live

    live._register(live._dataset_id(check.sha256), name, check.sha256, None)
    runner = Runner(live._dataset_id(check.sha256), root=root, workers=1)
    state = runner.execute()
    assert state["status"] == "completed", state
    return runner


def test_discovers_files_and_describes_them(root: Path) -> None:
    place(root)
    place(root, "notes.csv", b"a,b,c\n1,2,3\n4,5,6\n")
    place(root, "empty.log", b"")
    (incoming_dir(root) / "subfolder").mkdir()
    place(root, "has space.log")
    items = {f.name: f for f in list_files().items}
    assert "subfolder" not in items
    assert items["new.log"].selectable and items["new.log"].detected_format == "fortigate_kv"
    assert items["new.log"].size_bytes == len(log_bytes()) and items["new.log"].modified_utc
    assert not items["notes.csv"].selectable and "No adapter" in (items["notes.csv"].problem or "")
    assert not items["empty.log"].selectable and "empty" in (items["empty.log"].problem or "")
    assert not items["has space.log"].selectable and "Rename" in (items["has space.log"].problem or "")


@pytest.mark.parametrize(
    "bad", ["../secret.log", "..", "a/b.log", "a\\b.log", "C:\\x.log", ".hidden", "%2e%2e"]
)
def test_path_traversal_is_refused(root: Path, bad: str) -> None:
    (root / "secret.log").write_bytes(log_bytes())
    place(root)
    with pytest.raises(RunError) as caught:
        preflight(bad)
    assert caught.value.status in (404, 422)


def test_symlink_out_of_the_folder_is_refused(root: Path) -> None:
    outside = root / "outside.log"
    outside.write_bytes(log_bytes())
    place(root)
    link = incoming_dir(root) / "link.log"
    try:
        os.symlink(outside, link)
    except OSError:
        pytest.skip("symlinks need extra rights on this machine")
    assert "link.log" not in {f.name for f in list_files().items}
    with pytest.raises(RunError):
        preflight("link.log")


@pytest.mark.parametrize(
    ("content", "expected"),
    [
        (log_bytes(), "fortigate_kv"),
        (b"a,b,c\n1,2,3\n4,5,6\n", "csv"),
        (b'{"a": 1}\n{"a": 2}\n', "jsonl"),
        (b'[{"a": 1}, {"a": 2}]', "json"),
        (b"", "empty"),
        (b"\x00\x01\x02\x03 binary", "unknown"),
        (b"just some words\nand more words\n", "unknown"),
    ],
)
def test_format_detection(content: bytes, expected: str) -> None:
    assert detect_format(content)[0] == expected


def test_preflight_shows_what_the_operator_needs(root: Path) -> None:
    place(root)
    check = preflight("new.log")
    assert check.sha256 == hashlib.sha256(log_bytes()).hexdigest()
    assert check.format_label == "FortiGate key-value log" and check.adapter and "parser" in check.adapter
    assert check.parsing_confidence == "High" and check.sample_records and check.can_start
    assert check.time_interpretation and check.privacy_warning
    assert check.expected_destination and check.expected_destination.startswith("results/firex-runs/frun-")


def test_unsupported_format_cannot_start(root: Path) -> None:
    place(root, "data.jsonl", b'{"a": 1}\n{"a": 2}\n')
    check = preflight("data.jsonl")
    assert not check.can_start and check.problems[0].code == "unsupported_format" and check.adapter is None
    with pytest.raises(RunError) as caught:
        start("data.jsonl")
    assert caught.value.status == 415


def test_empty_file_cannot_start(root: Path) -> None:
    place(root, "empty.log", b"")
    assert preflight("empty.log").problems[0].code == "empty_file"
    with pytest.raises(RunError):
        start("empty.log")


def test_insufficient_disk_is_refused(root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    place(root)
    from halt.firex import live

    monkeypatch.setattr(live.shutil, "disk_usage", lambda _: type("U", (), {"free": 1})())
    assert preflight("new.log").problems[0].code == "insufficient_disk"
    with pytest.raises(RunError) as caught:
        start("new.log")
    assert caught.value.status == 507


def test_a_small_upload_lands_in_the_incoming_folder(root: Path) -> None:
    content = log_bytes()
    state = create_upload(UploadRequest(filename="up.log", size_bytes=len(content)))
    assert state.total_chunks == 1 and not state.complete
    state = write_chunk(state.upload_id, 0, content, hashlib.sha256(content).hexdigest())
    assert state.complete
    assert complete_upload(state.upload_id).name == "up.log"
    assert (incoming_dir(root) / "up.log").read_bytes() == content
    assert not list((incoming_dir(root) / ".uploads").iterdir())


def _big_log() -> bytes:
    rows = [traffic(DAY + i % 500, "10.1.0.5", "198.51.100.9", sid=i, sent=i) for i in range(70000)]
    content = log_bytes(rows)
    assert len(content) > CHUNK_BYTES
    return content


def test_an_interrupted_upload_resumes_without_resending(root: Path) -> None:
    content = _big_log()
    state = create_upload(UploadRequest(filename="big.log", size_bytes=len(content)))
    assert state.total_chunks >= 2
    write_chunk(state.upload_id, 0, content[:CHUNK_BYTES], None)
    # The browser closes. A later session asks what arrived.
    resumed = upload_state(state.upload_id)
    assert resumed.received_chunks == [0] and resumed.received_bytes == CHUNK_BYTES
    with pytest.raises(RunError) as caught:
        complete_upload(state.upload_id)
    assert caught.value.status == 409
    for index in range(1, resumed.total_chunks):
        write_chunk(state.upload_id, index, content[index * CHUNK_BYTES : (index + 1) * CHUNK_BYTES], None)
    assert complete_upload(state.upload_id).name == "big.log"
    assert (incoming_dir(root) / "big.log").read_bytes() == content


def test_a_bad_chunk_is_refused_and_can_be_sent_again(root: Path) -> None:
    content = log_bytes()
    state = create_upload(UploadRequest(filename="up.log", size_bytes=len(content)))
    with pytest.raises(RunError) as caught:
        write_chunk(state.upload_id, 0, content, "0" * 64)
    assert caught.value.code == "chunk_checksum"
    with pytest.raises(RunError):
        write_chunk(state.upload_id, 0, content[:-1], None)
    with pytest.raises(RunError):
        write_chunk(state.upload_id, 5, content, None)
    assert write_chunk(state.upload_id, 0, content, None).complete


def test_upload_limits_format_and_cancel(root: Path) -> None:
    for request, code in (
        (UploadRequest(filename="a.log", size_bytes=0), "empty_file"),
        (UploadRequest(filename="a.log", size_bytes=MAX_UPLOAD_BYTES + 1), "too_large"),
        (UploadRequest(filename="../a.log", size_bytes=5), "invalid_name"),
    ):
        with pytest.raises(RunError) as caught:
            create_upload(request)
        assert caught.value.code == code
    text = b'{"a": 1}\n'
    state = create_upload(UploadRequest(filename="a.jsonl", size_bytes=len(text)))
    with pytest.raises(RunError) as caught:
        write_chunk(state.upload_id, 0, text, None)
    assert caught.value.status == 415
    with pytest.raises(RunError):
        upload_state(state.upload_id)
    other = create_upload(UploadRequest(filename="b.log", size_bytes=10))
    cancel_upload(other.upload_id)
    with pytest.raises(RunError):
        upload_state(other.upload_id)
    with pytest.raises(RunError):
        upload_state("../../etc")


def test_upload_does_not_overwrite_an_existing_file(root: Path) -> None:
    place(root, "up.log", b"keep me\n")
    content = log_bytes()
    state = create_upload(UploadRequest(filename="up.log", size_bytes=len(content)))
    write_chunk(state.upload_id, 0, content, None)
    name = complete_upload(state.upload_id).name
    assert name != "up.log" and (incoming_dir(root) / "up.log").read_bytes() == b"keep me\n"


def test_new_data_gets_an_isolated_completed_run_with_a_working_product(root: Path) -> None:
    place(root)
    runner = run_inline(root)
    state = read_state(runner.run_id)
    assert state["dataset_id"].startswith("live-")
    plan = json.loads((run_dir(runner.run_id) / "plan.json").read_text(encoding="utf-8"))
    assert plan["filename"] == "new.log" and plan["source_sha256_verified"] is True
    assert (run_dir(runner.run_id) / "benchmark_receipt.json").is_file()
    assert source_path(datasets()[state["dataset_id"]]).parent == incoming_dir()
    assert (incoming_dir(root) / "new.log").is_file(), "the source is not moved or copied"
    health, _, _ = build_health(runner.run_id)
    assert health.state == "Unconfirmed" and health.incident_count >= 1
    found = search(runner.run_id, "temp1")
    assert found.source_records[0].label == "RAW RECORD" and found.incident_steps
    chain = build_provenance(runner.run_id, evidence_id=found.canonical_events[0].evidence_id)
    assert chain.source_status == "SOURCE VERIFIED" and chain.incident_status == "INCIDENT UNCONFIRMED"
    iid = found.canonical_events[0].incidents[0].incident_id
    manifest = create_case(CaseRequest(run_id=runner.run_id, subject="incident", incident_id=iid))
    assert len(manifest.chapters) == 8 and manifest.dataset_id == state["dataset_id"]


def test_a_collapsed_new_source_becomes_a_quality_case(root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [traffic(DAY, f"10.1.0.{i % 200 + 1}", "198.51.100.1", sid=i, sent=i) for i in range(200)]
    place(root, "flat.log", log_bytes(rows))
    check = preflight("flat.log")
    from halt.firex import live

    live._register(live._dataset_id(check.sha256 or ""), "flat.log", check.sha256 or "", None)
    runner = Runner(live._dataset_id(check.sha256 or ""), root=root, workers=1)
    runner.rules = {**runner.rules, "collapse": {"threshold_records": 50, "config_version": "test"}}
    assert runner.execute()["status"] == "completed"
    health, _, _ = build_health(runner.run_id)
    assert health.reconstruction == "withheld" and health.incident_count == 0
    assert create_case(CaseRequest(run_id=runner.run_id, subject="quality")).status == "Degraded"


def test_removing_the_source_keeps_the_result_and_says_so(root: Path) -> None:
    path = place(root)
    runner = run_inline(root)
    path.unlink()
    found = search(runner.run_id, "temp1")
    assert found.run.source_available is False and found.canonical_events
    assert all(r.label == "CANONICAL EVENT" for r in found.source_records)


def test_duplicate_source_is_detected_across_names(root: Path) -> None:
    place(root)
    run_inline(root)
    place(root, "copy.log")
    check = preflight("copy.log")
    assert check.duplicates and check.warnings
    assert check.duplicates[0]["status"] == "completed"


def test_duplicate_of_another_dataset_needs_confirmation(root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from halt.firex import live

    raw = root / "raw"
    raw.mkdir()
    (raw / "firex-10G.log").write_bytes(log_bytes())
    (root / "registry.json").write_text(
        json.dumps({"other": {"filename": "firex-10G.log", "title": "Other"}}), encoding="utf-8"
    )
    Runner("other", root=root, workers=1).execute()
    place(root)
    with pytest.raises(RunError) as caught:
        start("new.log")
    assert caught.value.code == "duplicate_source"
    monkeypatch.setattr(live.jobs, "start_run", lambda dataset_id, _max, _root: {"dataset_id": dataset_id})
    assert start("new.log", confirm_duplicate=True)["dataset_id"].startswith("live-")


def test_two_new_sources_never_mix(root: Path) -> None:
    place(root, "one.log")
    place(root, "two.log", log_bytes(background(DAY - 100, 30)))
    one = run_inline(root, "one.log")
    two = run_inline(root, "two.log")
    assert (
        one.run_id != two.run_id
        and read_state(one.run_id)["dataset_id"] != read_state(two.run_id)["dataset_id"]
    )
    assert search(one.run_id, "temp1").canonical_events
    assert search(two.run_id, "temp1").not_found
    assert {s["run_id"] for s in list_runs()} == {one.run_id, two.run_id}


def test_interrupted_run_resumes_to_the_same_result(root: Path) -> None:
    place(root)
    check = preflight("new.log")
    from halt.firex import live

    dataset_id = live._dataset_id(check.sha256 or "")
    live._register(dataset_id, "new.log", check.sha256 or "", None)
    runner = Runner(dataset_id, root=root, workers=1)
    runner.dir.mkdir(parents=True, exist_ok=True)
    runner.update(status="running", pid=999_999_9, detail="Working")
    # The recorded process is gone: this is how an API or machine restart looks.
    state = read_state(runner.run_id)
    assert state["status"] == "interrupted" and state["recovered"] is True
    assert Runner(dataset_id, root=root, workers=1).execute()["status"] == "completed"
    assert read_state(runner.run_id)["status"] == "completed"
    with pytest.raises(RunError):
        resume_run("frun-0000000000000000")


def test_source_removed_before_starting_is_reported(root: Path) -> None:
    path = place(root)
    preflight("new.log")
    path.unlink()
    with pytest.raises(RunError) as caught:
        start("new.log")
    assert caught.value.status == 404


def test_routes_answer_and_validate(root: Path) -> None:
    place(root)
    settings = Settings(db_url="sqlite+pysqlite:///:memory:", signing_key_path=str(root / "key.pem"))
    with TestClient(create_app(settings)) as client:
        base = "/api/v1/ps2/live"
        listing: Any = client.get(f"{base}/files").json()
        assert listing["items"][0]["name"] == "new.log" and listing["incoming_path"]
        assert client.get(f"{base}/files/new.log/preflight").json()["can_start"] is True
        assert client.get(f"{base}/files/..%2Fsecret/preflight").status_code in (404, 422)
        assert client.get(f"{base}/files/missing.log/preflight").status_code == 404
        made = client.post(
            f"{base}/uploads", json={"filename": "u.log", "size_bytes": len(log_bytes())}
        ).json()
        url = f"{base}/uploads/{made['upload_id']}"
        sent = client.put(
            f"{url}/chunks/0",
            content=log_bytes(),
            headers={"x-chunk-sha256": hashlib.sha256(log_bytes()).hexdigest()},
        )
        assert sent.status_code == 200 and sent.json()["complete"] is True
        assert client.get(url).json()["received_chunks"] == [0]
        assert client.post(f"{url}/complete").json()["name"] == "u.log"
        over = client.post(f"{base}/uploads", json={"filename": "o.log", "size_bytes": 10}).json()
        big = client.put(f"{base}/uploads/{over['upload_id']}/chunks/0", content=b"x" * (CHUNK_BYTES + 5))
        assert big.status_code in (413, 422)
        assert client.delete(f"{base}/uploads/{over['upload_id']}").status_code == 204


VENDOR = (
    b'{"occurred_at":"2026-11-01T08:00:00Z","client_ip":"203.0.113.21","server_ip":"10.0.0.12",'
    b'"principal":"maya","operation":"login","result":"success"}\n'
    b'{"occurred_at":"2026-11-01T08:02:10Z","client_ip":"203.0.113.21","server_ip":"10.0.0.12",'
    b'"principal":"maya","operation":"download","result":"success"}\n'
)


@pytest.fixture
def adaptive_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HALT_ADAPTIVE_INTAKE", "1")


def test_adaptive_is_off_by_default_and_changes_nothing(root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HALT_ADAPTIVE_INTAKE", raising=False)
    place(root, "vendor.jsonl", VENDOR)
    listing = list_files()
    assert listing.adaptive_enabled is False and listing.items[0].profilable is False
    assert not listing.items[0].selectable
    with pytest.raises(RunError) as caught:
        profile("vendor.jsonl")
    assert caught.value.status == 404 and caught.value.code == "adaptive_disabled"


def test_adaptive_profiles_an_unfamiliar_file_and_cannot_start_it(root: Path, adaptive_on: None) -> None:
    source = place(root, "vendor.jsonl", VENDOR)
    before = source.read_bytes()
    listing = list_files()
    assert listing.adaptive_enabled and listing.items[0].profilable
    found = profile("vendor.jsonl")
    assert found.format == "jsonl" and found.can_analyse is False and "cannot analyse" in found.statement
    assert "not an analysis" in found.statement
    mapped = {m.proposed_field: m for m in found.mappings}
    assert mapped["source.ip"].source_field == "client_ip" and mapped["source.ip"].halt_field == "src_ip"
    assert mapped["event.timestamp"].halt_field == "event_ns"
    assert found.schema_fingerprint and found.parsed_records == 2
    assert source.read_bytes() == before, "profiling does not change the file"
    assert not (root / "results").exists() or not list(runs_dir_of(root).glob("*")), (
        "profiling creates no run"
    )
    with pytest.raises(RunError) as caught:
        start("vendor.jsonl")
    assert caught.value.status == 415, "a good profile does not make a file analysable"


def runs_dir_of(root: Path) -> Path:
    return root / "results" / "firex-runs"


def test_adaptive_never_guesses_for_a_fortigate_file(root: Path, adaptive_on: None) -> None:
    place(root)
    found = profile("new.log")
    assert found.can_analyse is True and "not used by that parser" in found.statement
    assert preflight("new.log").can_start is True


def test_adaptive_withholds_without_time_and_says_why(root: Path, adaptive_on: None) -> None:
    place(root, "notime.jsonl", b'{"client_ip":"203.0.113.3","username":"a","operation":"login"}\n')
    found = profile("notime.jsonl")
    assert found.structure_state == "reconstruction_withheld"
    assert "trustworthy timestamp" in found.missing_requirements


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("deep.jsonl", b'{"a":' * 3000 + b"1" + b"}" * 3000 + b"\n"),
        ("hugefield.csv", b"a,b,c\n" + b"x" * 300_000 + b",2,3\n" + b"4,5,6\n" + b"7,8,9\n"),
        ("binary.dat", bytes(range(256)) * 200),
        ("oneline.txt", b"just words\n"),
    ],
    ids=["deep-json", "huge-csv-field", "binary", "plain-text"],
)
def test_adaptive_survives_hostile_and_malformed_files(
    root: Path, adaptive_on: None, name: str, content: bytes
) -> None:
    place(root, name, content)
    found = profile(name)
    assert found.can_analyse is False and found.structure_state in (
        "unsupported",
        "reconstruction_withheld",
        "searchable_only",
        "mapping_required",
        "supported",
    )


@pytest.mark.parametrize("bad", ["../secret.log", "..", "a/b.log", "C:\\x.log", ".hidden"])
def test_adaptive_refuses_paths(root: Path, adaptive_on: None, bad: str) -> None:
    (root / "secret.log").write_bytes(log_bytes())
    place(root)
    with pytest.raises(RunError) as caught:
        profile(bad)
    assert caught.value.status in (404, 422)


def test_adaptive_refuses_an_empty_file_and_exposes_no_server_path(root: Path, adaptive_on: None) -> None:
    place(root, "empty.log", b"")
    with pytest.raises(RunError):
        profile("empty.log")
    place(root, "vendor.jsonl", VENDOR)
    assert str(root) not in profile("vendor.jsonl").model_dump_json()


def test_adaptive_route(root: Path, adaptive_on: None) -> None:
    place(root, "vendor.jsonl", VENDOR)
    settings = Settings(db_url="sqlite+pysqlite:///:memory:", signing_key_path=str(root / "key.pem"))
    with TestClient(create_app(settings)) as client:
        answer = client.get("/api/v1/ps2/live/files/vendor.jsonl/profile")
        assert answer.status_code == 200 and answer.json()["can_analyse"] is False


def test_a_near_miss_log_says_what_is_missing_and_is_not_analysed(root: Path) -> None:
    no_tz = log_bytes().replace(b'tz="+0530" ', b"")
    place(root, "no-tz.log", no_tz)
    item = next(f for f in list_files().items if f.name == "no-tz.log")
    assert item.detected_format == "key_value_other" and not item.selectable
    assert "missing: tz" in (item.problem or "")
    check = preflight("no-tz.log")
    assert not check.can_start and "missing: tz" in check.problems[0].message
    with pytest.raises(RunError) as caught:
        start("no-tz.log")
    assert caught.value.status == 415


def test_a_syslog_prefix_is_explained_and_not_guessed_around(root: Path) -> None:
    prefixed = b"\n".join(b"<189>" + ln for ln in log_bytes().splitlines()) + b"\n"
    place(root, "syslog.log", prefixed)
    item = next(f for f in list_files().items if f.name == "syslog.log")
    assert item.detected_format == "key_value_other" and "must start with date=" in (item.problem or "")


def test_a_near_miss_upload_is_refused_with_the_same_reason(root: Path) -> None:
    content = log_bytes().replace(b'tz="+0530" ', b"")
    state = create_upload(UploadRequest(filename="no-tz.log", size_bytes=len(content)))
    with pytest.raises(RunError) as caught:
        write_chunk(state.upload_id, 0, content, None)
    assert caught.value.status == 415 and "missing: tz" in str(caught.value)


def test_a_run_is_never_completed_before_its_receipt_is_sealed(
    root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A page that reads the verdict the moment a run completes must not be told the seal is missing."""
    from halt.firex import receipts

    place(root)
    real = receipts.write_benchmark
    seen: dict[str, Any] = {}

    def watched(runner: Any, *args: Any) -> dict[str, Any]:
        state = runner.state()
        seen.update(status=state["status"], completed_at=state.get("completed_at"), metrics=state["metrics"])
        return real(runner, *args)

    monkeypatch.setattr(receipts, "write_benchmark", watched)
    runner = run_inline(root)
    assert seen["status"] != "completed", "the run said completed before the receipt existed"
    state = read_state(runner.run_id)
    assert state["status"] == "completed" and state["stage"] == "done" and state["pid"] is None
    receipt = json.loads((run_dir(runner.run_id) / "benchmark_receipt.json").read_text(encoding="utf-8"))
    assert receipt["completed_at"] == seen["completed_at"] == state["completed_at"]
    assert receipt["records_valid"] == seen["metrics"]["canonical_records"]
    assert build_health(runner.run_id)[0].dimensions[1].status == "Verified"
