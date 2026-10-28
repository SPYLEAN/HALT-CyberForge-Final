"""OpenAPI document: the routes plus every contract model, so frontend types exist before the routes do."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from pydantic.json_schema import models_json_schema

from halt.contracts import CONTRACT_MODELS


def build_openapi(app: FastAPI) -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)
    _, defs = models_json_schema(
        [(m, "serialization") for m in CONTRACT_MODELS], ref_template="#/components/schemas/{model}"
    )
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    for name, definition in defs.get("$defs", {}).items():
        components.setdefault(name, definition)  # route-generated schemas win on a name clash
    schema["components"]["schemas"] = dict(sorted(components.items()))
    app.openapi_schema = schema
    return schema
