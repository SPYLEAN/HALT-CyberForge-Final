"""Policy-aware residual risk: the two profiles are different constraint limits; SafeCut, EchoLab and
ProofSeal apply them; plans can differ; no-feasible-plan is truthful; U1 is described as what it is.

Baseline facts these tests rest on (all derived, none hard-coded in the engines): ThreadGraph enumerates seven
paths to db.finance_ledger, P1-P6 at or above risk 0.20 and U1 below it (502 of 6,000 rollouts on its own).
Only C05, C06 and C07 hard-cut U1; none is reversible within 300 s and each breaks critical processes.
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from halt.compare import compare
from halt.config import Settings
from halt.contracts.simulation import PlanRef, SimulationRequest
from halt.echolab.risk import rank_paths
from halt.echolab.simulate import simulate
from halt.main import create_app
from halt.proofseal.checks import ProofError, prove
from halt.proofseal.seal import Sealer
from halt.safecut.instance import PLAN_TIME_OFFSET_S, build_instance
from halt.safecut.solve import solve
from halt.scenario.loader import load_scenario
from halt.scenario.profiles import apply_profile

CB, ZT = "continuity_balanced", "critical_asset_zero_tolerance"
B, I = "/api/v1", "/api/v1/incidents/INC-2417"  # noqa: E741


@pytest.fixture(scope="module")
def sealer(tmp_path_factory: pytest.TempPathFactory) -> Sealer:
    return Sealer.from_path(tmp_path_factory.mktemp("key") / "k.pem")


def setup(variant: str = "baseline") -> tuple[Any, Any]:
    s = load_scenario(variant=variant)
    return s, rank_paths(s)


def test_the_two_profiles_are_different_constraint_limits() -> None:
    s, paths = setup()
    cb, zt = apply_profile(s, CB), apply_profile(s, ZT)
    limits = {
        name: {c.id: c.limit for c in sc.constraints if c.id in ("C-COVER", "C-RESIDUAL")}
        for name, sc in ((CB, cb), (ZT, zt))
    }
    assert limits == {CB: {"C-COVER": 0.2, "C-RESIDUAL": 600.0}, ZT: {"C-COVER": 0.0, "C-RESIDUAL": 0.0}}
    # Every other constraint is untouched by the profile.
    others = lambda sc: [c for c in sc.constraints if c.id not in ("C-COVER", "C-RESIDUAL")]  # noqa: E731
    assert others(cb) == others(zt) == others(s)
    ib, iz = build_instance(cb, paths), build_instance(zt, paths)
    assert ib.paths == ("P1", "P2", "P3", "P4", "P5", "P6") and ib.optional == ("U1",)
    assert iz.paths == ("P1", "P2", "P3", "P4", "P5", "P6", "U1") and iz.optional == ()
    assert ib.reach["U1"] == 502


def test_continuity_leaves_u1_open_as_bounded_residual_risk() -> None:
    s, paths = setup()
    plan = solve(apply_profile(s, CB), paths)
    assert plan.status == "optimal" and plan.profile_id == CB
    assert plan.selected_candidate_ids == ["C01", "C02", "C03", "C04"]
    r = plan.residual
    assert r is not None and r.open_path_ids == ["U1"] and r.within_limit
    assert (r.reach_bound.numerator, r.reach_bound.denominator, r.limit) == (502, 6000, 600)
    assert any("inferred edge i.asn-support" in u for u in r.uncertainty)
    assert any("not measured" in u for u in r.uncertainty)
    residual = next(c for c in plan.constraints if c.constraint_id == "C-RESIDUAL")
    assert residual.state == "met" and "502 of 6,000 rollouts via U1" in residual.value


def test_weak_containment_leaves_a_path_zero_tolerance_finds_unacceptable() -> None:
    """The Continuity plan, judged by Zero Tolerance's own limits, fails: U1 stays open and still reaches the
    ledger in EchoLab."""
    s, paths = setup()
    plan = solve(apply_profile(s, CB), paths)
    zt = build_instance(apply_profile(s, ZT), paths)
    assert "U1" in zt.paths and "U1" in (plan.residual.open_path_ids if plan.residual else [])
    params = s.incident.params
    run = simulate(
        s,
        paths,
        SimulationRequest(
            plans=[PlanRef(label="C", source="plan", plan_id=plan.id)],
            rollouts=params.rollouts,
            horizon_s=params.horizon_s,
            seed=params.seed,
        ),
        {plan.id: plan.selected_candidate_ids},
    )
    future = run.futures[0]
    assert future.path_reached["U1"] > 0 and future.target_reached.numerator == future.path_reached["U1"]
    assert future.target_reached.numerator > zt.residual_limit


def test_zero_tolerance_is_truthfully_infeasible_in_the_baseline(sealer: Sealer) -> None:
    s, paths = setup()
    plan = solve(apply_profile(s, ZT), paths)
    assert plan.status == "infeasible" and plan.profile_id == ZT
    assert plan.residual is None and plan.selected_candidate_ids == []
    assert plan.infeasibility and plan.infeasibility.violated_constraint_ids == ["C-COVER"]
    # The closest option is exactly what Continuity would run: it is offered, not executed.
    assert plan.infeasibility.closest_options[0].candidate_ids == ["C01", "C02", "C03", "C04"]
    # Why: every action that hard-cuts U1 is rejected, each for stated constraint reasons.
    rejected = {r.candidate_id: " ".join(r.reasons) for r in plan.rejected}
    for cid in ("C05", "C06", "C07"):
        assert "C-REVERSIBLE" in rejected[cid] and "C-DOWNTIME" in rejected[cid]
    with pytest.raises(ProofError):
        prove(apply_profile(s, ZT), paths, plan, sealer)


def test_zero_tolerance_cuts_every_enumerated_path_when_feasible(sealer: Sealer) -> None:
    s, paths = setup("support_route_blockable")
    cb, zt = solve(apply_profile(s, CB), paths), solve(apply_profile(s, ZT), paths)
    # The plans differ, by one more reversible action; Continuity is unchanged by the variant.
    assert cb.selected_candidate_ids == ["C01", "C02", "C03", "C04"]
    assert zt.status == "optimal" and zt.selected_candidate_ids == ["C01", "C02", "C03", "C04", "C09"]
    assert cb.id != zt.id
    assert zt.residual and zt.residual.open_path_ids == [] and zt.residual.reach_bound.numerator == 0
    proof = prove(apply_profile(s, ZT), paths, zt, sealer)
    claims = {c.id: c for c in proof.claims}
    assert all(c.status == "verified" for c in proof.claims), [c.text for c in proof.claims]
    assert claims["CHK-01"].result.denominator == 7 and claims["CHK-01"].result.numerator == 0
    assert claims["CHK-10"].result.numerator == 0 and claims["CHK-10"].result.source_ids == []
    assert not any(n.startswith("U1") for n in proof.not_covered)
    assert any("not a claim of zero real-world risk" in n for n in proof.not_covered)


def test_proofseal_checks_the_plans_own_profile(sealer: Sealer) -> None:
    s, paths = setup()
    plan = solve(apply_profile(s, CB), paths)
    proof = prove(s, paths, plan, sealer)  # the scenario without a profile: the proof reads plan.profile_id
    claims = {c.id: c for c in proof.claims}
    assert all(c.status == "verified" for c in proof.claims)
    assert claims["CHK-01"].result.denominator == 6
    assert claims["CHK-10"].result.source_ids == ["U1"]
    assert "within the Continuity Balanced limit of 600" in claims["CHK-10"].text
    # CHK-08's independent 2^12 enumeration applies the same profile and finds the same optimum.
    assert claims["CHK-08"].status == "verified"


@pytest.mark.parametrize("variant", ["baseline", "support_route_blockable", "verma_not_releaser"])
@pytest.mark.parametrize("profile_id", [CB, ZT])
def test_the_solver_still_follows_scenario_inputs(variant: str, profile_id: str, sealer: Sealer) -> None:
    """Under either profile, ProofSeal's independent enumeration agrees with SafeCut for every variant."""
    s, paths = setup(variant)
    plan = solve(apply_profile(s, profile_id), paths)  # type: ignore[arg-type]
    if plan.status == "optimal":
        assert all(c.status == "verified" for c in prove(s, paths, plan, sealer).claims)
    else:
        assert plan.infeasibility is not None


