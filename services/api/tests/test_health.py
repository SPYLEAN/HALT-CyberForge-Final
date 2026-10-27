"""AT-0.4 (API half): /health reports db status. The compose CI job checks it against PostgreSQL."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_ok(client: TestClient) -> None:
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert body["simulated"] is True
    assert body["audit_enforcement"] == "app"  # sqlite fallback is labelled
    assert r.headers["x-request-id"]


def test_openapi_served(client: TestClient) -> None:
    assert client.get("/api/v1/openapi.json").json()["info"]["title"] == "HALT API"
