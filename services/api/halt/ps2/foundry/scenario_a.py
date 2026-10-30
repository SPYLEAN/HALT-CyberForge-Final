"""Scenario A: OAuth consent phishing against Finance Operations (synthetic).

Attack: phishing mail with a consent link → sign-in from an unfamiliar network → MFA method added in that
session → consent to an unverified app (token minted) → token replayed from attacker infrastructure → finance
library enumerated → finance-ledger access attempted and denied.
Noise: normal sign-ins over corporate egress, routine file access and mail, a legitimate consent, a legitimate
MFA change (ambiguous), a VPN sign-in from a first-seen ASN (false-positive bait, known egress), a marketing
mail
from a young domain (false-positive bait), one malformed JSON line and one short CSV row.
"""

from __future__ import annotations

import random
from datetime import timedelta
from typing import Any

from halt.ps2.foundry.common import Builder, at, iso, jitter, rid

DAY = "2026-10-29"
CAPTURED_AT = "2026-10-29T12:00:00Z"  # after the whole log window
TENANT = "contoso.example"
CORP_EGRESS = "192.0.2.10"
VPN_EGRESS = "192.0.2.70"
OFFICE_APP = ("4765445b-32c6-49b0-83e6-1d93765276ca", "OfficeHome")
FILES_APP = ("00000003-0000-0ff1-ce00-000000000000", "SharePoint Online")
USERS = ["m.verma", "s.iyer", "k.rao", "j.ortiz", "a.chen", "p.nair", "r.okafor"]
LIBRARIES = ["finance-close-library", "ap-invoices-library", "treasury-reports", "team-site-docs"]

CONTEXT: dict[str, Any] = {
    "organisation": "Contoso Finance (synthetic)",
    "internal_cidrs": ["10.20.0.0/16"],
    "known_egress_cidrs": ["192.0.2.0/27", "192.0.2.64/27"],
    "managed_hosts": [f"fin-ws-{i:03d}" for i in range(10, 30)],
    "service_accounts": [],
    "business_services": [
        {"name": "Month-end close", "criticality": "high"},
        {"name": "Finance ledger", "criticality": "critical"},
        {"name": "Accounts payable", "criticality": "high"},
        {"name": "Treasury", "criticality": "high"},
        {"name": "Collaboration", "criticality": "low"},
    ],
    "assets": [
        {
            "resource": "finance-close-library",
            "resource_type": "file_share",
            "business_service": "Month-end close",
            "criticality": "high",
            "depends_on": ["finance-api"],
        },
        {
            "resource": "finance-api",
            "resource_type": "api",
            "business_service": "Finance ledger",
            "criticality": "critical",
            "depends_on": ["finance-ledger-db"],
        },
        {
            "resource": "finance-ledger-db",
            "resource_type": "database",
            "business_service": "Finance ledger",
            "criticality": "critical",
            "depends_on": [],
        },
        {
            "resource": "ap-invoices-library",
            "resource_type": "file_share",
            "business_service": "Accounts payable",
            "criticality": "high",
            "depends_on": [],
        },
        {
            "resource": "treasury-reports",
            "resource_type": "file_share",
            "business_service": "Treasury",
            "criticality": "high",
            "depends_on": [],
        },
        {
            "resource": "team-site-docs",
            "resource_type": "file_share",
            "business_service": "Collaboration",
            "criticality": "low",
            "depends_on": [],
        },
    ],
}

FILES = [
    {"filename": "mail_trace.csv", "adapter": "mail_trace", "content_type": "text/csv"},
    {"filename": "idp_signin.jsonl", "adapter": "idp_signin", "content_type": "application/x-ndjson"},
    {"filename": "idp_audit.json", "adapter": "idp_audit", "content_type": "application/json"},
    {"filename": "api_activity.jsonl", "adapter": "api_activity", "content_type": "application/x-ndjson"},
]
ENVELOPES = {"idp_audit.json": "value"}
COLUMNS = {
    "mail_trace.csv": [
        "message_id",
        "received_utc",
        "sender",
        "sender_domain",
        "sender_domain_age_days",
        "recipient",
        "subject",
        "link_domain",
        "link_type",
        "delivery_action",
    ]
}


def upn(u: str) -> str:
    return f"{u}@{TENANT}"


def oid(u: str) -> str:
    return "u-" + format(abs(hash_str(u)) % 16**8, "08x")


def hash_str(s: str) -> int:
    h = 0
    for ch in s:
        h = (h * 131 + ord(ch)) % (2**31)
    return h


