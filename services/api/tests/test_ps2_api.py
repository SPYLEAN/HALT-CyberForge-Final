"""PS2 REST boundary: fixture mode, uploads, validation, size and filename safety, metrics labelling."""

from __future__ import annotations

from fastapi.testclient import TestClient

from halt.ps2.config import load_config
from tests.ps2_support import api_record, jsonl

BASE = "/api/v1/ps2"


def _upload(content: str, **over: object) -> dict[str, object]:
    f = {"filename": "api.jsonl", "adapter": "api_activity", "content_type": "application/x-ndjson"}
    return {"files": [{**f, "content": content, **over}], "context": {"organisation": "Test Org"}}


def test_dataset_listing(client: TestClient) -> None:
    items = client.get(f"{BASE}/datasets").json()["items"]
    assert [d["dataset_id"] for d in items] == ["scenario-a", "scenario-b"]
    assert all(d["synthetic"] and d["has_ground_truth"] for d in items)


def test_fixture_mode_end_to_end(client: TestClient) -> None:
    ing = client.post(f"{BASE}/ingestions", json={"dataset_id": "scenario-a"})
    assert ing.status_code == 200
    batch = ing.json()["batch_id"]
    assert client.post(f"{BASE}/ingestions", json={"dataset_id": "scenario-a"}).json()["batch_id"] == batch
    page = client.get(f"{BASE}/ingestions/{batch}/events", params={"limit": 5}).json()
    assert page["total"] > 5 and len(page["items"]) == 5

    run = client.post(f"{BASE}/reconstructions", json={"batch_id": batch})
    assert run.status_code == 200
    run_id = run.json()["run_id"]
    assert client.post(f"{BASE}/reconstructions", json={"batch_id": batch}).json()["run_id"] == run_id
    for part in ("graph", "story", "hypotheses", "receipt", "attack-flow", "evaluation"):
        assert client.get(f"{BASE}/reconstructions/{run_id}/{part}").status_code == 200, part

    receipt = client.get(f"{BASE}/reconstructions/{run_id}/receipt").json()
    assert receipt["metrics"], "ground truth exists for the fixture, so measured metrics are attached"
    for m in receipt["metrics"]:
        assert m["status"] in ("measured", "unavailable")
        if m["status"] == "unavailable":
            assert m["value"] is None
    story = client.get(f"{BASE}/reconstructions/{run_id}/story").json()
    assert story["unsupported_claims"] == 0


def test_upload_mode_has_no_metrics(client: TestClient) -> None:
    content = jsonl(
        [
            api_record("r1", "2026-10-29T09:00:00Z", "u@org.example", "s1", "10.0.0.5"),
            api_record("r2", "2026-10-29T09:05:00Z", "u@org.example", "s1", "10.0.0.5"),
        ]
    )
    ing = client.post(f"{BASE}/ingestions", json=_upload(content))
    assert ing.status_code == 200 and ing.json()["accepted"] == 2
    run_id = client.post(f"{BASE}/reconstructions", json={"batch_id": ing.json()["batch_id"]}).json()[
        "run_id"
    ]
    assert client.get(f"{BASE}/reconstructions/{run_id}/receipt").json()["metrics"] == []
    assert client.get(f"{BASE}/reconstructions/{run_id}/evaluation").status_code == 404


def test_request_validation(client: TestClient) -> None:
    assert client.post(f"{BASE}/ingestions", json={}).status_code == 422
    both = {**_upload("{}\n"), "dataset_id": "scenario-a"}
    assert client.post(f"{BASE}/ingestions", json=both).status_code == 422
    assert client.post(f"{BASE}/ingestions", json={"dataset_id": "../ground_truth"}).status_code == 422
    assert client.post(f"{BASE}/ingestions", json={"dataset_id": "no-such-set"}).status_code == 404
    assert client.post(f"{BASE}/ingestions", json={"url": "http://example.com/logs"}).status_code == 422
    assert client.post(f"{BASE}/reconstructions", json={"batch_id": "x"}).status_code == 422
    missing = client.post(f"{BASE}/reconstructions", json={"batch_id": "batch-0000000000000000"})
    assert missing.status_code == 404
    assert client.get(f"{BASE}/reconstructions/run-unknown/graph").status_code == 404


