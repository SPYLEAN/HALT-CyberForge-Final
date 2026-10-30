"""Run the existing HALT-R1 scorer (unchanged) on canonical events of the kinds it was trained on.

R1 scores human identity-attack events: mail, sign-in, MFA change, consent, token replay and resource access.
The attributes R1 reads (first-seen ASN, seconds since sign-in, …) are derived here from earlier canonical
events
in the same batch. Service-account, cloud-control-plane, process and database events are outside R1's training
distribution and get no anomaly score (None), never a guessed one.
"""

from __future__ import annotations

from datetime import UTC

from halt.contracts.events import EventKind as R1Kind
from halt.contracts.events import EventSource, SecurityEvent
from halt.ps2.schema import CanonicalEvent
from halt.r1.correlate import score_stream
from halt.r1.model import configured_model


def _kind(e: CanonicalEvent) -> R1Kind | None:
    if e.actor_kind == "service":
        return None
    return {
        "email_delivery": "mail_delivered",
        "authentication": "sign_in",
        "mfa_method_change": "mfa_method_added",
        "app_consent": "oauth_consent",
        "token_use": "token_replay",
        "resource_enumeration": "resource_enumeration",
        "resource_access": "resource_access",
    }.get(e.event_kind)  # type: ignore[return-value]


def anomaly_scores(events: list[CanonicalEvent]) -> dict[str, float]:
    seen_asn: dict[str, set[int]] = {}
    seen_ua: dict[str, set[str]] = {}
    last_sign_in: dict[str, float] = {}
    issued: dict[str, CanonicalEvent] = {}
    bridged: list[tuple[str, SecurityEvent]] = []
    for e in events:  # already in (occurred_at, event_id) order
        if e.token_issued:
            issued[e.token_issued] = e
        kind = _kind(e)
        if kind is None:
            continue
        user = (e.target_user if kind == "mail_delivered" else e.actor_user) or ""
        ts = e.occurred_at.timestamp()
        attrs: dict[str, str | int | float | bool] = {"upn": user}
        if kind == "mail_delivered":
            attrs.update(
                recipient=user,
                sender_domain_age_days=e.sender_domain_age_days
                if e.sender_domain_age_days is not None
                else 10**6,
                link_type=e.link_type or "none",
            )
        elif kind == "sign_in":
            asns, uas = seen_asn.setdefault(user, set()), seen_ua.setdefault(user, set())
            attrs.update(
                asn_first_seen_for_user=bool(asns) and e.asn is not None and e.asn not in asns,
                user_agent_first_seen_for_user=bool(uas)
                and e.user_agent is not None
                and e.user_agent not in uas,
                result="success" if e.outcome == "success" else "failure",
            )
            if e.asn is not None:
                asns.add(e.asn)
            if e.user_agent:
                uas.add(e.user_agent)
            last_sign_in[user] = ts
        elif kind == "mfa_method_added":
            attrs["seconds_since_sign_in"] = ts - last_sign_in[user] if user in last_sign_in else 10**9
        elif kind == "oauth_consent":
            attrs.update(
                app_age_days=e.app_age_days if e.app_age_days is not None else 10**6,
                scopes=" ".join(e.scopes),
            )
            if e.publisher_verified is not None:
                attrs["publisher_verified"] = e.publisher_verified
        elif kind == "token_replay":
            src = issued.get(e.token or "")
            attrs.update(
                device_mismatch=bool(src and src.device_id and src.device_id != e.device_id),
                asn=e.asn if e.asn is not None else -1,
                issued_asn=src.asn if src and src.asn is not None else -1,
            )
        else:
            attrs.update(request_count=e.request_count or 0, window_s=e.window_s or 0)
        sid = f"BG-{len(bridged) + 1:04d}"
        bridged.append(
            (
                e.event_id,
                SecurityEvent(
                    id=sid,
                    ts=e.occurred_at.astimezone(UTC),
                    source=EventSource(system=e.source_type, record_id=e.event_id),
                    kind=kind,
                    attributes=attrs,
                ),
            )
        )
    if not bridged:
        return {}
    model = configured_model()
    by_sid = {se.id: eid for eid, se in bridged}
    return {by_sid[s.event.id]: round(model(s.features), 6) for s in score_stream([se for _, se in bridged])}
