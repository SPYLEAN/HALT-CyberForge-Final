"""Load, validate and cross-check a scenario fixture directory; apply a variant overlay.

A malformed fixture raises ScenarioError, which stops the API from starting (AT-1.1).
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any, get_args

from pydantic import TypeAdapter, ValidationError

from halt.canonical import sha256_hex
from halt.contracts.constraints import ConstraintId
from halt.scenario.models import (
    RemoveEdge,
    Scenario,
    SetApproverAvailability,
    SetConstraintLimit,
    SetCutStrength,
    Variant,
)

DEFAULT_SCENARIO_DIR = Path(__file__).parent / "inc_2417"

FILES = {
    "incident": "incident.json",
    "events": "events.json",
    "background_events": "background_events.json",
    "topology": "topology.json",
    "actions": "actions.json",
    "policies": "policies.json",
    "approvers": "approvers.json",
    "constraints": "constraints.json",
    "variants": "variants.json",
    "presets": "presets.json",
}


class ScenarioError(RuntimeError):
    pass


def _read(directory: Path) -> dict[str, Any]:
    raw: dict[str, Any] = {}
    for key, name in FILES.items():
        path = directory / name
        try:
            raw[key] = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            raise ScenarioError(f"missing scenario file: {path}") from None
        except json.JSONDecodeError as exc:
            raise ScenarioError(f"invalid JSON in {path}: {exc}") from None
    return raw


def _duplicates(ids: list[str]) -> set[str]:
    return {i for i, n in Counter(ids).items() if n > 1}


def check(s: Scenario, *, variants: bool = True) -> None:
    """Cross-reference checks the per-model validators cannot see. Raises ScenarioError listing every issue.

    Variant definitions are checked against the base fixture only (variants=False after an overlay).
    """
    errors: list[str] = []
    nodes = {n.id: n for n in s.topology.nodes}
    edges = {e.id: e for e in s.topology.edges}
    policies = {p.id: p for p in s.policies}

    for label, ids in [
        ("node", [n.id for n in s.topology.nodes]),
        ("edge", [e.id for e in s.topology.edges]),
        ("event", [e.id for e in [*s.events, *s.background_events]]),
        ("action", [a.id for a in s.actions]),
        ("policy", [p.id for p in s.policies]),
        ("approver", [a.id for a in s.approvers]),
        ("variant", [v.key for v in s.variants]),
    ]:
        for dup in sorted(_duplicates(ids)):
            errors.append(f"duplicate {label} id {dup}")

    # graph
    for e in s.topology.edges:
        for end in (e.source, e.target):
            if end not in nodes:
                errors.append(f"edge {e.id}: unknown node {end}")
    target = nodes.get(s.incident.params.target_id)
    if target is None:
        errors.append(f"incident target {s.incident.params.target_id} is not a node")
    elif target.criticality != "critical":
        errors.append(f"incident target {target.id} must be critical")

    # events and evidence
    event_ids = {ev.id for ev in s.events}
    for ev in s.events:
        if not ev.id.startswith("EV-"):
            errors.append(f"incident event {ev.id} must use the EV- prefix")
        if ev.attack is not None:
            errors.append(f"event {ev.id}: attack must be null in the fixture (filled by HALT-R1)")
        for n in ev.actor_node_ids:
            if n not in nodes:
                errors.append(f"event {ev.id}: unknown actor node {n}")
    for ev in s.background_events:
        if not ev.id.startswith("BG-"):
            errors.append(f"background event {ev.id} must use the BG- prefix")
        if ev.attack is not None or ev.actor_node_ids:
            errors.append(f"background event {ev.id} must not reference graph nodes or ATT&CK")
    referenced = [(n.id, n.evidence_ids) for n in s.topology.nodes] + [
        (e.id, e.evidence_ids) for e in s.topology.edges
    ]
    for item_id, evidence_ids in referenced:
        for ref in evidence_ids:
            if ref not in event_ids:
                errors.append(f"{item_id}: unknown evidence id {ref}")

    # actions
    for a in s.actions:
        for t in a.targets:
            if t not in nodes:
                errors.append(f"action {a.id}: unknown target {t}")
        for c in a.cuts:
            if c.ref_type == "node" and c.ref not in nodes:
                errors.append(f"action {a.id}: cut references unknown node {c.ref}")
            if c.ref_type == "edge":
                edge = edges.get(c.ref)
                if edge is None:
                    errors.append(f"action {a.id}: cut references unknown edge {c.ref}")
                elif edge.historical:
                    errors.append(f"action {a.id}: cannot cut historical edge {c.ref}")
        for u in a.impact.users:
            if nodes.get(u) is None or nodes[u].kind != "user":
                errors.append(f"action {a.id}: impact user {u} is not a user node")
        needed: set[str] = set()
        for pid in a.authorisation.policy_ids:
            pol = policies.get(pid)
            if pol is None:
                errors.append(f"action {a.id}: unknown policy {pid}")
                continue
            if a.type not in pol.applies_to_action_types:
                errors.append(f"action {a.id}: policy {pid} does not apply to {a.type}")
            needed |= set(pol.required_roles)
            if pol.window:
                needed.add(pol.window.exception_role)
        missing = needed - set(a.authorisation.required_roles)
        if missing:
            errors.append(f"action {a.id}: required_roles missing {sorted(missing)} demanded by its policies")

    # approvers, constraints
    for ap in s.approvers:
        if ap.user_node_id and ap.user_node_id not in nodes:
            errors.append(f"approver {ap.id}: unknown user node {ap.user_node_id}")
    got = sorted(c.id for c in s.constraints)
    if got != sorted(get_args(ConstraintId)):
        errors.append(f"constraints must define each of {sorted(get_args(ConstraintId))} once, got {got}")

    # presets
    if sorted(p.key for p in s.presets) != ["preset_aggressive", "preset_passive"]:
        errors.append("presets must define preset_aggressive and preset_passive once each")
    for p in s.presets:
        for aid in p.action_ids:
            if aid not in {a.id for a in s.actions}:
                errors.append(f"preset {p.key}: unknown action {aid}")

    # variants
    if "baseline" not in {v.key for v in s.variants}:
        errors.append("variants must include 'baseline'")
    actions = {a.id: a for a in s.actions}
    approver_ids = {a.id for a in s.approvers}
    for v in s.variants if variants else []:
        for op in v.ops:
            if isinstance(op, RemoveEdge) and op.edge_id not in edges:
                errors.append(f"variant {v.key}: unknown edge {op.edge_id}")
            if isinstance(op, SetApproverAvailability) and op.approver_id not in approver_ids:
                errors.append(f"variant {v.key}: unknown approver {op.approver_id}")
            if isinstance(op, SetCutStrength):
                act = actions.get(op.action_id)
                if act is None or op.ref not in {c.ref for c in act.cuts}:
                    errors.append(f"variant {v.key}: action {op.action_id} has no cut on {op.ref}")

    if errors:
        raise ScenarioError("Invalid scenario:\n  " + "\n  ".join(errors))


def apply_variant(s: Scenario, variant: Variant) -> Scenario:
    topology, actions, approvers, constraints = s.topology, s.actions, s.approvers, s.constraints
    for op in variant.ops:
        if isinstance(op, RemoveEdge):
            topology = topology.model_copy(
                update={"edges": [e for e in topology.edges if e.id != op.edge_id]}
            )
        elif isinstance(op, SetApproverAvailability):
            approvers = [
                a.model_copy(update={"available": op.available}) if a.id == op.approver_id else a
                for a in approvers
            ]
        elif isinstance(op, SetCutStrength):
            actions = [
                a.model_copy(
                    update={
                        "cuts": [
                            c.model_copy(update={"strength": op.strength}) if c.ref == op.ref else c
                            for c in a.cuts
                        ]
                    }
                )
                if a.id == op.action_id
                else a
                for a in actions
            ]
        elif isinstance(op, SetConstraintLimit):
            constraints = [
                c.model_copy(update={"limit": op.limit}) if c.id == op.constraint_id else c
                for c in constraints
            ]
    return s.model_copy(
        update={
            "topology": topology,
            "actions": actions,
            "approvers": approvers,
            "constraints": constraints,
            "variant": variant.key,
        }
    )


def load_scenario(directory: Path = DEFAULT_SCENARIO_DIR, variant: str = "baseline") -> Scenario:
    try:
        scenario = Scenario.model_validate(_read(directory))
    except ValidationError as exc:
        raise ScenarioError(f"Invalid scenario in {directory}:\n{exc}") from None
    check(scenario)
    chosen = next((v for v in scenario.variants if v.key == variant), None)
    if chosen is None:
        raise ScenarioError(f"unknown variant {variant!r}; known: {[v.key for v in scenario.variants]}")
    applied = apply_variant(scenario, chosen)
    # model_copy skips validation: re-validate so an overlay cannot produce an invalid scenario.
    applied = TypeAdapter(Scenario).validate_python(applied.model_dump())
    check(applied, variants=False)
    return applied


def scenario_hashes(s: Scenario) -> dict[str, str]:
    """Per-section fingerprints recorded as input hashes on every downstream artefact."""
    return {
        "events": sha256_hex([*s.events, *s.background_events]),
        "graph": sha256_hex(s.topology),
        "actions": sha256_hex(s.actions),
        "policies": sha256_hex([*s.policies, *s.approvers]),
        "constraints": sha256_hex(s.constraints),
    }
