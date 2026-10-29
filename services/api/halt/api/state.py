"""The incident service behind every route, started lazily so a missing database is a 503, not a crash.

`create_app` tries to start the service once. If PostgreSQL (or the SQLite file) is unreachable the API still
starts: /health reports it, /ready answers 503, and every incident route answers 503 `dependency_unavailable`.
Each later request retries the start at most every RETRY_S seconds, so the API recovers on its own once the
database is back, restoring incidents from their journal as it would after a restart.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy.exc import SQLAlchemyError

from halt.db import create_schema, make_engine
from halt.db.repo import Repository
from halt.logging import get_logger
from halt.proofseal.seal import Sealer
from halt.service import IncidentService, Unavailable, default_loader

RETRY_S = 2.0


def describe(exc: SQLAlchemyError) -> str:
    """One readable line, without the SQL or the connection string."""
    cause = getattr(exc, "orig", None) or exc
    text = str(cause).strip().splitlines()[0] if str(cause).strip() else type(cause).__name__
    return f"{type(cause).__name__}: {text[:200]}"


def init(app: FastAPI) -> None:
    app.state.service = None
    app.state.start_error = None
    app.state.start_attempt = float("-inf")
    app.state.start_lock = threading.Lock()
    try_start(app)


def try_start(app: FastAPI) -> None:
    settings = app.state.settings
    try:
        owner = make_engine(settings.db_migrate_url) if settings.db_migrate_url else app.state.engine
        create_schema(owner, settings.db_app_role)
        app.state.service = IncidentService(
            Repository(app.state.engine),
            Sealer.from_path(Path(settings.signing_key_path)),
            default_loader(settings.scenario_dir),
        )
        app.state.start_error = None
    except SQLAlchemyError as exc:
        app.state.start_error = describe(exc)
        get_logger().error("service_unavailable", reason=app.state.start_error)
    finally:
        # Measured from the end of the attempt: requests that queued behind it fail fast instead of each
        # waiting out another connection timeout.
        app.state.start_attempt = time.monotonic()


def service_of(app: FastAPI) -> IncidentService:
    service: IncidentService | None = app.state.service
    if service is not None:
        return service
    with app.state.start_lock:
        if app.state.service is None and time.monotonic() - app.state.start_attempt >= RETRY_S:
            try_start(app)
        if app.state.service is None:
            raise Unavailable(
                "dependency_unavailable",
                f"The HALT database is unavailable ({app.state.start_error}). "
                "Nothing was changed; retry shortly.",
            )
        started: IncidentService = app.state.service
        return started
