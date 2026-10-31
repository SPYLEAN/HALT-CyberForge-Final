"""Config-driven detection over canonical events. Every threshold, pattern and label is in
detection_rules.json; no
user name, address, time or evidence id from any profile appears here.

A rule produces a candidate. `level=alert`, an IPS or antivirus record, application risk and `attackid` are
never
detections on their own, and every detection stays `unconfirmed`.
"""

from __future__ import annotations

from typing import Any

import duckdb

from halt.firex.util import stable_hash, utc_text

STEP_REFS = 20


class _Context:
    def __init__(
        self,
        con: duckdb.DuckDBPyConnection,
        rules: dict[str, Any],
        config_hash: str,
        collapsed: set[int],
        ref_cap: int,
    ) -> None:
        self.con, self.rules, self.config_hash, self.collapsed, self.ref_cap = (
            con,
            rules,
            config_hash,
            collapsed,
            ref_cap,
        )

    def quality(self, ns_values: list[int]) -> str:
        return "collapsed" if any(n in self.collapsed for n in ns_values) else "normal"


def _step(
    label: str,
    rule: dict[str, Any],
    ns: int,
    offset: int,
    refs: list[str],
    count: int,
    layer: str,
    *,
    actor: str | None = None,
    target: str | None = None,
    technique: tuple[str, str] | None = None,
    stage: str | None = None,
    last_ns: int | None = None,
) -> dict[str, Any]:
    tid, name = technique or (rule["technique"][0], rule["technique"][1])
    return {
        "label": label,
        "utc": utc_text(ns),
        "ns": ns,
        "last_utc": utc_text(last_ns if last_ns is not None else ns),
        "last_ns": last_ns if last_ns is not None else ns,
        "offset": offset,
        "count": count,
        "evidence_refs": refs[:STEP_REFS],
        "technique_id": tid,
        "technique_name": name,
        "stage": stage or rule["stage"],
        "layer": layer,
        "actor": actor,
        "target": target,
    }


def _detection(
    ctx: _Context,
    rule_id: str,
    key: list[Any],
    reason: str,
    steps: list[dict[str, Any]],
    entities: dict[str, list[str]],
    *,
    confidence_scale: float = 1.0,
    target_kind: str = "host",
    merged: int | None = None,
    all_refs: list[str] | None = None,
) -> dict[str, Any]:
    rule = ctx.rules["rules"][rule_id]
    steps = sorted(steps, key=lambda s: (s["ns"], s["offset"]))
    refs: list[str] = []
    for ref in [r for s in steps for r in s["evidence_refs"]] + (all_refs or []):
        if ref not in refs:
            refs.append(ref)
    capped = refs[: ctx.ref_cap]
    count = merged if merged is not None else sum(s["count"] for s in steps)
    return {
        "detection_id": "fdet-" + stable_hash([rule_id, rule["version"], key]),
        "rule_id": rule_id,
        "rule_version": rule["version"],
        "title": rule["title"],
        "reason": reason,
        "evidence_refs": capped,
        "evidence_refs_truncated": len(refs) > len(capped) or count > len(capped),
        "risk_contribution": round(rule["risk"] * confidence_scale, 3),
        "technique_id": rule["technique"][0],
        "technique_name": rule["technique"][1],
        "tactic": rule["technique"][2],
        "kill_chain_stage": rule["stage"],
        "confidence": round(rule["confidence"] * confidence_scale, 3),
        "basis": rule["basis"],
        "first_utc": steps[0]["utc"],
        "last_utc": utc_text(max(s["last_ns"] for s in steps)),
        "first_ns": steps[0]["ns"],
        "last_ns": max(s["last_ns"] for s in steps),
        "first_offset": steps[0]["offset"],
        "merged_events": count,
        "config_hash": ctx.config_hash,
        "timestamp_quality": ctx.quality([s["ns"] for s in steps]),
        "entities": {k: sorted({x for x in v if x})[:40] for k, v in entities.items()},
        "steps": steps,
        "target_kind": target_kind,
        "status": "unconfirmed",
    }


