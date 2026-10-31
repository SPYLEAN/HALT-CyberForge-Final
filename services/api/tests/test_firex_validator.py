"""Validator isolation, validator metrics and receipt seals."""

from __future__ import annotations

import ast
import json
from pathlib import Path

from halt.firex.receipts import make_proof, measure_open_latency, verify_seal
from halt.firex.util import read_json, seal_of
from tests.firex_support import DAY, admin, background, run_fixture
from validation.firex_validator import CASE_SPECS, build_expected_cases, validate

PACKAGE = Path(__file__).resolve().parents[1] / "halt"
FORBIDDEN_TEXT = (
    "candidate_patterns",
    "candidate_followup",
    "validation_expected_cases",
    "firex_validator",
    "validation_metrics",
    "planted",
)


def production_files() -> list[Path]:
    return [p for p in (PACKAGE / "firex").rglob("*") if p.suffix in (".py", ".json")]


def test_production_never_references_validator_or_candidate_files() -> None:
    offenders = []
    for path in production_files():
        text = path.read_text(encoding="utf-8").lower()
        offenders += [f"{path.name}: {word}" for word in FORBIDDEN_TEXT if word in text]
    assert offenders == []


def test_no_halt_module_imports_the_validation_package() -> None:
    for path in PACKAGE.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert not any(a.name.split(".")[0] == "validation" for a in node.names), path
            if isinstance(node, ast.ImportFrom):
                assert (node.module or "").split(".")[0] != "validation", path


def test_production_hardcodes_no_candidate_identity() -> None:
    """Generic rules: no user name or address the profile surfaced may appear in the engine or its rules."""
    values = {spec["entity"][1] for spec in CASE_SPECS} | {
        spec["timeline"] for spec in CASE_SPECS if "timeline" in spec
    }
    assert len(values) > 8
    for path in production_files():
        text = path.read_text(encoding="utf-8")
        assert not [v for v in values if v in text], path


def test_seal_detects_any_change_and_excludes_itself() -> None:
    doc = {"a": 1, "b": {"c": 2}, "seal": ""}
    doc["seal"] = seal_of(doc)
    assert verify_seal(doc).valid
    assert seal_of({**doc, "seal": "other"}) == doc["seal"]
    tampered = {**doc, "a": 2}
    assert not verify_seal(tampered).valid


def test_proof_is_sealed_and_carries_required_fields() -> None:
    plan = {"source_sha256": "a" * 64, "start": 0, "end": 10}
    proof = make_proof(
        incident_id="finc-1",
        run_id="frun-1",
        dataset_id="d",
        plan=plan,
        config_hash="c",
        commit=None,
        graph_hash="g",
        selected_path_id="p",
        evidence_coverage=1.0,
        unsupported_claims=0,
        uncertainty_margin=0.2,
        cited=["ev-b", "ev-a"],
    )
    assert verify_seal(proof).valid
    assert proof["cited_evidence"] == ["ev-a", "ev-b"] and proof["deterministic_replay_id"].startswith(
        "replay-"
    )
    assert proof["status"] == "unconfirmed" and proof["seal_algorithm"] == "sha256-canonical-json"


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


def test_benchmark_receipt_is_complete_and_reports_its_own_run(tmp_path: Path) -> None:
    runner = run_fixture(tmp_path, [*background(DAY - 200, 100), *lifecycle(), b"\xff\xfe junk\n"])
    receipt = read_json(runner.dir / "benchmark_receipt.json")
    assert verify_seal(receipt).valid
    assert receipt["records_valid"] == 103 and receipt["records_rejected"] == 1
    assert receipt["quarantine_segments"] == 1 and receipt["incidents"] == 1
    assert receipt["processed_byte_range"] == [0, runner.path.stat().st_size]
    assert receipt["source_sha256_verified"] is True and receipt["detection_config_hash"]
    assert receipt["host"]["cores"] >= 1 and receipt["host"]["python"]
    assert receipt["status"] == "completed" and receipt["peak_memory_scope"]
    assert (
        receipt["artifact_hashes"]["detections.json"] and receipt["artifact_hashes"]["incidents/index.json"]
    )
    assert receipt["incident_open_latency_ms"] == receipt["incident_open_latency_ms"]
    assert measure_open_latency(runner.dir) is not None
    assert "Bearer" not in json.dumps(receipt)


def test_incident_proof_verifies_and_cites_only_stored_evidence(tmp_path: Path) -> None:
    runner = run_fixture(tmp_path, lifecycle())
    [summary] = read_json(runner.dir / "incidents" / "index.json")
    folder = runner.dir / "incidents" / summary["incident_id"]
    proof, detail, graph = (
        read_json(folder / "proof.json"),
        read_json(folder / "detail.json"),
        read_json(folder / "graph.json"),
    )
    assert verify_seal(proof).valid and proof["graph_hash"] == graph["graph_hash"]
    assert set(proof["cited_evidence"]) <= {e["evidence_id"] for e in detail["evidence"]}
    assert proof["evidence_coverage"] == 1.0 and proof["unsupported_claims"] == 0


def test_validator_scores_a_fixture_run_with_numerators_and_denominators(tmp_path: Path) -> None:
    runner = run_fixture(tmp_path, lifecycle())
    cases = [
        {
            "case_id": "hit",
            "rule_id": "account_lifecycle",
            "entity_kind": "users",
            "entity": "temp1",
            "stage": "installation",
            "expected_steps": 3,
            "first_offset": 0,
        },
        {
            "case_id": "miss",
            "rule_id": "internal_fanout",
            "entity_kind": "src_ips",
            "entity": "10.0.0.9",
            "stage": "lateral_movement",
            "expected_steps": 1,
            "first_offset": 0,
        },
        {
            "case_id": "beyond",
            "rule_id": "sustained_dns",
            "entity_kind": "src_ips",
            "entity": "10.0.0.8",
            "stage": "command_and_control",
            "expected_steps": 1,
            "first_offset": 10**12,
        },
    ]
    metrics, actual = validate(runner.dir, cases)
    assert metrics["cases_in_processed_range"] == 2
    assert (
        metrics["candidate_steps_detected"]["numerator"],
        metrics["candidate_steps_detected"]["denominator"],
    ) == (1, 2)
    assert metrics["labels_correct"]["value"] == 1.0
    assert metrics["paths_recovered"]["numerator"] == 1
    assert metrics["incidents_matching_no_candidate"]["numerator"] == 0
    assert "not organiser ground truth" in metrics["notice"]
    assert {o["case_id"]: o["in_processed_range"] for o in actual["outcomes"]}["beyond"] is False


def test_expected_cases_read_offsets_from_followup_only() -> None:
    followup = {
        "entity_timelines": {
            spec["timeline"]: {"rows": [{"offset": 5}]} for spec in CASE_SPECS if "timeline" in spec
        },
        "groups": {spec["group"]: {"first_offset": 7} for spec in CASE_SPECS if "group" in spec},
    }
    cases = build_expected_cases(followup)
    assert len(cases) == len(CASE_SPECS) and all(c["status"].startswith("unconfirmed") for c in cases)
    assert {c["first_offset"] for c in cases} == {5, 7}
