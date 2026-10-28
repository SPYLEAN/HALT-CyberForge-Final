"""Database engine, schema creation and health ping."""

from __future__ import annotations

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.pool import StaticPool

from halt.db.models import metadata


def make_engine(db_url: str) -> Engine:
    if db_url.startswith("sqlite"):
        # One shared connection for in-memory databases; allow use from the threadpool.
        memory = ":memory:" in db_url or db_url.endswith("://")
        return create_engine(
            db_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool if memory else None,
        )
    return create_engine(db_url, pool_pre_ping=True)


def create_schema(engine: Engine) -> None:
    """Idempotent. On PostgreSQL this also installs the audit_log append-only triggers (models.py)."""
    metadata.create_all(engine)


def ping(engine: Engine) -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
