"""Scenario B: service-account abuse in a cloud data platform (synthetic).

Attack: the reporting service principal signs in with a client secret from an external network → assumes its
role there (new credential) → widens the role's policy to wildcards → enumerates the payroll-exports bucket →
reads an export → mints a database auth token → queries the payroll database.
Noise: the same service principal's hourly scheduled job from its managed runner (cron → python → aws), a CI
service principal deploying, an admin's legitimate read-only policy attachment (ambiguous), a data engineer's
listing burst below the enumeration rate (false-positive bait), developer process noise, routine DB queries.
"""

from __future__ import annotations

import random
from datetime import timedelta
from typing import Any

from halt.ps2.foundry.common import Builder, at, iso, jitter, rid
from halt.ps2.foundry.scenario_a import ground_truth

DAY = "2026-10-29"
CAPTURED_AT = "2026-10-29T15:00:00Z"  # after the whole log window
RUNNER, RUNNER_IP = "etl-runner-02", "10.40.2.15"
CI_RUNNER, CI_IP = "ci-runner-01", "10.40.3.21"
ACCOUNT = "111122223333"

CONTEXT: dict[str, Any] = {
    "organisation": "Northwind Data Platform (synthetic)",
    "internal_cidrs": ["10.40.0.0/16"],
    "known_egress_cidrs": ["192.0.2.128/27"],
    "managed_hosts": [RUNNER, CI_RUNNER, "dev-ws-07", "dev-ws-11"],
    "service_accounts": ["svc-reporting", "svc-ci"],
    "business_services": [
        {"name": "Payroll", "criticality": "critical"},
        {"name": "Payments", "criticality": "critical"},
        {"name": "Reporting", "criticality": "medium"},
        {"name": "Analytics", "criticality": "low"},
    ],
    "assets": [
        {
            "resource": "hr-payroll-exports",
            "resource_type": "cloud_service",
            "business_service": "Payroll",
            "criticality": "high",
            "depends_on": ["payments-batch-bucket"],
        },
        {
            "resource": "payments-batch-bucket",
            "resource_type": "cloud_service",
            "business_service": "Payments",
            "criticality": "critical",
            "depends_on": [],
        },
        {
            "resource": "db-payroll",
            "resource_type": "database",
            "business_service": "Payroll",
            "criticality": "critical",
            "depends_on": [],
        },
        {
            "resource": "reports-bucket",
            "resource_type": "cloud_service",
            "business_service": "Reporting",
            "criticality": "medium",
            "depends_on": [],
        },
        {
            "resource": "db-reporting",
            "resource_type": "database",
            "business_service": "Reporting",
            "criticality": "medium",
            "depends_on": [],
        },
        {
            "resource": "analytics-scratch",
            "resource_type": "cloud_service",
            "business_service": "Analytics",
            "criticality": "low",
            "depends_on": [],
        },
    ],
}

FILES = [
    {"filename": "idp_signin.jsonl", "adapter": "idp_signin", "content_type": "application/x-ndjson"},
    {"filename": "cloud_audit.json", "adapter": "cloud_audit", "content_type": "application/json"},
    {"filename": "process.jsonl", "adapter": "process", "content_type": "application/x-ndjson"},
    {"filename": "db_audit.csv", "adapter": "db_audit", "content_type": "text/csv"},
]
ENVELOPES = {"cloud_audit.json": "Records"}
COLUMNS = {
    "db_audit.csv": [
        "event_id",
        "event_time",
        "db_name",
        "db_user",
        "client_ip",
        "auth_method",
        "auth_token_id",
        "statement_type",
        "object_name",
        "rows",
        "result",
    ]
}