def account_lifecycle(ctx: _Context) -> list[dict[str, Any]]:
    rule = ctx.rules["rules"]["account_lifecycle"]
    window = int(rule["window_seconds"]) * 1_000_000_000
    created = ctx.con.execute(
        """SELECT regexp_extract(message, ?, 1) AS account, user, src_ip, devname, event_ns, byte_offset,
        evidence_id
           FROM events WHERE event_type = 'event' AND message IS NOT NULL AND regexp_matches(message, ?)
           ORDER BY byte_offset LIMIT 1000""",
        [rule["create_pattern"], rule["create_pattern"]],
    ).fetchall()
    out = []
    for account, actor, src, device, ns, offset, ref in created:
        if not account:
            continue
        removed = ctx.con.execute(
            """SELECT user, src_ip, event_ns, byte_offset, evidence_id FROM events
               WHERE event_type = 'event' AND regexp_extract(message, ?, 1) = ? AND byte_offset > ? AND
               event_ns <= ?
               ORDER BY byte_offset LIMIT 1""",
            [rule["delete_pattern"], account, offset, ns + window],
        ).fetchone()
        logins = ctx.con.execute(
            """SELECT src_ip, event_ns, byte_offset, evidence_id FROM events
               WHERE event_type = 'event' AND action = 'login' AND status = 'success' AND user = ?
                 AND byte_offset > ? AND event_ns <= ? ORDER BY byte_offset LIMIT 20""",
            [account, offset, ns + window],
        ).fetchall()
        if not removed and not logins:
            continue
        steps = [
            _step(
                f"Account {account} created by {actor}",
                rule,
                ns,
                offset,
                [ref],
                1,
                "identity",
                actor=actor,
                target=account,
            )
        ]
        for login_src, login_ns, login_offset, login_ref in logins[:5]:
            steps.append(
                _step(
                    f"New account {account} signed in from {login_src}",
                    rule,
                    login_ns,
                    login_offset,
                    [login_ref],
                    1,
                    "identity",
                    actor=account,
                    target=device,
                    technique=("T1078", "Valid Accounts"),
                    stage="actions_on_objectives",
                )
            )
        if removed:
            steps.append(
                _step(
                    f"Account {account} deleted by {removed[0]}",
                    rule,
                    removed[2],
                    removed[3],
                    [removed[4]],
                    1,
                    "identity",
                    actor=removed[0],
                    target=account,
                    technique=("T1070", "Indicator Removal"),
                    stage="defense_evasion",
                )
            )
        complete = bool(removed and logins)
        out.append(
            _detection(
                ctx,
                "account_lifecycle",
                [account, offset],
                f"Account {account} was created"
                + (", used to sign in" if logins else "")
                + (" and deleted" if removed else "")
                + " within the configured window.",
                steps,
                {
                    "users": [actor, account, *([removed[0]] if removed else [])],
                    "src_ips": [src, *[x[0] for x in logins], *([removed[1]] if removed else [])],
                    "devices": [device],
                },
                confidence_scale=1.0 if complete else 0.7,
                target_kind="device",
            )
        )
    return out


