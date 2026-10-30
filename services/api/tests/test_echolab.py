"""AT-3.1 – AT-3.6: deterministic seeded simulation, six high-risk paths, counts not probabilities."""

from __future__ import annotations

import time
from typing import Any

import pytest

from halt.contracts.findings import AttackPath
from halt.contracts.simulation import PlanRef, SimulationRequest, SimulationRun
from halt.echolab.risk import rank_paths
from halt.echolab.simulate import SimulationError, simulate
from halt.scenario.loader import load_scenario
from halt.scenario.models import Scenario

# A candidate response used only to exercise the simulator; SafeCut derives the real plan in Phase 4.
CANDIDATE = "test-candidate"
CRITICAL = {"process.payment", "process.payroll", "process.reconciliation"}


@pytest.fixture(scope="module")
def scenario() -> Scenario:
    return load_scenario()


@pytest.fixture(scope="module")
def paths(scenario: Scenario) -> list[AttackPath]:
    return rank_paths(scenario)


def _request(*refs: PlanRef, **kw: Any) -> SimulationRequest:
    return SimulationRequest(plans=list(refs), **kw)


ABC = (
    PlanRef(label="A", source="preset_aggressive"),
    PlanRef(label="B", source="preset_passive"),
    PlanRef(label="C", source="plan", plan_id=CANDIDATE),
)


def _run(s: Scenario, paths: list[AttackPath], actions: list[str], **kw: Any) -> SimulationRun:
    return simulate(s, paths, _request(*ABC, **kw), {CANDIDATE: actions})


def test_AT_3_1_same_seed_same_hash(scenario: Scenario, paths: list[AttackPath]) -> None:
    runs = [_run(load_scenario(), rank_paths(load_scenario()), ["C01"]) for _ in range(3)]
    assert len({r.hash for r in runs}) == 1
    assert runs[0].id == f"SIM-{runs[0].hash[:12]}"
    assert _run(scenario, paths, ["C01"], seed=7).hash != runs[0].hash


def test_AT_3_2_exactly_six_high_risk_paths(paths: list[AttackPath]) -> None:
    high = [p for p in paths if p.high_risk]
    low = [p for p in paths if not p.high_risk]
    assert [p.id for p in high] == ["P1", "P2", "P3", "P4", "P5", "P6"]
    assert [p.id for p in low] == ["U1"]
    assert all(p.risk >= 0.2 for p in high) and all(p.risk < 0.2 for p in low)
    assert [p.risk for p in high] == sorted((p.risk for p in high), reverse=True)
    u1 = low[0]
    assert u1.uncertain and u1.node_ids[1] == "process.support"
    print("\nAT-3.2 path risk (seed 2417):", {p.id: (p.reach.numerator, p.risk) for p in paths})


def test_AT_3_2_path_ids_stable(scenario: Scenario) -> None:
    assert rank_paths(scenario) == rank_paths(load_scenario())


def test_AT_3_3_counts_not_probabilities(scenario: Scenario, paths: list[AttackPath]) -> None:
    run = _run(scenario, paths, ["C01"])
    for p in paths:
        assert isinstance(p.reach.numerator, int) and p.reach.denominator == scenario.incident.params.rollouts
    for f in run.futures:
        for d in (f.paths_blocked, f.target_reached):
            assert isinstance(d.numerator, int) and isinstance(d.denominator, int)
        assert f.target_reached.denominator == run.request.rollouts
        assert isinstance(f.users_affected.numerator, int)
        assert all(isinstance(v, int) for v in f.path_reached.values())


def test_AT_3_4_aggressive_breaks_business_passive_reaches_target(
    scenario: Scenario, paths: list[AttackPath]
) -> None:
    run = _run(scenario, paths, [])
    a, b, _ = run.futures
    assert any(a.downtime_min.get(p, 0) > 0 for p in CRITICAL)
    assert (a.paths_blocked.numerator, a.paths_blocked.denominator) == (7, 7)  # isolation also cuts U1
    assert a.target_reached.numerator == 0
    assert not a.reversible
    assert b.target_reached.numerator > 0
    assert b.paths_blocked.numerator == 0 and b.downtime_min == {}


def test_AT_3_5_three_futures_under_three_seconds(scenario: Scenario, paths: list[AttackPath]) -> None:
    start = time.perf_counter()
    run = _run(scenario, paths, ["C01", "C02"], rollouts=6000)
    elapsed = time.perf_counter() - start
    assert len(run.futures) == 3
    print(f"\nAT-3.5 3 futures x 6,000 rollouts: {elapsed * 1000:.0f} ms")
    assert elapsed < 3.0


def test_AT_3_6_soft_cut_is_evaded(scenario: Scenario, paths: list[AttackPath]) -> None:
    run = simulate(
        scenario, paths, _request(PlanRef(label="C", source="plan", plan_id="asn")), {"asn": ["C09"]}
    )
    passive = simulate(scenario, paths, _request(PlanRef(label="B", source="preset_passive")))
    soft_paths = [p.id for p in paths if {"e.asn-s1", "e.asn-s2"} & set(p.edge_ids)]
    assert len(soft_paths) == 2
    for pid in soft_paths:
        assert 0 < run.futures[0].path_reached[pid] < passive.futures[0].path_reached[pid]
    assert run.futures[0].paths_blocked.numerator == 0


def test_hard_cut_zeroes_its_paths(scenario: Scenario, paths: list[AttackPath]) -> None:
    run = simulate(scenario, paths, _request(PlanRef(label="C", source="plan", plan_id="g")), {"g": ["C01"]})
    grant_paths = [p.id for p in paths if "token.grant_docusync" in p.node_ids]
    assert len(grant_paths) == 3
    assert all(run.futures[0].path_reached[pid] == 0 for pid in grant_paths)
    assert run.futures[0].paths_blocked.numerator == 3


def test_business_and_users(scenario: Scenario, paths: list[AttackPath]) -> None:
    run = simulate(
        scenario, paths, _request(PlanRef(label="C", source="plan", plan_id="d")), {"d": ["C08", "C05"]}
    )
    f = run.futures[0]
    assert f.users_affected.numerator == 1 + 310
    assert set(f.downtime_min) == CRITICAL | {"process.support"}
    assert all(v == scenario.incident.params.containment_window_min for v in f.downtime_min.values())


def test_unknown_plan_rejected(scenario: Scenario, paths: list[AttackPath]) -> None:
    with pytest.raises(SimulationError, match="unknown plan"):
        simulate(scenario, paths, _request(PlanRef(label="C", source="plan", plan_id="nope")))