def _signin(
    b: Builder,
    t: Any,
    user: str,
    ip: str,
    asn: int,
    device: str | None,
    session: str,
    ua: str,
    *,
    step: str | None = None,
    token: str | None = None,
    incoming: str | None = None,
    app: tuple[str, str] = OFFICE_APP,
    risk: str = "none",
    **truth: Any,
) -> None:
    rec_id = rid(b.rng, "si-")
    rec: dict[str, Any] = {
        "id": rec_id,
        "createdDateTime": iso(t),
        "userPrincipalName": upn(user),
        "userId": oid(user),
        "appId": app[0],
        "appDisplayName": app[1],
        "ipAddress": ip,
        "autonomousSystemNumber": asn,
        "userAgent": ua,
        "correlationId": session,
        "status": {"errorCode": 0},
        "signInEventType": "nonInteractiveUser" if incoming else "interactiveUser",
        "isInteractive": incoming is None,
        "riskLevelDuringSignIn": risk,
        "deviceDetail": {"deviceId": f"dev-{device}" if device else "", "displayName": device or ""},
    }
    if token:
        rec["uniqueTokenIdentifier"] = token
    if incoming:
        rec["incomingTokenId"] = incoming
    b.add("jsonl", "idp_signin.jsonl", t, rec, rec_id, step, **truth)


def _activity(
    b: Builder,
    t: Any,
    user: str,
    op: str,
    obj: str,
    session: str,
    ip: str,
    *,
    app: tuple[str, str] = FILES_APP,
    token: str | None = None,
    count: int = 1,
    window: int = 60,
    result: str = "Succeeded",
    step: str | None = None,
    **truth: Any,
) -> None:
    rec_id = rid(b.rng, "ua-")
    rec = {
        "RecordId": rec_id,
        "CreationTime": iso(t),
        "UserId": upn(user),
        "AppId": app[0],
        "Operation": op,
        "ObjectId": obj,
        "SessionId": session,
        "ClientIP": ip,
        "RequestCount": count,
        "WindowSeconds": window,
        "ResultStatus": result,
    }
    if token:
        rec["TokenId"] = token
    b.add("jsonl", "api_activity.jsonl", t, rec, rec_id, step, **truth)


def _audit(
    b: Builder,
    t: Any,
    user: str,
    activity: str,
    session: str,
    ip: str,
    details: dict[str, str],
    *,
    step: str | None = None,
    **truth: Any,
) -> None:
    rec_id = rid(b.rng, "da-")
    rec = {
        "id": rec_id,
        "activityDateTime": iso(t),
        "activityDisplayName": activity,
        "correlationId": session,
        "result": "success",
        "initiatedBy": {"user": {"userPrincipalName": upn(user), "id": oid(user), "ipAddress": ip}},
        "targetResources": [{"type": "User", "userPrincipalName": upn(user)}],
        "additionalDetails": [{"key": k, "value": v} for k, v in sorted(details.items())],
    }
    b.add("json", "idp_audit.json", t, rec, rec_id, step, **truth)


def _mail(
    b: Builder,
    t: Any,
    sender: str,
    domain: str,
    age: int,
    recipient: str,
    subject: str,
    link_domain: str,
    link_type: str,
    *,
    step: str | None = None,
    **truth: Any,
) -> None:
    rec_id = f"MT-{b.rng.randint(10000, 99999)}"
    row = {
        "message_id": rec_id,
        "received_utc": iso(t),
        "sender": sender,
        "sender_domain": domain,
        "sender_domain_age_days": str(age),
        "recipient": upn(recipient),
        "subject": subject,
        "link_domain": link_domain,
        "link_type": link_type,
        "delivery_action": "Delivered",
    }
    b.add("csv", "mail_trace.csv", t, row, rec_id, step, **truth)