def test_unsafe_filenames_and_types(client: TestClient) -> None:
    for name in ("../../etc/passwd", "a\\b.jsonl", ".env"):
        assert client.post(f"{BASE}/ingestions", json=_upload("{}\n", filename=name)).status_code == 422
    assert (
        client.post(f"{BASE}/ingestions", json=_upload("{}\n", content_type="text/html")).status_code == 422
    )
    wrong = client.post(f"{BASE}/ingestions", json=_upload("{}\n", content_type="text/csv"))
    assert wrong.status_code == 415 and wrong.json()["code"] == "unsupported_content_type"
    unknown = client.post(f"{BASE}/ingestions", json=_upload("{}\n", adapter="shell"))
    assert unknown.status_code == 422 and unknown.json()["code"] == "unknown_adapter"


def test_size_limits(client: TestClient) -> None:
    lim = load_config().limits
    big = client.post(f"{BASE}/ingestions", json=_upload("x" * (lim.max_file_bytes + 1)))
    assert big.status_code == 413 and big.json()["code"] == "file_too_large"
    huge = client.post(
        f"{BASE}/ingestions",
        content=b'{"files": []}',
        headers={"content-type": "application/json", "content-length": str(lim.max_total_bytes * 2)},
    )
    assert huge.status_code == 413


def test_malformed_upload_is_reported_with_redacted_preview(client: TestClient) -> None:
    secret = "password=hunter2"
    res = client.post(f"{BASE}/ingestions", json=_upload('{"broken": \n' + f'{{"note": "{secret}"}}\n'))
    assert res.status_code == 200
    body = res.json()
    assert body["rejected"] >= 1
    assert "hunter2" not in res.text


def test_intake_capabilities_come_from_the_registry_and_config(client: TestClient) -> None:
    from halt.ps2.intake.adapters import ADAPTERS

    body = client.get(f"{BASE}/intake").json()
    assert [a["adapter_id"] for a in body["adapters"]] == sorted(ADAPTERS)
    lim = load_config().limits
    assert body["limits"] == {
        "max_files": lim.max_files,
        "max_file_bytes": lim.max_file_bytes,
        "max_total_bytes": lim.max_total_bytes,
        "max_records_per_file": lim.max_records_per_file,
    }
    assert body["canonical_schema"] == "halt.canonical/1.0"


def _fixture_run(client: TestClient, dataset_id: str) -> str:
    batch = client.post(f"{BASE}/ingestions", json={"dataset_id": dataset_id}).json()["batch_id"]
    return str(client.post(f"{BASE}/reconstructions", json={"batch_id": batch}).json()["run_id"])


def test_entities_stages_and_selected_hypothesis(client: TestClient) -> None:
    run_id = _fixture_run(client, "scenario-a")
    summary = client.get(f"{BASE}/reconstructions/{run_id}").json()
    entities = client.get(f"{BASE}/reconstructions/{run_id}/entities").json()["items"]
    assert len(entities) == summary["entity_count"]
    assert any(e["aliases"] for e in entities)

    graph = client.get(f"{BASE}/reconstructions/{run_id}/graph").json()
    kept = {n["node_id"] for n in graph["nodes"] if n["node_kind"] == "event"}
    stages = client.get(f"{BASE}/reconstructions/{run_id}/stages").json()["items"]
    assert stages and {s["event_id"] for s in stages} <= kept
    times = {n["node_id"]: n["occurred_at"] for n in graph["nodes"] if n["node_kind"] == "event"}
    ordered = [times[s["event_id"]] for s in stages]
    assert ordered == sorted(ordered)
    assert all(
        c["basis"] in ("observed", "rule_inferred", "uncertain") for s in stages for c in s["candidates"]
    )

    hyp = client.get(f"{BASE}/reconstructions/{run_id}/hypotheses").json()
    assert hyp["selected"]["path_id"] == summary["selected_path_id"]
    assert hyp["selected"]["status"] == "selected"
    assert all(a["score"] <= hyp["selected"]["score"] for a in hyp["alternates"])
