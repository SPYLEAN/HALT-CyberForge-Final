"""Seeded generator for benign background events (BG-xxxx), so correlation has noise to reject.

Background events use the same kinds and attribute keys as the incident events, including a few hard
negatives (travel sign-in followed by an MFA change, a large quarter-end export, a VPN session hop), so
detection cannot rely on the event kind or the EV- prefix.

Regenerate the committed fixture with:  python -m halt.scenario.background
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

from halt.contracts.events import EventSource, SecurityEvent
from halt.scenario.loader import DEFAULT_SCENARIO_DIR

CORP_ASNS = [64496, 64497, 64498]  # RFC 5398 documentation range; AS64500 is the attacker
TRAVEL_ASN = 64510
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/141.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Safari/18.1",
    "Microsoft Outlook 16.0",
]
SENDER_DOMAINS = ["supplier-one.example", "bank-notices.example", "payroll-svc.example", "intranet.example"]
VERIFIED_APPS = [("MeetSpace", "User.Read Calendars.Read"), ("SignFlow", "User.Read Files.Read")]
RESOURCES = ["Finance-Close library", "AP invoices", "Expense reports", "Vendor master"]


class _Rng:
    """Only uses random.random(), whose sequence is stable for a given seed across Python versions."""

    def __init__(self, seed: int) -> None:
        self._r = random.Random(seed)

    def int(self, lo: int, hi: int) -> int:
        return lo + int(self._r.random() * (hi - lo + 1))

    def pick[T](self, items: list[T]) -> T:
        return items[self.int(0, len(items) - 1)]

    def chance(self, p: float) -> bool:
        return self._r.random() < p


def generate(seed: int, t0: datetime, n_users: int = 60, n_events: int = 400) -> list[SecurityEvent]:
    rng = _Rng(seed)
    users = [f"user{i:02d}@finance.example" for i in range(1, n_users + 1)]
    raw: list[tuple[int, int, str, str, str, dict[str, str | int | float | bool]]] = []

    def add(offset_s: int, kind: str, system: str, attrs: dict[str, str | int | float | bool]) -> None:
        raw.append((offset_s, len(raw), kind, system, f"{system[:2].upper()}-{70000 + len(raw)}", attrs))

    for _ in range(n_events):
        upn = rng.pick(users)
        offset = rng.int(-2400, 3000)
        roll = rng.int(1, 100)
        if roll <= 55:
            travel = rng.chance(0.02)
            add(
                offset,
                "sign_in",
                "Entra sign-in logs",
                {
                    "upn": upn,
                    "asn": TRAVEL_ASN if travel else rng.pick(CORP_ASNS),
                    "asn_first_seen_for_user": travel,
                    "user_agent": rng.pick(USER_AGENTS),
                    "user_agent_first_seen_for_user": rng.chance(0.03),
                    "result": "success" if rng.chance(0.96) else "failure",
                },
            )
        elif roll <= 80:
            add(
                offset,
                "resource_access",
                "Graph activity log",
                {
                    "upn": upn,
                    "resource": rng.pick(RESOURCES),
                    "request_count": rng.int(1, 40),
                    "window_s": 240,
                    "via": rng.pick(["Finance API", "SharePoint"]),
                },
            )
        elif roll <= 92:
            add(
                offset,
                "mail_delivered",
                "Mail gateway message trace",
                {
                    "recipient": upn,
                    "sender_domain": rng.pick(SENDER_DOMAINS),
                    "sender_domain_age_days": rng.int(200, 4000),
                    "link_type": rng.pick(["none", "document"]),
                },
            )
        elif roll <= 95:
            app, scopes = rng.pick(VERIFIED_APPS)
            add(
                offset,
                "oauth_consent",
                "Entra audit log",
                {
                    "upn": upn,
                    "app_name": app,
                    "publisher_verified": True,
                    "app_age_days": rng.int(300, 3000),
                    "scopes": scopes,
                    "consent_type": "user",
                },
            )
        else:
            add(
                offset,
                "mfa_method_added",
                "Entra audit log",
                {
                    "upn": upn,
                    "method": rng.pick(["fido2", "authenticator_push"]),
                    "asn": rng.pick(CORP_ASNS),
                    "seconds_since_sign_in": rng.int(300, 86400),
                },
            )

    # Hard negatives.
    traveller = users[7]
    add(
        -1800,
        "sign_in",
        "Entra sign-in logs",
        {
            "upn": traveller,
            "asn": TRAVEL_ASN,
            "asn_first_seen_for_user": True,
            "user_agent": USER_AGENTS[1],
            "user_agent_first_seen_for_user": False,
            "result": "success",
        },
    )
    add(
        -1200,
        "mfa_method_added",
        "Entra audit log",
        {
            "upn": traveller,
            "method": "authenticator_push",
            "asn": TRAVEL_ASN,
            "seconds_since_sign_in": 600,
        },
    )
    add(
        900,
        "resource_access",
        "Graph activity log",
        {
            "upn": users[11],
            "resource": "Finance-Close library",
            "request_count": 180,
            "window_s": 240,
            "via": "Finance API",
        },
    )
    add(
        300,
        "token_replay",
        "Entra sign-in logs",
        {
            "upn": users[23],
            "sessions": "S-BG-1",
            "asn": 64496,
            "issued_asn": 64497,
            "device_mismatch": False,
        },
    )
    add(
        1500,
        "oauth_consent",
        "Entra audit log",
        {
            "upn": users[30],
            "app_name": "Ledger Export (internal)",
            "publisher_verified": False,
            "app_age_days": 900,
            "scopes": "Files.Read",
            "consent_type": "user",
        },
    )

    raw.sort(key=lambda r: (r[0], r[1]))
    return [
        SecurityEvent(
            id=f"BG-{i:04d}",
            ts=t0 + timedelta(seconds=offset),
            source=EventSource(system=system, record_id=record_id),
            kind=kind,
            attributes=attrs,
        )
        for i, (offset, _, kind, system, record_id, attrs) in enumerate(raw, start=1)
    ]


def render(events: list[SecurityEvent]) -> str:
    return json.dumps([e.model_dump(mode="json") for e in events], indent=1, ensure_ascii=False) + "\n"


def main() -> None:
    incident = json.loads((DEFAULT_SCENARIO_DIR / "incident.json").read_text(encoding="utf-8"))
    t0 = datetime.fromisoformat(incident["t0"])
    out: Path = DEFAULT_SCENARIO_DIR / "background_events.json"
    out.write_text(render(generate(incident["params"]["seed"], t0)), encoding="utf-8", newline="\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
