"""FastAPI application factory."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from halt import __version__
from halt.api import errors, health, routes, ws
from halt.config import Settings, get_settings
from halt.db import create_schema, make_engine
from halt.db.repo import Repository
from halt.logging import configure_logging, get_logger, request_id_var
from halt.openapi import build_openapi
from halt.proofseal.seal import Sealer
from halt.scenario.loader import load_scenario
from halt.service import IncidentService, default_loader

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="HALT API",
        version=__version__,
        description="Proof-Carrying Cyber Response. All data is synthetic (SIMULATED).",
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs",
    )
    app.state.settings = settings
    app.state.engine = make_engine(settings.db_url)
    create_schema(app.state.engine)
    # A malformed fixture raises ScenarioError here and the API does not start (AT-1.1).
    app.state.scenario = load_scenario(settings.scenario_dir, settings.scenario_variant)
    app.state.service = IncidentService(
        Repository(app.state.engine),
        Sealer.from_path(Path(settings.signing_key_path)),
        default_loader(settings.scenario_dir),
    )
    app.state.llm = None  # optional LlmClient; HALT_LLM_ENABLED must also be true

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
            get_logger().info(
                "request", method=request.method, path=request.url.path, status=response.status_code
            )
        finally:
            request_id_var.reset(token)
        response.headers["x-request-id"] = rid
        return response

    errors.install(app)
    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(routes.router, prefix=API_PREFIX)
    app.include_router(ws.router)
    app.openapi = lambda: build_openapi(app)  # type: ignore[method-assign]
    return app
