"""AT-4.1, AT-4.3 – AT-4.6, AT-4.8: SafeCut derives the envelope, explains rejections, flips with inputs."""

from __future__ import annotations

import statistics
import time

import pytest
from _brute import brute_force

from halt.contracts.plan import Plan
from halt.echolab.risk import rank_paths
from halt.safecut.instance import build_instance
from halt.safecut.solve import solve
from halt.scenario.loader import load_scenario

VARIANTS = [
    "baseline",
    "verma_not_releaser",
    "approver_unavailable",
    "no_phish_resistant_mfa",
    "relaxed_users_250",
]


def plan_for(variant: str = "baseline") -> Plan:
    s = load_scenario(variant=variant)
    return solve(s, rank_paths(s))


@pytest.fixture(scope="module")
def baseline() -> Plan:
    return plan_for()


def test_AT_4_1_baseline_optimum(baseline: Plan) -> None:
    assert baseline.status == "optimal"
    assert baseline.selected_candidate_ids == ["C01", "C02", "C03", "C04"]
    assert [(d.id, d.candidate_ids) for d in baseline.display_actions] == [
        ("A1", ["C01"]),
        ("A2", ["C02", "C03"]),
        ("A3", ["C04"]),
    ]
    assert all(c.state in ("met", "binding") for c in baseline.constraints)
    covered = sorted(p for d in baseline.display_actions for p in d.blocks_path_ids)
    assert covered == ["P1", "P2", "P3", "P4", "P5", "P6"]
    assert baseline.objective is not None and baseline.objective.terms == {
        "downtime_min": 0,
        "users": 3,
        "actions": 4,
        "approvals": 5,
    }


def test_AT_4_1_plan_is_deterministic(baseline: Plan) -> None:
    again = plan_for()
    assert again.id == baseline.id
    assert again.model_dump(exclude={"solver"}) == baseline.model_dump(exclude={"solver"})


def test_AT_4_3_every_rejection_explained(baseline: Plan) -> None:
    rejected = {r.candidate_id for r in baseline.rejected}
    assert rejected == {f"C{i:02d}" for i in range(1, 13)} - set(baseline.selected_candidate_ids)
    for r in baseline.rejected:
        assert r.reasons
        for reason in r.reasons:
            assert reason.startswith(("C-", "Dominated", "No hard cut", "Only soft cuts")), reason


def test_AT_4_4_plan_changes_when_releaser_dependency_removed() -> None:
    p = plan_for("verma_not_releaser")
    assert p.status == "optimal"
    assert p.selected_candidate_ids == ["C01", "C02", "C03", "C08"]


@pytest.mark.parametrize("variant", ["approver_unavailable", "no_phish_resistant_mfa"])
def test_AT_4_5_infeasible_with_closest_options(variant: str) -> None:
    p = plan_for(variant)
    assert p.status == "infeasible"
    assert p.selected_candidate_ids == [] and p.display_actions == [] and p.objective is None
    assert p.infeasibility is not None
    assert 1 <= len(p.infeasibility.closest_options) <= 3
    for option in p.infeasibility.closest_options:
        assert option.breaks and all(b.state == "violated" for b in option.breaks)
    partial = [
        o for o in p.infeasibility.closest_options if any(b.constraint_id == "C-COVER" for b in o.breaks)
    ]
    assert partial and "5 of 6" in partial[0].breaks[0].value


def test_AT_4_5_approver_unavailable_names_the_missing_role() -> None:
    p = plan_for("approver_unavailable")
    assert p.infeasibility is not None
    auth = [b for o in p.infeasibility.closest_options for b in o.breaks if b.constraint_id == "C-AUTH"]
    assert auth and "finance_ops_owner" in auth[0].value


def test_AT_4_6_user_limit_is_not_what_wins(baseline: Plan) -> None:
    assert plan_for("relaxed_users_250").selected_candidate_ids == baseline.selected_candidate_ids


@pytest.mark.parametrize("variant", VARIANTS)
def test_cp_sat_agrees_with_brute_force(variant: str) -> None:
    s = load_scenario(variant=variant)
    paths = rank_paths(s)
    plan = solve(s, paths)
    best, optimal, checked = brute_force(build_instance(s, paths))
    assert checked == 4096
    if plan.status == "infeasible":
        assert best is None
    else:
        assert plan.objective is not None and plan.objective.value == best
        assert optimal == [tuple(plan.selected_candidate_ids)]  # unique optimum


def test_AT_4_8_solve_time() -> None:
    s = load_scenario()
    paths = rank_paths(s)
    timings = []
    for _ in range(20):
        start = time.perf_counter()
        solve(s, paths)
        timings.append(time.perf_counter() - start)
    p95 = statistics.quantiles(timings, n=20)[18]
    print(f"\nAT-4.8 SafeCut solve p95 over 20 runs: {p95 * 1000:.1f} ms")
    assert p95 < 1.0
