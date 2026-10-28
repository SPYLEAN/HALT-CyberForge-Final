"""Deterministic, evidence-citing explanations and the citation validator shared with the LLM adapter."""

from __future__ import annotations

import re
from dataclasses import dataclass

from halt.contracts.findings import AttackPath, Finding
from halt.contracts.plan import Plan
from halt.scenario.models import Scenario

# Ids an explanation may cite: events, paths, findings, candidates, display actions, policies, graph nodes.
ID_PATTERN = re.compile(r"\b(EV-\d{2}|[PU]\d+|F-\d{2}|C\d{2}|A\d+|IR-[A-Z]+-\d{2}|[a-z]+\.[a-z0-9_]+)\b")


@dataclass(frozen=True)
class Context:
    scenario: Scenario
    paths: list[AttackPath]
    findings: list[Finding]
    plan: Plan | None


def known_ids(ctx: Context) -> set[str]:
    s = ctx.scenario
    ids = {e.id for e in s.events} | {n.id for n in s.topology.nodes} | {a.id for a in s.actions}
    ids |= {p.id for p in s.policies} | {p.id for p in ctx.paths} | {f.id for f in ctx.findings}
    if ctx.plan:
        ids |= {d.id for d in ctx.plan.display_actions}
    return ids


def cited(text: str) -> list[str]:
    return sorted(set(ID_PATTERN.findall(text)))


def invalid_citations(text: str, ctx: Context) -> list[str]:
    known = known_ids(ctx)
    return [i for i in cited(text) if i not in known]


def explain(subject_id: str, ctx: Context) -> str | None:
    s = ctx.scenario
    nodes = {n.id: n for n in s.topology.nodes}
    if subject_id in nodes:
        n = nodes[subject_id]
        evidence = ", ".join(n.evidence_ids) or "no incident events"
        text = f"{subject_id} ({n.label}) is {n.provenance}; evidence: {evidence}."
        if n.business:
            text += f" {n.business.users} users depend on it."
        return text
    path = next((p for p in ctx.paths if p.id == subject_id), None)
    if path:
        edges = {e.id: e for e in s.topology.edges}
        ev = sorted({i for e in path.edge_ids for i in edges[e].evidence_ids})
        text = (
            f"{path.id}: {' -> '.join(path.node_ids)}. Reached in {path.reach.numerator} of "
            f"{path.reach.denominator} simulated rollouts (risk {path.risk}). "
            f"Observed hops cite {', '.join(ev) if ev else 'no events (forecast only)'}."
        )
        if ctx.plan:
            cutters = [d.id for d in ctx.plan.display_actions if path.id in d.blocks_path_ids]
            if cutters:
                text += f" Cut by {', '.join(cutters)}."
        return text
    finding = next((f for f in ctx.findings if f.id == subject_id), None)
    if finding:
        evidence = ", ".join(finding.evidence_ids)
        return f"{finding.id} ({finding.stage}): {finding.score.derivation.method} Evidence: {evidence}."
    action = next((a for a in s.actions if a.id == subject_id), None)
    if action:
        text = (
            f"{action.id} {action.title}: affects {action.impact.description} "
            f"Rollback {action.reversibility.method}. Policies {', '.join(action.authorisation.policy_ids)}."
        )
        if ctx.plan:
            if action.id in ctx.plan.selected_candidate_ids:
                text += " Selected by SafeCut."
            else:
                rejection = next((r for r in ctx.plan.rejected if r.candidate_id == action.id), None)
                if rejection:
                    text += " Rejected: " + "; ".join(rejection.reasons) + "."
        return text
    return None