def logging_tamper(ctx: _Context) -> list[dict[str, Any]]:
    rule = ctx.rules["rules"]["logging_tamper"]
    window = int(rule["window_seconds"]) * 1_000_000_000
    disabled = ctx.con.execute(
        """SELECT user, src_ip, devname, message, event_ns, byte_offset, evidence_id FROM events
           WHERE event_type = 'event' AND message IS NOT NULL AND regexp_matches(message, ?)
           ORDER BY byte_offset LIMIT 1000""",
        [rule["disable_pattern"]],
    ).fetchall()
    out = []
    for actor, src, device, _message, ns, offset, ref in disabled:
        restored = ctx.con.execute(
            """SELECT user, src_ip, event_ns, byte_offset, evidence_id FROM events
               WHERE event_type = 'event' AND regexp_matches(coalesce(message, ''), ?) AND byte_offset > ?
               AND event_ns <= ?
                 AND (user = ? OR src_ip = ?) ORDER BY byte_offset LIMIT 1""",
            [rule["enable_pattern"], offset, ns + window, actor, src],
        ).fetchone()
        upper = restored[3] if restored else 2**62
        placeholders = ",".join("?" for _ in rule["change_actions"])
        changes = ctx.con.execute(
            f"""SELECT message, event_ns, byte_offset, evidence_id FROM events
                WHERE event_type = 'event' AND action IN ({placeholders}) AND byte_offset > ? AND byte_offset
                < ?
                  AND event_ns <= ? AND (user = ? OR src_ip = ?)
                  AND NOT regexp_matches(coalesce(message, ''), ?)
                ORDER BY byte_offset LIMIT 20""",
            [*rule["change_actions"], offset, upper, ns + window, actor, src, rule["enable_pattern"]],
        ).fetchall()
        if not restored and not changes:
            continue
        steps = [
            _step(
                f"{actor} disabled security logging",
                rule,
                ns,
                offset,
                [ref],
                1,
                "network_edge",
                actor=actor,
                target=device,
            )
        ]
        for message, change_ns, change_offset, change_ref in changes[:5]:
            steps.append(
                _step(
                    f"While logging was off: {str(message)[:80]}",
                    rule,
                    change_ns,
                    change_offset,
                    [change_ref],
                    1,
                    "network_edge",
                    actor=actor,
                    target=device,
                    technique=("T1562.004", "Impair Defenses: Disable or Modify System Firewall"),
                    stage="actions_on_objectives",
                )
            )
        if restored:
            steps.append(
                _step(
                    f"{restored[0]} restored security logging",
                    rule,
                    restored[2],
                    restored[3],
                    [restored[4]],
                    1,
                    "network_edge",
                    actor=restored[0],
                    target=device,
                    technique=("T1070", "Indicator Removal"),
                )
            )
        complete = bool(restored and changes)
        out.append(
            _detection(
                ctx,
                "logging_tamper",
                [actor, offset],
                f"{actor} disabled logging"
                + (f", made {len(changes)} configuration change(s)" if changes else "")
                + (" and restored logging" if restored else ", and no restore was found in the window")
                + ".",
                steps,
                {"users": [actor], "src_ips": [src], "devices": [device]},
                confidence_scale=1.0 if complete else 0.7,
                target_kind="device",
            )
        )
    return out


def web_attack_concentration(ctx: _Context) -> list[dict[str, Any]]:
    rule = ctx.rules["rules"]["web_attack_concentration"]
    services = rule["services"]
    placeholders = ",".join("?" for _ in services)
    # The attack name is the identity; attackid is not reliable enough to count techniques.
    groups = ctx.con.execute(
        f"""SELECT dst_ip, count(*) AS n, count(DISTINCT attack) AS signatures, count(DISTINCT src_ip) AS
        sources,
                   min(event_ns), max(event_ns), min(byte_offset)
            FROM events WHERE subtype = 'ips' AND attack IS NOT NULL AND service IN ({placeholders}) AND
            dst_ip IS NOT NULL
            GROUP BY dst_ip HAVING count(*) >= ? AND count(DISTINCT attack) >= ?
            ORDER BY n DESC, dst_ip LIMIT 100""",
        [*services, rule["min_events"], rule["min_signatures"]],
    ).fetchall()
    out = []
    for dst, count, signatures, sources, _low, _high, _offset in groups:
        rows = ctx.con.execute(
            """SELECT src_ip, attack, count(*) AS n, min(event_ns), max(event_ns), min(byte_offset),
                      min_by(evidence_id, byte_offset, 5)
               FROM events WHERE subtype = 'ips' AND dst_ip = ? AND attack IS NOT NULL
               GROUP BY src_ip, attack ORDER BY min(byte_offset) LIMIT 12""",
            [dst],
        ).fetchall()
        steps = [
            _step(
                f"{attack} from {src} ({n} events)",
                rule,
                low,
                first,
                list(refs),
                int(n),
                "application",
                actor=src,
                target=dst,
                last_ns=high,
            )
            for src, attack, n, low, high, first, refs in rows
        ]
        out.append(
            _detection(
                ctx,
                "web_attack_concentration",
                [dst],
                f"{count} IPS events using {signatures} attack signatures from {sources} source(s) targeted "
                f"{dst}.",
                steps,
                {"dst_ips": [dst], "src_ips": [r[0] for r in rows]},
                target_kind="service",
                merged=int(count),
            )
        )
    return out