def generate(seed: int = 2417) -> tuple[dict[str, str], dict[str, Any], dict[str, Any]]:
    """Returns (files, context, ground_truth). Different seeds vary the noise, ids and timing jitter."""
    rng = random.Random(seed)
    b = Builder(rng)
    edge_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130.0"
    devices = {u: f"fin-ws-{10 + i:03d}" for i, u in enumerate(USERS)}
    start = at(DAY, "06:30:00")

    # ---- background: workday sign-ins over corporate egress, routine file access, internal mail
    for u in USERS:
        t = jitter(rng, start, 1800)
        for n in range(3):
            session = rid(rng, "sess-")
            _signin(b, t, u, CORP_EGRESS, 64496, devices[u], session, edge_ua, token=rid(rng, "tok-"))
            for _ in range(rng.randint(4, 9)):
                t2 = jitter(rng, t, 2400)
                _activity(
                    b,
                    t2,
                    u,
                    rng.choice(["FileAccessed", "FileAccessed", "FileDownloaded", "FolderListed"]),
                    rng.choice(LIBRARIES),
                    session,
                    CORP_EGRESS,
                    count=rng.randint(1, 6),
                    window=60,
                )
            t = t + timedelta(minutes=rng.randint(70, 110))
            if n == 2:
                break
    for _ in range(36):
        sender, recipient = rng.sample(USERS, 2)
        _mail(
            b,
            jitter(rng, start, 4 * 3600),
            upn(sender),
            TENANT,
            3650,
            recipient,
            "Re: month-end",
            "sharepoint.contoso.example",
            "web",
        )
    for _ in range(10):
        _mail(
            b,
            jitter(rng, start, 4 * 3600),
            "noreply@vendor-portal.example",
            "vendor-portal.example",
            1400,
            rng.choice(USERS),
            "Invoice available",
            "vendor-portal.example",
            "web",
        )

    # ---- ambiguous and false-positive bait
    sess_si = rid(rng, "sess-")
    t_si = at(DAY, "09:12:00") + timedelta(seconds=rng.randint(0, 120))
    _signin(
        b, t_si, "s.iyer", CORP_EGRESS, 64496, devices["s.iyer"], sess_si, edge_ua, token=rid(rng, "tok-")
    )
    _audit(
        b,
        t_si + timedelta(seconds=95),
        "s.iyer",
        "User registered security info",
        sess_si,
        CORP_EGRESS,
        {"Method": "Microsoft Authenticator"},
    )  # legitimate MFA change
    t_kr = at(DAY, "09:20:00") + timedelta(seconds=rng.randint(0, 300))
    _signin(
        b,
        t_kr,
        "k.rao",
        VPN_EGRESS,
        64497,
        None,
        rid(rng, "sess-"),
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Safari/605.1",
        token=rid(rng, "tok-"),
    )  # VPN, first-seen ASN
    _mail(
        b,
        at(DAY, "08:44:10"),
        "offers@spring-offers.example",
        "spring-offers.example",
        9,
        "j.ortiz",
        "Your spring discount",
        "spring-offers.example",
        "web",
    )  # young domain, plain link
    t_jo = at(DAY, "10:05:00")
    sess_jo = rid(rng, "sess-")
    _signin(
        b,
        t_jo - timedelta(seconds=40),
        "j.ortiz",
        CORP_EGRESS,
        64496,
        devices["j.ortiz"],
        sess_jo,
        edge_ua,
        token=rid(rng, "tok-"),
    )
    _audit(
        b,
        t_jo,
        "j.ortiz",
        "Consent to application",
        sess_jo,
        CORP_EGRESS,
        {
            "AppId": "e7a1c2d4-expenses",
            "AppDisplayName": "Contoso Expenses",
            "PublisherVerified": "true",
            "AppAgeDays": "900",
            "ConsentScopes": "User.Read",
        },
    )

    # ---- the attack (m.verma)
    victim = "m.verma"
    attacker_ip, attacker_asn = "203.0.113.77", 64500
    replay_ip, replay_asn = "198.51.100.23", 64511
    s1, s2 = rid(rng, "sess-"), rid(rng, "sess-")
    app = ("d0c5f1e2-docusync-pro", "DocuSync Pro")
    grant_token = rid(rng, "tok-")
    t0 = at(DAY, "09:33:40") + timedelta(seconds=rng.randint(0, 20))
    _mail(
        b,
        t0,
        "billing@docusign-portal.example",
        "docusign-portal.example",
        3,
        victim,
        "Action required: sign the Q3 close pack",
        "login.docusign-portal.example",
        "oauth_consent",
        step="phishing_delivery",
        tactic="initial-access",
        artefacts=["mail:victim"],
    )
    t1 = t0 + timedelta(seconds=452 + rng.randint(0, 30))
    _signin(
        b,
        t1,
        victim,
        attacker_ip,
        attacker_asn,
        None,
        s1,
        "Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0",
        token=rid(rng, "tok-"),
        risk="medium",
        step="suspicious_authentication",
        tactic="initial-access",
        artefacts=["mail:victim", f"session:{s1}", f"ip:{attacker_ip}"],
    )
    t2 = t1 + timedelta(seconds=129)
    _audit(
        b,
        t2,
        victim,
        "User registered security info",
        s1,
        attacker_ip,
        {"Method": "Authenticator app (new device)"},
        step="mfa_modification",
        tactic="persistence",
        artefacts=[f"session:{s1}", f"ip:{attacker_ip}"],
    )
    t3 = t2 + timedelta(seconds=29)
    _audit(
        b,
        t3,
        victim,
        "Consent to application",
        s1,
        attacker_ip,
        {
            "AppId": app[0],
            "AppDisplayName": app[1],
            "PublisherVerified": "false",
            "AppAgeDays": "4",
            "ConsentScopes": "Files.ReadWrite.All Mail.Read offline_access",
            "IssuedTokenId": grant_token,
        },
        step="malicious_consent",
        tactic="credential-access",
        artefacts=[f"session:{s1}", f"token:{grant_token}", f"app:{app[0]}", f"ip:{attacker_ip}"],
    )
    t4 = t3 + timedelta(seconds=193)
    _signin(
        b,
        t4,
        victim,
        replay_ip,
        replay_asn,
        None,
        s2,
        "python-requests/2.32",
        incoming=grant_token,
        app=app,
        step="token_replay",
        tactic="defense-evasion",
        artefacts=[f"token:{grant_token}", f"session:{s2}", f"app:{app[0]}"],
    )
    t5 = t4 + timedelta(seconds=315)
    _activity(
        b,
        t5,
        victim,
        "FolderListed",
        "finance-close-library",
        s2,
        replay_ip,
        app=app,
        token=grant_token,
        count=214,
        window=120,
        step="finance_discovery",
        tactic="discovery",
        artefacts=[f"token:{grant_token}", f"session:{s2}", f"app:{app[0]}"],
    )
    t6 = t5 + timedelta(seconds=202)
    _activity(
        b,
        t6,
        victim,
        "ResourceAccess",
        "finance-ledger-db",
        s2,
        replay_ip,
        app=app,
        token=grant_token,
        result="Denied",
        step="ledger_access_attempt",
        tactic="collection",
        artefacts=[f"token:{grant_token}", f"session:{s2}", f"app:{app[0]}"],
    )
    # the victim's own routine work continues around the attack (temporal neighbours that must not be linked)
    _activity(
        b,
        t1 - timedelta(seconds=240),
        victim,
        "FileAccessed",
        "finance-close-library",
        rid(rng, "sess-"),
        CORP_EGRESS,
        count=2,
    )

    # ---- deliberately malformed input (must be rejected, never crash the batch)
    b.extra_lines["api_activity.jsonl"] = [
        '{"RecordId": "ua-truncated", "CreationTime": "2026-10-29T09:58:00Z", "UserId": '
    ]
    b.extra_lines["mail_trace.csv"] = ["MT-00000,2026-10-29T10:00:00Z,short-row"]

    files = b.render(ENVELOPES, COLUMNS)
    truth = ground_truth(
        "scenario-a",
        b.attack,
        root_step="phishing_delivery",
        services=["Month-end close", "Finance ledger"],
        forecast=["Finance ledger"],
    )
    return files, CONTEXT, truth


def ground_truth(
    dataset_id: str, attack: list[dict[str, Any]], *, root_step: str, services: list[str], forecast: list[str]
) -> dict[str, Any]:
    steps = sorted(attack, key=lambda s: s["time"])

    def key(s: dict[str, Any]) -> str:
        return f"{s['file']}#{s['record_id']}"

    chain = [[key(a), key(b_)] for a, b_ in zip(steps, steps[1:], strict=False)]
    also = [
        [key(a), key(b_)]
        for i, a in enumerate(steps)
        for b_ in steps[i + 1 :]
        if set(a["artefacts"]) & set(b_["artefacts"])
    ]
    return {
        "dataset_id": dataset_id,
        "relevant_records": [key(s) for s in steps],
        "path": [key(s) for s in steps],
        "chain_edges": chain,
        "valid_edges": sorted({tuple(x) for x in chain + also}),
        "stages": {key(s): s["tactic"] for s in steps},
        "root_cause": key(next(s for s in steps if s["step"] == root_step)),
        "affected_services": services,
        "forecast_services": forecast,
        "steps": [
            {"step": s["step"], "record": key(s), "tactic": s["tactic"], "time": s["time"]} for s in steps
        ],
    }
