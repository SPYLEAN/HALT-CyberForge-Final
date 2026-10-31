"""SourceTrace: search and provenance over stored runs. Every tampered copy lives in a temporary data root."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from halt.config import Settings
from halt.firex.contracts import ReviewRequest
from halt.firex.jobs import RunError, run_dir
from halt.firex.pipeline import Runner
from halt.firex.registry import source_path
from halt.firex.reviews import add_review, chain_valid, latest_reviews, review_list
from halt.firex.trace import NOT_FOUND, build_provenance, build_summary, search, suggest
from halt.firex.util import read_json
from halt.main import create_app
from tests.firex_support import DAY, admin, background, run_fixture, traffic

ADMIN_SRC = "203.0.113.9"
COLLAPSE = {"collapse": {"threshold_records": 50, "config_version": "test"}}
REAL_ROOT = Path("C:/HALT-DATA")
REAL_10G = "frun-69553b2c1dfeb3fe"


def lifecycle() -> list[str]:
    return [
        admin(
            DAY, "ops", ADMIN_SRC, action="Add", status=None, msg="Add system.admin temp1", logid="0100044547"
        ),
        admin(DAY + 60, "temp1", ADMIN_SRC),
        admin(
            DAY + 120,
            "ops",
            ADMIN_SRC,
            action="Delete",
            status=None,
            msg="Delete system.admin temp1",
            logid="0100044547",
        ),
    ]


@pytest.fixture
def root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    data = tmp_path / "data"
    monkeypatch.setenv("HALT_FIREX_DATA_ROOT", str(data))
    yield data


@pytest.fixture
def run(root: Path) -> Runner:
    return run_fixture(root, [*background(DAY - 100, 20), *lifecycle()])


def tamper(path: Path, change: Any) -> None:
    doc = read_json(path)
    change(doc)
    path.write_text(json.dumps(doc), encoding="utf-8")


def incident_of(runner: Runner) -> str:
    return str(read_json(run_dir(runner.run_id) / "incidents" / "index.json")[0]["incident_id"])


def gate(chain: Any, check: str) -> str:
    return str(next(c.status for c in chain.gate if c.id == check))


def snapshot(folder: Path) -> dict[str, str]:
    return {
        str(p.relative_to(folder)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(folder.rglob("*"))
        if p.is_file() and p.name != "run.json" and "duck_tmp" not in p.parts
    }


def test_finds_the_account_with_its_sign_in_and_deletion(run: Runner) -> None:
    found = search(run.run_id, "temp1")
    assert found.value_kind == "account" and "not a file" in (found.value_note or "")
    messages = [r.fields.get("message", "") for r in found.canonical_events]
    assert any("Add system.admin temp1" in m for m in messages)
    assert any("Delete system.admin temp1" in m for m in messages)
    assert any(r.fields.get("user") == "temp1" for r in found.canonical_events), "the sign-in record"
    assert all(r.label == "RAW RECORD" and r.raw_status == "verified" for r in found.source_records)
    assert all(r.incidents and r.incidents[0].status == "unconfirmed" for r in found.canonical_events)
    assert found.detections and found.incident_steps and found.proof_receipts and found.graph_relationships
    assert found.run.source_sha256 and found.run.dataset_id == "fixture"


def test_source_line_and_fields_are_correct(run: Runner) -> None:
    found = search(run.run_id, "temp1")
    line = next(r for r in found.source_records if "Add system.admin temp1" in (r.excerpt or ""))
    source = source_path_of(run).read_bytes().splitlines()
    assert line.line is not None and b"Add system.admin temp1" in source[line.line - 1]
    by_line = search(run.run_id, f"{line.line:,}")
    assert by_line.read_as == "source line" and by_line.canonical_events[0].line == line.line
    event = by_line.canonical_events[0]
    assert (
        event.fields["user"] == "ops"
        and event.fields["src_ip"] == ADMIN_SRC
        and event.fields["action"] == "Add"
    )


def source_path_of(runner: Runner) -> Path:
    return source_path(runner.dataset, runner.root)


def test_a_complete_chain_is_source_verified_and_stays_unconfirmed(run: Runner) -> None:
    before = snapshot(run_dir(run.run_id))
    event = search(run.run_id, "temp1").canonical_events[0]
    chain = build_provenance(run.run_id, evidence_id=event.evidence_id)
    assert chain.source_status == "SOURCE VERIFIED"
    assert chain.incident_status == "INCIDENT UNCONFIRMED"
    assert chain.relationship_status == "RELATIONSHIP INFERRED"
    assert [s.id for s in chain.stages] == [
        "source",
        "parser",
        "canonical",
        "dedupe",
        "detection",
        "relationship",
        "hypothesis",
        "statement",
        "proof",
    ]
    assert all(s.plain and s.input and s.transformation and s.output for s in chain.stages)
    assert all(c.status != "failed" for c in chain.gate) and chain.failed_link is None
    assert "unconfirmed" in chain.plain
    assert snapshot(run_dir(run.run_id)) == before, "SourceTrace writes nothing into the run"


def test_no_cross_run_contamination(root: Path) -> None:
    one = run_fixture(root, [*background(DAY - 100, 20), *lifecycle()])
    two = run_fixture(root, background(DAY - 100, 30))
    assert one.run_id != two.run_id
    found = search(two.run_id, "temp1")
    assert found.not_found == NOT_FOUND and found.run.run_id == two.run_id
    event = search(one.run_id, "temp1").canonical_events[0]
    with pytest.raises(RunError):
        build_provenance(two.run_id, evidence_id=event.evidence_id)


def test_missing_source_keeps_canonical_evidence_and_says_so(run: Runner) -> None:
    source_path_of(run).unlink()
    found = search(run.run_id, "temp1")
    assert found.run.source_available is False
    assert found.canonical_events and all(r.label == "CANONICAL EVENT" for r in found.source_records)
    assert all(r.excerpt is None and r.raw_status == "unavailable" for r in found.source_records)
    chain = build_provenance(run.run_id, evidence_id=found.canonical_events[0].evidence_id)
    assert chain.source_status == "SOURCE UNAVAILABLE" and chain.failed_link is None
    assert gate(chain, "source_record") == "unavailable"
    assert build_summary(run.run_id).status == "SOURCE UNAVAILABLE"
    assert build_summary(run.run_id).verified_records == 0


def test_invalid_line_reference_fails_and_is_not_counted(run: Runner) -> None:
    iid = incident_of(run)
    detail = run_dir(run.run_id) / "incidents" / iid / "detail.json"
    tamper(detail, lambda d: d["evidence"][0].__setitem__("line", 999_999))
    chain = build_provenance(run.run_id, incident_id=iid)
    assert chain.source_status == "PROVENANCE FAILED" and gate(chain, "origin") == "failed"
    assert "line" in (chain.plain + (chain.failed_link or "")).lower()
    summary = build_summary(run.run_id)
    assert summary.status == "PROVENANCE FAILED" and summary.failed_incidents == 1
    assert summary.verified_records == 0
    assert summary.incidents[0].failed_links


def test_source_hash_mismatch_fails(run: Runner) -> None:
    iid = incident_of(run)
    tamper(
        run_dir(run.run_id) / "incidents" / iid / "proof.json",
        lambda d: d.__setitem__("source_sha256", "0" * 64),
    )
    chain = build_provenance(run.run_id, incident_id=iid)
    assert chain.source_status == "PROVENANCE FAILED" and gate(chain, "source_hash") == "failed"


def test_changed_source_bytes_are_not_shown_as_raw(run: Runner) -> None:
    path = source_path_of(run)
    data = path.read_bytes()
    path.write_bytes(data.replace(b"temp1", b"tempX"))
    found = search(run.run_id, "temp1")
    assert all(r.label != "RAW RECORD" and r.raw_status == "mismatch" for r in found.source_records)
    chain = build_provenance(run.run_id, evidence_id=found.canonical_events[0].evidence_id)
    assert chain.source_status == "PROVENANCE FAILED" and gate(chain, "source_record") == "failed"


def test_deduplicated_record_is_reported(root: Path) -> None:
    repeated = traffic(DAY, "10.1.0.5", "198.51.100.5", sid=77, sent=5)
    runner = run_fixture(root, [*background(DAY - 100, 5), repeated, repeated])
    rows = search(runner.run_id, "198.51.100.5").canonical_events
    assert [r.duplicate for r in rows] == [False, True]
    chain = build_provenance(runner.run_id, evidence_id=rows[1].evidence_id)
    assert next(s for s in chain.stages if s.id == "dedupe").plain.startswith("This record repeats")


def test_quarantined_line_is_labelled_and_not_invented(root: Path) -> None:
    rows: list[str | bytes] = [*background(DAY - 100, 5), b"\x90\xff binary junk\n", *background(DAY - 50, 5)]
    runner = run_fixture(root, rows)
    found = search(runner.run_id, "6")
    assert found.read_as == "source line"
    record = found.source_records[0]
    assert record.state == "quarantined" and record.evidence_id is None and record.quarantine_reason
    assert record.label == "STORED SOURCE EXCERPT" and not found.canonical_events


def test_edge_classification_decides_the_relationship(run: Runner) -> None:
    iid = incident_of(run)
    graph = read_json(run_dir(run.run_id) / "incidents" / iid / "graph.json")
    inferred = next(e for e in graph["edges"] if e["classification"] == "inferred")
    observed = next(e for e in graph["edges"] if e["classification"] == "observed")
    assert (
        build_provenance(run.run_id, incident_id=iid, edge_id=inferred["edge_id"]).relationship_status
        == "RELATIONSHIP INFERRED"
    )
    assert (
        build_provenance(run.run_id, incident_id=iid, edge_id=observed["edge_id"]).relationship_status
        == "RELATIONSHIP OBSERVED"
    )


def test_unsupported_story_statement_fails(run: Runner) -> None:
    iid = incident_of(run)
    story = run_dir(run.run_id) / "incidents" / iid / "story.json"
    tamper(story, lambda d: d["statements"][0].__setitem__("evidence_ids", []))
    statement = read_json(story)["statements"][0]["statement_id"]
    chain = build_provenance(run.run_id, incident_id=iid, statement_id=statement)
    assert chain.source_status == "PROVENANCE FAILED" and gate(chain, "statement") == "failed"
    assert build_summary(run.run_id).status == "PROVENANCE FAILED"


def test_not_found_says_nothing_was_substituted(run: Runner) -> None:
    found = search(run.run_id, "no-such-value-anywhere")
    assert found.complete and found.not_found == NOT_FOUND
    assert "has not substituted data from another dataset" in NOT_FOUND
    assert not found.source_records and not found.incident_steps


def test_pagination_returns_every_record_once(root: Path) -> None:
    rows = [traffic(DAY + i, "10.1.0.5", "198.51.100.9", sid=i, sent=i) for i in range(45)]
    runner = run_fixture(root, rows)
    seen: list[int | None] = []
    cursor = None
    for _ in range(6):
        page = search(runner.run_id, "198.51.100.9", limit=20, cursor=cursor)
        seen += [r.line for r in page.canonical_events]
        cursor = page.next_cursor
        if not cursor:
            break
    assert seen == list(range(1, 46))


def test_invalid_cursor_is_refused(run: Runner) -> None:
    with pytest.raises(RunError):
        search(run.run_id, "temp1", cursor="not-a-cursor")


def test_query_values_cannot_inject_sql(run: Runner) -> None:
    found = search(run.run_id, "x' OR 1=1 --")
    assert found.not_found == NOT_FOUND and not found.canonical_events


def test_incident_detection_node_edge_and_receipt_ids_resolve(run: Runner) -> None:
    iid = incident_of(run)
    folder = run_dir(run.run_id) / "incidents" / iid
    detail, graph, proof = (read_json(folder / f"{n}.json") for n in ("detail", "graph", "proof"))
    assert search(run.run_id, iid).incident_steps
    assert search(run.run_id, detail["detections"][0]["detection_id"]).detections
    assert (
        search(run.run_id, graph["nodes"][-1]["node_id"]).graph_relationships
        or search(run.run_id, graph["nodes"][-1]["node_id"]).incident_steps
    )
    assert search(run.run_id, graph["edges"][0]["edge_id"]).graph_relationships
    assert search(run.run_id, proof["receipt_id"]).proof_receipts
    benchmark = read_json(run_dir(run.run_id) / "benchmark_receipt.json")["receipt_id"]
    assert search(run.run_id, benchmark).proof_receipts[0].kind == "benchmark"
    assert "temp1" in suggest(run.run_id, "temp").values


def test_withheld_source_stays_searchable_without_inventing_an_incident(root: Path) -> None:
    rows: list[str | bytes] = [
        traffic(DAY, f"10.1.0.{i % 200 + 1}", "198.51.100.1", sid=i, sent=i) for i in range(200)
    ]
    runner = run_fixture(root, rows, rules=COLLAPSE)
    found = search(runner.run_id, "198.51.100.1", limit=5)
    assert found.run.narrative == "Reconstruction withheld" and found.run.health_state == "Degraded"
    assert found.canonical_events and not found.incident_steps and not found.detections
    assert all(not r.incidents for r in found.canonical_events)
    assert build_summary(runner.run_id).status == "NOT APPLICABLE"


def test_partial_source_stays_partial_in_search(root: Path) -> None:
    rows: list[str | bytes] = [
        *lifecycle(),
        *background(DAY - 1000, 40),
        *[traffic(DAY + 5000, "10.1.0.1", "198.51.100.1", sid=i, sent=i) for i in range(120)],
    ]
    runner = run_fixture(root, rows, rules=COLLAPSE)
    found = search(runner.run_id, "temp1")
    assert found.run.narrative == "Partial reconstruction from a degraded source"
    assert found.run.health_state == "Degraded" and found.incident_steps


def test_review_is_chained_separate_and_changes_no_sealed_file(run: Runner) -> None:
    before = snapshot(run_dir(run.run_id))
    iid = incident_of(run)
    add_review(
        run.run_id, ReviewRequest(incident_id=iid, decision="Needs more evidence", reason="Check owner.")
    )
    second = add_review(
        run.run_id,
        ReviewRequest(incident_id=iid, decision="Confirmed", reason="Owner confirmed.", analyst="a.n"),
    )
    assert second.original_conclusion == "unconfirmed" and second.seq == 1 and second.analyst == "a.n"
    assert latest_reviews(run.run_id)[iid].decision == "Confirmed"
    assert review_list(run.run_id).chain_valid is True
    assert snapshot(run_dir(run.run_id)) == before
    assert read_json(run_dir(run.run_id) / "incidents" / iid / "proof.json")["status"] == "unconfirmed"
    chain = build_provenance(run.run_id, incident_id=iid)
    assert chain.incident_status == "ANALYST CONFIRMED" and chain.original_conclusion == "unconfirmed"
    assert len(chain.reviews) == 2


def test_a_changed_review_breaks_the_chain(run: Runner) -> None:
    iid = incident_of(run)
    add_review(run.run_id, ReviewRequest(incident_id=iid, decision="False positive", reason="A"))
    path = run_dir(run.run_id).parent.parent / "firex-reviews" / f"{run.run_id}.jsonl"
    entry = json.loads(path.read_text(encoding="utf-8").splitlines()[0])
    assert chain_valid([entry]) is True
    entry["reason"] = "B"
    assert chain_valid([entry]) is False


def test_routes_validate_and_answer(run: Runner) -> None:
    settings = Settings(db_url="sqlite+pysqlite:///:memory:", signing_key_path=str(run.root / "key.pem"))
    with TestClient(create_app(settings)) as client:
        base = f"/api/v1/ps2/runs/{run.run_id}"
        assert client.get(f"{base}/search", params={"q": "temp1"}).status_code == 200
        assert client.get(f"{base}/search", params={"q": "x"}).status_code == 422
        assert client.get(f"{base}/search", params={"q": "temp1", "field": "path"}).status_code == 422
        assert client.get(f"{base}/provenance").status_code == 422
        assert (
            client.get(f"{base}/provenance", params={"incident_id": "finc-000000000000"}).status_code == 404
        )
        assert client.get(f"{base}/provenance-summary").json()["status"] == "SOURCE VERIFIED"
        assert (
            client.post(f"{base}/reviews", json={"decision": "Confirmed", "reason": "x"}).status_code == 422
        )
        assert (
            client.get("/api/v1/ps2/runs/frun-0000000000000000/search", params={"q": "temp1"}).status_code
            == 404
        )


@pytest.mark.skipif(
    not (REAL_ROOT / "results" / "firex-runs" / REAL_10G).is_dir(), reason="the stored 10G run is local"
)
def test_real_10g_svc_backup30(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reads the stored official run. It reruns nothing and writes nothing."""
    monkeypatch.setenv("HALT_FIREX_DATA_ROOT", str(REAL_ROOT))
    found = search(REAL_10G, "svc_backup30")
    assert found.value_kind == "account" and "not a file" in (found.value_note or "")
    add = next(r for r in found.canonical_events if r.line == 3_226_313)
    assert add.fields["user"] == "Rakes" and add.fields["src_ip"] == "203.228.177.117"
    assert add.fields["dst_ip"] == "10.10.99.1" and add.fields["action"] == "Add"
    assert (
        add.fields["message"] == "Add system.admin svc_backup30" and add.event_utc == "2026-10-29T03:55:43Z"
    )
    source = next(r for r in found.source_records if r.line == 3_226_313)
    if source.raw_status == "verified":
        assert source.label == "RAW RECORD" and "Add system.admin svc_backup30" in (source.excerpt or "")
    sign_in = next(r for r in found.canonical_events if r.fields.get("user") == "svc_backup30")
    assert sign_in.line == 3_227_163 and "logged in successfully" in sign_in.fields["message"]
    delete = next(r for r in found.canonical_events if r.fields.get("action") == "Delete")
    assert "Delete system.admin svc_backup30" in delete.fields["message"]
    assert {u.incident_id for r in found.canonical_events for u in r.incidents} == {"finc-18b9ea482583"}
    chain = build_provenance(REAL_10G, evidence_id=add.evidence_id)
    assert (
        chain.incident_status == "INCIDENT UNCONFIRMED"
        and chain.relationship_status == "RELATIONSHIP INFERRED"
    )
    assert chain.failed_link is None and chain.proof_receipt_id
    rule = next(s for s in chain.stages if s.id == "detection")
    assert rule.rule == "account_lifecycle"