def internal_fanout(ctx: _Context) -> list[dict[str, Any]]:
    rule = ctx.rules["rules"]["internal_fanout"]
    ports, roles = rule["ports"], rule["internal_roles"]
    port_marks, role_marks = ",".join("?" for _ in ports), ",".join("?" for _ in roles)
    params = [*ports, *roles, *roles]
    groups = ctx.con.execute(
        f"""SELECT src_ip, count(*) AS n, count(DISTINCT dst_ip) AS destinations
            FROM events WHERE event_type = 'traffic' AND dst_port IN ({port_marks})
              AND src_role IN ({role_marks}) AND dst_role IN ({role_marks}) AND src_ip IS NOT NULL
            GROUP BY src_ip HAVING count(DISTINCT dst_ip) >= ? ORDER BY n DESC, src_ip LIMIT 100""",
        [*params, rule["min_destinations"]],
    ).fetchall()
    out = []
    for src, count, destinations in groups:
        rows = ctx.con.execute(
            f"""SELECT dst_port, service, count(*), count(DISTINCT dst_ip), min(event_ns), min(byte_offset),
                       min_by(evidence_id, byte_offset, 10), list(DISTINCT dst_ip)[:20], max(event_ns)
                FROM events WHERE event_type = 'traffic' AND src_ip = ? AND dst_port IN ({port_marks})
                  AND src_role IN ({role_marks}) AND dst_role IN ({role_marks})
                GROUP BY dst_port, service ORDER BY min(byte_offset) LIMIT 6""",
            [src, *params],
        ).fetchall()
        steps = [
            _step(
                f"{service or port} to {dests} internal hosts",
                rule,
                low,
                first,
                list(refs),
                int(n),
                "endpoint",
                actor=src,
                last_ns=high,
            )
            for port, service, n, dests, low, first, refs, _targets, high in rows
        ]
        out.append(
            _detection(
                ctx,
                "internal_fanout",
                [src],
                f"{src} opened {count} SMB or RDP connections to {destinations} internal hosts.",
                steps,
                {"src_ips": [src], "dst_ips": [d for r in rows for d in r[7]]},
                merged=int(count),
            )
        )
    return out


def sustained_dns(ctx: _Context) -> list[dict[str, Any]]:
    rule = ctx.rules["rules"]["sustained_dns"]
    rows = ctx.con.execute(
        """SELECT src_ip, dst_ip, count(*) AS n, min(event_ns), max(event_ns), min(byte_offset),
                  min_by(evidence_id, byte_offset, 20), count(DISTINCT hostname)
           FROM timed_events WHERE subtype = 'dns' AND src_ip IS NOT NULL AND dst_ip IS NOT NULL
           GROUP BY src_ip, dst_ip
           HAVING count(*) >= ? AND (max(event_ns) - min(event_ns)) >= ?
           ORDER BY n DESC, src_ip, dst_ip LIMIT 100""",
        [rule["min_records"], int(rule["min_duration_seconds"]) * 1_000_000_000],
    ).fetchall()
    out = []
    for src, dst, count, low, high, first, refs, hosts in rows:
        minutes = round((high - low) / 60e9, 1)
        out.append(
            _detection(
                ctx,
                "sustained_dns",
                [src, dst],
                f"{src} sent {count} DNS records to {dst} over {minutes} minutes, naming {hosts} host(s). "
                "Volume and "
                "duration make this a tunnelling candidate; the logs do not show the payload.",
                [
                    _step(
                        f"Sustained DNS to {dst} ({count} records)",
                        rule,
                        low,
                        first,
                        list(refs),
                        int(count),
                        "endpoint",
                        actor=src,
                        target=dst,
                        last_ns=high,
                    )
                ],
                {"src_ips": [src], "dst_ips": [dst]},
                merged=int(count),
            )
        )
    return out


