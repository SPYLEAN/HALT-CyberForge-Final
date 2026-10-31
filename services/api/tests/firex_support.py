"""Synthetic FortiGate-style log fixtures. Every name and address is invented; nothing comes from a
profile."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from halt.firex.pipeline import Runner

DAY = 1_800_000_000  # an arbitrary epoch second; date and time below are derived from it


def line(
    ts: int, *, ns: int = 0, tz: str = "+0530", kind: str = "traffic", subtype: str = "forward", **fields: Any
) -> str:
    from time import gmtime, strftime

    parts = [
        f"date={strftime('%Y-%m-%d', gmtime(ts))}",
        f"time={strftime('%H:%M:%S', gmtime(ts))}",
        f"eventtime={ts * 1_000_000_000 + ns}",
        f'tz="{tz}"',
        'devname="FGT-TEST"',
        'devid="FGT-TEST"',
        f'logid="{fields.pop("logid", "0000000013")}"',
        f'type="{kind}"',
        f'subtype="{subtype}"',
        f'level="{fields.pop("level", "notice")}"',
        'vd="root"',
    ]
    for key, value in fields.items():
        parts.append(
            f"{key}={value}"
            if isinstance(value, int)
            else f'{key}="{value}"'
            if " " in str(value) or not _bare(key)
            else f"{key}={value}"
        )
    return " ".join(parts)


def _bare(key: str) -> bool:
    return key in {
        "srcip",
        "dstip",
        "srcport",
        "dstport",
        "sessionid",
        "proto",
        "attackid",
        "sentbyte",
        "rcvdbyte",
    }


def traffic(
    ts: int,
    src: str,
    dst: str,
    *,
    action: str = "accept",
    srcrole: str = "lan",
    dstrole: str = "wan",
    port: int = 443,
    service: str = "HTTPS",
    sid: int = 1,
    sent: int = 100,
    **extra: Any,
) -> str:
    return line(
        ts,
        srcip=src,
        srcintfrole=srcrole,
        dstip=dst,
        dstintfrole=dstrole,
        dstport=port,
        sessionid=sid,
        proto=6,
        action=action,
        service=service,
        sentbyte=sent,
        rcvdbyte=10,
        **extra,
    )


def ips(ts: int, src: str, dst: str, attack: str, attackid: int, *, sid: int = 2) -> str:
    return line(
        ts,
        kind="utm",
        subtype="ips",
        logid="0419016384",
        level="alert",
        srcip=src,
        srcintfrole="wan",
        dstip=dst,
        dstintfrole="dmz",
        dstport=443,
        sessionid=sid,
        proto=6,
        action="dropped",
        service="HTTPS",
        attack=attack,
        attackid=attackid,
        severity="high",
    )


def virus(ts: int, src: str, dst: str, name: str, *, sid: int = 3) -> str:
    return line(
        ts,
        kind="utm",
        subtype="virus",
        logid="0211008192",
        level="warning",
        srcip=src,
        srcintfrole="lan",
        dstip=dst,
        dstintfrole="wan",
        dstport=80,
        sessionid=sid,
        proto=6,
        action="blocked",
        service="HTTP",
        virus=name,
        hostname="bad.example",
    )


def dns(ts: int, src: str, dst: str) -> str:
    return line(
        ts,
        kind="utm",
        subtype="dns",
        logid="1501054600",
        level="information",
        srcip=src,
        srcintfrole="lan",
        dstip=dst,
        dstintfrole="wan",
        dstport=53,
        proto=17,
        action="pass",
        service="DNS",
        hostname="x.example",
    )


def admin(
    ts: int,
    user: str,
    src: str,
    *,
    action: str = "login",
    status: str | None = "success",
    msg: str = "m",
    logid: str = "0100032001",
) -> str:
    extra: dict[str, Any] = {"status": status} if status else {}
    return line(
        ts,
        kind="event",
        subtype="system",
        logid=logid,
        level="information",
        user=user,
        srcip=src,
        srcintfrole="wan",
        dstip="10.99.0.1",
        dstintfrole="lan",
        proto=6,
        action=action,
        msg=msg,
        **extra,
    )


def vpn_up(ts: int, user: str, src: str) -> str:
    return line(
        ts,
        kind="event",
        subtype="vpn",
        logid="0101039947",
        level="information",
        user=user,
        srcip=src,
        srcintfrole="wan",
        dstip="198.51.100.5",
        dstintfrole="wan",
        proto=6,
        action="tunnel-up",
        status="success",
        msg="up",
    )


def background(start: int, count: int) -> list[str]:
    return [
        traffic(start + i, f"10.1.0.{i % 200 + 1}", f"198.51.{i % 200}.{i % 250 + 1}", sid=10_000 + i)
        for i in range(count)
    ]


def write_dataset(
    root: Path,
    lines: list[str | bytes],
    dataset_id: str = "fixture",
    filename: str = "fixture.log",
    sha256: str | None = None,
) -> Path:
    (root / "raw").mkdir(parents=True, exist_ok=True)
    path = root / "raw" / filename
    with open(path, "wb") as f:
        for item in lines:
            f.write(item if isinstance(item, bytes) else item.encode() + b"\n")
    (root / "registry.json").write_text(
        json.dumps({dataset_id: {"filename": filename, "title": "Fixture", "sha256": sha256}}),
        encoding="utf-8",
    )
    return path


def run_fixture(
    root: Path,
    lines: list[str | bytes],
    *,
    workers: int = 1,
    max_bytes: int | None = None,
    chunk_bytes: int | None = None,
    rules: dict[str, Any] | None = None,
) -> Runner:
    write_dataset(root, lines)
    runner = Runner("fixture", root=root, workers=workers, max_bytes=max_bytes)
    if chunk_bytes:
        runner.rules = {**runner.rules, "storage": {**runner.rules["storage"], "chunk_bytes": chunk_bytes}}
    if rules:
        runner.rules = {**runner.rules, **rules}
    state = runner.execute()
    assert state["status"] == "completed", state
    return runner
