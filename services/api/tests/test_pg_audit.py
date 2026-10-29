"""AT-6.7: on PostgreSQL the audit log and the operation journal are append-only: triggers reject UPDATE,
DELETE and TRUNCATE for every role, and the application role holds only SELECT and INSERT on them.

Runs only when HALT_TEST_PG_URL points at a disposable PostgreSQL server where the user may create roles and
databases (the CI postgres service; locally, any PostgreSQL 16, e.g. the pip package pgserver).
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, make_url, text
from sqlalchemy.exc import DBAPIError

from halt.audit.log import AuditLog
from halt.config import Settings
from halt.db import create_schema, make_engine
from halt.db.repo import DbAuditStore
from halt.main import create_app

PG_URL = os.environ.get("HALT_TEST_PG_URL")
pytestmark = pytest.mark.skipif(not PG_URL, reason="HALT_TEST_PG_URL not set (no PostgreSQL available)")


def test_AT_6_7_audit_log_is_append_only_in_postgres() -> None:
    assert PG_URL
    engine = make_engine(PG_URL)
    create_schema(engine)
    create_schema(engine)  # idempotent: second call must not fail on existing triggers
    incident = f"INC-T{uuid.uuid4().hex[:6]}"
    log = AuditLog(DbAuditStore(engine, incident))
    at = datetime(2026, 10, 27, 9, 56, tzinfo=UTC)
    log.append(at, "system", "plan_received", "PLAN-x")
    log.append(at, "a_rahman", "approval_approved", "IR-OAUTH-02")
    assert log.verify().valid

    for statement in (
        f"UPDATE audit_log SET actor = 'mallory' WHERE incident_id = '{incident}'",
        f"DELETE FROM audit_log WHERE incident_id = '{incident}'",
        "TRUNCATE audit_log",
    ):
        with pytest.raises(DBAPIError, match="append-only"), engine.begin() as conn:
            conn.execute(text(statement))
    assert log.verify().valid and log.verify().length == 2


@pytest.fixture
def fresh_db() -> Iterator[str]:
    """A brand-new database on the test server, so restore tests see only their own incidents."""
    assert PG_URL
    name = f"halt_t_{uuid.uuid4().hex[:8]}"
    admin = create_engine(PG_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    yield make_url(PG_URL).set(database=name).render_as_string(hide_password=False)
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    admin.dispose()


def test_app_role_can_read_and_append_but_never_change_the_record(fresh_db: str) -> None:
    owner = make_engine(fresh_db)
    role, password = f"halt_app_{uuid.uuid4().hex[:6]}", uuid.uuid4().hex
    with owner.begin() as conn:
        conn.execute(text(f"CREATE ROLE {role} LOGIN PASSWORD '{password}'"))
    create_schema(owner, app_role=role)
    app = make_engine(
        make_url(fresh_db).set(username=role, password=password).render_as_string(hide_password=False)
    )

    log = AuditLog(DbAuditStore(app, "INC-ROLE"))
    log.append(datetime(2026, 10, 27, 9, 56, tzinfo=UTC), "system", "incident_reset", "INC-ROLE")
    with app.begin() as conn:  # mutable tables stay writable for the application
        conn.execute(text("INSERT INTO replay_positions (incident_id, t) VALUES ('INC-ROLE', 1.0)"))
        conn.execute(text("UPDATE replay_positions SET t = 2.0 WHERE incident_id = 'INC-ROLE'"))
        conn.execute(
            text(
                "INSERT INTO operations (incident_id, seq, kind, args, outcome, at) "
                "VALUES ('INC-ROLE', 1, 'reset', '{}', 'ok', now())"
            )
        )
    for table in ("audit_log", "operations"):
        for statement in (
            f"UPDATE {table} SET kind = 'forged' WHERE incident_id = 'INC-ROLE'",
            f"DELETE FROM {table} WHERE incident_id = 'INC-ROLE'",
            f"TRUNCATE {table}",
            f"ALTER TABLE {table} DISABLE TRIGGER ALL",  # only the owner could, and the app role is not it
        ):
            with pytest.raises(DBAPIError, match="permission denied|must be owner"), app.begin() as conn:
                conn.execute(text(statement))
        # The owner holds every privilege, and the trigger still refuses.
        with pytest.raises(DBAPIError, match="append-only"), owner.begin() as conn:
            conn.execute(text(f"DELETE FROM {table} WHERE incident_id = 'INC-ROLE'"))
    assert log.verify().valid and log.verify().length == 1
    app.dispose()
    owner.dispose()


def test_restart_restores_from_postgres(fresh_db: str, tmp_path: Path) -> None:
    settings = Settings(db_url=fresh_db, signing_key_path=str(tmp_path / "k.pem"))
    base, inc = "/api/v1", "/api/v1/incidents/INC-2417"
    with TestClient(create_app(settings)) as c:
        c.post(f"{inc}/correlate", json={})
        plan = c.post(f"{inc}/plans", json={}).json()
        proof = c.post(f"{base}/plans/{plan['id']}/proof").json()
        before = c.get(inc).json()
    with TestClient(create_app(settings)) as c2:
        assert c2.get(f"{base}/ready").json()["incidents"][0]["status"] == "restored"
        after = c2.get(inc).json()
        assert after["latest"] == before["latest"] and after["state"] == before["state"] == "approval_pending"
        assert c2.post(f"{base}/proofs/{proof['id']}/verify").json()["certificate_match"] is True
        assert c2.get(f"{base}/health").json()["audit_enforcement"] == "db"