def repeated_malware(ctx: _Context) -> list[dict[str, Any]]:
    rule = ctx.rules["rules"]["repeated_malware"]
    rows = ctx.con.execute(
        """SELECT src_ip, dst_ip, count(*) AS n, count(DISTINCT virus), min(event_ns), max(event_ns),
        min(byte_offset),
                  min_by(evidence_id, byte_offset, 20), list(DISTINCT virus)[:5], list(DISTINCT hostname)[:5]
           FROM events WHERE subtype = 'virus' AND src_ip IS NOT NULL AND dst_ip IS NOT NULL
           GROUP BY src_ip, dst_ip
           HAVING count(*) >= ? AND (max(event_ns) - min(event_ns)) <= ?
           ORDER BY n DESC, src_ip, dst_ip LIMIT 200""",
        [rule["min_events"], int(rule["max_window_seconds"]) * 1_000_000_000],
    ).fetchall()
    out = []
    for src, dst, count, names, low, high, first, refs, viruses, hosts in rows:
        host_text = ", ".join(h for h in hosts if h)
        out.append(
            _detection(
                ctx,
                "repeated_malware",
                [src, dst],
                f"{count} malware detections ({names} name(s)) between {src} and {dst}"
                + (f", host {host_text}" if host_text else "")
                + ".",
                [
                    _step(
                        f"Malware detections to {dst}: {', '.join(v for v in viruses if v)[:80]}",
                        rule,
                        low,
                        first,
                        list(refs),
                        int(count),
                        "endpoint",
                        actor=src,
                        target=dst,
                        last_ns=high,
                    )
                ],
                {"src_ips": [src], "dst_ips": [dst], "hostnames": [h for h in hosts if h]},
                merged=int(count),
            )
        )
    return out


def denial_flood(ctx: _Context) -> list[dict[str, Any]]:
    rule = ctx.rules["rules"]["denial_flood"]
    bucket = int(rule["bucket_seconds"]) * 1_000_000_000
    rows = ctx.con.execute(
        """WITH deny AS (SELECT dst_ip, src_ip, event_ns, byte_offset, evidence_id, service FROM timed_events
                         WHERE event_type = 'traffic' AND action = 'deny' AND dst_ip IS NOT NULL),
                hours AS (SELECT dst_ip, event_ns // ? AS h, count(*) AS n FROM deny GROUP BY dst_ip, h),
                peak AS (SELECT dst_ip, max(n) AS peak_n, avg(n) AS mean_n, count(*) AS active_hours FROM
                hours GROUP BY dst_ip)
           SELECT d.dst_ip, count(*) AS n, count(DISTINCT d.src_ip) AS sources, min(d.event_ns),
           max(d.event_ns),
                  min(d.byte_offset), min_by(d.evidence_id, d.byte_offset, 20), mode(d.service), p.peak_n,
                  p.active_hours
           FROM deny d JOIN peak p USING (dst_ip)
           GROUP BY d.dst_ip, p.peak_n, p.active_hours
           HAVING count(*) >= ? AND count(DISTINCT d.src_ip) >= ? AND p.peak_n >= ?
           ORDER BY n DESC, d.dst_ip LIMIT 50""",
        [bucket, rule["min_events"], rule["min_sources"], rule["min_bucket_events"]],
    ).fetchall()
    out = []
    for dst, count, sources, low, high, first, refs, service, peak, _hours in rows:
        out.append(
            _detection(
                ctx,
                "denial_flood",
                [dst],
                f"{count} denied connections from {sources} sources against {dst}, peaking at {peak} in one "
                f"{rule['bucket_seconds']}-second bucket.",
                [
                    _step(
                        f"Denied {service or 'traffic'} flood against {dst} ({count} records)",
                        rule,
                        low,
                        first,
                        list(refs),
                        int(count),
                        "network_edge",
                        target=dst,
                        last_ns=high,
                    )
                ],
                {"dst_ips": [dst]},
                target_kind="service",
                merged=int(count),
            )
        )
    return out


