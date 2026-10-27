from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel

from halt import __version__
from halt.db import ping

router = APIRouter()


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    db: Literal["ok", "unavailable"]
    audit_enforcement: Literal["db", "app"]
    simulated: Literal[True] = True
    version: str


@router.get("/health", response_model=Health)
def health(request: Request) -> Health:
    db_ok = ping(request.app.state.engine)
    return Health(
        status="ok" if db_ok else "degraded",
        db="ok" if db_ok else "unavailable",
        audit_enforcement=request.app.state.settings.audit_enforcement,
        version=__version__,
    )
