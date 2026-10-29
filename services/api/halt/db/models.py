"""Tables. Artefacts are stored as canonical JSON documents keyed by id; the audit log and the operation
journal are append-only.

On PostgreSQL, triggers reject UPDATE, DELETE and TRUNCATE on audit_log and operations for every role,
including the owner (AT-6.7); `grant_app_role` additionally limits a separate application role to SELECT and
INSERT on them. On SQLite the guarantee is application-enforced only, and /health reports audit_enforcement
"app".

The operation journal records every state-changing call in order (with its outcome), so a restarted API can
rebuild an incident by re-running it deterministically (service.restore).
"""

from __future__ import annotations

from sqlalchemy import (
    DDL,
    JSON,
    Column,
    DateTime,
    Float,
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

operations = Table(
    "operations",
    metadata,
    Column("incident_id", String(32), primary_key=True),
    Column("seq", Integer, primary_key=True, autoincrement=False),
    Column("kind", String(32), nullable=False),  # reset | correlate | plan | simulate | seal | approve | ...
    Column("args", JSON, nullable=False),
    Column("outcome", String(64), nullable=False),  # "ok" or the domain error code the call raised
    Column("at", DateTime(timezone=True), nullable=False),  # operator clock after the call
)

replay_positions = Table(
    "replay_positions",
    metadata,
    Column("incident_id", String(32), primary_key=True),
    Column("t", Float, nullable=True),  # null after a reset: clients start at the end of the replay
)

_APPEND_ONLY_FN = DDL(  # type: ignore[no-untyped-call]
    """
    CREATE OR REPLACE FUNCTION halt_append_only() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION '%% is append-only', TG_TABLE_NAME;  -- doubled: SQLAlchemy formats DDL text
    END
    $$ LANGUAGE plpgsql;
    """
).execute_if(dialect="postgresql")


def _append_only(table: Table) -> DDL:
    name = table.name
    return DDL(  # type: ignore[no-untyped-call]
        f"""
        CREATE TRIGGER {name}_no_update_delete BEFORE UPDATE OR DELETE ON {name}
          FOR EACH ROW EXECUTE FUNCTION halt_append_only();
        CREATE TRIGGER {name}_no_truncate BEFORE TRUNCATE ON {name}
          FOR EACH STATEMENT EXECUTE FUNCTION halt_append_only();
        """
    ).execute_if(dialect="postgresql")


event.listen(metadata, "before_create", _APPEND_ONLY_FN)
for _table in (audit_log, operations):
    event.listen(_table, "after_create", _append_only(_table))

APPEND_ONLY_TABLES = ("audit_log", "operations")
MUTABLE_TABLES = ("incidents", "artefacts", "replay_positions")
