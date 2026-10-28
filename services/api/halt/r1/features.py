"""Per-event features computed from the event's attributes and the same user's earlier events."""

from __future__ import annotations

from dataclasses import dataclass, field

from halt.contracts.events import SecurityEvent

FEATURE_NAMES = [
    "is_sign_in",
    "asn_new",
    "ua_new",
    "sign_in_failed",
    "is_mfa_change",
    "mfa_soon_after_sign_in",
    "mfa_after_new_asn",
    "is_consent",
    "publisher_unverified",
    "app_young",
    "high_privilege_scope",
    "consent_after_mfa_change",
    "is_replay",
    "device_mismatch",
    "asn_changed",
    "is_resource_access",
    "request_rate",
    "is_mail",
    "sender_domain_young",
    "consent_link",
    "prior_suspicious",
]

MFA_SOON_S = 300
NEW_ASN_LOOKBACK_S = 3600
CONSENT_AFTER_MFA_S = 600
YOUNG_DAYS = 30
HIGH_PRIVILEGE = ("Files.ReadWrite.All", "Mail.Read", "Mail.ReadWrite", "Directory.ReadWrite.All")


@dataclass
class _UserState:
    last_new_asn_sign_in: float | None = None
    last_mfa_change: float | None = None
    suspicious: int = 0


@dataclass
class FeatureExtractor:
    """Stateful: feed events in timestamp order. `mark_suspicious` lets the rule layer feed back."""

    users: dict[str, _UserState] = field(default_factory=dict)

    @staticmethod
    def upn(e: SecurityEvent) -> str:
        return str(e.attributes.get("upn") or e.attributes.get("recipient") or "")

    def state(self, e: SecurityEvent) -> _UserState:
        return self.users.setdefault(self.upn(e), _UserState())

    def mark_suspicious(self, e: SecurityEvent) -> None:
        self.state(e).suspicious += 1

    def extract(self, e: SecurityEvent) -> dict[str, float]:
        a = e.attributes
        st = self.state(e)
        ts = e.ts.timestamp()
        f = dict.fromkeys(FEATURE_NAMES, 0.0)
        f["prior_suspicious"] = min(st.suspicious, 3) / 3

        if e.kind == "sign_in":
            f["is_sign_in"] = 1
            f["asn_new"] = float(bool(a.get("asn_first_seen_for_user")))
            f["ua_new"] = float(bool(a.get("user_agent_first_seen_for_user")))
            f["sign_in_failed"] = float(a.get("result") == "failure")
            if f["asn_new"] and not f["sign_in_failed"]:
                st.last_new_asn_sign_in = ts
        elif e.kind == "mfa_method_added":
            f["is_mfa_change"] = 1
            f["mfa_soon_after_sign_in"] = float(float(a.get("seconds_since_sign_in", 1e9)) <= MFA_SOON_S)
            if st.last_new_asn_sign_in is not None and ts - st.last_new_asn_sign_in <= NEW_ASN_LOOKBACK_S:
                f["mfa_after_new_asn"] = 1
            st.last_mfa_change = ts
        elif e.kind == "oauth_consent":
            f["is_consent"] = 1
            f["publisher_unverified"] = float(a.get("publisher_verified") is False)
            f["app_young"] = float(float(a.get("app_age_days", 1e9)) < YOUNG_DAYS)
            f["high_privilege_scope"] = float(any(s in str(a.get("scopes", "")) for s in HIGH_PRIVILEGE))
            if st.last_mfa_change is not None and ts - st.last_mfa_change <= CONSENT_AFTER_MFA_S:
                f["consent_after_mfa_change"] = 1
        elif e.kind == "token_replay":
            f["is_replay"] = 1
            f["device_mismatch"] = float(bool(a.get("device_mismatch")))
            f["asn_changed"] = float(a.get("asn") != a.get("issued_asn"))
        elif e.kind in ("resource_access", "resource_enumeration"):
            f["is_resource_access"] = 1
            window = float(a.get("window_s", 0)) or 1.0
            f["request_rate"] = min(float(a.get("request_count", 0)) / window, 2.0)
        elif e.kind == "mail_delivered":
            f["is_mail"] = 1
            f["sender_domain_young"] = float(float(a.get("sender_domain_age_days", 1e9)) < YOUNG_DAYS)
            f["consent_link"] = float(a.get("link_type") == "oauth_consent")
        return f


def vector(f: dict[str, float]) -> list[float]:
    return [f[name] for name in FEATURE_NAMES]
