"""Benchmark and proof receipts, sealed with SHA-256 over canonical JSON. A cryptographic seal shows the
receipt has
not changed since sealing. It is not a legal digital signature and does not identify a signer."""

from __future__ import annotations

import ctypes
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any

from halt.firex import ENGINE_VERSION, PARSER_VERSION, SCHEMA_VERSION
from halt.firex.contracts import BenchmarkReceipt, HostInfo, ProofReceipt, SealVerification
from halt.firex.util import atomic_write_json, read_json, seal_of, sha256_file, stable_hash

if TYPE_CHECKING:
    from halt.firex.pipeline import Runner

REPO_ROOT = Path(__file__).resolve().parents[4]
PEAK_SCOPE = "upper bound: highest worker peak × workers + driver peak"


def git_commit() -> str | None:
    git = shutil.which("git")
    if not git:
        return None
    try:
        done = subprocess.run(
            [git, "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=10, check=True
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return done.stdout.strip() or None


def _ram_gb() -> float | None:
    if sys.platform == "win32":

        class Status(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = Status()
        status.dwLength = ctypes.sizeof(Status)
        kernel = ctypes.WinDLL("kernel32")  # type: ignore[attr-defined,unused-ignore]
        if kernel.GlobalMemoryStatusEx(ctypes.byref(status)):
            return float(round(status.ullTotalPhys / 1024**3, 1))
        return None
    try:
        return float(round(float(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")) / 1024**3, 1))
    except (ValueError, OSError, AttributeError):
        return None


def _node_version() -> str | None:
    node = shutil.which("node")
    if not node:
        return None
    try:
        return subprocess.run(
            [node, "--version"], capture_output=True, text=True, timeout=10, check=True
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def host_info() -> HostInfo:
    return HostInfo(
        os=platform.platform(),
        cpu=platform.processor() or platform.machine(),
        cores=os.cpu_count() or 1,
        ram_gb=_ram_gb(),
        python=platform.python_version(),
        node=_node_version(),
    )


def sealed(doc: dict[str, Any]) -> dict[str, Any]:
    body = {**doc, "seal": ""}
    body["seal"] = seal_of(body)
    return body


def verify_seal(doc: dict[str, Any]) -> SealVerification:
    expected = seal_of(doc)
    recorded = str(doc.get("seal", ""))
    return SealVerification(valid=expected == recorded, expected=expected, recorded=recorded)


def replay_id(plan: dict[str, Any], config_hash: str) -> str:
    return "replay-" + stable_hash(
        {
            "source": plan["source_sha256"],
            "range": [plan["start"], plan["end"]],
            "config": config_hash,
            "engine": ENGINE_VERSION,
            "parser": PARSER_VERSION,
            "schema": SCHEMA_VERSION,
        },
        24,
    )


def make_proof(
    *,
    incident_id: str,
    run_id: str,
    dataset_id: str,
    plan: dict[str, Any],
    config_hash: str,
    commit: str | None,
    graph_hash: str,
    selected_path_id: str,
    evidence_coverage: float,
    unsupported_claims: int,
    uncertainty_margin: float,
    cited: list[str],
) -> dict[str, Any]:
    receipt = ProofReceipt(
        receipt_id="fprf-" + stable_hash([incident_id, graph_hash]),
        incident_id=incident_id,
        run_id=run_id,
        dataset_id=dataset_id,
        source_sha256=plan["source_sha256"],
        processed_byte_range=(plan["start"], plan["end"]),
        parser_version=PARSER_VERSION,
        engine_version=ENGINE_VERSION,
        detection_config_hash=config_hash,
        git_commit=commit,
        graph_hash=graph_hash,
        selected_path_id=selected_path_id,
        evidence_coverage=evidence_coverage,
        unsupported_claims=unsupported_claims,
        uncertainty_margin=uncertainty_margin,
        cited_evidence=sorted(cited),
        deterministic_replay_id=replay_id(plan, config_hash),
    )
    return sealed(receipt.model_dump(mode="json"))


def measure_open_latency(run_dir: Path) -> float | None:
    """Slowest full incident open on this run's stored files, in milliseconds. None when there is no
    incident."""
    root = run_dir / "incidents"
    worst: float | None = None
    for folder in sorted(p for p in root.iterdir() if p.is_dir()) if root.is_dir() else []:
        started = time.perf_counter()
        for name in ("detail", "graph", "story", "hypotheses", "reachability", "proof"):
            read_json(folder / f"{name}.json")
        elapsed = (time.perf_counter() - started) * 1000
        worst = elapsed if worst is None or elapsed > worst else worst
    return round(worst, 2) if worst is not None else None


def write_benchmark(
    runner: Runner,
    plan: dict[str, Any],
    quality: dict[str, Any],
    outcome: dict[str, Any],
    elapsed: float,
    peak: float | None,
    parts_bytes: int,
) -> dict[str, Any]:
    run_dir = runner.dir
    state = runner.state()
    artifacts = {
        name: sha256_file(run_dir / name)
        for name in (
            "plan.json",
            "quality.json",
            "quarantine.json",
            "detections.json",
            "bursts.json",
            "incidents/index.json",
        )
        if (run_dir / name).is_file()
    }
    records = quality["records_valid"] + quality["records_rejected"]
    processed = plan["end"] - plan["start"]
    receipt = BenchmarkReceipt(
        receipt_id="fbmk-" + stable_hash([runner.run_id, state.get("completed_at")]),
        run_id=runner.run_id,
        dataset_id=runner.dataset.dataset_id,
        source_filename=plan["filename"],
        source_sha256=plan["source_sha256"],
        source_sha256_verified=plan["source_sha256_verified"],
        range_sha256=plan["range_sha256"],
        source_size_bytes=plan["source_size"],
        processed_byte_range=(plan["start"], plan["end"]),
        parser_version=PARSER_VERSION,
        schema_version_canonical=SCHEMA_VERSION,
        engine_version=ENGINE_VERSION,
        detection_config_hash=runner.config_hash,
        git_commit=git_commit(),
        started_at=state.get("started_at", state["created_at"]),
        completed_at=state.get("completed_at", state["updated_at"]),
        host=host_info(),
        bytes_processed=processed,
        records_valid=quality["records_valid"],
        records_rejected=quality["records_rejected"],
        quarantine_segments=quality["quarantine_segments"],
        quarantine_bytes=quality["bytes_quarantined"],
        exact_duplicates=quality["exact_duplicates"],
        behavioural_bursts=outcome["bursts"],
        detections=outcome["detections"],
        incidents=outcome["incidents"],
        duration_s=round(elapsed, 2),
        stage_durations_s=runner.stage_times,
        records_per_second=round(records / max(elapsed, 0.001), 1),
        mb_per_second=round(processed / 1e6 / max(elapsed, 0.001), 2),
        peak_memory_mb=peak,
        peak_memory_scope=PEAK_SCOPE,
        output_bytes=parts_bytes,
        incident_open_latency_ms=measure_open_latency(run_dir),
        status="completed",
        error_summary=None,
        artifact_hashes=artifacts,
    )
    doc = sealed(receipt.model_dump(mode="json"))
    atomic_write_json(run_dir / "benchmark_receipt.json", doc)
    return doc
