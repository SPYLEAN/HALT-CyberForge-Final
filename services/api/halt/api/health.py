"""Liveness (/health: 200 while the process runs) and readiness (/ready: 200 only when the demo can run)."""

from __future__ import annotations

import contextlib
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from halt import __version__
from halt.api.state import service_of
from halt.db import ping
from halt.service import IncidentService, Unavailable

router = APIRouter()


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    db: Literal["ok", "unavailable"]
    service: Literal["ready", "unavailable"]
    audit_enforcement: Literal["db", "app"]
    simulated: Literal[True] = True
    version: str


class IncidentReadiness(BaseModel):
    id: str
    status: Literal["seeded", "restored", "restoring", "dropped", "failed"]
    detail: str | None


class Readiness(BaseModel):
    ready: bool
    db: Literal["ok", "unavailable"]
    reason: str | None
    incidents: list[IncidentReadiness]


@router.get("/health", response_model=Health)
def health(request: Request) -> Health:
    """Fast: while the service has not started, the failed start already says the database is down, so it
    is not pinged again (an unreachable host can take seconds to time out)."""
    service_up = request.app.state.service is not None
    db_ok = service_up and ping(request.app.state.engine)
    return Health(
        status="ok" if db_ok and service_up else "degraded",
        db="ok" if db_ok else "unavailable",
        service="ready" if service_up else "unavailable",
        audit_enforcement=request.app.state.settings.audit_enforcement,
        version=__version__,
    )


@router.get("/ready", response_model=Readiness, responses={503: {"model": Readiness}})
def ready(request: Request) -> Readiness | JSONResponse:
    """Ready = the database answers and every known incident is being served (seeded or restored)."""
    service: IncidentService | None = None
    with contextlib.suppress(Unavailable):
        service = service_of(request.app)  # retries a failed start, like any route
    db_ok = service is not None and ping(request.app.state.engine)
    if service is not None:
        for incident_id, status, _ in service.readiness():
            if status == "dropped":  # retry the rebuild a failed write left pending
                with contextlib.suppress(Exception):
                    service.runtime(incident_id)
    incidents = (
        [IncidentReadiness(id=i, status=s, detail=d) for i, s, d in service.readiness()] if service else []
    )
    reason = (
        "database unavailable"
        if not db_ok
        else "incident service not started"
        if service is None
        else next(
            (f"{i.id} {i.status}: {i.detail}" for i in incidents if i.status in ("failed", "dropped")), None
        )
    )
    body = Readiness(
        ready=reason is None, db="ok" if db_ok else "unavailable", reason=reason, incidents=incidents
    )
    return body if body.ready else JSONResponse(status_code=503, content=body.model_dump(mode="json"))
