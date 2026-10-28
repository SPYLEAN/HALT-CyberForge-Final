"""Action Gate state machine.

  review ──(every required role approved ∧ proof sealed, verified, fresh ∧ Execute)──▶ executing
  executing ──(each candidate applied in display-action order)──▶ applied
  applied ──(Roll back all, inside the window)──▶ rolled
  review ──(new telemetry after sealing)──▶ review with the proof stale (execution refused)
  an infeasible plan that fails C-AUTH starts in blocked_by_policy and can never execute

No code path executes an action without a recorded human approval for every required role. Every
transition writes one audit entry. Time comes from the caller's replay clock, so runs are deterministic.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime

from halt.audit.log import AuditLog
from halt.contracts.gate import Approval, Execution, ExecutionStep, GateState
from halt.contracts.plan import Plan
from halt.contracts.proof import Proof
from halt.gate.authorise import may_approve, outstanding, required_roles_by_policy
from halt.gate.connectors import SimulatedEnvironment
from halt.proofseal.checks import all_verified
from halt.scenario.models import Scenario


class GateError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code = status, code


def conflict(code: str, message: str) -> GateError:
    return GateError(409, code, message)


@dataclass
class Gate:
    scenario: Scenario
    plan: Plan
    clock: Callable[[], datetime]
    audit: AuditLog = field(default_factory=AuditLog)
    proof: Proof | None = None
    proof_stale: bool = False
    approvals: list[Approval] = field(default_factory=list)
    execution: Execution | None = None
    state: GateState = "review"

    def __post_init__(self) -> None:
        self.env = SimulatedEnvironment(self.scenario)
        if self.plan.status != "optimal":
            auth_blocked = (
                self.plan.infeasibility and "C-AUTH" in self.plan.infeasibility.violated_constraint_ids
            )
            self.state = "blocked_by_policy" if auth_blocked else "review"
        self._log("system", "plan_received", self.plan.id, {"status": self.plan.status, "state": self.state})

    # ---- helpers

    def _log(self, actor: str, kind: str, subject: str, payload: object = None) -> None:
        self.audit.append(self.clock(), actor, kind, subject, payload)

    def ordered_candidates(self) -> list[tuple[str, str]]:
        return [(d.id, cid) for d in self.plan.display_actions for cid in d.candidate_ids]

    def outstanding_roles(self) -> set[str]:
        return outstanding(self.scenario, self.plan, self.approvals, self.clock())

    # ---- transitions

    def attach_proof(self, proof: Proof) -> None:
        if proof.plan_id != self.plan.id:
            raise conflict("proof_mismatch", "proof was sealed for a different plan")
        self.proof, self.proof_stale = proof, False
        self._log("proofseal", "proof_sealed", proof.id, {"certificate": proof.certificate})

    def approve(
        self, approver_id: str, policy_id: str, decision: str = "approved", note: str | None = None
    ) -> Approval:
        if self.state != "review":
            raise conflict("not_in_review", f"approvals are only recorded in review (state is {self.state})")
        approver = next((a for a in self.scenario.approvers if a.id == approver_id), None)
        if approver is None:
            raise GateError(404, "unknown_approver", f"no approver {approver_id!r}")
        policy_roles = required_roles_by_policy(self.scenario, self.plan, self.clock()).get(policy_id)
        if policy_roles is None:
            raise conflict("policy_not_in_plan", f"{policy_id} does not govern any action in this plan")
        if not may_approve(approver, policy_roles):
            raise GateError(
                403, "role_missing", f"{approver.name} holds none of {sorted(policy_roles)} or is unavailable"
            )
        approval = Approval(
            id=f"AP-{len(self.approvals) + 1:02d}",
            plan_id=self.plan.id,
            policy_id=policy_id,
            approver_id=approver_id,
            decision=decision,
            at=self.clock(),
            note=note,
        )
        self.approvals.append(approval)
        self._log(approver_id, f"approval_{decision}", policy_id, {"approval": approval.id})
        return approval

    def new_telemetry(self, reason: str) -> None:
        if self.proof is not None and self.state == "review":
            self.proof_stale = True
            self._log("system", "proof_stale", self.proof.id, {"reason": reason})

    def execute(self, proof_id: str, actor: str) -> Execution:
        if self.state != "review":
            raise conflict("not_in_review", f"cannot execute from {self.state}")
        if self.proof is None or self.proof.id != proof_id:
            raise conflict(
                "unsealed", "evidence and plan must be sealed by ProofSeal before execution (IR-DATA-07)"
            )
        if self.proof_stale:
            raise conflict("stale_proof", "new telemetry arrived after sealing; re-plan and re-seal")
        if not all_verified(self.proof):
            raise conflict("proof_failed", "a ProofSeal claim failed")
        missing = self.outstanding_roles()
        if missing:
            raise conflict("approvals_missing", f"awaiting approval from: {', '.join(sorted(missing))}")

        actions = {a.id: a for a in self.scenario.actions}
        self.state = "executing"
        steps = [
            ExecutionStep(display_action_id=d, candidate_id=c, status="pending")
            for d, c in self.ordered_candidates()
        ]
        self._log(actor, "execution_started", self.plan.id, {"proof": proof_id})
        for i, step in enumerate(steps):
            post = self.env.apply(actions[step.candidate_id])
            steps[i] = step.model_copy(
                update={"status": "applied", "at": self.clock(), "post_snapshot_hash": post}
            )
            self._log("connector:simulated", "step_applied", step.candidate_id, {"post_snapshot_hash": post})
        self.state = "applied"
        self.execution = Execution(
            id=f"EX-{self.plan.id.removeprefix('PLAN-')}",
            plan_id=self.plan.id,
            proof_id=proof_id,
            state=self.state,
            steps=steps,
            rollback_window_until=self.proof.valid_until,
        )
        self._log(actor, "execution_applied", self.execution.id, {"steps": len(steps)})
        return self.execution

    def rollback(self, actor: str) -> Execution:
        if self.state != "applied" or self.execution is None:
            raise conflict("not_applied", f"nothing to roll back (state is {self.state})")
        window = self.execution.rollback_window_until
        if window is not None and self.clock() > window:
            raise conflict("window_closed", f"rollback window closed at {window:%H:%MZ}")
        actions = {a.id: a for a in self.scenario.actions}
        steps = list(self.execution.steps)
        for i in reversed(range(len(steps))):
            post = self.env.rollback(actions[steps[i].candidate_id])
            steps[i] = steps[i].model_copy(
                update={"status": "rolled_back", "at": self.clock(), "post_snapshot_hash": post}
            )
            self._log(
                "connector:simulated", "step_rolled_back", steps[i].candidate_id, {"post_snapshot_hash": post}
            )
        self.state = "rolled"
        self.execution = self.execution.model_copy(update={"state": self.state, "steps": steps})
        self._log(actor, "rolled_back", self.execution.id, {"snapshot_hash": self.env.snapshot_hash()})
        return self.execution
