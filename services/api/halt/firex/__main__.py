"""Operator CLI (docs/POWERSHELL_OPERATOR_COMMANDS.md). `run` also resumes: finished chunks are never
repeated."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from typing import Any

from halt.firex.pipeline import RunFailed, Runner
from halt.firex.receipts import measure_open_latency, verify_seal
from halt.firex.util import read_json


def _runner(args: argparse.Namespace) -> Runner:
    return Runner(
        args.dataset,
        max_bytes=args.max_bytes,
        workers=getattr(args, "workers", None),
        memory_limit_gb=getattr(args, "memory_limit_gb", None),
    )


def _print(doc: Any) -> None:
    print(json.dumps(doc, indent=1, sort_keys=True))


def cmd_run(args: argparse.Namespace) -> int:
    runner = _runner(args)
    print(f"run {runner.run_id} dataset {runner.dataset.dataset_id} workers {runner.workers}", flush=True)
    state = runner.execute()
    _print({k: state.get(k) for k in ("run_id", "status", "stage", "detail", "error", "metrics")})
    return 0 if state["status"] == "completed" else 1


def cmd_status(args: argparse.Namespace) -> int:
    state = _runner(args).state()
    _print(
        {
            k: state.get(k)
            for k in (
                "run_id",
                "status",
                "stage",
                "detail",
                "chunks_done",
                "chunks_total",
                "metrics",
                "error",
            )
        }
    )
    return 0


def cmd_cancel(args: argparse.Namespace) -> int:
    runner = _runner(args)
    runner.dir.mkdir(parents=True, exist_ok=True)
    (runner.dir / "cancel").write_text("cancel\n", encoding="utf-8")
    print(f"cancel requested for {runner.run_id}")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    runner = _runner(args)
    failures = 0
    results = {}
    paths = [runner.dir / "benchmark_receipt.json", *sorted((runner.dir / "incidents").glob("*/proof.json"))]
    for path in paths:
        if not path.is_file():
            results[path.name] = "missing"
            failures += 1
            continue
        check = verify_seal(read_json(path))
        results[str(path.relative_to(runner.dir))] = "valid" if check.valid else "INVALID"
        failures += 0 if check.valid else 1
    _print({"run_id": runner.run_id, "receipts": results, "failures": failures})
    return 0 if failures == 0 else 1


def cmd_latency(args: argparse.Namespace) -> int:
    runner = _runner(args)
    samples = [measure_open_latency(runner.dir) for _ in range(5)]
    _print(
        {
            "run_id": runner.run_id,
            "slowest_incident_open_ms_each_pass": samples,
            "scope": "reading stored incident files",
        }
    )
    return 0


def cmd_replay(args: argparse.Namespace) -> int:
    """Rebuild detection and incidents from the stored parts into the run folder copy, then compare hashes."""
    from halt.firex.reconstruct import reconstruct_run

    runner = _runner(args)
    plan = read_json(runner.dir / "plan.json")
    quality = read_json(runner.dir / "quality.json")
    before = {
        p.parent.name: read_json(p)["graph_hash"] for p in (runner.dir / "incidents").glob("*/proof.json")
    }
    backup = runner.dir / f"incidents.before-replay-{int(time.time())}"
    shutil.copytree(runner.dir / "incidents", backup)
    reconstruct_run(runner, plan, quality)
    after = {
        p.parent.name: read_json(p)["graph_hash"] for p in (runner.dir / "incidents").glob("*/proof.json")
    }
    identical = before == after
    _print(
        {
            "run_id": runner.run_id,
            "incidents": len(after),
            "identical": identical,
            "previous_copy": backup.name,
        }
    )
    return 0 if identical else 1


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m halt.firex")
    sub = parser.add_subparsers(dest="command", required=True)
    handlers = {
        "run": cmd_run,
        "status": cmd_status,
        "cancel": cmd_cancel,
        "verify": cmd_verify,
        "latency": cmd_latency,
        "replay": cmd_replay,
    }
    for name in handlers:
        p = sub.add_parser(name)
        p.add_argument("--dataset", required=True)
        p.add_argument("--max-bytes", type=int, help="controlled run: read only the first N bytes")
        if name == "run":
            p.add_argument("--workers", type=int)
            p.add_argument("--memory-limit-gb", type=float)
    args = parser.parse_args()
    try:
        return handlers[args.command](args)
    except RunFailed as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
