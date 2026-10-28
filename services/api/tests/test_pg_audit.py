"""AT-6.7: on PostgreSQL the audit table rejects UPDATE, DELETE and TRUNCATE.

Runs only when HALT_TEST_PG_URL points at a disposable PostgreSQL database (the CI postgres service).
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from halt.audit.log import AuditLog
from halt.db import create_schema, make_engine
from halt.db.repo import DbAuditStore

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
