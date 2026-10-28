"""Deterministic detection rules. Each returns a score in [0, 1] and the conditions it checked."""

from __future__ import annotations

from dataclasses import dataclass

SUSPICIOUS = 0.5  # rule score at or above which an event seeds or joins an incident


@dataclass(frozen=True)
class RuleHit:
    rule_id: str
    score: float
    met: list[str]
    checked: list[str]


def _hit(rule_id: str, conditions: dict[str, bool], weights: dict[str, float]) -> RuleHit:
    met = [c for c, ok in conditions.items() if ok]
    return RuleHit(rule_id, min(1.0, sum(weights[c] for c in met)), met, list(conditions))


def evaluate(f: dict[str, float]) -> RuleHit | None:
    if f["is_sign_in"]:
        return _hit(
            "R-SIGNIN",
            {
                "first-seen ASN": bool(f["asn_new"]),
                "first-seen user agent": bool(f["ua_new"]),
                "earlier suspicious activity for the user": f["prior_suspicious"] > 0,
            },
            {
                "first-seen ASN": 0.4,
                "first-seen user agent": 0.4,
                "earlier suspicious activity for the user": 0.2,
            },
        )
    if f["is_mfa_change"]:
        return _hit(
            "R-MFA",
            {
                "added within 5 min of sign-in": bool(f["mfa_soon_after_sign_in"]),
                "after a first-seen-ASN sign-in": bool(f["mfa_after_new_asn"]),
            },
            {"added within 5 min of sign-in": 0.45, "after a first-seen-ASN sign-in": 0.45},
        )
    if f["is_consent"]:
        return _hit(
            "R-CONSENT",
            {
                "unverified publisher": bool(f["publisher_unverified"]),
                "app under 30 days old": bool(f["app_young"]),
                "high-privilege scopes": bool(f["high_privilege_scope"]),
                "within 10 min of an MFA change": bool(f["consent_after_mfa_change"]),
            },
            {
                "unverified publisher": 0.3,
                "app under 30 days old": 0.25,
                "high-privilege scopes": 0.2,
                "within 10 min of an MFA change": 0.25,
            },
        )
    if f["is_replay"]:
        return _hit(
            "R-REPLAY",
            {
                "device mismatch": bool(f["device_mismatch"]),
                "different ASN from issue": bool(f["asn_changed"]),
                "earlier suspicious activity for the user": f["prior_suspicious"] > 0,
            },
            {
                "device mismatch": 0.5,
                "different ASN from issue": 0.2,
                "earlier suspicious activity for the user": 0.3,
            },
        )
    if f["is_resource_access"]:
        return _hit(
            "R-ENUM",
            {
                "over 0.5 requests/s": f["request_rate"] > 0.5,
                "earlier suspicious activity for the user": f["prior_suspicious"] > 0,
            },
            {"over 0.5 requests/s": 0.4, "earlier suspicious activity for the user": 0.4},
        )
    if f["is_mail"]:
        return _hit(
            "R-MAIL",
            {
                "OAuth consent link": bool(f["consent_link"]),
                "sender domain under 30 days old": bool(f["sender_domain_young"]),
            },
            {"OAuth consent link": 0.35, "sender domain under 30 days old": 0.35},
        )
    return None
