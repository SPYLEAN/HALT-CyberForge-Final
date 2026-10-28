"""Which approvals a plan needs, and whether an approver may give one."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from halt.contracts.constraints import Approver
from halt.contracts.gate import Approval
from halt.contracts.plan import Plan
from halt.scenario.models import Scenario


def required_roles_by_policy(s: Scenario, plan: Plan, at: datetime) -> dict[str, set[str]]:
    """Policy id -> roles that must approve, for the plan's selected actions (freeze exceptions included)."""
    policies = {p.id: p for p in s.policies}
    actions = {a.id: a for a in s.actions}
    out: dict[str, set[str]] = {}
    for cid in plan.selected_candidate_ids:
        for pid in actions[cid].authorisation.policy_ids:
            pol = policies[pid]
            roles = out.setdefault(pid, set())
            roles |= set(pol.required_roles)
            if pol.window and pol.window.start <= at.time() < pol.window.end:
                roles.add(pol.window.exception_role)
    return out


def required_roles(s: Scenario, plan: Plan, at: datetime) -> set[str]:
    return set().union(*required_roles_by_policy(s, plan, at).values())


def may_approve(approver: Approver, policy_roles: set[str]) -> bool:
    return approver.available and bool(set(approver.roles) & policy_roles)


def outstanding(s: Scenario, plan: Plan, approvals: Sequence[Approval], at: datetime) -> set[str]:
    """Roles still lacking an 'approved' decision. A decline for a role blocks it until approved again."""
    approvers = {a.id: a for a in s.approvers}
    latest: dict[str, str] = {}
    for ap in approvals:
        for role in approvers[ap.approver_id].roles:
            latest[role] = ap.decision
    return {r for r in required_roles(s, plan, at) if latest.get(r) != "approved"}