def test_claims_reference_graph_paths_and_evidence(sealer: Sealer) -> None:
    s, paths = setup()
    path_ids = {p.id for p in paths}
    event_ids = {e.id for e in s.events}
    plan = solve(apply_profile(s, CB), paths)
    assert plan.residual
    assert set(plan.residual.enumerated_path_ids) == path_ids
    assert set(plan.residual.reach_bound.source_ids) <= path_ids
    for c in plan.constraints:
        if c.constraint_id in ("C-COVER", "C-RESIDUAL"):
            assert {x for x in c.derivation.source_ids if x[0] in "PU"} <= path_ids
    proof = prove(s, paths, plan, sealer)
    for claim in proof.claims:
        assert set(claim.evidence_ids) <= event_ids
    assert set(next(c for c in proof.claims if c.id == "CHK-01").result.source_ids) <= path_ids
    comparison = compare(s, paths)
    for reason in comparison.tradeoff.reasons:
        assert any(pid in reason for pid in path_ids), reason


def test_u1_is_no_longer_mislabelled(sealer: Sealer) -> None:
    s, paths = setup()
    plan = solve(apply_profile(s, CB), paths)
    cover = next(c for c in plan.constraints if c.constraint_id == "C-COVER")
    assert "required paths" in cover.value and "high-risk" not in cover.value
    proof = prove(s, paths, plan, sealer)
    u1 = next(n for n in proof.not_covered if n.startswith("U1"))
    assert "accepted residual risk, not containment" in u1 and "stays open under Continuity Balanced" in u1
    assert "Only paths enumerated in the modelled graph are proven" in " ".join(proof.not_covered)
    params = s.incident.params
    run = simulate(
        s,
        paths,
        SimulationRequest(
            plans=[PlanRef(label="C", source="plan", plan_id=plan.id)],
            rollouts=params.rollouts,
            horizon_s=params.horizon_s,
            seed=params.seed,
        ),
        {plan.id: plan.selected_candidate_ids},
    )
    blocked = run.futures[0].paths_blocked
    assert (blocked.numerator, blocked.denominator) == (6, 7) and "open: U1" in blocked.method


