"""Tables. Artefacts are stored as canonical JSON documents keyed by id; the audit log is append-only.

On PostgreSQL, triggers reject UPDATE, DELETE and TRUNCATE on audit_log (AT-6.7). On SQLite the guarantee
is application-enforced only, and /health reports audit_enforcement "app".
"""

from __future__ import annotations

from sqlalchemy import (
    DDL,
    JSON,
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    event,
)

metadata = MetaData()

incidents = Table(
    "incidents",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("variant", String(64), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("body", JSON, nullable=False),
)

artefacts = Table(
    "artefacts",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("incident_id", String(32), nullable=False, index=True),
    Column("kind", String(32), nullable=False),  # simulation | plan | proof | execution | approval | findings
    Column("hash", String(64), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("body", JSON, nullable=False),
)

audit_log = Table(
    "audit_log",
    metadata,
    Column("incident_id", String(32), primary_key=True),
    Column("seq", Integer, primary_key=True, autoincrement=False),
    Column("at", DateTime(timezone=True), nullable=False),
    Column("actor", String(64), nullable=False),
    Column("kind", String(64), nullable=False),
    Column("subject_id", String(64), nullable=False),
    Column("payload", JSON, nullable=True),
    Column("prev_hash", String(64), nullable=False),
    Column("hash", String(64), nullable=False),
)

_APPEND_ONLY = DDL(  # type: ignore[no-untyped-call]
    """
    CREATE OR REPLACE FUNCTION halt_audit_append_only() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log is append-only';
    END
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION halt_audit_append_only();
    CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
      FOR EACH STATEMENT EXECUTE FUNCTION halt_audit_append_only();
    """
).execute_if(dialect="postgresql")

event.listen(audit_log, "after_create", _APPEND_ONLY)
