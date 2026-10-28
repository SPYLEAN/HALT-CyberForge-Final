"""Record real API responses at each stage of the demo for the web unit tests.

Writes apps/web/tests/fixtures/api/stages.json: {stage: {"METHOD /path?query": body}}. The web tests replay
these through a fetch stub, so every number they assert came from the real backend.

Usage: python scripts/record_fixtures.py [--check]
"""

from __future__ import annotations

import hashlib
import json
import sys
import tempfile
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from halt.config import Settings
from halt.main import create_app

OUT = Path(__file__).resolve().parents[3] / "apps" / "web" / "tests" / "fixtures" / "api" / "stages.json"
I = "/api/v1/incidents/INC-2417"  # noqa: E741


def fixture_key(path: Path) -> str:
    """A fixed Ed25519 key, so recorded signatures do not change between runs (test data only)."""
    key = Ed25519PrivateKey.from_private_bytes(hashlib.sha256(b"halt-web-fixtures").digest())
    path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        )
    )
    return str(path)


def normalise(value: Any) -> Any:
    """Solver wall time is the one non-deterministic field in a response; record it as 0."""
    if isinstance(value, dict):
        return {k: 0 if k == "wall_ms" else normalise(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normalise(v) for v in value]
    return value


def snapshot(client: TestClient, extra: list[str]) -> dict[str, Any]:
    """GET everything the Command Center loads, plus the stage's artefacts."""
    paths = [I, f"{I}/policies", f"{I}/actions", f"{I}/audit", f"{I}/findings", *extra]
    out: dict[str, Any] = {}
    for p in paths:
        r = client.get(p)
        out[f"GET {p}"] = {"status": r.status_code, "body": r.json()}
    paths_r = client.get(f"{I}/paths")
    out[f"GET {I}/paths"] = {"status": paths_r.status_code, "body": paths_r.json()}
    return out


def record() -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        key = fixture_key(Path(tmp) / "k.pem")
        app = create_app(Settings(db_url="sqlite+pysqlite:///:memory:", signing_key_path=key))
        c = TestClient(app, headers={"x-request-id": "fixture"})
        stages: dict[str, Any] = {}
        graph = c.get(f"{I}/graph").json()
        stages["new"] = snapshot(c, [])
        c.post(f"{I}/correlate", json={})
        stages["forecast"] = snapshot(c, [])
        plan = c.post(f"{I}/plans", json={}).json()
        sim = c.post(
            f"{I}/simulations",
            json={
                "plans": [
                    {"label": "A", "source": "preset_aggressive"},
                    {"label": "B", "source": "preset_passive"},
                    {"label": "C", "source": "plan", "plan_id": plan["id"]},
                ]
            },
        ).json()
        proof = c.post(f"/api/v1/plans/{plan['id']}/proof").json()
        artefacts = [
            f"/api/v1/plans/{plan['id']}",
            f"/api/v1/simulations/{sim['id']}",
            f"/api/v1/proofs/{proof['id']}",
            f"/api/v1/plans/{plan['id']}/approvals",
        ]
        stages["sealed"] = snapshot(c, artefacts)
        for policy, approver in (("IR-OAUTH-02", "a_rahman"), ("IR-CA-05", "s_iyer")):
            c.post(
                f"/api/v1/plans/{plan['id']}/approvals",
                json={"policy_id": policy, "approver_id": approver},
                headers={"X-Halt-Actor": approver},
            )
        execution = c.post(
            f"/api/v1/plans/{plan['id']}/execute",
            json={"proof_id": proof["id"]},
            headers={"X-Halt-Actor": "a_rahman"},
        ).json()["execution"]
        stages["contained"] = snapshot(c, [*artefacts, f"/api/v1/executions/{execution['id']}"])

        c.post(f"{I}/replay/reset", json={"variant": "approver_unavailable"})
        c.post(f"{I}/correlate", json={})
        blocked = c.post(f"{I}/plans", json={}).json()
        stages["blocked"] = snapshot(
            c, [f"/api/v1/plans/{blocked['id']}", f"/api/v1/plans/{blocked['id']}/approvals"]
        )
        return normalise({"graph": graph, "stages": stages})  # type: ignore[no-any-return]


def main() -> int:
    text = json.dumps(record(), indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT} is out of date; run: python scripts/record_fixtures.py", file=sys.stderr)
            return 1
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT} ({len(text) // 1024} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