def vpn_alternation(ctx: _Context) -> list[dict[str, Any]]:
    rule = ctx.rules["rules"]["vpn_alternation"]
    window = int(rule["window_seconds"]) * 1_000_000_000
    marks = ",".join("?" for _ in rule["actions"])
    rows = ctx.con.execute(
        f"""SELECT user, src_ip, event_ns, byte_offset, evidence_id FROM events
            WHERE subtype = 'vpn' AND action IN ({marks}) AND user IS NOT NULL AND src_ip IS NOT NULL
            ORDER BY user, byte_offset LIMIT 100000""",
        list(rule["actions"]),
    ).fetchall()
    by_user: dict[str, list[tuple[Any, ...]]] = {}
    for row in rows:
        by_user.setdefault(row[0], []).append(row)
    out = []
    for user, items in sorted(by_user.items()):
        start = 0
        while start < len(items):
            end = start
            while end + 1 < len(items) and items[end + 1][2] - items[start][2] <= window:
                end += 1
            group = items[start : end + 1]
            changes = sum(a[1] != b[1] for a, b in zip(group, group[1:], strict=False))
            if len(group) >= rule["min_sessions"] and changes >= rule["min_alternations"]:
                sources = sorted({g[1] for g in group})
                steps = [
                    _step(
                        f"VPN tunnel up for {user} from {g[1]}",
                        rule,
                        g[2],
                        g[3],
                        [g[4]],
                        1,
                        "identity",
                        actor=user,
                        target=g[1],
                    )
                    for g in group[:12]
                ]
                out.append(
                    _detection(
                        ctx,
                        "vpn_alternation",
                        [user, group[0][3]],
                        f"{user} brought up {len(group)} VPN tunnels with {changes} changes across "
                        f"{len(sources)} source "
                        "addresses within the window. One identity alternating like this may mean shared "
                        "credentials.",
                        steps,
                        {"users": [user], "src_ips": sources},
                        target_kind="account",
                        merged=len(group),
                    )
                )
                start = end + 1
            else:
                start += 1
    return out


def failure_then_success(ctx: _Context) -> list[dict[str, Any]]:
    rule = ctx.rules["rules"]["failure_then_success"]
    window = int(rule["window_seconds"]) * 1_000_000_000
    rows = ctx.con.execute(
        """WITH wins AS (SELECT user, src_ip, event_ns, byte_offset, evidence_id, dst_ip FROM events
                         WHERE event_type = 'event' AND status = 'success' AND action IN ('login',
                         'tunnel-up')),
                losses AS (SELECT user, src_ip, event_ns, byte_offset, evidence_id FROM events
                           WHERE event_type = 'event' AND status = 'failed' AND action = 'login')
           SELECT w.user, w.src_ip, w.dst_ip, w.event_ns, w.byte_offset, w.evidence_id,
                  count(*) AS failures, min(l.event_ns), min(l.byte_offset), min_by(l.evidence_id,
                  l.byte_offset, 10),
                  count(*) FILTER (WHERE l.user = w.user) AS same_account,
                  count(*) FILTER (WHERE l.src_ip = w.src_ip) AS same_source
           FROM wins w JOIN losses l
             ON (l.user = w.user OR l.src_ip = w.src_ip) AND l.byte_offset < w.byte_offset AND w.event_ns -
             l.event_ns <= ?
           GROUP BY ALL HAVING count(*) >= ? ORDER BY w.byte_offset LIMIT 200""",
        [window, rule["min_failures"]],
    ).fetchall()
    out = []
    for user, src, dst, ns, offset, ref, failures, low, first, refs, same_account, same_source in rows:
        steps = [
            _step(
                f"{failures} failed logins ({same_account} same account, {same_source} same source)",
                rule,
                low,
                first,
                list(refs),
                int(failures),
                "identity",
                actor=src,
                target=user,
            ),
            _step(
                f"Successful login for {user} from {src}",
                rule,
                ns,
                offset,
                [ref],
                1,
                "identity",
                actor=src,
                target=user,
                technique=("T1078", "Valid Accounts"),
                stage="exploitation",
            ),
        ]
        out.append(
            _detection(
                ctx,
                "failure_then_success",
                [user, offset],
                f"{failures} failed logins sharing the account or source preceded a successful login for "
                f"{user}.",
                steps,
                {"users": [user], "src_ips": [src], "dst_ips": [dst]},
                target_kind="account",
                merged=int(failures) + 1,
            )
        )
    return out