def _sp_signin(
    b: Builder,
    t: Any,
    sp: str,
    ip: str,
    asn: int,
    session: str,
    cred: str,
    *,
    step: str | None = None,
    **truth: Any,
) -> None:
    rec_id = rid(b.rng, "si-")
    rec = {
        "id": rec_id,
        "createdDateTime": iso(t),
        "signInEventType": "servicePrincipal",
        "servicePrincipalName": sp,
        "servicePrincipalId": f"sp-{sp}",
        "appId": f"app-{sp}",
        "appDisplayName": sp,
        "ipAddress": ip,
        "autonomousSystemNumber": asn,
        "correlationId": session,
        "clientCredentialType": cred,
        "status": {"errorCode": 0},
        "isInteractive": False,
        "uniqueTokenIdentifier": rid(b.rng, "tok-"),
    }
    b.add("jsonl", "idp_signin.jsonl", t, rec, rec_id, step, **truth)


def _cloud(
    b: Builder,
    t: Any,
    name: str,
    actor: str,
    ip: str,
    *,
    key: str | None = None,
    params: dict[str, Any] | None = None,
    resp: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
    error: str | None = None,
    step: str | None = None,
    **truth: Any,
) -> None:
    rec_id = rid(b.rng, "ct-", 12)
    rec: dict[str, Any] = {
        "eventID": rec_id,
        "eventTime": iso(t),
        "eventName": name,
        "eventSource": "sts.amazonaws.example" if name == "AssumeRole" else "s3.amazonaws.example",
        "awsRegion": "eu-west-1",
        "sourceIPAddress": ip,
        "userAgent": "aws-cli/2.17 Python/3.12",
        "userIdentity": {
            "type": "AssumedRole" if key and name != "AssumeRole" else "ServicePrincipal",
            "sourceIdentity": actor,
            "accessKeyId": key or "",
            "accountId": ACCOUNT,
        },
        "requestParameters": params or {},
        "responseElements": resp or {},
    }
    if extra:
        rec["additionalEventData"] = extra
    if error:
        rec["errorCode"] = error
    b.add("json", "cloud_audit.json", t, rec, rec_id, step, **truth)


def _proc(
    b: Builder, t: Any, host: str, user: str, pid: int, image: str, ppid: int, parent: str, cmd: str
) -> None:
    rec_id = rid(b.rng, "pr-")
    rec = {
        "RecordID": rec_id,
        "EventID": 1,
        "UtcTime": iso(t),
        "Computer": host,
        "User": user,
        "ProcessId": pid,
        "Image": image,
        "CommandLine": cmd,
        "ParentProcessId": ppid,
        "ParentImage": parent,
    }
    b.add("jsonl", "process.jsonl", t, rec, rec_id)


def _db(
    b: Builder,
    t: Any,
    db: str,
    user: str,
    ip: str,
    method: str,
    token: str,
    stmt: str,
    obj: str,
    rows: int,
    *,
    step: str | None = None,
    **truth: Any,
) -> None:
    rec_id = f"dba-{b.rng.randint(100000, 999999)}"
    row = {
        "event_id": rec_id,
        "event_time": iso(t),
        "db_name": db,
        "db_user": user,
        "client_ip": ip,
        "auth_method": method,
        "auth_token_id": token,
        "statement_type": stmt,
        "object_name": obj,
        "rows": str(rows),
        "result": "success",
    }
    b.add("csv", "db_audit.csv", t, row, rec_id, step, **truth)


