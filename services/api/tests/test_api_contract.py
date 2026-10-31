"""AT-6.1, AT-6.4: every documented endpoint exists, behaves as documented, and carries simulated Meta."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from halt.config import Settings
from halt.main import create_app

B = "/api/v1"
I = f"{B}/incidents/INC-2417"  # noqa: E741

# docs/DATA_CONTRACTS.md §10
DOCUMENTED = {
    ("get", "/health"),
    ("get", "/incidents"),
    ("get", "/incidents/{incident_id}"),
    ("get", "/incidents/{incident_id}/events"),
    ("post", "/incidents/{incident_id}/correlate"),
    ("get", "/incidents/{incident_id}/findings"),
    ("get", "/incidents/{incident_id}/graph"),
    ("get", "/incidents/{incident_id}/paths"),
    ("get", "/incidents/{incident_id}/actions"),
    ("get", "/incidents/{incident_id}/policies"),
    ("post", "/incidents/{incident_id}/simulations"),
    ("get", "/simulations/{sim_id}"),
    ("post", "/incidents/{incident_id}/plans"),
    ("get", "/plans/{plan_id}"),
    ("post", "/plans/{plan_id}/proof"),
    ("get", "/proofs/{proof_id}"),
    ("post", "/proofs/{proof_id}/verify"),
    ("post", "/plans/{plan_id}/approvals"),
    ("get", "/plans/{plan_id}/approvals"),
    ("post", "/plans/{plan_id}/execute"),
    ("get", "/executions/{execution_id}"),
    ("post", "/executions/{execution_id}/rollback"),
    ("get", "/incidents/{incident_id}/audit"),
    ("get", "/incidents/{incident_id}/audit/verify"),
    ("post", "/incidents/{incident_id}/replay/reset"),
    ("get", "/incidents/{incident_id}/variants"),
    ("get", "/incidents/{incident_id}/policy-comparison"),
    ("post", "/incidents/{incident_id}/reset-to-seed"),
    ("get", "/ready"),
    ("post", "/incidents/{incident_id}/explain"),
    # PS2 reconstruction engine (docs/PS2_RECONSTRUCTION_ENGINE.md)
    ("get", "/ps2/datasets"),
    ("get", "/ps2/intake"),
    ("post", "/ps2/ingestions"),
    ("get", "/ps2/ingestions/{batch_id}"),
    ("get", "/ps2/ingestions/{batch_id}/events"),
    ("post", "/ps2/reconstructions"),
    ("get", "/ps2/reconstructions/{run_id}"),
    ("get", "/ps2/reconstructions/{run_id}/graph"),
    ("get", "/ps2/reconstructions/{run_id}/story"),
    ("get", "/ps2/reconstructions/{run_id}/hypotheses"),
    ("get", "/ps2/reconstructions/{run_id}/entities"),
    ("get", "/ps2/reconstructions/{run_id}/stages"),
    ("get", "/ps2/reconstructions/{run_id}/receipt"),
    ("get", "/ps2/reconstructions/{run_id}/attack-flow"),
    ("get", "/ps2/reconstructions/{run_id}/evaluation"),
    ("get", "/ps2/runs"),
    ("post", "/ps2/runs"),
    ("get", "/ps2/runs/{run_id}"),
    ("get", "/ps2/runs/{run_id}/progress"),
    ("post", "/ps2/runs/{run_id}/cancel"),
    ("post", "/ps2/runs/{run_id}/resume"),
    ("get", "/ps2/runs/{run_id}/incidents"),
    ("get", "/ps2/runs/{run_id}/quarantine"),
    ("get", "/ps2/runs/{run_id}/benchmark"),
    ("get", "/ps2/incidents/{incident_id}"),
    ("get", "/ps2/incidents/{incident_id}/graph"),
    ("get", "/ps2/incidents/{incident_id}/story"),
    ("get", "/ps2/incidents/{incident_id}/hypotheses"),
    ("get", "/ps2/incidents/{incident_id}/reachability"),
    ("get", "/ps2/incidents/{incident_id}/proof"),
    ("post", "/ps2/incidents/{incident_id}/narrative"),
    ("post", "/ps2/demo/reset"),
}


def actor(name: str) -> dict[str, str]:
    return {"X-Halt-Actor": name}


class Recorder:
    """Wraps a TestClient and keeps every successful JSON response for the Meta check."""

    def __init__(self, client: TestClient) -> None:
        self.client, self.ok = client, []

    def call(self, method: str, url: str, status: int = 200, **kw: Any) -> Any:
        r: Response = getattr(self.client, method)(url, **kw)
        assert r.status_code == status, f"{method.upper()} {url}: {r.status_code} {r.text[:300]}"
        body = r.json()
        if status < 400:
            if not url.endswith("/health"):
                self.ok.append((url, body))
        else:
            assert set(body) >= {"code", "message", "request_id"}
        return body


def run_demo(client: TestClient) -> tuple[Recorder, dict[str, Any]]:
    rec = Recorder(client)
    rec.call("get", f"{B}/health")
    rec.call("get", f"{B}/incidents")
    rec.call("get", I)
    rec.call("get", f"{I}/events", params={"until": 200})
    rec.call("get", f"{I}/paths", status=409)
    findings = rec.call("post", f"{I}/correlate", json={})
    rec.call("get", f"{I}/graph", params={"at": 300})
    paths = rec.call("get", f"{I}/paths")
    rec.call("get", f"{I}/actions")
    rec.call("get", f"{I}/policies")
    plan = rec.call("post", f"{I}/plans", json={})
    rec.call("get", f"{B}/plans/{plan['id']}")
    sim = rec.call(
        "post",
        f"{I}/simulations",
        json={
            "plans": [
                {"label": "A", "source": "preset_aggressive"},
                {"label": "B", "source": "preset_passive"},
                {"label": "C", "source": "plan", "plan_id": plan["id"]},
            ]
        },
    )
    rec.call("get", f"{B}/simulations/{sim['id']}")
    rec.call(
        "post",
        f"{B}/plans/{plan['id']}/execute",
        status=409,
        json={"proof_id": "PS-2417-x"},
        headers=actor("a_rahman"),
    )
    proof = rec.call("post", f"{B}/plans/{plan['id']}/proof")
    rec.call("get", f"{B}/proofs/{proof['id']}")
    verify = rec.call("post", f"{B}/proofs/{proof['id']}/verify")
    rec.call(
        "post",
        f"{B}/plans/{plan['id']}/execute",
        status=409,
        json={"proof_id": proof["id"]},
        headers=actor("a_rahman"),
    )
    rec.call(
        "post",
        f"{B}/plans/{plan['id']}/approvals",
        status=403,
        json={"policy_id": "IR-OAUTH-02", "approver_id": "k_mensah"},
        headers=actor("k_mensah"),
    )
    rec.call(
        "post",
        f"{B}/plans/{plan['id']}/approvals",
        status=403,
        json={"policy_id": "IR-CA-05", "approver_id": "s_iyer"},
        headers=actor("a_rahman"),
    )
    rec.call(
        "post",
        f"{B}/plans/{plan['id']}/approvals",
        json={"policy_id": "IR-OAUTH-02", "approver_id": "a_rahman"},
        headers=actor("a_rahman"),
    )
    last = rec.call(
        "post",
        f"{B}/plans/{plan['id']}/approvals",
        json={"policy_id": "IR-CA-05", "approver_id": "s_iyer"},
        headers=actor("s_iyer"),
    )
    execution = rec.call(
        "post", f"{B}/plans/{plan['id']}/execute", json={"proof_id": proof["id"]}, headers=actor("a_rahman")
    )["execution"]
    rec.call("get", f"{B}/executions/{execution['id']}")
    rec.call("get", f"{I}/graph", params={"plan_id": plan["id"]})
    contained = rec.call("get", I)
    rolled = rec.call("post", f"{B}/executions/{execution['id']}/rollback", headers=actor("a_rahman"))
    rec.call("post", f"{B}/executions/{execution['id']}/rollback", status=409, headers=actor("a_rahman"))
    audit = rec.call("get", f"{I}/audit")
    audit_ok = rec.call("get", f"{I}/audit/verify")
    explained = rec.call("post", f"{I}/explain", json={"subject_id": "P1"})
    return rec, {
        "findings": findings,
        "paths": paths,
        "plan": plan,
        "sim": sim,
        "proof": proof,
        "verify": verify,
        "outstanding": last["outstanding_roles"],
        "execution": execution,
        "contained": contained,
        "rolled": rolled,
        "audit": audit,
        "audit_ok": audit_ok,
        "explained": explained,
    }


@pytest.fixture(scope="module")
def demo(tmp_path_factory: pytest.TempPathFactory) -> tuple[Recorder, dict[str, Any], TestClient]:
    key = tmp_path_factory.mktemp("k") / "key.pem"
    client = TestClient(create_app(Settings(db_url="sqlite+pysqlite:///:memory:", signing_key_path=str(key))))
    rec, out = run_demo(client)
    return rec, out, client


def test_AT_6_1_documented_routes_exist(client: TestClient) -> None:
    spec = client.get(f"{B}/openapi.json").json()["paths"]
    published = {(m, p.removeprefix(B)) for p, ops in spec.items() for m in ops}
    assert published == DOCUMENTED


def test_AT_6_1_full_flow(demo: tuple[Recorder, dict[str, Any], TestClient]) -> None:
    _, out, _ = demo
    assert len(out["findings"]["items"]) == 4
    assert [p["id"] for p in out["paths"]["items"]] == ["P1", "P2", "P3", "P4", "P5", "P6", "U1"]
    assert out["plan"]["status"] == "optimal"
    # Counted over all 7 enumerated paths to the ledger: the plan leaves U1 open, and says so.
    blocked = [
        (f["paths_blocked"]["numerator"], f["paths_blocked"]["denominator"]) for f in out["sim"]["futures"]
    ]
    assert blocked == [(7, 7), (0, 7), (6, 7)]
    assert "U1" not in out["sim"]["futures"][2]["paths_blocked"]["source_ids"]
    assert "open: U1" in out["sim"]["futures"][2]["paths_blocked"]["method"]
    assert all(c["status"] == "verified" for c in out["proof"]["claims"])
    assert out["verify"]["certificate_match"] and out["verify"]["signature_valid"]
    assert out["outstanding"] == []
    assert out["execution"]["state"] == "applied" and out["contained"]["state"] == "contained"
    assert out["rolled"]["execution"]["state"] == "rolled"
    assert out["audit_ok"]["valid"] and out["audit_ok"]["enforcement"] == "app"
    assert out["explained"]["engine"] == "template" and "P1" in out["explained"]["cited_ids"]
    kinds = [e["kind"] for e in out["audit"]["items"]]
    assert kinds.index("approval_approved") < kinds.index("execution_started") < kinds.index("rolled_back")


def test_AT_6_1_error_codes(client: TestClient) -> None:
    assert client.get(f"{B}/incidents/INC-0000").status_code == 404
    assert client.get(f"{B}/plans/PLAN-nope").status_code == 404
    assert client.post(f"{B}/executions/EX-nope/rollback", headers=actor("a_rahman")).status_code == 404
    assert client.post(f"{I}/replay/reset", json={"variant": "nope"}).status_code == 422
    assert client.post(f"{I}/explain", json={"subject_id": "nothing.here"}).status_code == 404
    # infeasible plan cannot be sealed
    assert client.post(f"{I}/replay/reset", json={"variant": "approver_unavailable"}).status_code == 200
    client.post(f"{I}/correlate", json={})
    plan = client.post(f"{I}/plans", json={}).json()
    assert plan["status"] == "infeasible"
    assert client.get(I).json()["state"] == "blocked_by_policy"
    assert client.post(f"{B}/plans/{plan['id']}/proof").status_code == 409
    # unknown actor on a state-changing call
    r = client.post(
        f"{B}/plans/{plan['id']}/approvals",
        json={"policy_id": "IR-OAUTH-02", "approver_id": "x"},
        headers=actor("x"),
    )
    assert r.status_code == 403


def test_variants_listed_and_active_variant_follows_reset(client: TestClient) -> None:
    import json

    from halt.scenario.loader import DEFAULT_SCENARIO_DIR

    fixture = json.loads((DEFAULT_SCENARIO_DIR / "variants.json").read_text(encoding="utf-8"))
    listed = client.get(f"{I}/variants").json()
    assert [v["key"] for v in listed["items"]] == [v["key"] for v in fixture]
    assert [v["title"] for v in listed["items"]] == [v["title"] for v in fixture]
    assert "ops" not in listed["items"][0]
    assert listed["active"] == "baseline" and client.get(I).json()["variant"] == "baseline"
    assert client.post(f"{I}/replay/reset", json={"variant": "approver_unavailable"}).status_code == 200
    assert client.get(I).json()["variant"] == "approver_unavailable"
    assert client.get(f"{I}/variants").json()["active"] == "approver_unavailable"


def test_AT_6_4_every_response_is_simulated_with_seed(
    demo: tuple[Recorder, dict[str, Any], TestClient],
) -> None:
    rec, _, _ = demo
    assert len(rec.ok) >= 25  # every successful call in the demo flow except /health
    for url, body in rec.ok:
        meta = body["meta"]
        assert meta["simulated"] is True and meta["seed"] == 2417, url
        assert meta["incident_id"] == "INC-2417"


def test_runs_are_reproducible(demo: tuple[Recorder, dict[str, Any], TestClient], tmp_path: Path) -> None:
    _, first, _ = demo
    client = TestClient(
        create_app(
            Settings(db_url="sqlite+pysqlite:///:memory:", signing_key_path=str(tmp_path / "other.pem"))
        )
    )
    _, second = run_demo(client)
    assert second["plan"]["id"] == first["plan"]["id"]
    assert second["sim"]["hash"] == first["sim"]["hash"]
    assert second["proof"]["certificate"] == first["proof"]["certificate"]
    assert [e["hash"] for e in second["audit"]["items"]] == [e["hash"] for e in first["audit"]["items"]]
