"""Suspicion scoring: deterministic, scenario-independent rules (weights in config) combined with HALT-R1.

Rules read only canonical fields and the batch's own history (what each identity did earlier). Organisation
context can lower suspicion (known egress networks), never raise it beyond what the rules found.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field

from halt.ps2.config import ReconstructionConfig
from halt.ps2.schema import CanonicalEvent, OrgContext

CRITICALITY_SCORE = {"critical": 1.0, "high": 0.75, "medium": 0.4, "low": 0.1}


@dataclass(frozen=True)
class Suspicion:
    score: float
    rules: list[str] = field(default_factory=list)
    anomaly: float | None = None


def _ip(value: str | None) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(value) if value else None
    except ValueError:
        return None


_RFC1918 = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8")]


def is_external(ip: str | None, context: OrgContext) -> bool:
    """Outside RFC 1918 / loopback and outside the organisation's declared internal ranges. (Not `is_global`:
    the RFC 5737 documentation ranges used by synthetic data are not "global" to Python but are external
    here.)"""
    a = _ip(ip)
    if a is None:
        return False
    internal = [*_RFC1918, *(ipaddress.ip_network(c, strict=False) for c in context.internal_cidrs)]
    return not any(a in n for n in internal)


def known_egress(ip: str | None, context: OrgContext) -> bool:
    a = _ip(ip)
    return bool(a and any(a in ipaddress.ip_network(c, strict=False) for c in context.known_egress_cidrs))


def score(
    events: list[CanonicalEvent], context: OrgContext, config: ReconstructionConfig, anomaly: dict[str, float]
) -> dict[str, Suspicion]:
    w = config.seed.rules
    crit = {a.resource.lower(): a.criticality for a in context.assets}
    managed = {h.lower() for h in context.managed_hosts}
    seen_ip: dict[str, set[str]] = {}
    token_ip: dict[str, str] = {}
    out: dict[str, Suspicion] = {}
    for e in events:  # (occurred_at, event_id) order: "first seen" means earlier in this batch
        hits: list[tuple[str, float]] = []
        actor = e.actor_user or ""
        prior = seen_ip.setdefault(actor, set())
        egress = known_egress(e.src_ip, context)
        first_ip = bool(prior) and e.src_ip is not None and e.src_ip not in prior
        external = is_external(e.src_ip, context) and not egress
        target_crit = crit.get((e.resource or "").lower())
        k = e.event_kind
        if k == "authentication" and e.outcome == "success":
            if e.actor_kind == "service":
                if external and (first_ip or not prior):
                    hits.append(("service_auth_external_ip", w["service_auth_external_ip"]))
            elif first_ip:
                hits.append(("auth_first_seen_ip", w["auth_first_seen_ip"]))
                if not e.device_id or (e.device or "") not in managed:
                    hits.append(("auth_unmanaged_device", w["auth_unmanaged_device"]))
        elif k == "email_delivery":
            if e.sender_domain_age_days is not None and e.sender_domain_age_days < config.seed.young_days:
                hits.append(("email_young_domain", w["email_young_domain"]))
            if e.link_type == "oauth_consent":
                hits.append(("email_consent_link", w["email_consent_link"]))
        elif k == "app_consent":
            if e.publisher_verified is False:
                hits.append(("consent_unverified_publisher", w["consent_unverified_publisher"]))
            if set(e.scopes) & set(config.seed.high_privilege_scopes):
                hits.append(("consent_high_privilege_scope", w["consent_high_privilege_scope"]))
            if e.app_age_days is not None and e.app_age_days < config.seed.young_days:
                hits.append(("consent_young_app", w["consent_young_app"]))
        elif k == "mfa_method_change":
            hits.append(("mfa_change", w["mfa_change"]))
        elif k == "credential_change":
            hits.append(("credential_added", w["credential_added"]))
        elif (
            k == "token_use"
            and e.token
            and e.token in token_ip
            and e.src_ip
            and e.src_ip != token_ip[e.token]
        ):
            hits.append(("token_use_new_ip", w["token_use_new_ip"]))
        elif k == "role_assumption" and external:
            hits.append(("role_assumption_external", w["role_assumption_external"]))
        elif (
            k == "permission_change"
            and e.permission
            and (
                "*" in e.permission or "admin" in e.permission.lower() or "fullaccess" in e.permission.lower()
            )
        ):
            hits.append(("permission_wildcard", w["permission_wildcard"]))
        rate = (e.request_count or 0) / max((e.window_s or 0) / 60, 1 / 60)
        if k == "resource_enumeration" and e.window_s and rate >= config.seed.enumeration_rate_per_min:
            hits.append(("enumeration_burst", w["enumeration_burst"]))
        if k == "access_denied" and target_crit in ("high", "critical"):
            hits.append(("access_denied_critical", w["access_denied_critical"]))
        if k in ("resource_access", "database_query") and target_crit in ("high", "critical") and external:
            hits.append(("access_critical_from_external", w["access_critical_from_external"]))
        rule_score = min(1.0, sum(v for _, v in hits))
        a = anomaly.get(e.event_id)
        model_score = config.seed.r1_weight * a if a is not None else 0.0
        if egress and (hits or model_score):
            # A known corporate egress network contradicts "first-seen network": it lowers both rules and
            # model.
            hits.append(("known_egress_suppression", -w["known_egress_suppression"]))
            rule_score = max(0.0, rule_score - w["known_egress_suppression"])
            model_score = max(0.0, model_score - w["known_egress_suppression"])
        total = max(rule_score, model_score)
        out[e.event_id] = Suspicion(round(min(1.0, total), 6), [n for n, _ in hits], a)
        if e.src_ip and e.outcome == "success":
            prior.add(e.src_ip)
        if e.token_issued and e.src_ip:
            token_ip[e.token_issued] = e.src_ip
    return out