RULES = {
    "account_lifecycle": account_lifecycle,
    "logging_tamper": logging_tamper,
    "web_attack_concentration": web_attack_concentration,
    "internal_fanout": internal_fanout,
    "sustained_dns": sustained_dns,
    "repeated_malware": repeated_malware,
    "denial_flood": denial_flood,
    "vpn_alternation": vpn_alternation,
    "failure_then_success": failure_then_success,
}


def run_detection(
    con: duckdb.DuckDBPyConnection, rules: dict[str, Any], config_hash: str, collapsed: set[int]
) -> list[dict[str, Any]]:
    ctx = _Context(con, rules, config_hash, collapsed, int(rules["evidence_refs_per_detection"]))
    out: list[dict[str, Any]] = []
    for name, handler in RULES.items():
        if rules["rules"][name]["enabled"]:
            out.extend(handler(ctx))
    return sorted(out, key=lambda d: (d["first_ns"], d["first_offset"], d["detection_id"]))


def behavioural_bursts(
    con: duckdb.DuckDBPyConnection, rules: dict[str, Any]
) -> tuple[int, list[dict[str, Any]]]:
    """Repeated meaningful behaviour, not duplicates: same actor, target and action within one bucket."""
    spec = rules["bursts"]
    bucket = int(spec["bucket_seconds"]) * 1_000_000_000
    query = """
        SELECT event_ns // ? AS bucket, event_type, subtype, action, src_ip, dst_ip, dst_port, service, user,
        attack, virus,
               count(*) AS n, min(event_ns) AS first_ns, max(event_ns) AS last_ns,
               min_by(evidence_id, byte_offset, ?) AS refs
        FROM timed_events
        GROUP BY ALL HAVING count(*) >= ?"""
    params = [bucket, spec["evidence_refs"], spec["min_records"]]
    row = con.execute(f"SELECT count(*) FROM ({query})", params).fetchone()
    total = int(row[0]) if row else 0
    rows = con.execute(f"{query} ORDER BY n DESC, first_ns LIMIT {int(spec['keep'])}", params).fetchall()
    bursts = []
    for r in rows:
        keys = dict(
            zip(
                (
                    "event_type",
                    "subtype",
                    "action",
                    "src_ip",
                    "dst_ip",
                    "dst_port",
                    "service",
                    "user",
                    "attack",
                    "virus",
                ),
                (None if v is None else str(v) for v in r[1:11]),
                strict=True,
            )
        )
        bursts.append(
            {
                "burst_id": "fbur-" + stable_hash([r[0], keys]),
                "rule_id": spec["rule_id"],
                "rule_version": spec["rule_version"],
                "grouping_key": keys,
                "count": int(r[11]),
                "first_utc": utc_text(r[12]),
                "last_utc": utc_text(r[13]),
                "timestamp_quality": "normal",
                "representative": {k: v for k, v in keys.items() if v is not None},
                "evidence_refs": list(r[14]),
                "evidence_refs_truncated": int(r[11]) > len(r[14]),
            }
        )
    return total, bursts
