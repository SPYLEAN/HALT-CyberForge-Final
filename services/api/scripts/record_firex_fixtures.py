"""Record real FireX API responses for the web unit tests, from a small synthetic log.

Writes apps/web/tests/fixtures/api/firex.json. The web tests replay these through a fetch stub, so every
value they
render came from the real backend. Wall-clock values and durations are normalised, and listed in the file.

Usage: python scripts/record_firex_fixtures.py [--check]
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from halt.config import Settings
from halt.firex.pipeline import Runner
from halt.main import create_app
from tests.firex_support import DAY, admin, background, ips, traffic, virus, write_dataset

OUT = Path(__file__).resolve().parents[3] / "apps" / "web" / "tests" / "fixtures" / "api" / "firex.json"
B = "/api/v1/ps2"
VOLATILE = {
    "created_at",
    "updated_at",
    "started_at",
    "completed_at",
    "generated_at",
    "git_commit",
    "duration_s",
    "stage_durations_s",
    "records_per_second",
    "mb_per_second",
    "peak_memory_mb",
    "incident_open_latency_ms",
    "host",
    "seal",
    "expected",
    "recorded",
    "incoming_path",
    "modified_utc",
    "receipt_id",
    "request_id",
    "benchmark_receipt_id",
    "benchmark_seal",
    "output_bytes",
    "compression_ratio",
    "artifact_hashes",
    "pid",
}


def normalise(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: ("fixture" if k in VOLATILE and v is not None else normalise(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [normalise(v) for v in value]
    return value


def fixture_log() -> list[str | bytes]:
    src = "203.0.113.9"
    host = "10.1.0.44"
    names = ("HTTP.URI.SQL.Injection", "HTTP.Path.Traversal", "HTTP.URI.XSS.Attack")
    return [
        *background(DAY - 500, 60),
        admin(
            DAY, "ops.user", src, action="Add", status=None, msg="Add system.admin temp1", logid="0100044547"
        ),
        admin(DAY + 300, "temp1", src),
        admin(
            DAY + 600,
            "ops.user",
            src,
            action="Delete",
            status=None,
            msg="Delete system.admin temp1",
            logid="0100044547",
        ),
        *[
            traffic(
                DAY + i,
                host,
                f"10.20.0.{i + 1}",
                srcrole="lan",
                dstrole="dmz",
                port=445,
                service="SMB",
                sid=500 + i,
            )
            for i in range(15)
        ],
        *[virus(DAY + 100 + i * 60, host, "198.51.100.34", f"W{i}/x!tr", sid=900 + i) for i in range(4)],
        traffic(
            DAY + 50, host, "10.30.0.9", srcrole="lan", dstrole="lan", port=8080, service="HTTP", sid=950
        ),
        *[
            ips(
                DAY + 1000 + i,
                f"203.0.113.{i % 3 + 20}",
                "10.20.0.200",
                names[i % 3],
                15000 + i,
                sid=2000 + i,
            )
            for i in range(60)
        ],
        b"\x90\xff binary junk line\n",
    ]


def record() -> dict[str, Any]:
    responses: dict[str, Any] = {}
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        os.environ["HALT_FIREX_DATA_ROOT"] = str(root)
        write_dataset(root, fixture_log())
        runner = Runner("fixture", workers=1, root=root)
        state = runner.execute()
        if state["status"] != "completed":
            raise SystemExit(f"fixture run failed: {state.get('error')}")
        settings = Settings(db_url="sqlite+pysqlite:///:memory:", signing_key_path=str(root / "key.pem"))
        with TestClient(create_app(settings)) as client:

            def get(path: str) -> Any:
                r = client.get(path)
                responses[f"GET {path}"] = {"status": r.status_code, "body": normalise(r.json())}
                return r.json()

            def post(path: str, payload: dict[str, Any]) -> Any:
                r = client.post(path, json=payload)
                responses[f"POST {path}"] = {"status": r.status_code, "body": normalise(r.json())}
                return r.json()

            get(f"{B}/datasets")
            get(f"{B}/runs")
            run_id = runner.run_id
            for part in ("", "/progress", "/quarantine", "/benchmark", "/health", "/trust", "/quality-case"):
                get(f"{B}/runs/{run_id}{part}")
            get(f"{B}/runs/{run_id}/case-candidates")
            get(f"{B}/facts")
            get(f"{B}/live/files")
            get(f"{B}/runs/{run_id}/provenance-summary")
            get(f"{B}/runs/{run_id}/search?q=temp1")
            get(f"{B}/runs/{run_id}/search?q=no-such-value")
            get(f"{B}/runs/{run_id}/search/suggestions?q=temp1")
            items = get(f"{B}/runs/{run_id}/incidents")["items"]
            for item in items:
                iid = item["incident_id"]
                suffix = f"?run_id={run_id}"
                get(f"{B}/incidents/{iid}{suffix}")
                for part in ("graph", "story", "hypotheses", "reachability", "proof", "guide"):
                    get(f"{B}/incidents/{iid}/{part}{suffix}")
                get(f"{B}/runs/{run_id}/provenance?incident_id={iid}")
                post(f"{B}/incidents/{iid}/narrative{suffix}", {"audience": "analyst", "question": None})
            made = post(
                f"{B}/cases",
                {"run_id": run_id, "subject": "incident", "incident_id": items[0]["incident_id"]},
            )
            get(f"{B}/cases/{made['case_id']}")
        os.environ.pop("HALT_FIREX_DATA_ROOT", None)
    return {
        "_note": "Recorded from the real backend by scripts/record_firex_fixtures.py; do not edit.",
        "normalised": sorted(VOLATILE),
        "run_id": run_id,
        "incidents": [i["incident_id"] for i in items],
        "responses": responses,
    }


def main() -> int:
    text = json.dumps(record(), indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    # A case id hashes the run's benchmark seal, which holds machine timings, so its value is not stable. Nor
    # are measurements written into display text.
    text = re.sub(r"fcase-[0-9a-f]{16}", "fcase-0000000000000000", text)
    text = re.sub(r"\b\d+(?:[.,]\d+)* (ms|s|MB|GB)\b", r"0 \1", text)
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT} is stale: run python scripts/record_firex_fixtures.py")
            return 1
        print("FireX web fixtures are up to date")
        return 0
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT} ({len(text) // 1024} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
