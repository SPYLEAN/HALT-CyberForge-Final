"""Database engine, schema creation and health ping."""

from __future__ import annotations

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.pool import StaticPool

from halt.db.models import APPEND_ONLY_TABLES, MUTABLE_TABLES, metadata


def make_engine(db_url: str) -> Engine:
    if db_url.startswith("sqlite"):
        # One shared connection for in-memory databases; allow use from the threadpool.
        memory = ":memory:" in db_url or db_url.endswith("://")
        return create_engine(
            db_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool if memory else None,
        )
    # Fail fast when PostgreSQL is unreachable, so a request gets a 503 instead of hanging.
    return create_engine(db_url, pool_pre_ping=True, connect_args={"connect_timeout": 3})


def create_schema(engine: Engine, app_role: str | None = None) -> None:
    """Idempotent. On PostgreSQL this also installs the append-only triggers (models.py) and, when an
    application role is named, limits it to reading and appending on the append-only tables."""
    metadata.create_all(engine)
    if app_role and engine.dialect.name == "postgresql":
        grant_app_role(engine, app_role)


def grant_app_role(engine: Engine, role: str) -> None:
    """The application role may read and append to the audit log and journal, never change them. Triggers
    already reject UPDATE/DELETE/TRUNCATE for every role; this removes the privileges as well, so the role
    cannot even attempt them (or drop the triggers, which needs ownership)."""
    append_only, mutable = ", ".join(APPEND_ONLY_TABLES), ", ".join(MUTABLE_TABLES)
    with engine.begin() as conn:
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(f"REVOKE ALL ON {append_only} FROM PUBLIC"))
        conn.execute(text(f'REVOKE ALL ON {append_only} FROM "{role}"'))
        conn.execute(text(f'GRANT SELECT, INSERT ON {append_only} TO "{role}"'))
        conn.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON {mutable} TO "{role}"'))


def ping(engine: Engine) -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
