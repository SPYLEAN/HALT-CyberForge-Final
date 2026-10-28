"""AT-5.5 – AT-5.8, AT-5.10: approvals, sealed execution in order, exact rollback, stale proofs."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from halt.echolab.risk import rank_paths
from halt.gate.gate import Gate, GateError
from halt.proofseal.checks import prove
from halt.proofseal.seal import Sealer
from halt.safecut.solve import solve
from halt.scenario.loader import load_scenario
from halt.threadgraph.build import snapshot


class Clock:
    def __init__(self, start: datetime) -> None:
        self.now = start

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kw: float) -> None:
        self.now += timedelta(**kw)


@pytest.fixture
def ready() -> tuple[Gate, Clock, str]:
    s = load_scenario()
    paths = rank_paths(s)
    plan = solve(s, paths)
    clock = Clock(plan.meta.generated_at)
    gate = Gate(s, plan, clock)
    proof = prove(s, paths, plan, Sealer.generate())
    gate.attach_proof(proof)
    return gate, clock, proof.id


def approve_all(gate: Gate) -> None:
    gate.approve("a_rahman", "IR-OAUTH-02")
    gate.approve("s_iyer", "IR-CA-05")


def test_AT_5_5_missing_approvals(ready: tuple[Gate, Clock, str]) -> None:
    gate, _, proof_id = ready
    with pytest.raises(GateError) as e:
        gate.execute(proof_id, "a_rahman")
    assert e.value.status == 409 and e.value.code == "approvals_missing"
    gate.approve("a_rahman", "IR-SESS-01")
    with pytest.raises(GateError, match="finance_ops_owner"):
        gate.execute(proof_id, "a_rahman")
    assert gate.state == "review" and gate.env.snapshot_hash() == snapshot(gate.scenario).hash


def test_AT_5_5_unsealed_plan_refused() -> None:
    s = load_scenario()
    plan = solve(s, rank_paths(s))
    gate = Gate(s, plan, Clock(plan.meta.generated_at))
    approve_all(gate)
    with pytest.raises(GateError) as e:
        gate.execute("PS-2417-anything", "a_rahman")
    assert e.value.status == 409 and e.value.code == "unsealed"


def test_AT_5_5_declined_blocks_execution(ready: tuple[Gate, Clock, str]) -> None:
    gate, _, proof_id = ready
    gate.approve("a_rahman", "IR-OAUTH-02")
    gate.approve("s_iyer", "IR-CA-05", decision="declined", note="Close in progress")
    with pytest.raises(GateError, match="finance_ops_owner"):
        gate.execute(proof_id, "a_rahman")


def test_AT_5_6_wrong_role_forbidden(ready: tuple[Gate, Clock, str]) -> None:
    gate, *_ = ready
    with pytest.raises(GateError) as e:
        gate.approve("k_mensah", "IR-OAUTH-02")
    assert e.value.status == 403
    with pytest.raises(GateError) as e:
        gate.approve("a_rahman", "IR-ISO-03")  # not a policy of this plan
    assert e.value.status == 409


def test_AT_5_7_executes_in_order_with_audit(ready: tuple[Gate, Clock, str]) -> None:
    gate, clock, proof_id = ready
    approve_all(gate)
    clock.advance(minutes=1)
    ex = gate.execute(proof_id, "a_rahman")
    assert gate.state == "applied" and ex.state == "applied"
    expected = [(d.id, c) for d in gate.plan.display_actions for c in d.candidate_ids]
    assert [(st.display_action_id, st.candidate_id) for st in ex.steps] == expected
    assert all(st.status == "applied" for st in ex.steps)
    assert ex.steps[-1].post_snapshot_hash == gate.proof.post_snapshot_hash  # type: ignore[union-attr]
    assert gate.audit.kinds().count("step_applied") == len(ex.steps)
    assert gate.audit.verify().valid


def test_AT_5_8_rollback_restores_snapshot_exactly(ready: tuple[Gate, Clock, str]) -> None:
    gate, clock, proof_id = ready
    approve_all(gate)
    gate.execute(proof_id, "a_rahman")
    clock.advance(minutes=10)
    ex = gate.rollback("a_rahman")
    assert gate.state == "rolled" and all(st.status == "rolled_back" for st in ex.steps)
    assert gate.env.snapshot_hash() == snapshot(gate.scenario).hash
    with pytest.raises(GateError):
        gate.rollback("a_rahman")


def test_rollback_window_closes(ready: tuple[Gate, Clock, str]) -> None:
    gate, clock, proof_id = ready
    approve_all(gate)
    gate.execute(proof_id, "a_rahman")
    clock.advance(hours=1)
    with pytest.raises(GateError) as e:
        gate.rollback("a_rahman")
    assert e.value.code == "window_closed"


def test_AT_5_10_new_telemetry_makes_proof_stale(ready: tuple[Gate, Clock, str]) -> None:
    gate, _, proof_id = ready
    approve_all(gate)
    gate.new_telemetry("EV-07: new sign-in from AS64511")
    assert gate.state == "review" and gate.proof_stale
    with pytest.raises(GateError) as e:
        gate.execute(proof_id, "a_rahman")
    assert e.value.code == "stale_proof"
    assert "proof_stale" in gate.audit.kinds()


def test_policy_blocked_plan_never_executes() -> None:
    s = load_scenario(variant="approver_unavailable")
    plan = solve(s, rank_paths(s))
    gate = Gate(s, plan, Clock(plan.meta.generated_at))
    assert gate.state == "blocked_by_policy"
    with pytest.raises(GateError):
        gate.approve("a_rahman", "IR-OAUTH-02")
    with pytest.raises(GateError):
        gate.execute("PS-2417-anything", "a_rahman")
