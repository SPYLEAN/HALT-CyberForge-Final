"""Map domain errors to ApiError JSON responses."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from halt.contracts.common import ApiError
from halt.gate.gate import GateError
from halt.logging import request_id_var
from halt.scenario.loader import ScenarioError
from halt.service import Conflict, NotFound


def _error(status: int, code: str, message: str) -> JSONResponse:
    body = ApiError(code=code, message=message, request_id=request_id_var.get())
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"))


def install(app: FastAPI) -> None:
    @app.exception_handler(NotFound)
    async def not_found(_: Request, exc: NotFound) -> JSONResponse:
        return _error(404, "not_found", str(exc))

    @app.exception_handler(Conflict)
    async def conflict(_: Request, exc: Conflict) -> JSONResponse:
        return _error(409, exc.code, str(exc))

    @app.exception_handler(GateError)
    async def gate(_: Request, exc: GateError) -> JSONResponse:
        return _error(exc.status, exc.code, str(exc))

    @app.exception_handler(ScenarioError)
    async def scenario(_: Request, exc: ScenarioError) -> JSONResponse:
        return _error(422, "invalid_scenario", str(exc))
