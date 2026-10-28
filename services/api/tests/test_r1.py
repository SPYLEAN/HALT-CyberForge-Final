"""AT-2.4 – AT-2.6: correlation, evidence-backed findings, baseline-model selection."""

from __future__ import annotations

import json
from typing import Any

import pytest

from halt.contracts.events import SecurityEvent
from halt.r1.correlate import enrich, findings, incidents
from halt.r1.model import configured_model
from halt.r1.train_eval import GBM_MARGIN, MODEL_PATH, REPORT_PATH, evaluate
from halt.scenario.loader import load_scenario

INCIDENT_IDS = [f"EV-0{i}" for i in range(1, 7)]


@pytest.fixture(scope="module")
def stream() -> list[SecurityEvent]:
    s = load_scenario()
    return [*s.events, *s.background_events]


def test_AT_2_4_one_incident_with_exactly_the_attack_events(stream: list[SecurityEvent]) -> None:
    found = incidents(stream)
    assert len(found) == 1
    ids = [s.event.id for s in found[0].events]
    assert ids == INCIDENT_IDS
    background = [e for e in stream if e.id.startswith("BG-")]
    linked_bg = [i for i in ids if i.startswith("BG-")]
    assert len(linked_bg) <= 0.01 * len(background)


def test_AT_2_4_detection_ignores_ids(stream: list[SecurityEvent]) -> None:
    """Renaming every event id must not change what is detected."""
    renamed = [e.model_copy(update={"id": f"BG-{9000 - i}"}) for i, e in enumerate(stream)]
    original = {s.event.source.record_id for s in incidents(stream)[0].events}
    again = {s.event.source.record_id for s in incidents(renamed)[0].events}
    assert original == again


def test_AT_2_5_findings_cite_evidence_with_derivations(stream: list[SecurityEvent]) -> None:
    fs = findings(incidents(stream)[0], configured_model())
    assert [f.stage for f in fs] == ["initial_access", "credential_persistence", "token_abuse", "discovery"]
    cited = sorted(i for f in fs for i in f.evidence_ids)
    assert cited == INCIDENT_IDS
    for f in fs:
        assert f.evidence_ids
        d = f.score.derivation
        assert d.numerator is not None and d.denominator and d.source_ids == f.evidence_ids
        assert f.model_score is not None and f.model_score.method == "logreg"
        assert f.attack


def test_AT_2_5_attack_techniques_filled_only_for_incident(stream: list[SecurityEvent]) -> None:
    enriched = enrich(stream, incidents(stream)[0])
    tagged = {e.id: e.attack.technique_id for e in enriched if e.attack}
    assert tagged == {
        "EV-01": "T1566.002",
        "EV-02": "T1078.004",
        "EV-03": "T1556.006",
        "EV-04": "T1528",
        "EV-05": "T1550.004",
        "EV-06": "T1213.002",
    }


@pytest.fixture(scope="module")
def evaluation() -> tuple[dict[str, Any], dict[str, Any]]:
    return evaluate()


def test_AT_2_6_model_selection_rule(evaluation: tuple[dict[str, Any], dict[str, Any]]) -> None:
    report, _ = evaluation
    pr = report["pr_auc"]
    expected = "gbm" if pr["gbm"] - pr["logreg"] >= GBM_MARGIN else "logreg"
    assert report["selected"] == expected
    assert configured_model().method == expected
    print(f"\nAT-2.6 PR-AUC (held-out synthetic): {pr}; selected {expected}")


def test_AT_2_6_committed_artefacts_match_training(evaluation: tuple[dict[str, Any], dict[str, Any]]) -> None:
    report, artefact = evaluation
    committed_report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    committed_model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    assert committed_report["selected"] == report["selected"]
    for k, v in report["pr_auc"].items():
        assert committed_report["pr_auc"][k] == pytest.approx(v, abs=1e-3)
    assert committed_model["features"] == artefact["features"]
    assert committed_model["coef"] == pytest.approx(artefact["coef"], abs=1e-3)
    assert committed_model["intercept"] == pytest.approx(artefact["intercept"], abs=1e-3)
