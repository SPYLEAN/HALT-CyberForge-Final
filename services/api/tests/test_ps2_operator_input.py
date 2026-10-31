"""The operator's manual-upload file (demo-inputs/ps2-small-demo.jsonl): synthetic only, and it reconstructs
to exactly what demo-inputs/README.md documents."""

from __future__ import annotations

import ipaddress
import json
from pathlib import Path

from fastapi.testclient import TestClient

BASE = "/api/v1/ps2"
DEMO = Path(__file__).resolve().parents[3] / "demo-inputs" / "ps2-small-demo.jsonl"
DOC_RANGE = ipaddress.ip_network("203.0.113.0/24")  # RFC 5737 TEST-NET-3


def test_operator_file_is_small_and_synthetic() -> None:
    raw = DEMO.read_text(encoding="utf-8")
    assert len(raw.encode()) < 10_000
    records = [json.loads(line) for line in raw.splitlines()]
    assert len(records) == 20
    for r in records:
        assert r["UserId"].endswith("@northwind.example")
        ip = ipaddress.ip_address(r["ClientIP"])
        assert ip.is_private or ip in DOC_RANGE
    lowered = raw.lower()
    for word in ("password", "secret", "token", "apikey", "bearer"):
        assert word not in lowered


def test_operator_file_reconstructs_as_documented(client: TestClient) -> None:
    files = [
        {
            "filename": DEMO.name,
            "adapter": "api_activity",
            "content_type": "application/x-ndjson",
            "content": DEMO.read_text(encoding="utf-8"),
        }
    ]
    ing = client.post(f"{BASE}/ingestions", json={"files": files}).json()
    assert (ing["accepted"], ing["rejected"], ing["warnings"], ing["event_count"]) == (19, 1, 0, 19)
    [rejected] = [r for r in ing["files"][0]["records"] if r["status"] == "rejected"]
    assert rejected["source_record_id"] == "demo-019"
    assert [i["code"] for i in rejected["issues"]] == ["unsupported_operation"]

    run = client.post(f"{BASE}/reconstructions", json={"batch_id": ing["batch_id"]}).json()
    assert run["run_id"] == "run-07fc183c9b2f9ddb"  # deterministic: same file, no context, same engine
    assert (run["seeds"], run["selected_edges"], run["candidate_edges"]) == (2, 15, 28)
    assert run["affected_services"] == []  # no organisation context, so no service impact is forecast

    rid = run["run_id"]
    receipt = client.get(f"{BASE}/reconstructions/{rid}/receipt").json()
    assert receipt["uncertainty"]["inferred_hops"] == 0
    assert receipt["uncertainty"]["score_margin"] < 0.01  # reads as ambiguous in the workspace
    story = client.get(f"{BASE}/reconstructions/{rid}/story").json()
    assert (story["checked_statements"], story["unsupported_claims"]) == (4, 0)
    record_of = {r["event_id"]: r["source_record_id"] for r in ing["files"][0]["records"]}
    selected = client.get(f"{BASE}/reconstructions/{rid}/hypotheses").json()["selected"]["event_ids"]
    assert [record_of[e] for e in selected] == ["demo-011", "demo-012", "demo-016"]
    assert client.get(f"{BASE}/reconstructions/{rid}/evaluation").status_code == 404  # no ground truth
