"""AT-5.1 – AT-5.4: independent verification, enumeration, irredundancy, tamper-evident seal."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from halt.contracts.findings import AttackPath
from halt.contracts.plan import Plan
from halt.contracts.proof import Proof
from halt.echolab.risk import rank_paths
from halt.proofseal.checks import ProofError, all_verified, prove
from halt.proofseal.seal import Sealer
from halt.safecut.solve import solve
from halt.scenario.loader import load_scenario
from halt.scenario.models import Scenario


@pytest.fixture(scope="module")
def setup() -> tuple[Scenario, list[AttackPath], Plan, Sealer, Proof]:
    s = load_scenario()
    paths = rank_paths(s)
    plan = solve(s, paths)
    sealer = Sealer.generate()
    return s, paths, plan, sealer, prove(s, paths, plan, sealer)


def claim(proof: Proof, cid: str) -> object:
    return next(c for c in proof.claims if c.id == cid)


def test_AT_5_1_no_high_risk_path_survives_and_business_continues(setup: tuple) -> None:
    *_, proof = setup
    c1, c2, c3 = (claim(proof, f"CHK-0{i}") for i in (1, 2, 3))
    assert c1.status == "verified" and c1.result.numerator == 0 and c1.result.denominator == 6  # type: ignore[attr-defined]
    assert c2.status == "verified" and c2.result.numerator == c2.result.denominator  # type: ignore[attr-defined]
    assert c3.status == "verified"  # type: ignore[attr-defined]
    assert proof.post_snapshot_hash != proof.snapshot_hash
    assert all_verified(proof)


def test_AT_5_2_enumeration_unique_optimum(setup: tuple) -> None:
    *_, proof = setup
    assert proof.enumeration.subsets_checked == 4096
    assert proof.enumeration.optimal_count == 1 and proof.enumeration.unique
    assert claim(proof, "CHK-08").status == "verified"  # type: ignore[attr-defined]


def test_AT_5_3_irredundant(setup: tuple) -> None:
    *_, proof = setup
    assert claim(proof, "CHK-09").status == "verified"  # type: ignore[attr-defined]


def test_AT_5_3_a_redundant_plan_fails(setup: tuple) -> None:
    s, paths, plan, sealer, _ = setup
    padded = plan.model_copy(update={"selected_candidate_ids": [*plan.selected_candidate_ids, "C12"]})
    proof = prove(s, paths, padded, sealer)
    assert claim(proof, "CHK-09").status == "failed"  # type: ignore[attr-defined]
    assert claim(proof, "CHK-08").status == "failed"  # objective no longer the minimum
    assert not all_verified(proof)


def test_AT_5_4_certificate_and_signature_verify(setup: tuple) -> None:
    *_, sealer, proof = setup
    cert_ok, sig_ok, recomputed = sealer.verify(proof)
    assert cert_ok and sig_ok and recomputed == proof.certificate
    assert proof.id.startswith("PS-2417-")


def test_AT_5_4_tampering_is_detected(setup: tuple) -> None:
    *_, sealer, proof = setup
    forged_claim = proof.claims[0].model_copy(update={"text": "0 of 6 paths reachable (edited)"})
    for forged in [
        proof.model_copy(update={"claims": [forged_claim, *proof.claims[1:]]}),
        proof.model_copy(update={"plan_id": "PLAN-000000000000"}),
        proof.model_copy(update={"not_covered": proof.not_covered[1:]}),
    ]:
        assert sealer.verify(forged)[0] is False
    other_key = Sealer.generate()
    assert other_key.verify(proof)[1] is False


def test_certificate_is_deterministic_across_keys(setup: tuple) -> None:
    s, paths, plan, _, proof = setup
    assert prove(s, paths, plan, Sealer.generate()).certificate == proof.certificate


def test_proof_states_residual_risk(setup: tuple) -> None:
    *_, proof = setup
    residual = [n for n in proof.not_covered if n.startswith("U1")]
    assert residual and "stays open" in residual[0]
    assert any("simulated" in n.lower() for n in proof.not_covered)


def test_infeasible_plan_cannot_be_sealed() -> None:
    s = load_scenario(variant="approver_unavailable")
    paths = rank_paths(s)
    with pytest.raises(ProofError):
        prove(s, paths, solve(s, paths), Sealer.generate())


def test_proofseal_does_not_import_safecut() -> None:
    root = Path(__file__).resolve().parents[1] / "halt" / "proofseal"
    for path in root.glob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or "").startswith("halt.safecut"), path.name
