"""Database engine. Models and migrations arrive in Phase 6."""

from __future__ import annotations

from sqlalchemy import Engine, create_engine, text


def make_engine(db_url: str) -> Engine:
    return create_engine(db_url, pool_pre_ping=True)


def ping(engine: Engine) -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
