"""Run driver: plan → parse in parallel → prepare → detect → reconstruct → receipts.

The driver is one process with a worker pool, started by the API or by the operator CLI. All state is on disk
under
the run directory, so an interrupted run resumes from its chunk manifests and repeats nothing it finished.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from concurrent.futures import FIRST_COMPLETED, Future, ProcessPoolExecutor, wait
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from halt.canonical import canonical_json
from halt.firex import ENGINE_VERSION, PARSER_VERSION, SCHEMA_VERSION
from halt.firex.parser import ChunkTask, process_chunk
from halt.firex.registry import RegisteredDataset, datasets, runs_dir, source_path
from halt.firex.util import atomic_write_json, peak_memory_mb, read_json

RULES_PATH = Path(__file__).resolve().parent / "detection_rules.json"
READ_BLOCK = 1 << 24


class RunCancelled(Exception):
    pass


class RunFailed(Exception):
    pass


def load_rules() -> dict[str, Any]:
    rules: dict[str, Any] = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    return rules


def rules_hash(rules: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(rules)).hexdigest()


def now_text() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_id_of(dataset: RegisteredDataset, size: int, max_bytes: int | None, config_hash: str) -> str:
    """Same dataset, range, rules and engine → same run, so a repeated Start finds the existing run."""
    material = {
        "dataset": dataset.dataset_id,
        "sha256": dataset.sha256,
        "size": size,
        "max_bytes": max_bytes,
        "config": config_hash,
        "engine": ENGINE_VERSION,
        "parser": PARSER_VERSION,
    }
    return "frun-" + hashlib.sha256(canonical_json(material)).hexdigest()[:16]


def build_plan(
    path: Path, dataset: RegisteredDataset, max_bytes: int | None, chunk_bytes: int
) -> dict[str, Any]:
    """One sequential read: hash, chunk boundaries on line ends, and the line number at each chunk start."""
    size = path.stat().st_size
    limit = min(size, max_bytes) if max_bytes else size
    digest = hashlib.sha256()
    chunks: list[dict[str, int]] = []
    start = offset = lines = line_base = 0
    with open(path, "rb", buffering=0) as f:
        while offset < limit:
            block = f.read(min(READ_BLOCK, chunk_bytes, limit - offset))
            if not block:
                break
            lines += block.count(b"\n")
            digest.update(block)
            end_of_block = offset + len(block)
            if end_of_block - start >= chunk_bytes:
                cut = block.rfind(b"\n")
                if cut >= 0:
                    # Everything after the last newline belongs to the next chunk and holds no line end.
                    boundary = offset + cut + 1
                    chunks.append(
                        {"chunk_id": len(chunks), "start": start, "end": boundary, "line_base": line_base}
                    )
                    line_base = lines
                    start = boundary
            offset = end_of_block
    end = offset
    if max_bytes and end < size:
        # A controlled range ends on a line end, so no record is cut in half.
        end = _last_line_end(path, start, end)
    if end > start:
        chunks.append({"chunk_id": len(chunks), "start": start, "end": end, "line_base": line_base})
    range_sha = digest.hexdigest()
    return {
        "dataset_id": dataset.dataset_id,
        "filename": dataset.filename,
        "source_size": size,
        "start": 0,
        "end": chunks[-1]["end"] if chunks else 0,
        "source_sha256": dataset.sha256 if (max_bytes and limit < size and dataset.sha256) else range_sha,
        "source_sha256_verified": limit == size,
        "range_sha256": range_sha,
        "range_sha256_bytes": limit,
        "chunks": chunks,
        "parser_version": PARSER_VERSION,
        "schema_version": SCHEMA_VERSION,
        "engine_version": ENGINE_VERSION,
    }


def _last_line_end(path: Path, start: int, end: int) -> int:
    position = end
    with open(path, "rb") as f:
        while position > start:
            step = min(1 << 20, position - start)
            f.seek(position - step)
            block = f.read(step)
            cut = block.rfind(b"\n")
            if cut >= 0:
                return position - step + cut + 1
            position -= step
    return start


class Runner:
    def __init__(
        self,
        dataset_id: str,
        *,
        max_bytes: int | None = None,
        workers: int | None = None,
        root: Path | None = None,
        memory_limit_gb: float | None = None,
    ) -> None:
        self.root = root
        registered = datasets(root)
        if dataset_id not in registered:
            raise RunFailed(f"dataset {dataset_id} is not registered")
        self.dataset = registered[dataset_id]
        self.path = source_path(self.dataset, root)
        if not self.path.is_file():
            raise RunFailed(f"dataset {dataset_id} is not available on this server")
        self.rules = load_rules()
        self.config_hash = rules_hash(self.rules)
        self.max_bytes = max_bytes
        self.size = self.path.stat().st_size
        self.run_id = run_id_of(self.dataset, self.size, max_bytes, self.config_hash)
        self.dir = runs_dir(root) / self.run_id
        self.workers = workers or max(1, min((os.cpu_count() or 2) - 1, 8))
        self.memory_limit_gb = memory_limit_gb or float(self.rules["storage"]["duckdb_memory_limit_gb"])
        self.state_path = self.dir / "run.json"
        self.started = time.monotonic()
        self.stage_times: dict[str, float] = {}
        self.worker_peaks: dict[int, float] = {}

    # ---- run state

    def state(self) -> dict[str, Any]:
        if self.state_path.is_file():
            state: dict[str, Any] = read_json(self.state_path)
            return state
        return {
            "run_id": self.run_id,
            "dataset_id": self.dataset.dataset_id,
            "max_bytes": self.max_bytes,
            "status": "queued",
            "stage": "read",
            "detail": "Waiting to start",
            "byte_range": None,
            "chunks_total": 0,
            "chunks_done": 0,
            "created_at": now_text(),
            "updated_at": now_text(),
            "pid": None,
            "resume_count": 0,
            "recovered": False,
            "error": None,
            "metrics": {},
            "workers": self.workers,
        }

    def update(self, **changes: Any) -> dict[str, Any]:
        state = self.state()
        metrics = changes.pop("metrics", None)
        state.update(changes)
        if metrics:
            state["metrics"] = {**state.get("metrics", {}), **metrics}
        state["updated_at"] = now_text()
        atomic_write_json(self.state_path, state)
        return state

    def cancelled(self) -> bool:
        return (self.dir / "cancel").exists()

    def check_cancel(self) -> None:
        if self.cancelled():
            raise RunCancelled

    # ---- stages

    def plan(self) -> dict[str, Any]:
        path = self.dir / "plan.json"
        if path.is_file():
            plan: dict[str, Any] = read_json(path)
            return plan
        self.update(stage="read", detail="Verifying the source and planning chunks")
        plan = build_plan(self.path, self.dataset, self.max_bytes, int(self.rules["storage"]["chunk_bytes"]))
        if (
            plan["source_sha256_verified"]
            and self.dataset.sha256
            and plan["range_sha256"] != self.dataset.sha256
        ):
            raise RunFailed(f"source hash does not match the registry for {self.dataset.dataset_id}")
        atomic_write_json(path, plan)
        return plan

    def parse(self, plan: dict[str, Any]) -> list[dict[str, Any]]:
        chunks = plan["chunks"]
        done: dict[int, dict[str, Any]] = {}
        for spec in chunks:
            manifest_path = self.dir / "chunks" / f"chunk-{spec['chunk_id']:06d}.json"
            part = self.dir / "parts" / f"part-{spec['chunk_id']:06d}.parquet"
            if manifest_path.is_file() and part.is_file():
                done[spec["chunk_id"]] = read_json(manifest_path)
        self._progress(plan, done)
        pending = [s for s in chunks if s["chunk_id"] not in done]
        if pending:
            self.check_cancel()
            with ProcessPoolExecutor(max_workers=self.workers) as pool:
                queue = iter(pending)
                running: set[Future[dict[str, Any]]] = set()
                try:
                    while True:
                        while len(running) < self.workers * 2 and not self.cancelled():
                            spec = next(queue, None)
                            if spec is None:
                                break
                            running.add(
                                pool.submit(
                                    process_chunk,
                                    ChunkTask(
                                        spec["chunk_id"],
                                        str(self.path),
                                        spec["start"],
                                        spec["end"],
                                        plan["source_sha256"],
                                        str(self.dir),
                                    ),
                                )
                            )
                        if not running:
                            break
                        finished, running = wait(running, return_when=FIRST_COMPLETED)
                        for future in finished:
                            manifest = future.result()
                            done[manifest["chunk_id"]] = manifest
                        self._progress(plan, done)
                finally:
                    pool.shutdown(wait=True, cancel_futures=True)
            self.check_cancel()
        return [done[s["chunk_id"]] for s in chunks]

    def _progress(self, plan: dict[str, Any], done: dict[int, dict[str, Any]]) -> None:
        elapsed = max(time.monotonic() - self.started, 0.001)
        valid = sum(m["valid"] for m in done.values())
        rejected = sum(m["rejected"] for m in done.values())
        total_bytes = sum(m["end"] - m["start"] for m in done.values())
        self.update(
            stage="read",
            detail=f"Parsed {len(done)} of {len(plan['chunks'])} chunks",
            byte_range=[plan["start"], plan["end"]],
            chunks_total=len(plan["chunks"]),
            chunks_done=len(done),
            metrics={
                "bytes_processed": total_bytes,
                "bytes_total": plan["end"] - plan["start"],
                "records_processed": valid + rejected,
                "canonical_records": valid,
                "rejected_records": rejected,
                "quarantine_segments": sum(len(m["segments"]) for m in done.values()),
                "duration_s": round(elapsed, 1),
                "records_per_second": round((valid + rejected) / elapsed, 1),
                "mb_per_second": round(total_bytes / 1e6 / elapsed, 2),
            },
        )

    def execute(self) -> dict[str, Any]:
        """Run or resume to completion. Returns the final state."""
        from halt.firex.reconstruct import reconstruct_run
        from halt.firex.store import prepare_run

        self.dir.mkdir(parents=True, exist_ok=True)
        previous = self.state()
        resumed = (self.dir / "chunks").is_dir()
        if previous["status"] == "completed" and (self.dir / "benchmark_receipt.json").is_file():
            return previous
        # Launching clears the flag, so on a queued run a flag is a Stop pressed before this process began.
        if previous["status"] not in ("queued", "cancelling"):
            (self.dir / "cancel").unlink(missing_ok=True)
        self.update(
            status="running",
            pid=os.getpid(),
            error=None,
            resume_count=previous.get("resume_count", 0) + (1 if resumed else 0),
            started_at=previous.get("started_at", now_text()),
            workers=self.workers,
        )
        try:
            self.check_cancel()
            mark = time.monotonic()
            plan = self.plan()
            self.stage_times["plan"] = round(time.monotonic() - mark, 2)
            mark = time.monotonic()
            manifests = self.parse(plan)
            self.stage_times["parse"] = round(time.monotonic() - mark, 2)
            self.worker_peaks = {m["chunk_id"]: m.get("worker_peak_mb") or 0.0 for m in manifests}

            mark = time.monotonic()
            self.update(stage="prepare", detail="Finding duplicates and measuring data quality")
            quality = prepare_run(self, plan, manifests)
            self.stage_times["prepare"] = round(time.monotonic() - mark, 2)
            self.check_cancel()

            mark = time.monotonic()
            self.update(stage="reconstruct", detail="Detecting candidates and reconstructing incidents")
            outcome = reconstruct_run(self, plan, quality)
            self.stage_times["reconstruct"] = round(time.monotonic() - mark, 2)
            self.check_cancel()

            mark = time.monotonic()
            self.update(stage="explain", detail="Writing stories and sealing receipts")
            self.finish(plan, manifests, quality, outcome)
        except RunCancelled:
            return self.update(
                status="cancelled", detail="Cancelled. Finished chunks are kept; resume continues.", pid=None
            )
        except RunFailed as exc:
            return self.update(status="failed", detail="Run failed", error=str(exc), pid=None)
        except Exception as exc:  # the state file must say what happened; the log carries the traceback
            self.update(
                status="failed", detail="Run failed", error=f"{type(exc).__name__}: {exc}"[:500], pid=None
            )
            raise
        return self.state()

    def finish(
        self,
        plan: dict[str, Any],
        manifests: list[dict[str, Any]],
        quality: dict[str, Any],
        outcome: dict[str, Any],
    ) -> None:
        from halt.firex.receipts import write_benchmark

        elapsed = time.monotonic() - self.started
        valid = quality["records_valid"]
        processed = plan["end"] - plan["start"]
        parts = sum(m.get("part_bytes", 0) for m in manifests)
        peak = self.peak_memory()
        # The seal comes first: a run must never read as completed while its receipt is still missing.
        self.update(
            completed_at=now_text(),
            metrics={
                "bytes_processed": processed,
                "bytes_total": processed,
                "records_processed": valid + quality["records_rejected"],
                "canonical_records": valid,
                "rejected_records": quality["records_rejected"],
                "quarantine_segments": quality["quarantine_segments"],
                "exact_duplicates": quality["exact_duplicates"],
                "behavioural_bursts": outcome["bursts"],
                "detections": outcome["detections"],
                "incidents": outcome["incidents"],
                "duration_s": round(elapsed, 1),
                "records_per_second": round((valid + quality["records_rejected"]) / max(elapsed, 0.001), 1),
                "mb_per_second": round(processed / 1e6 / max(elapsed, 0.001), 2),
                "peak_memory_mb": peak,
                "output_bytes": parts,
                "compression_ratio": round(processed / parts, 2) if parts else None,
            },
        )
        write_benchmark(self, plan, quality, outcome, elapsed, peak, parts)
        self.update(status="completed", stage="done", detail="Completed", pid=None)

    def peak_memory(self) -> float | None:
        """Upper bound on total use: the highest worker peak times the workers, plus this process's peak."""
        own = peak_memory_mb()
        if own is None:
            return None
        top = max(self.worker_peaks.values(), default=0.0)
        return round(own + top * self.workers, 1)
