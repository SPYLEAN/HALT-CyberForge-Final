"""ATT&CK stage mapping and Attack Flow-compatible export.

Mapping table `halt.attack-map/1.0`: scenario-independent rules over canonical event semantics. Technique IDs
are ATT&CK Enterprise identifiers as published by MITRE; this pass does not validate them against a STIX
bundle.
Each candidate says how it was reached:
  observed      the log line itself evidences the technique (e.g. an MFA method was added)
  rule_inferred a rule concluded it from context (e.g. a valid-account sign-in from a first-seen network)
  uncertain     one of several plausible techniques for the same behaviour
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from halt.ps2.schema import CanonicalEvent, StageAssignment, Tactic, TechniqueCandidate

TACTIC_ORDER: list[Tactic] = [
    "reconnaissance",
    "resource-development",
    "initial-access",
    "execution",
    "persistence",
    "privilege-escalation",
    "defense-evasion",
    "credential-access",
    "discovery",
    "lateral-movement",
    "collection",
    "command-and-control",
    "exfiltration",
    "impact",
]
TACTIC_INDEX = {t: i for i, t in enumerate(TACTIC_ORDER)}

NAMES = {
    "T1566.002": "Phishing: Spearphishing Link",
    "T1078": "Valid Accounts",
    "T1078.004": "Valid Accounts: Cloud Accounts",
    "T1556.006": "Modify Authentication Process: Multi-Factor Authentication",
    "T1528": "Steal Application Access Token",
    "T1550.001": "Use Alternate Authentication Material: Application Access Token",
    "T1098.001": "Account Manipulation: Additional Cloud Credentials",
    "T1098.003": "Account Manipulation: Additional Cloud Roles",
    "T1619": "Cloud Storage Object Discovery",
    "T1083": "File and Directory Discovery",
    "T1213": "Data from Information Repositories",
    "T1530": "Data from Cloud Storage",
    "T1059": "Command and Scripting Interpreter",
}

_INTERPRETERS = {"python", "python3", "python.exe", "powershell.exe", "pwsh", "bash", "sh", "cmd.exe"}
_BASIS_RANK = {"observed": 0, "rule_inferred": 1, "uncertain": 2}

Basis = Literal["observed", "rule_inferred", "uncertain"]


def _t(tid: str, tactic: Tactic, basis: Basis, rule: str) -> TechniqueCandidate:
    return TechniqueCandidate(
        technique_id=tid, technique_name=NAMES[tid], tactic=tactic, basis=basis, rule=rule
    )


def candidates(e: CanonicalEvent, suspicious: bool, cloud_resource: bool) -> list[TechniqueCandidate]:
    """Technique candidates for one event. Ambiguous kinds map only when the event is suspicious."""
    k = e.event_kind
    out: list[TechniqueCandidate] = []
    if k == "email_delivery" and (suspicious or e.link_type == "oauth_consent"):
        out.append(
            _t(
                "T1566.002",
                "initial-access",
                "rule_inferred",
                "A-MAIL: link delivered to the recipient; delivery alone does not prove a click",
            )
        )
    elif k == "authentication" and e.outcome == "success" and suspicious:
        tid = "T1078.004" if (e.actor_kind == "service" or e.application) else "T1078"
        out.append(
            _t(
                tid,
                "initial-access",
                "rule_inferred",
                "A-AUTH: valid-account sign-in that matched suspicious-authentication rules",
            )
        )
    elif k == "mfa_method_change":
        out.append(
            _t("T1556.006", "persistence", "observed", "A-MFA: the record is an MFA-method registration")
        )
    elif k == "app_consent":
        basis: Basis = "rule_inferred" if (e.publisher_verified is False or suspicious) else "uncertain"
        out.append(
            _t(
                "T1528",
                "credential-access",
                basis,
                "A-CONSENT: delegated consent grants the application tokens for the user",
            )
        )
    elif k == "token_use" and suspicious:
        out.append(
            _t(
                "T1550.001",
                "defense-evasion",
                "rule_inferred",
                "A-TOKEN: an issued token presented from another network",
            )
        )
    elif k == "credential_change":
        out.append(
            _t("T1098.001", "persistence", "observed", "A-CRED: credentials added to a service principal")
        )
    elif k == "permission_change":
        out.append(
            _t("T1098.003", "privilege-escalation", "observed", "A-ROLE: a role or policy was granted")
        )
    elif k == "role_assumption" and suspicious:
        out.append(
            _t(
                "T1078.004",
                "privilege-escalation",
                "rule_inferred",
                "A-ASSUME: cloud role assumed from a suspicious context",
            )
        )
    elif k == "resource_enumeration" and suspicious:
        if cloud_resource:
            out.append(_t("T1619", "discovery", "uncertain", "A-ENUM: listing cloud storage objects"))
        else:
            out.append(_t("T1083", "discovery", "uncertain", "A-ENUM: listing files and folders"))
        out.append(
            _t(
                "T1213",
                "collection",
                "uncertain",
                "A-ENUM: enumeration may also be collection from a repository",
            )
        )
    elif k in ("resource_access", "database_query", "access_denied") and suspicious:
        if cloud_resource and k != "database_query":
            out.append(
                _t(
                    "T1530",
                    "collection",
                    "rule_inferred" if k != "access_denied" else "uncertain",
                    "A-DATA: data read from cloud storage",
                )
            )
        else:
            out.append(
                _t(
                    "T1213",
                    "collection",
                    "rule_inferred" if k != "access_denied" else "uncertain",
                    "A-DATA: data read from an information repository",
                )
            )
    elif k == "token_issued" and suspicious:
        out.append(
            _t(
                "T1550.001",
                "defense-evasion",
                "uncertain",
                "A-MINT: a new access token minted from another credential",
            )
        )
    elif k == "process_start" and suspicious and (e.process or "") in _INTERPRETERS:
        out.append(_t("T1059", "execution", "uncertain", "A-PROC: interpreter launched"))
    return out


def assign(e: CanonicalEvent, cands: list[TechniqueCandidate]) -> StageAssignment:
    primary = min(enumerate(cands), key=lambda ic: (_BASIS_RANK[ic[1].basis], ic[0]))[1] if cands else None
    return StageAssignment(
        event_id=e.event_id, tactic=primary.tactic if primary else None, primary=primary, candidates=cands
    )


# ---- Attack Flow-compatible export (internal adapter; not validated against the official schema)

_NS = uuid.UUID("6f1d4b2a-6a38-4d5e-9c2f-3a0b7f6d2e11")


def _sid(kind: str, key: str) -> str:
    return f"{kind}--{uuid.uuid5(_NS, key)}"


def attack_flow(
    run_id: str, title: str, event_ids: list[str], stages: dict[str, StageAssignment]
) -> dict[str, Any]:
    actions = []
    ids = [_sid("attack-action", f"{run_id}:{eid}") for eid in event_ids]
    for i, eid in enumerate(event_ids):
        st = stages.get(eid)
        action: dict[str, Any] = {
            "type": "attack-action",
            "id": ids[i],
            "name": st.primary.technique_name if st and st.primary else "Unmapped step",
            "x_halt_event_id": eid,
            "x_halt_basis": st.primary.basis if st and st.primary else None,
            "effect_refs": [ids[i + 1]] if i + 1 < len(ids) else [],
        }
        if st and st.primary:
            action["technique_id"] = st.primary.technique_id
            action["tactic_id"] = st.primary.tactic
        actions.append(action)
    flow = {
        "type": "attack-flow",
        "id": _sid("attack-flow", run_id),
        "name": title,
        "scope": "incident",
        "start_refs": ids[:1],
    }
    return {
        "type": "bundle",
        "id": _sid("bundle", run_id),
        "x_halt_conformance": "attack-flow-compatible shape; not validated against the official schema",
        "objects": [flow, *actions],
    }


def validate_flow_shape(doc: dict[str, Any]) -> list[str]:
    """Boundary check of the export's own shape (types, ids, references). Empty list = consistent."""
    problems: list[str] = []
    objects = doc.get("objects")
    if doc.get("type") != "bundle" or not isinstance(objects, list):
        return ["not a bundle with objects"]
    ids = {o.get("id") for o in objects if isinstance(o, dict)}
    flows = [o for o in objects if o.get("type") == "attack-flow"]
    if len(flows) != 1:
        problems.append("exactly one attack-flow object is required")
    for o in objects:
        for ref in [*o.get("start_refs", []), *o.get("effect_refs", [])]:
            if ref not in ids:
                problems.append(f"{o.get('id')} references unknown {ref}")
        if o.get("type") == "attack-action" and not str(o.get("id", "")).startswith("attack-action--"):
            problems.append(f"bad action id {o.get('id')}")
    return problems
