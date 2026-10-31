"""Dataset health, Trust Centre, quality case and case manifests: read-only derivations over stored runs."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from halt.firex.cases import create_case, list_candidates, read_case
from halt.firex.contracts import CaseRequest
from halt.firex.jobs import RunError
from halt.firex.pipeline import Runner
from halt.firex.trust import build_facts, build_health, build_quality_case, build_trust
from tests.firex_support import DAY, admin, background, line, run_fixture, traffic

BASE = "/api/v1/ps2"
COLLAPSE = {"collapse": {"threshold_records": 50, "config_version": "test"}}


def lifecycle() -> list[str]:
    src = "203.0.113.9"
    return [
        admin(DAY, "ops", src, action="Add", status=None, msg="Add system.admin temp1", logid="0100044547"),
        admin(DAY + 60, "temp1", src),
        admin(
            DAY + 120,
            "ops",
            src,
            action="Delete",
            status=None,
            msg="Delete system.admin temp1",
            logid="0100044547",
        ),
    ]


def collapsed_source() -> list[str | bytes]:
    return [
        b'name"\n',
        *[traffic(DAY, f"10.1.0.{i % 200 + 1}", "198.51.100.1", sid=i, sent=i) for i in range(200)],
        b"\x90\xff binary tail\n" * 400,
    ]


@pytest.fixture
def root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    data = tmp_path / "data"
    monkeypatch.setenv("HALT_FIREX_DATA_ROOT", str(data))
    yield data


@pytest.fixture
def normal(root: Path) -> Runner:
    return run_fixture(root, [*background(DAY - 100, 20), *lifecycle()])


@pytest.fixture
def withheld(root: Path) -> Runner:
    return run_fixture(root, collapsed_source(), rules=COLLAPSE)


def dimension(health, name):  # noqa: ANN001, ANN201
    return next(d for d in health.dimensions if d.id == name)


def snapshot(folder: Path) -> dict[str, str]:
    return {
        str(p.relative_to(folder)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(folder.rglob("*"))
        if p.is_file() and p.name != "run.json" and "duck_tmp" not in p.parts
    }


def test_incidents_stay_unconfirmed_with_verified_source_and_processing(normal: Runner) -> None:
    health, proofs, _ = build_health(normal.run_id)
    assert health.state == "Unconfirmed" and health.reconstruction == "ran" and health.incident_count == 1
    assert dimension(health, "source").status == "Verified"
    assert dimension(health, "processing").status == "Verified"
    assert dimension(health, "reconstruction").status == "Needs review"
    assert dimension(health, "ground_truth").status == "Not measured"
    assert "unconfirmed" in health.headline and "ground truth" in health.explanation
    assert [p.seal_valid for p in proofs] == [True]


def test_collapsed_source_is_degraded_and_withheld(withheld: Runner) -> None:
    health, _, _ = build_health(withheld.run_id)
    assert health.state == "Degraded" and health.reconstruction == "withheld" and health.incident_count == 0
    assert dimension(health, "source").status == "Verified"
    assert dimension(health, "processing").status == "Verified"
    assert "no trustworthy time axis" in health.headline
    assert "Zero incidents does not mean zero threats" in health.explanation
    assert health.incident_open_latency_ms is None and health.incident_open_latency_label == "Not applicable"
    assert health.quarantined_fraction and health.valid_fraction


def test_withheld_language_never_reads_as_clean(withheld: Runner) -> None:
    report = build_trust(withheld.run_id).model_dump_json().lower()
    for phrase in ("no threats found", "no threats", "is safe", "clean dataset", "0 ms"):
        assert phrase not in report


def test_no_incidents_with_usable_time_is_not_called_clean(root: Path) -> None:
    runner = run_fixture(root, background(DAY, 30))
    health, _, _ = build_health(runner.run_id)
    assert health.state == "Unconfirmed" and health.reconstruction == "ran"
    assert "not proof that the data is clean" in health.explanation


def test_partly_collapsed_source_runs_but_discloses_it(root: Path) -> None:
    rows = [
        *background(DAY - 1000, 100),
        *[traffic(DAY, "10.1.0.1", "198.51.100.1", sid=i, sent=i) for i in range(60)],
    ]
    runner = run_fixture(root, rows, rules=COLLAPSE)
    health, _, _ = build_health(runner.run_id)
    assert health.reconstruction == "ran" and "60 of 160" in health.reconstruction_reason
    assert dimension(health, "reconstruction").status == "Needs review"


def test_tampered_receipt_fails_processing_and_overall(normal: Runner) -> None:
    path = normal.dir / "benchmark_receipt.json"
    doc = json.loads(path.read_text())
    doc["records_valid"] = 999
    path.write_text(json.dumps(doc))
    health, _, _ = build_health(normal.run_id)
    assert health.state == "Failed" and dimension(health, "processing").status == "Failed"


def test_sample_run_does_not_claim_a_verified_source(root: Path) -> None:
    lines = background(DAY, 100)
    run_fixture(root, list(lines))
    sample = Runner("fixture", max_bytes=5000, root=root, workers=1)
    assert sample.execute()["status"] == "completed"
    health, _, _ = build_health(sample.run_id)
    assert health.is_sample is True and dimension(health, "source").status == "Not measured"


def test_trust_report_lists_proofs_and_artifacts(normal: Runner) -> None:
    report = build_trust(normal.run_id)
    assert report.benchmark_seal_valid is True and report.seal_algorithm == "sha256-canonical-json"
    assert "detections.json" in report.artifact_hashes
    labels = {i.label for d in report.health.dimensions for i in d.items}
    assert {"Source hash", "Git commit", "Evidence coverage", "Time-zone conflict", "Accuracy"} <= labels


def test_quality_case_only_for_withheld_runs_and_has_no_graph(normal: Runner, tmp_path: Path) -> None:
    with pytest.raises(RunError):
        build_quality_case(normal.run_id)


def test_quality_case_facts(withheld: Runner) -> None:
    case = build_quality_case(withheld.run_id)
    assert case.collapsed_records == case.canonical_records == 200
    assert case.bytes_valid + case.bytes_quarantined + case.bytes_blank == case.source_bytes
    assert case.declared_tz == ["+0530"] and case.segments
    assert "trustworthy time axis" in case.withheld_statement and "zero threats" in case.zero_statement
    assert "graph" not in case.model_dump()


def test_candidates_explain_a_recommendation_without_confirming(normal: Runner) -> None:
    result = list_candidates(normal.run_id)
    [only] = result.items
    assert only.recommended is True and only.status == "unconfirmed" and only.components
    assert only.score == round(sum(c.value * c.weight for c in only.components), 3)
    assert "does not mean" in result.note and result.quality_case_available is False


def test_incident_case_is_deterministic_and_leaves_the_run_unchanged(normal: Runner) -> None:
    before = snapshot(normal.dir)
    [summary] = json.loads((normal.dir / "incidents" / "index.json").read_text())
    request = CaseRequest(run_id=normal.run_id, subject="incident", incident_id=summary["incident_id"])
    one, two = create_case(request), create_case(request)
    assert one == two and one.case_id.startswith("fcase-")
    assert snapshot(normal.dir) == before
    assert read_case(one.case_id) == one
    assert [c.chapter_id for c in one.chapters] == [
        "situation",
        "entry",
        "progression",
        "evidence",
        "uncertainty",
        "reachable",
        "verification",
        "closing",
    ]
    assert one.status == "Unconfirmed" and one.chapters[0].camera.shot == "establish"
    assert all(c.presenter_notes for c in one.chapters) and one.llm_notes is None
    assert "created_at" not in one.model_dump()


def test_case_evidence_references_exist_in_the_incident(normal: Runner) -> None:
    [summary] = json.loads((normal.dir / "incidents" / "index.json").read_text())
    case = create_case(
        CaseRequest(run_id=normal.run_id, subject="incident", incident_id=summary["incident_id"])
    )
    stored = json.loads((normal.dir / "incidents" / summary["incident_id"] / "detail.json").read_text())
    valid = {e["evidence_id"] for e in stored["evidence"]}
    refs = {r for c in case.chapters for r in c.evidence_refs}
    assert refs and refs <= valid


def test_quality_case_manifest_has_no_attack_visuals(withheld: Runner) -> None:
    case = create_case(CaseRequest(run_id=withheld.run_id, subject="quality"))
    assert case.status == "Degraded" and case.incident_id is None
    assert len(case.chapters) == 8 and all(c.visual != "world" for c in case.chapters)
    assert case.chapters[3].chapter_id == "collapse"
    text = case.model_dump_json().lower()
    assert "no threats found" not in text


def test_quality_case_refused_for_a_normal_run(normal: Runner) -> None:
    with pytest.raises(RunError):
        create_case(CaseRequest(run_id=normal.run_id, subject="quality"))


def test_incident_case_needs_a_real_incident(normal: Runner) -> None:
    with pytest.raises(RunError):
        create_case(CaseRequest(run_id=normal.run_id, subject="incident", incident_id="finc-000000000000"))
    with pytest.raises(RunError):
        create_case(CaseRequest(run_id=normal.run_id, subject="incident"))


def test_facts_use_completed_whole_file_runs_only(root: Path) -> None:
    run_fixture(root, [*background(DAY, 100), line(DAY, srcip="10.0.0.1")])
    Runner("fixture", max_bytes=2000, root=root, workers=1).execute()
    facts = build_facts()
    assert len(facts.items) == 1 and "Not a performance guarantee" in facts.note
    assert facts.items[0].source_bytes > 2000


def test_facts_empty_without_runs(root: Path) -> None:
    assert build_facts().items == []


def test_production_holds_no_stored_run_or_incident_ids() -> None:
    package = Path(__file__).resolve().parents[1] / "halt" / "firex"
    for path in [*package.rglob("*.py"), *package.rglob("*.json")]:
        text = path.read_text(encoding="utf-8")
        assert "frun-6" not in text and "finc-1" not in text and "finc-2" not in text, path


def test_api_serves_health_trust_quality_cases_and_facts(client: TestClient, withheld: Runner) -> None:
    rid = withheld.run_id
    health = client.get(f"{BASE}/runs/{rid}/health").json()
    assert health["state"] == "Degraded"
    trust = client.get(f"{BASE}/runs/{rid}/trust").json()
    assert trust["health"]["reconstruction"] == "withheld" and trust["benchmark_seal_valid"] is True
    assert client.get(f"{BASE}/runs/{rid}/quality-case").json()["collapsed_records"] == 200
    candidates = client.get(f"{BASE}/runs/{rid}/case-candidates").json()
    assert candidates["items"] == [] and candidates["quality_case_available"] is True
    case = client.post(f"{BASE}/cases", json={"run_id": rid, "subject": "quality"}).json()
    assert client.get(f"{BASE}/cases/{case['case_id']}").json() == case
    assert client.get(f"{BASE}/facts").json()["items"][0]["reconstruction"] == "withheld"
    assert client.get(f"{BASE}/cases/fcase-0000").status_code == 404
    assert client.get(f"{BASE}/cases/..%2Fx").status_code == 404
    assert client.post(f"{BASE}/cases", json={"run_id": "../x", "subject": "quality"}).status_code == 422


def test_guide_explains_every_step_and_only_recommends_checks(normal: Runner) -> None:
    from halt.firex.guide import build_guide

    [summary] = json.loads((normal.dir / "incidents" / "index.json").read_text())
    folder = normal.dir / "incidents" / summary["incident_id"]
    guide = build_guide(folder)
    graph = json.loads((folder / "graph.json").read_text())
    path = [
        n["node_id"]
        for n in sorted((n for n in graph["nodes"] if n["on_selected_path"]), key=lambda n: n["order"])
    ]
    assert [g.node_id for g in guide.steps] == path
    assert all(
        g.what_happened and g.who and g.evidence and g.why_it_matters and g.uncertain and g.check_next
        for g in guide.steps
    )
    assert "earliest evidence" in guide.steps[0].uncertain and "inferred" in guide.steps[1].uncertain
    kinds = {c.kind for c in guide.next_checks}
    assert {"inspect_records", "validate_identity", "compare_hypothesis"} <= kinds
    assert "has not taken any action" in guide.note
    text = guide.model_dump_json().lower()
    for word in ("blocked the", "was contained", "has been remediated", "isolate the", "disable the account"):
        assert word not in text
    valid = {e["evidence_id"] for e in json.loads((folder / "detail.json").read_text())["evidence"]}
    assert {r for c in guide.next_checks for r in c.evidence_refs} <= valid
    assert build_guide(folder) == guide


def test_guide_reports_reachable_only_when_recorded(root: Path) -> None:
    from halt.firex.guide import build_guide

    host = "10.1.0.44"
    lines = [
        *[
            traffic(
                DAY + i,
                host,
                f"10.20.0.{i + 1}",
                srcrole="lan",
                dstrole="dmz",
                port=445,
                service="SMB",
                sid=500 + i,
            )
            for i in range(15)
        ],
        traffic(
            DAY + 50, host, "10.30.0.9", srcrole="lan", dstrole="lan", port=8080, service="HTTP", sid=950
        ),
    ]
    runner = run_fixture(root, lines)
    [summary] = json.loads((runner.dir / "incidents" / "index.json").read_text())
    guide = build_guide(runner.dir / "incidents" / summary["incident_id"])
    [check] = [c for c in guide.next_checks if c.kind == "review_reachable"]
    assert "10.30.0.9" in check.action and "not observed" in check.reason


def test_api_serves_the_guide(client: TestClient, normal: Runner) -> None:
    [summary] = json.loads((normal.dir / "incidents" / "index.json").read_text())
    body = client.get(f"{BASE}/incidents/{summary['incident_id']}/guide").json()
    assert body["steps"] and body["next_checks"]
