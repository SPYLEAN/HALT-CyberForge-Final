"""AT-6.5: logs are JSON lines carrying the request id."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from halt.config import Settings
from halt.main import create_app


def test_AT_6_5_json_logs_with_request_id(settings: Settings, capfd: pytest.CaptureFixture[str]) -> None:
    client = TestClient(create_app(settings.model_copy(update={"log_level": "INFO"})))
    capfd.readouterr()
    r = client.get("/api/v1/health", headers={"x-request-id": "req-test-123"})
    assert r.headers["x-request-id"] == "req-test-123"
    lines = [line for line in capfd.readouterr().out.splitlines() if line.strip().startswith("{")]
    records = [json.loads(line) for line in lines]
    request_logs = [rec for rec in records if rec.get("event") == "request"]
    assert request_logs, capfd.readouterr()
    rec = request_logs[-1]
    assert rec["request_id"] == "req-test-123"
    assert rec["path"] == "/api/v1/health" and rec["status"] == 200 and "timestamp" in rec
