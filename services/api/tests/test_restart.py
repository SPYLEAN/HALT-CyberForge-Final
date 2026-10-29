"""Restart safety: an API restart restores each incident from its operation journal, verified against the
audit log and the stored artefacts; disagreement is refused, never papered over; reset-to-seed is
deterministic; the replay position survives; dependency failures answer 503 and recover.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, text

from halt.config import Settings
from halt.db.models import operations
from halt.main import create_app

B = "/api/v1"
I = f"{B}/incidents/INC-2417"  # noqa: E741
SIM = {
    "plans": [
        {"label": "A", "source": "preset_aggressive"},
        {"label": "B", "source": "preset_passive"},
        {"label": "C", "source": "plan", "plan_id": None},
    ]
}


def actor(name: str) -> dict[str, str]:
    return {"X-Halt-Actor": name}


@pytest.fixture
def file_settings(tmp_path: Path) -> Settings:
    return Settings(
        db_url=f"sqlite+pysqlite:///{(tmp_path / 'halt.db').as_posix()}",
        signing_key_path=str(tmp_path / "demo-key.pem"),
    )


@pytest.fixture
def boot(file_settings: Settings) -> Iterator[Any]:
    """Start (and restart) the API on the same database file."""
    clients: list[TestClient] = []

    def start() -> TestClient:
        c = TestClient(create_app(file_settings))
        c.__enter__()
        clients.append(c)
        return c

    yield start
    for c in clients:
        c.__exit__(None, None, None)


def ok(r: Any, status: int = 200) -> Any:
    assert r.status_code == status, f"{r.request.method} {r.request.url}: {r.status_code} {r.text[:300]}"
    return r.json()


def to_sealed(c: TestClient) -> tuple[str, str, str]:
    ok(c.post(f"{I}/correlate", json={}))
    plan = ok(c.post(f"{I}/plans", json={}))
    sim = ok(
        c.post(
            f"{I}/simulations",
            json={**SIM, "plans": [*SIM["plans"][:2], {**SIM["plans"][2], "plan_id": plan["id"]}]},
        )
    )
    # A refused call still moves the operator clock; the journal records it so a restore re-runs it too.
    ok(c.post(f"{B}/plans/{plan['id']}/execute", json={"proof_id": "PS-x"}, headers=actor("a_rahman")), 409)
    proof = ok(c.post(f"{B}/plans/{plan['id']}/proof"))
    return plan["id"], sim["id"], proof["id"]


def approve(c: TestClient, plan_id: str, policy: str, approver: str) -> Any:
    body = {"policy_id": policy, "approver_id": approver}
    return ok(c.post(f"{B}/plans/{plan_id}/approvals", json=body, headers=actor(approver)))


def snapshot(c: TestClient) -> dict[str, Any]:
    incident = ok(c.get(I))
    audit = ok(c.get(f"{I}/audit"))
    return {
        "state": incident["state"],
        "latest": incident["latest"],
        "variant": incident["variant"],
        "generated_at": incident["meta"]["generated_at"],
        "audit": [(e["seq"], e["hash"]) for e in audit["items"]],
    }


def test_restart_restores_the_incident_exactly(boot: Any) -> None:
    c = boot()
    plan_id, sim_id, proof_id = to_sealed(c)
    approve(c, plan_id, "IR-OAUTH-02", "a_rahman")
    before = snapshot(c)
    approvals_before = ok(c.get(f"{B}/plans/{plan_id}/approvals"))

    c2 = boot()  # a second API process on the same database: what a restart sees
    assert ok(c2.get(f"{B}/ready"))["incidents"] == [{"id": "INC-2417", "status": "restored", "detail": None}]
    assert snapshot(c2) == before
    assert ok(c2.get(f"{B}/plans/{plan_id}/approvals")) == approvals_before
    assert ok(c2.get(f"{B}/simulations/{sim_id}"))["hash"] == ok(c.get(f"{B}/simulations/{sim_id}"))["hash"]
    assert ok(c2.post(f"{B}/proofs/{proof_id}/verify"))["certificate_match"] is True
    assert ok(c2.get(f"{I}/audit/verify"))["valid"] is True

    # The restored incident carries on: second approval, execute, roll back.
    approve(c2, plan_id, "IR-CA-05", "s_iyer")
    execution = ok(
        c2.post(f"{B}/plans/{plan_id}/execute", json={"proof_id": proof_id}, headers=actor("a_rahman"))
    )
    assert execution["execution"]["state"] == "applied"

    c3 = boot()  # and survives another restart in the contained state
    assert ok(c3.get(I))["state"] == "contained"
    rolled = ok(c3.post(f"{B}/executions/{execution['execution']['id']}/rollback", headers=actor("a_rahman")))
    assert rolled["execution"]["state"] == "rolled"
    assert ok(c3.get(f"{I}/audit/verify"))["valid"] is True


def test_restore_refuses_a_journal_that_disagrees_with_the_record(boot: Any, file_settings: Settings) -> None:
    c = boot()
    plan_id, _, _ = to_sealed(c)
    # Tamper: journal an approval that never happened (no audit entry, no artefact).
    engine = c.app.state.engine  # type: ignore[attr-defined]
    with engine.begin() as conn:
        last = conn.execute(text("SELECT max(seq) FROM operations WHERE incident_id = 'INC-2417'")).scalar()
        args = {
            "plan_id": plan_id,
            "actor": "a_rahman",
            "policy_id": "IR-OAUTH-02",
            "approver_id": "a_rahman",
            "decision": "approved",
            "note": None,
        }
        conn.execute(
            insert(operations).values(
                incident_id="INC-2417",
                seq=last + 1,
                kind="approve",
                args=args,
                outcome="ok",
                at=c.app.state.service.runtime("INC-2417").now,
            )
        )  # type: ignore[attr-defined]

    c2 = boot()
    ready = c2.get(f"{B}/ready")
    assert ready.status_code == 503
    assert ready.json()["incidents"][0]["status"] == "failed"
    blocked = ok(c2.get(I), 503)
    assert blocked["code"] == "restore_inconsistent"
    assert "reset-to-seed" in blocked["message"]

    # Reset to seed is the explicit way out; the audit history is kept and still verifies.
    reset = ok(c2.post(f"{I}/reset-to-seed"))
    assert reset["state"] == "new" and reset["variant"] == "baseline" and reset["replay_cursor_s"] is None
    assert ok(c2.get(f"{I}/audit/verify"))["valid"] is True
    assert ok(c2.get(f"{B}/ready"))["ready"] is True


def test_reset_to_seed_is_deterministic(boot: Any) -> None:
    c = boot()
    first = to_sealed(c)
    first_cert = ok(c.get(f"{B}/proofs/{first[2]}"))["certificate"]
    ok(c.post(f"{I}/replay/reset", json={"variant": "verma_not_releaser"}))
    ok(c.post(f"{I}/reset-to-seed"))
    second = to_sealed(c)
    assert second == first  # same plan, simulation and proof ids
    assert ok(c.get(f"{B}/proofs/{second[2]}"))["certificate"] == first_cert
    assert ok(c.get(f"{I}/audit/verify"))["valid"] is True
    # ...and a restart after the reset restores the second run, not the first.
    c2 = boot()
    assert ok(c2.get(I))["latest"]["proof_id"] == second[2]


def test_replay_position_survives_a_restart(boot: Any) -> None:
    c = boot()
    assert ok(c.get(I))["replay_cursor_s"] is None
    with c.websocket_connect("/ws/incidents/INC-2417") as ws:
        ws.send_json({"type": "seek", "t": 300})
        assert ws.receive_json()["type"] == "clock"
    assert ok(c.get(I))["replay_cursor_s"] == 300
    c2 = boot()
    assert ok(c2.get(I))["replay_cursor_s"] == 300
    ok(c2.post(f"{I}/reset-to-seed"))
    assert ok(c2.get(I))["replay_cursor_s"] is None


def test_unreachable_database_answers_503_not_a_crash(tmp_path: Path) -> None:
    # Nothing listens on port 1: connection refused, immediately.
    settings = Settings(
        db_url="postgresql+psycopg://halt:halt@127.0.0.1:1/halt", signing_key_path=str(tmp_path / "k.pem")
    )
    with TestClient(create_app(settings)) as c:
        health = ok(c.get(f"{B}/health"))
        assert (
            health["status"] == "degraded"
            and health["db"] == "unavailable"
            and health["service"] == "unavailable"
        )
        ready = c.get(f"{B}/ready")
        assert ready.status_code == 503 and ready.json()["reason"] == "database unavailable"
        body = ok(c.get(I), 503)
        assert body["code"] == "dependency_unavailable" and "Nothing was changed" in body["message"]
        assert set(body) >= {"code", "message", "request_id"}
        with pytest.raises(Exception), c.websocket_connect("/ws/incidents/INC-2417") as ws:  # noqa: B017
            ws.receive_json()


def test_database_failure_mid_call_is_rebuilt_from_the_journal(
    boot: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from sqlalchemy.exc import OperationalError

    c = boot()
    ok(c.post(f"{I}/correlate", json={}))
    service = c.app.state.service  # type: ignore[attr-defined]
    real = service.repo.save_artefact

    def broken(*args: Any, **kwargs: Any) -> None:
        raise OperationalError("INSERT", {}, Exception("server closed the connection unexpectedly"))

    monkeypatch.setattr(service.repo, "save_artefact", broken)
    failed = ok(c.post(f"{I}/plans", json={}), 503)
    assert failed["code"] == "dependency_unavailable"
    assert service.status["INC-2417"] == "dropped"

    monkeypatch.setattr(service.repo, "save_artefact", real)
    # The next call rebuilds from the journal: the half-made plan is gone, the correlation is not.
    incident = ok(c.get(I))
    assert incident["state"] == "forecast_ready" and incident["latest"]["plan_id"] is None
    plan = ok(c.post(f"{I}/plans", json={}))
    assert plan["status"] == "optimal"
    assert ok(c.get(f"{I}/audit/verify"))["valid"] is True


def test_api_recovers_on_its_own_when_the_database_comes_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from halt.api import state

    monkeypatch.setattr(state, "RETRY_S", 0.0)
    missing = tmp_path / "not-yet"  # SQLite cannot open a file in a directory that does not exist
    settings = Settings(
        db_url=f"sqlite+pysqlite:///{(missing / 'halt.db').as_posix()}",
        signing_key_path=str(tmp_path / "k.pem"),
    )
    with TestClient(create_app(settings)) as c:
        assert ok(c.get(I), 503)["code"] == "dependency_unavailable"
        assert c.get(f"{B}/ready").status_code == 503
        missing.mkdir()  # the database is back
        assert ok(c.get(I))["state"] == "new"
        assert ok(c.get(f"{B}/ready"))["incidents"] == [
            {"id": "INC-2417", "status": "seeded", "detail": None}
        ]
        assert ok(c.get(f"{B}/health"))["status"] == "ok"