def test_comparison_states_the_exact_tradeoff() -> None:
    s, paths = setup("support_route_blockable")
    t = compare(s, paths).tradeoff
    assert (t.from_profile, t.to_profile) == (CB, ZT)
    assert (
        t.added_candidate_ids == ["C09"] and t.removed_candidate_ids == [] and t.newly_cut_path_ids == ["U1"]
    )
    assert (t.delta_actions, t.delta_users, t.delta_critical_downtime_min) == (1, 0, 0)
    assert t.delta_reach_bound == -502
    assert t.delta_simulated_reach is not None and t.delta_simulated_reach < 0
    assert any(
        r.startswith("C09 (Block AS64500 at the edge) is added because it hard-cuts") for r in t.reasons
    )

    s, paths = setup()
    c = compare(s, paths)
    statuses = [(o.profile.id, o.status) for o in c.outcomes]
    assert statuses == [(CB, "optimal"), (ZT, "infeasible")]
    assert c.outcomes[1].residual is None and c.outcomes[1].simulated_reach is None
    # No plan under Zero Tolerance: nothing is "dropped" or "added", there is simply nothing to run.
    assert c.tradeoff.added_candidate_ids == [] and c.tradeoff.removed_candidate_ids == []
    assert c.tradeoff.delta_actions is None and c.tradeoff.delta_users is None
    joined = " ".join(c.tradeoff.reasons)
    assert "must cut U1" in joined and "C05" in joined and "C06" in joined and "C07" in joined
    assert (
        "no plan satisfies every constraint of Critical Asset Zero Tolerance while U1 must be cut" in joined
    )


def test_api_resolves_under_the_chosen_profile_and_restores_it(tmp_path: Path) -> None:
    settings = Settings(
        db_url=f"sqlite+pysqlite:///{(tmp_path / 'halt.db').as_posix()}",
        signing_key_path=str(tmp_path / "k.pem"),
    )
    with TestClient(create_app(settings)) as c:
        assert c.get(f"{I}/policy-comparison").status_code == 409  # paths come from correlation
        profiles = c.get(f"{I}/policies").json()["profiles"]
        assert [p["id"] for p in profiles] == [CB, ZT]
        assert c.post(f"{I}/replay/reset", json={"variant": "support_route_blockable"}).status_code == 200
        c.post(f"{I}/correlate", json={})
        cb = c.post(f"{I}/plans", json={}).json()
        zt = c.post(f"{I}/plans", json={"profile_id": ZT}).json()
        assert (cb["profile_id"], zt["profile_id"]) == (CB, ZT)
        assert zt["selected_candidate_ids"] == [*cb["selected_candidate_ids"], "C09"]
        comparison = c.get(f"{I}/policy-comparison").json()
        assert [o["plan_id"] for o in comparison["outcomes"]] == [cb["id"], zt["id"]]
        assert c.get(I).json()["latest"]["plan_id"] == zt["id"]
    with TestClient(create_app(settings)) as c2:  # the journal replays the profile too
        assert c2.get(f"{B}/ready").json()["incidents"][0]["status"] == "restored"
        assert c2.get(f"{B}/plans/{zt['id']}").json()["profile_id"] == ZT


def test_plan_time_is_the_service_default() -> None:
    """compare() uses the service's plan time, so its plan ids are the ids POST /plans returns."""
    s, paths = setup()
    t = s.incident.t0 + timedelta(seconds=PLAN_TIME_OFFSET_S)
    assert compare(s, paths).outcomes[0].plan_id == solve(apply_profile(s, CB), paths, t).id
