"""Plain-language guide to a stored incident: what each step means, and what an analyst could check next.

Derived only from stored evidence, recorded gaps, reachable-next results and rule mappings. It is
deterministic template text.
It recommends checks, never remediation, claims no action was taken, and uses no language model.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from halt.firex.contracts import IncidentGuide, NextCheck, StepGuide
from halt.firex.util import read_json

WHY_BY_STAGE = {
    "reconnaissance": "Mapping a target usually comes before an attempt on it.",
    "credential_access": "Access to an identity can let later activity look legitimate.",
    "delivery": "This is how harmful content may reach a system.",
    "exploitation": "This is an attempt to turn a weakness into access.",
    "installation": "A new foothold can outlast the original access.",
    "defense_evasion": "Reducing visibility makes everything after it harder to see.",
    "command_and_control": "This may be a channel for directing or moving data.",
    "lateral_movement": "One compromised system may be spreading to others.",
    "actions_on_objectives": "This is activity that could directly affect the organisation.",
    "impact": "This can disrupt a service the business depends on.",
}
NO_ACTOR = "No single source is named by these records."


def _sentence(text: str) -> str:
    text = text.strip()
    return text if text.endswith((".", "!", "?")) else f"{text}."


def build_guide(folder: Path) -> IncidentGuide:
    detail: dict[str, Any] = read_json(folder / "detail.json")
    graph: dict[str, Any] = read_json(folder / "graph.json")
    reach: dict[str, Any] = read_json(folder / "reachability.json")
    hypotheses: dict[str, Any] = read_json(folder / "hypotheses.json")
    path = sorted((n for n in graph["nodes"] if n["on_selected_path"]), key=lambda n: n["order"])
    detections = {d["detection_id"]: d for d in detail["detections"]}
    steps_by_order: list[dict[str, Any]] = sorted(
        (s for d in detail["detections"] for s in d["steps"]), key=lambda s: (s["ns"], s["offset"])
    )
    links: dict[str, dict[str, Any]] = {
        e["target"]: e for e in graph["edges"] if e["relation"] == "next_step" and e["on_selected_path"]
    }

    guides = []
    for index, node in enumerate(path):
        step = steps_by_order[index] if index < len(steps_by_order) else {}
        detection = detections.get(node["detection_id"] or "", {})
        link = links.get(node["node_id"])
        actor, target = step.get("actor"), step.get("target")
        who = NO_ACTOR
        if actor and target:
            who = f"{actor} acted on {target}."
        elif actor:
            who = f"{actor} is the source named by these records."
        elif target:
            who = f"{target} received this activity. {NO_ACTOR}"
        count = node["count"]
        cited = len(node["evidence_refs"])
        evidence = f"{cited} source record{'s' if cited != 1 else ''} cited" + (
            f", standing in for {count:,} merged records." if count > cited else "."
        )
        if link and link["missing_evidence"]:
            uncertain = "No shared entity links this step to the previous one, so the connection is a gap."
        elif link:
            uncertain = "A rule inferred the link from the previous step. No single record states it."
        else:
            uncertain = "This is the earliest evidence in this data, not proof of how access began."
        guides.append(
            StepGuide(
                node_id=node["node_id"],
                what_happened=_sentence(node["label"]),
                who=who,
                evidence=evidence,
                why_it_matters=WHY_BY_STAGE.get(node["stage"] or "", "This is part of the selected path."),
                uncertain=uncertain,
                check_next=(
                    f"Inspect the cited records for {detection.get('title', 'this step').lower()}."
                    if detection
                    else "Inspect the cited records."
                ),
                evidence_refs=node["evidence_refs"][:8],
            )
        )

    first_refs = path[0]["evidence_refs"][:5] if path else []
    checks = [
        NextCheck(
            kind="inspect_records",
            action="Inspect the cited source records",
            reason=(
                f"{len(detail['evidence'])} stored records support this incident. "
                "Reading them is the fastest way to test it."
            ),
            evidence_refs=first_refs,
        )
    ]
    users = detail["affected_entities"].get("users", [])
    if users:
        checks.append(
            NextCheck(
                kind="validate_identity",
                action=f"Ask who owns {', '.join(users[:3])}, and whether this activity was expected",
                reason="These logs name the accounts but cannot show who was using them.",
                evidence_refs=first_refs,
            )
        )
    devices = detail["affected_entities"].get("devices", [])
    if devices or detail["summary"]["critical_target"]:
        asset = devices[0] if devices else detail["summary"]["critical_target"]
        checks.append(
            NextCheck(
                kind="validate_asset",
                action=f"Confirm the owner and importance of {asset}",
                reason="The log has no asset inventory, so its business importance is unknown here.",
                evidence_refs=first_refs,
            )
        )
    if any("payload or endpoint data" in gap for gap in detail["evidence_gaps"]):
        checks.append(
            NextCheck(
                kind="collect_telemetry",
                action="Collect endpoint or payload records for the same period",
                reason="These logs cannot show whether an attempted action succeeded.",
                evidence_refs=[],
            )
        )
    if reach["targets"]:
        targets = ", ".join(t["target"] for t in reach["targets"][:3])
        checks.append(
            NextCheck(
                kind="review_reachable",
                action=f"Review the hypothetical next systems: {targets}",
                reason=reach["label"],
                evidence_refs=[r for t in reach["targets"][:3] for r in t["evidence_refs"]][:6],
            )
        )
    if hypotheses["alternates"]:
        best = hypotheses["alternates"][0]
        checks.append(
            NextCheck(
                kind="compare_hypothesis",
                action=f"Test the alternative: {best['title']}",
                reason=best["description"],
                evidence_refs=[],
            )
        )
    return IncidentGuide(
        incident_id=detail["summary"]["incident_id"],
        steps=guides,
        next_checks=checks,
        note="Checks to consider, derived from stored evidence. HALT has not taken any action.",
    )
