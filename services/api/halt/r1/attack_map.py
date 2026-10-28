"""Map a suspicious event to an ATT&CK technique and an attack stage (by kind and the rule that fired)."""

from __future__ import annotations

from halt.contracts.events import AttackTechnique, EventKind
from halt.contracts.findings import Stage

_MAP: dict[str, tuple[str, str, Stage]] = {
    "mail_delivered": ("T1566.002", "Phishing: Spearphishing Link", "initial_access"),
    "sign_in": ("T1078.004", "Valid Accounts: Cloud Accounts", "initial_access"),
    "mfa_method_added": (
        "T1556.006",
        "Modify Authentication Process: Multi-Factor Authentication",
        "credential_persistence",
    ),
    "oauth_consent": ("T1528", "Steal Application Access Token", "credential_persistence"),
    "token_replay": ("T1550.004", "Use Alternate Authentication Material: Web Session Cookie", "token_abuse"),
    "resource_access": ("T1213.002", "Data from Information Repositories: Sharepoint", "discovery"),
    "resource_enumeration": ("T1213.002", "Data from Information Repositories: Sharepoint", "discovery"),
}


def technique(kind: EventKind) -> AttackTechnique:
    tid, name, _ = _MAP[kind]
    return AttackTechnique(technique_id=tid, technique_name=name)


def stage(kind: EventKind) -> Stage:
    return _MAP[kind][2]
