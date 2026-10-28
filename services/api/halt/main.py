"""FastAPI application factory."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from halt import __version__
from halt.api import health
from halt.config import Settings, get_settings
from halt.db import make_engine
from halt.logging import configure_logging, get_logger, request_id_var
from halt.openapi import build_openapi
from halt.scenario.loader import load_scenario

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
    # A malformed fixture raises ScenarioError here and the API does not start (AT-1.1).
    app.state.scenario = load_scenario(settings.scenario_dir, settings.scenario_variant)

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

    app.include_router(health.router, prefix=API_PREFIX)
    app.openapi = lambda: build_openapi(app)  # type: ignore[method-assign]
    return app
