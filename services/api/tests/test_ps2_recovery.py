"""PS2 demo recovery: bundled-dataset runs are regenerated identically after an API restart; uploaded runs are
never regenerated; the demo reset touches bundled data only and is off unless HALT_DEMO_MODE is on."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from halt.config import Settings
from halt.main import create_app
from tests.ps2_support import api_record, jsonl

BASE = "/api/v1/ps2"


def fresh(tmp_path: Path, name: str, demo_mode: bool = False) -> TestClient:
    """A new app instance: its PS2 store starts empty, exactly as after an API restart."""
    return TestClient(
        create_app(
            Settings(
                db_url="sqlite+pysqlite:///:memory:",
                signing_key_path=str(tmp_path / f"{name}.pem"),
                demo_mode=demo_mode,
            )
        )
    )


def bundled_run(client: TestClient, dataset_id: str) -> tuple[str, str]:
    batch = client.post(f"{BASE}/ingestions", json={"dataset_id": dataset_id}).json()["batch_id"]
    return batch, str(client.post(f"{BASE}/reconstructions", json={"batch_id": batch}).json()["run_id"])


def snapshot(client: TestClient, run_id: str) -> dict[str, Any]:
    receipt = client.get(f"{BASE}/reconstructions/{run_id}/receipt").json()
    receipt.pop("processing_ms")  # wall time; excluded from every hash
    return {
        "summary": {
            k: v
            for k, v in client.get(f"{BASE}/reconstructions/{run_id}").json().items()
            if k != "processing_ms"
        },
        "graph": client.get(f"{BASE}/reconstructions/{run_id}/graph").json(),
        "story": client.get(f"{BASE}/reconstructions/{run_id}/story").json(),
        "hypotheses": client.get(f"{BASE}/reconstructions/{run_id}/hypotheses").json(),
        "receipt": receipt,
    }


def upload(client: TestClient) -> tuple[str, str]:
    content = jsonl(
        [
            api_record("r1", "2026-10-29T09:00:00Z", "u@org.example", "s1", "10.0.0.5"),
            api_record("r2", "2026-10-29T09:05:00Z", "u@org.example", "s1", "10.0.0.5"),
        ]
    )
    files = [
        {
            "filename": "api.jsonl",
            "adapter": "api_activity",
            "content_type": "application/x-ndjson",
            "content": content,
        }
    ]
    batch = client.post(
        f"{BASE}/ingestions", json={"files": files, "context": {"organisation": "Test Org"}}
    ).json()["batch_id"]
    return batch, str(client.post(f"{BASE}/reconstructions", json={"batch_id": batch}).json()["run_id"])


def test_bundled_run_is_identical_after_a_restart(tmp_path: Path) -> None:
    with fresh(tmp_path, "a") as before:
        batch, run_id = bundled_run(before, "scenario-b")
        expected = snapshot(before, run_id)
        events = before.get(f"{BASE}/ingestions/{batch}/events?limit=500").json()
    with fresh(tmp_path, "b") as after:  # nothing ingested in this process
        assert snapshot(after, run_id) == expected
        assert after.get(f"{BASE}/ingestions/{batch}/events?limit=500").json() == events
        assert after.get(f"{BASE}/reconstructions/{run_id}/evaluation").status_code == 200


def test_a_restored_bundled_batch_reconstructs_to_the_same_run(tmp_path: Path) -> None:
    with fresh(tmp_path, "a") as before:
        batch, run_id = bundled_run(before, "scenario-a")
    with fresh(tmp_path, "b") as after:
        assert after.get(f"{BASE}/ingestions/{batch}").status_code == 200
        assert after.post(f"{BASE}/reconstructions", json={"batch_id": batch}).json()["run_id"] == run_id


def test_uploaded_runs_are_never_regenerated(tmp_path: Path) -> None:
    with fresh(tmp_path, "a") as before:
        batch, run_id = upload(before)
        assert before.get(f"{BASE}/reconstructions/{run_id}").status_code == 200
    with fresh(tmp_path, "b") as after:
        for path in (
            f"/reconstructions/{run_id}",
            f"/reconstructions/{run_id}/graph",
            f"/ingestions/{batch}",
        ):
            r = after.get(f"{BASE}{path}")
            assert r.status_code == 404, path
            assert "uploaded" in r.json()["message"]


def test_unknown_ids_stay_404(client: TestClient) -> None:
    assert client.get(f"{BASE}/reconstructions/run-0000000000000000").status_code == 404
    assert client.get(f"{BASE}/ingestions/batch-0000000000000000").status_code == 404


def test_demo_mode_is_off_by_default_and_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HALT_DEMO_MODE", raising=False)
    assert Settings(db_url="sqlite+pysqlite:///:memory:", _env_file=None).demo_mode is False
    monkeypatch.setenv("HALT_DEMO_MODE", "true")
    assert Settings(db_url="sqlite+pysqlite:///:memory:", _env_file=None).demo_mode is True


def test_demo_reset_is_404_and_changes_nothing_when_demo_mode_is_off(tmp_path: Path) -> None:
    with fresh(tmp_path, "off") as client:
        batch_a, run_a = bundled_run(client, "scenario-a")
        up_batch, up_run = upload(client)
        r = client.post(f"{BASE}/demo/reset")
        assert r.status_code == 404
        assert "HALT_DEMO_MODE" in r.json()["message"]
        store = client.app.state.ps2  # type: ignore[attr-defined]
        assert set(store.batches) == {batch_a, up_batch}
        assert set(store.runs) == {run_a, up_run}


def test_demo_reset_drops_only_bundled_entries_and_they_come_back_identical(tmp_path: Path) -> None:
    with fresh(tmp_path, "on", demo_mode=True) as client:
        _demo_reset_round_trip(client)


def _demo_reset_round_trip(client: TestClient) -> None:
    batch_a, run_a = bundled_run(client, "scenario-a")
    expected = snapshot(client, run_a)
    up_batch, up_run = upload(client)

    body = client.post(f"{BASE}/demo/reset").json()
    assert body["removed_batches"] == [batch_a]
    assert body["removed_runs"] == [run_a]
    assert body["kept_uploaded_batches"] == 1 and body["kept_uploaded_runs"] == 1
    assert "Demo-only" in body["note"]
    # Uploads are untouched; the bundled run regenerates identically on request.
    assert client.get(f"{BASE}/reconstructions/{up_run}").status_code == 200
    assert client.get(f"{BASE}/ingestions/{up_batch}").status_code == 200
    assert snapshot(client, run_a) == expected
    # A second reset after nothing new was requested removes nothing more than what was regenerated.
    again = client.post(f"{BASE}/demo/reset").json()
    assert again["removed_runs"] == [run_a] and again["kept_uploaded_runs"] == 1