def generate(seed: int = 7310) -> tuple[dict[str, str], dict[str, Any], dict[str, Any]]:
    rng = random.Random(seed)
    b = Builder(rng)

    # ---- benign scheduled automation: hourly report job on the managed runner
    for hour in (10, 11, 12, 13, 14):
        t = at(DAY, f"{hour:02d}:00:00") + timedelta(seconds=rng.randint(0, 20))
        cron_pid, py_pid, aws_pid = 1001, rng.randint(20000, 29999), rng.randint(30000, 39999)
        _proc(
            b,
            t,
            RUNNER,
            "svc-reporting",
            py_pid,
            "/usr/bin/python3",
            cron_pid,
            "/usr/sbin/cron",
            "python3 /opt/jobs/report_job.py --daily",
        )
        _proc(
            b,
            t + timedelta(seconds=4),
            RUNNER,
            "svc-reporting",
            aws_pid,
            "/usr/local/bin/aws",
            py_pid,
            "/usr/bin/python3",
            "aws s3 cp reports s3://reports-bucket/ --recursive",
        )
        session = rid(rng, "sess-")
        _sp_signin(b, t + timedelta(seconds=6), "svc-reporting", RUNNER_IP, 64496, session, "certificate")
        key = rid(rng, "ASIA", 12).upper()
        _cloud(
            b,
            t + timedelta(seconds=8),
            "AssumeRole",
            "svc-reporting",
            RUNNER_IP,
            params={"roleArn": f"arn:aws:iam::{ACCOUNT}:role/reporting-reader", "sourceSession": session},
            resp={"credentials": {"accessKeyId": key, "sessionToken": "CANARY-SESSION-TOKEN-DO-NOT-RENDER"}},
        )
        for _ in range(rng.randint(2, 4)):
            _cloud(
                b,
                t + timedelta(seconds=rng.randint(10, 60)),
                "GetObject",
                "svc-reporting",
                RUNNER_IP,
                key=key,
                params={"bucketName": "reports-bucket", "key": f"daily/{rng.randint(1, 99)}.parquet"},
            )
        _db(
            b,
            t + timedelta(seconds=rng.randint(70, 120)),
            "db-reporting",
            "svc-reporting",
            RUNNER_IP,
            "iam_token",
            rid(rng, "dbtok-"),
            "SELECT",
            "daily_metrics",
            rng.randint(500, 3000),
        )

    # ---- CI deployments, developer and admin noise
    for hh, mm in ((10, 20), (12, 40), (14, 5)):
        t = at(DAY, f"{hh:02d}:{mm:02d}:00")
        session = rid(rng, "sess-")
        _sp_signin(b, t, "svc-ci", CI_IP, 64496, session, "certificate")
        key = rid(rng, "ASIA", 12).upper()
        _cloud(
            b,
            t + timedelta(seconds=5),
            "AssumeRole",
            "svc-ci",
            CI_IP,
            params={"roleArn": f"arn:aws:iam::{ACCOUNT}:role/deployer", "sourceSession": session},
            resp={"credentials": {"accessKeyId": key}},
        )
        _cloud(
            b,
            t + timedelta(seconds=30),
            "ListObjectsV2",
            "svc-ci",
            CI_IP,
            key=key,
            params={"bucketName": "reports-bucket"},
            extra={"requestCount": 3, "windowSeconds": 60},
        )
        _proc(
            b,
            t + timedelta(seconds=2),
            CI_RUNNER,
            "svc-ci",
            rng.randint(40000, 49999),
            "/usr/bin/bash",
            1,
            "/usr/lib/systemd/systemd",
            "bash deploy.sh",
        )
    for _ in range(40):
        host = rng.choice(["dev-ws-07", "dev-ws-11"])
        t = jitter(rng, at(DAY, "10:00:00"), 4 * 3600)
        _proc(
            b,
            t,
            host,
            "l.mensah",
            rng.randint(5000, 9000),
            rng.choice(["/usr/bin/git", "/usr/bin/code", "/usr/bin/node", "/usr/bin/python3"]),
            rng.randint(1000, 4000),
            "/usr/bin/zsh",
            "dev tooling",
        )
    _cloud(
        b,
        at(DAY, "11:45:10"),
        "AttachRolePolicy",
        "d.okafor",
        "192.0.2.130",
        params={"roleName": "analytics", "policyArn": "arn:aws:iam::aws:policy/ReadOnlyAccess"},
    )  # legitimate admin change
    _cloud(
        b,
        at(DAY, "12:15:00"),
        "ListObjectsV2",
        "l.mensah",
        "10.40.5.9",
        key=rid(rng, "AKIA", 12).upper(),
        params={"bucketName": "analytics-scratch"},
        extra={"requestCount": 25, "windowSeconds": 60},
    )  # busy, below the burst rate
    for _ in range(12):
        _db(
            b,
            jitter(rng, at(DAY, "10:00:00"), 4 * 3600),
            "db-reporting",
            "l.mensah",
            "10.40.5.9",
            "password",
            "",
            "SELECT",
            rng.choice(["daily_metrics", "weekly_rollup"]),
            rng.randint(10, 400),
        )

    # ---- the attack: leaked client secret for svc-reporting
    sp = "svc-reporting"
    ext_ip, ext_asn = "203.0.113.140", 64520
    s1 = rid(rng, "sess-")
    key = "ASIA" + rid(rng, "", 12).upper()
    dbtok = rid(rng, "dbtok-")
    t0 = at(DAY, "13:05:12") + timedelta(seconds=rng.randint(0, 30))
    _sp_signin(
        b,
        t0,
        sp,
        ext_ip,
        ext_asn,
        s1,
        "clientSecret",
        step="anomalous_service_auth",
        tactic="initial-access",
        artefacts=[f"session:{s1}", f"ip:{ext_ip}"],
    )
    t1 = t0 + timedelta(seconds=138)
    _cloud(
        b,
        t1,
        "AssumeRole",
        sp,
        ext_ip,
        params={"roleArn": f"arn:aws:iam::{ACCOUNT}:role/reporting-reader", "sourceSession": s1},
        resp={"credentials": {"accessKeyId": key, "sessionToken": "CANARY-SESSION-TOKEN-DO-NOT-RENDER"}},
        step="role_assumption",
        tactic="privilege-escalation",
        artefacts=[f"session:{s1}", f"key:{key}", f"ip:{ext_ip}"],
    )
    t2 = t1 + timedelta(seconds=134)
    _cloud(
        b,
        t2,
        "PutRolePolicy",
        sp,
        ext_ip,
        key=key,
        params={"roleName": "reporting-reader", "policySummary": "s3:* and rds-db:connect on *"},
        step="permission_misuse",
        tactic="privilege-escalation",
        artefacts=[f"key:{key}", f"ip:{ext_ip}"],
    )
    t3 = t2 + timedelta(seconds=139)
    _cloud(
        b,
        t3,
        "ListObjectsV2",
        sp,
        ext_ip,
        key=key,
        params={"bucketName": "hr-payroll-exports"},
        extra={"requestCount": 160, "windowSeconds": 90},
        step="resource_enumeration",
        tactic="discovery",
        artefacts=[f"key:{key}", f"ip:{ext_ip}"],
    )
    t4 = t3 + timedelta(seconds=157)
    _cloud(
        b,
        t4,
        "GetObject",
        sp,
        ext_ip,
        key=key,
        params={"bucketName": "hr-payroll-exports", "key": "2026-10/payroll-run.csv"},
        step="export_read",
        tactic="collection",
        artefacts=[f"key:{key}", f"ip:{ext_ip}"],
    )
    t5 = t4 + timedelta(seconds=72)
    _cloud(
        b,
        t5,
        "GenerateDBAuthToken",
        sp,
        ext_ip,
        key=key,
        params={"dbInstanceIdentifier": "db-payroll"},
        resp={"tokenId": dbtok},
        step="db_token_minted",
        tactic="defense-evasion",
        artefacts=[f"key:{key}", f"dbtok:{dbtok}", f"ip:{ext_ip}"],
    )
    t6 = t5 + timedelta(seconds=39)
    _db(
        b,
        t6,
        "db-payroll",
        sp,
        ext_ip,
        "iam_token",
        dbtok,
        "SELECT",
        "employee_bank_accounts",
        2210,
        step="payroll_database_access",
        tactic="collection",
        artefacts=[f"dbtok:{dbtok}", f"ip:{ext_ip}"],
    )

    files = b.render(ENVELOPES, COLUMNS)
    truth = ground_truth(
        "scenario-b",
        b.attack,
        root_step="anomalous_service_auth",
        services=["Payroll"],
        forecast=["Payments"],
    )
    return files, CONTEXT, truth
