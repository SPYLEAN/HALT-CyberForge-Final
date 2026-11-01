"""Response Handoff: what an analyst could take to the people who can act, from one stored incident only.

Deterministic, with no language model. It reads the selected run's stored evidence, executes nothing and sends
nothing. A containment consideration appears only when a rule's stored evidence names the thing it concerns,
and even then it stays a consideration: the incident is unconfirmed, and no backend path converts a FireX
incident into the SafeCut or Action Gate contract.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from halt.firex.contracts import (
    ApprovalRequirement,
    ContainmentConsideration,
    HandoffItem,
    NextCheck,
    ResponseHandoff,
)
from halt.firex.guide import build_guide
from halt.firex.reviews import latest_reviews
from halt.firex.util import read_json

BOUNDARY = (
    "SafeCut and Action Gate work on the synthetic response contract only. No converter from a FireX "
    "incident to that contract exists, so nothing here is sent to them."
)
STATEMENT = (
    "HALT has not executed, simulated or scheduled any response. These are items for people to review, "
    "derived from this incident's stored evidence."
)
REQUIRES = "Analyst confirmation and the system owner's approval"
# The entity field a consideration concerns, and its wording. Without that entity, nothing is shown.
CONSIDERATIONS: dict[str, tuple[str, str]] = {
    "account_lifecycle": ("devices", "Review who may create administrator accounts on {value}."),
    "logging_tamper": (
        "devices",
        "Review who may change logging on {value}, and check it is on.",
    ),
    "web_attack_concentration": ("dst_ips", "Review the exposure and edge filtering of {value}."),
    "internal_fanout": ("src_ips", "Discuss whether {value} needs isolating while it is reviewed."),
    "sustained_dns": ("src_ips", "Discuss whether DNS from {value} needs restricting while it is reviewed."),
    "repeated_malware": ("src_ips", "Discuss whether {value} needs isolating while it is scanned."),
    "denial_flood": ("dst_ips", "Review rate limits and upstream filtering for {value}."),
    "vpn_alternation": ("users", "Discuss whether VPN sessions for {value} need resetting."),
    "failure_then_success": ("users", "Discuss whether credentials for {value} need resetting."),
}


def _item(check: NextCheck) -> HandoffItem:
    return HandoffItem(action=check.action, reason=check.reason, evidence_refs=check.evidence_refs)


def _containment(detail: dict[str, Any]) -> list[ContainmentConsideration]:
    out = []
    for detection in detail["detections"]:
        rule = CONSIDERATIONS.get(detection["rule_id"])
        values = detection["entities"].get(rule[0], []) if rule else []
        if not rule or not values:
            continue
        out.append(
            ContainmentConsideration(
                consideration=rule[1].format(value=", ".join(values[:3])),
                supported_by=f"{detection['rule_id']} {detection['rule_version']}: {detection['reason']}",
                requires=REQUIRES,
                evidence_refs=detection["evidence_refs"][:5],
            )
        )
    return out


def build_handoff(folder: Path) -> ResponseHandoff:
    detail: dict[str, Any] = read_json(folder / "detail.json")
    reach: dict[str, Any] = read_json(folder / "reachability.json")
    summary = detail["summary"]
    guide = build_guide(folder)
    checks = guide.next_checks
    first_refs = checks[0].evidence_refs if checks else []
    entities = detail["affected_entities"]
    # .../results/firex-runs/<run>/incidents/<incident>: the review store sits beside the runs.
    root = folder.parents[4]
    review = latest_reviews(summary["run_id"], root).get(summary["incident_id"])
    confirmed = bool(review and review.decision == "Confirmed")
    missing = [
        HandoffItem(action=gap, reason="Recorded as a gap in this incident.", evidence_refs=[])
        for gap in detail["evidence_gaps"]
    ]
    missing += [_item(c) for c in checks if c.kind == "collect_telemetry"]
    return ResponseHandoff(
        incident_id=summary["incident_id"],
        run_id=summary["run_id"],
        execution_state="NOT EXECUTED",
        incident_status=summary["status"],
        statement=STATEMENT,
        investigation_actions=[
            _item(c) for c in checks if c.kind in ("inspect_records", "compare_hypothesis")
        ],
        missing_evidence=missing,
        identities_to_validate=[
            HandoffItem(
                action=f"Confirm who owns {user}, and whether this activity was expected",
                reason="These logs name the account but cannot show who was using it.",
                evidence_refs=first_refs,
            )
            for user in entities.get("users", [])[:12]
        ],
        assets_to_validate=[
            HandoffItem(
                action=f"Confirm the owner and importance of {asset}",
                reason="The log has no asset inventory.",
                evidence_refs=first_refs,
            )
            for asset in entities.get("devices", [])[:12]
        ],
        reachable_to_monitor=[
            HandoffItem(
                action=f"Consider monitoring {target['target']}",
                reason=f"{reach['label']} Hypothetical: a path seen in the log, not activity.",
                evidence_refs=target["evidence_refs"][:5],
            )
            for target in reach["targets"][:12]
        ],
        containment_considerations=_containment(detail),
        containment_note=(
            "Considerations only. HALT does not recommend or perform them while the incident is unconfirmed."
        ),
        approvals=[
            ApprovalRequirement(
                requirement="An analyst confirms the incident",
                state="Recorded in an analyst review" if confirmed else "Not met",
            ),
            ApprovalRequirement(
                requirement="The system owner approves any change",
                state="Not recorded: HALT has no record of owners or approvals for this log",
            ),
            ApprovalRequirement(requirement="A response system accepts this incident", state="Not available"),
        ],
        integration_boundary=BOUNDARY,
        missing_response_context=detail["response_simulation"]["missing"],
    )
