"""Map domain errors to ApiError JSON responses."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from halt.api.state import describe
from halt.contracts.common import ApiError
from halt.gate.gate import GateError
from halt.logging import get_logger, request_id_var
from halt.ps2.intake.intake import IntakeError
from halt.scenario.loader import ScenarioError
from halt.service import Conflict, NotFound, Unavailable


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

    @app.exception_handler(IntakeError)
    async def intake(_: Request, exc: IntakeError) -> JSONResponse:
        return _error(exc.status, exc.code, str(exc))

    @app.exception_handler(Unavailable)
    async def unavailable(_: Request, exc: Unavailable) -> JSONResponse:
        return _error(503, exc.code, str(exc))

    @app.exception_handler(SQLAlchemyError)
    async def database(_: Request, exc: SQLAlchemyError) -> JSONResponse:
        get_logger().error("database_error", reason=describe(exc))
        return _error(
            503,
            "dependency_unavailable",
            "The HALT database failed during this request; it was not completed and the incident will be "
            "rebuilt from its journal on the next call.",
        )

    @app.exception_handler(Exception)
    async def internal(_: Request, exc: Exception) -> JSONResponse:
        get_logger().error("internal_error", error=type(exc).__name__)
        return _error(500, "internal_error", "Unexpected error in the HALT API. Nothing shown was invented.")
