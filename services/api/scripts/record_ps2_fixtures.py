"""Record real PS2 API responses for the web unit tests.

Writes apps/web/tests/fixtures/api/ps2.json: {"responses": {"METHOD /path?query[ body]": {status, body}}}. A
POST key carries its canonical JSON body (sorted keys, compact), so two POSTs to one path stay distinct. The
web tests replay these through a fetch stub, so every value they render came from the real backend.

Normalised (values that would otherwise change on every run): `processing_ms`, error `request_id`s, the
measured `reconstruction_latency_ms` metric value and an upload's `ingested_at`. Each is listed in the file.

Usage: python scripts/record_ps2_fixtures.py [--check]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from halt.config import Settings
from halt.main import create_app
from halt.ps2.datasets import load_dataset

OUT = Path(__file__).resolve().parents[3] / "apps" / "web" / "tests" / "fixtures" / "api" / "ps2.json"
B = "/api/v1/ps2"
FIXED_INGESTED_AT = "2026-10-29T12:00:00Z"
NORMALISED = [
    "processing_ms",
    "request_id",
    "metrics[reconstruction_latency_ms].value",
    "upload records[].ingested_at",
]


def canonical(body: Any) -> str:
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def normalise(value: Any) -> Any:
    if isinstance(value, dict):
        out = {
            k: 0 if k == "processing_ms" else "fixture" if k == "request_id" else normalise(v)
            for k, v in value.items()
        }
        if out.get("name") == "reconstruction_latency_ms" and out.get("value") is not None:
            out["value"] = 0
        return out
    if isinstance(value, list):
        return [normalise(v) for v in value]
    return value


def fixed_clock(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: FIXED_INGESTED_AT if k == "ingested_at" else fixed_clock(v) for k, v in value.items()}
    if isinstance(value, list):
        return [fixed_clock(v) for v in value]
    return value


def upload_files() -> list[dict[str, str]]:
    """A small upload built from scenario A's synthetic API log, plus two records that must be rejected."""
    lines = [ln for ln in load_dataset("scenario-a").files[3].content.splitlines() if ln.strip()][:12]
    lines.insert(5, '{"RecordId": "ua-broken", "CreationTime": ')  # malformed JSON line
    # Fails mapping (no timestamp) and carries a secret in free text; its preview must be redacted.
    lines.append(
        json.dumps({"RecordId": "ua-secret", "UserId": "x@contoso.example", "Note": "password=hunter2"})
    )
    return [
        {
            "filename": "api_activity.jsonl",
            "adapter": "api_activity",
            "content_type": "application/jsonl",  # what the web upload form sends for a .jsonl file
            "content": "\n".join(lines) + "\n",
        }
    ]


def record() -> dict[str, Any]:
    responses: dict[str, Any] = {}
    with TestClient(create_app(Settings(db_url="sqlite+pysqlite:///:memory:"))) as client:

        def get(path: str, clock: bool = False) -> Any:
            r = client.get(path)
            body = normalise(r.json())
            responses[f"GET {path}"] = {"status": r.status_code, "body": fixed_clock(body) if clock else body}
            return body

        def post(path: str, payload: dict[str, Any], clock: bool = False) -> Any:
            r = client.post(path, json=payload)
            body = normalise(r.json())
            responses[f"POST {path} {canonical(payload)}"] = {
                "status": r.status_code,
                "body": fixed_clock(body) if clock else body,
            }
            return body

        def run(payload: dict[str, Any], upload: bool) -> str:
            ing = post(f"{B}/ingestions", payload, clock=upload)
            batch = ing["batch_id"]
            get(f"{B}/ingestions/{batch}", clock=upload)
            get(f"{B}/ingestions/{batch}/events?offset=0&limit=500")
            run_id = str(post(f"{B}/reconstructions", {"batch_id": batch})["run_id"])
            for part in (
                "",
                "/graph",
                "/story",
                "/hypotheses",
                "/entities",
                "/stages",
                "/receipt",
                "/evaluation",
            ):
                get(f"{B}/reconstructions/{run_id}{part}")
            return run_id

        get(f"{B}/datasets")
        get(f"{B}/intake")
        runs = {d: run({"dataset_id": d}, upload=False) for d in ("scenario-a", "scenario-b")}
        files = upload_files()
        runs["upload"] = run({"files": files, "context": {"organisation": "Contoso Finance"}}, upload=True)
        get(f"{B}/reconstructions/run-0000000000000000")  # an expired or unknown run: 404
    return {
        "_note": "Recorded from the real backend by scripts/record_ps2_fixtures.py; do not edit.",
        "normalised": NORMALISED,
        "runs": runs,
        "uploads": {"partial": files},
        "responses": responses,
    }


def main() -> int:
    text = json.dumps(record(), indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT} is stale: run python scripts/record_ps2_fixtures.py")
            return 1
        print("PS2 web fixtures are up to date")
        return 0
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT} ({len(text) // 1024} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
