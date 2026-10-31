"""Persistent run control. A run's state lives in its `run.json`, so it survives an API restart. The run
itself is a
separate process: the API starts it, watches its files and can request a stop, and never holds any of its
data."""

from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from halt.firex.contracts import DatasetDescriptor, DatasetRun, RunMetrics
from halt.firex.pipeline import Runner, load_rules, now_text, rules_hash, run_id_of
from halt.firex.registry import datasets, runs_dir, source_path
from halt.firex.util import atomic_write_json, read_json

ACTIVE = {"queued", "running", "cancelling"}
LOCK_STALE_SECONDS = 30.0
SPAWN_WAIT_SECONDS = 15.0


class RunError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code = status, code


def _process_alive(pid: int | None) -> bool:
    if not pid:
        return False
    if sys.platform == "win32":
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)  # type: ignore[attr-defined,unused-ignore]
        kernel.OpenProcess.restype = ctypes.c_void_p
        handle = kernel.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return False
        code = ctypes.c_ulong()
        kernel.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        alive = (
            bool(kernel.GetExitCodeProcess(handle, ctypes.byref(code))) and code.value == 259
        )  # STILL_ACTIVE
        kernel.CloseHandle(handle)
        return alive
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def run_dir(run_id: str, root: Path | None = None) -> Path:
    if not run_id.startswith("frun-") or not run_id[5:].isalnum():
        raise RunError(404, "not_found", f"run {run_id} not found")
    return runs_dir(root) / run_id


def read_state(run_id: str, root: Path | None = None) -> dict[str, Any]:
    """The run's state. A run marked active whose process has gone is reported, and stored, as interrupted."""
    path = run_dir(run_id, root) / "run.json"
    if not path.is_file():
        raise RunError(404, "not_found", f"run {run_id} not found")
    state: dict[str, Any] = read_json(path)
    if state["status"] in ACTIVE and state.get("pid") and not _process_alive(state["pid"]):
        state.update(
            status="interrupted",
            detail="The run process stopped. Finished chunks are kept; resume continues from them.",
            recovered=True,
            pid=None,
            updated_at=now_text(),
        )
        atomic_write_json(path, state)
    return state


def to_contract(state: dict[str, Any]) -> DatasetRun:
    byte_range = state.get("byte_range")
    return DatasetRun(
        run_id=state["run_id"],
        dataset_id=state["dataset_id"],
        status=state["status"],
        stage=state["stage"],
        detail=state["detail"],
        byte_range=list(byte_range) if byte_range else None,
        chunks_total=state["chunks_total"],
        chunks_done=state["chunks_done"],
        created_at=state["created_at"],
        updated_at=state["updated_at"],
        pid=state.get("pid"),
        resume_count=state.get("resume_count", 0),
        recovered=state.get("recovered", False),
        error=state.get("error"),
        metrics=RunMetrics(**state.get("metrics", {})),
    )


def _spawn(dataset_id: str, max_bytes: int | None, root: Path | None) -> int:
    command = [sys.executable, "-m", "halt.firex", "run", "--dataset", dataset_id]
    if max_bytes:
        command += ["--max-bytes", str(max_bytes)]
    env = dict(os.environ)
    if root:
        env["HALT_FIREX_DATA_ROOT"] = str(root)
    flags = 0x00000008 | 0x00000200 if sys.platform == "win32" else 0  # detached, new process group
    log_path = _runner(dataset_id, max_bytes, root).dir / "run.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "ab") as log:
        process = (
            subprocess.Popen(  # fixed argv, no shell; nothing here comes from a request but the checked id
                command,
                cwd=Path(__file__).resolve().parents[2],
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=log,
                creationflags=flags,
                start_new_session=sys.platform != "win32",
            )
        )
    return process.pid


def _runner(dataset_id: str, max_bytes: int | None, root: Path | None) -> Runner:
    from halt.firex.pipeline import RunFailed

    try:
        return Runner(dataset_id, max_bytes=max_bytes, root=root)
    except RunFailed as exc:
        status = 404 if "not registered" in str(exc) else 409
        code = "not_found" if status == 404 else "dataset_unavailable"
        raise RunError(status, code, str(exc)) from exc


class _StartLock:
    """Exclusive file lock: two simultaneous starts of one run cannot both launch a process."""

    def __init__(self, path: Path) -> None:
        self.path, self.fd = path, -1

    def __enter__(self) -> _StartLock:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + 5
        while True:
            try:
                self.fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                return self
            except FileExistsError:
                try:
                    if time.time() - self.path.stat().st_mtime > LOCK_STALE_SECONDS:
                        self.path.unlink(missing_ok=True)
                        continue
                except FileNotFoundError:
                    continue
                if time.monotonic() > deadline:
                    raise RunError(409, "run_busy", "another request is starting this run") from None
                time.sleep(0.05)

    def __exit__(self, *_: object) -> None:
        os.close(self.fd)
        self.path.unlink(missing_ok=True)


def start_run(dataset_id: str, max_bytes: int | None, root: Path | None = None) -> dict[str, Any]:
    """Idempotent: the same dataset and range always map to one run, and an active or finished run is
    returned."""
    runner = _runner(dataset_id, max_bytes, root)
    with _StartLock(runner.dir.parent / f".{runner.run_id}.lock"):
        if runner.state_path.is_file():
            state = read_state(runner.run_id, root)
            if state["status"] in ACTIVE or state["status"] == "completed":
                return state
        return _launch(runner, dataset_id, max_bytes, root)


def _launch(runner: Runner, dataset_id: str, max_bytes: int | None, root: Path | None) -> dict[str, Any]:
    runner.dir.mkdir(parents=True, exist_ok=True)
    (runner.dir / "cancel").unlink(missing_ok=True)
    runner.update(status="queued", pid=None, detail="Starting the run process", error=None)
    try:
        pid = _spawn(dataset_id, max_bytes, root)
    except OSError as exc:
        runner.update(status="failed", detail="The run process could not start", error=type(exc).__name__)
        raise RunError(500, "run_start_failed", "the run process could not start") from exc
    # The new process may already have recorded itself; it holds the same pid either way.
    if runner.state()["status"] == "queued":
        runner.update(pid=pid)
    return read_state(runner.run_id, root)


def cancel_run(run_id: str, root: Path | None = None) -> dict[str, Any]:
    state = read_state(run_id, root)
    if state["status"] not in ACTIVE:
        return state
    path = run_dir(run_id, root)
    (path / "cancel").write_text("cancel\n", encoding="utf-8")
    state.update(status="cancelling", detail="Stopping after the chunks in progress", updated_at=now_text())
    atomic_write_json(path / "run.json", state)
    return state


def resume_run(run_id: str, root: Path | None = None) -> dict[str, Any]:
    state = read_state(run_id, root)
    if state["status"] in ACTIVE or state["status"] == "completed":
        return state
    return start_run(state["dataset_id"], state.get("max_bytes"), root)


def list_runs(root: Path | None = None) -> list[dict[str, Any]]:
    base = runs_dir(root)
    if not base.is_dir():
        return []
    out = []
    for path in base.iterdir():
        if path.is_dir() and (path / "run.json").is_file():
            out.append(read_state(path.name, root))
    return sorted(out, key=lambda s: s["updated_at"], reverse=True)


def describe_datasets(root: Path | None = None) -> list[DatasetDescriptor]:
    rules_id = rules_hash(load_rules())
    items = []
    for dataset in datasets(root).values():
        path = source_path(dataset, root)
        size = path.stat().st_size if path.is_file() else None
        latest = None
        if size is not None:
            full = run_id_of(dataset, size, None, rules_id)
            if (runs_dir(root) / full / "run.json").is_file():
                latest = full
        items.append(
            DatasetDescriptor(
                dataset_id=dataset.dataset_id,
                title=dataset.title,
                filename=dataset.filename,
                available=size is not None,
                size_bytes=size,
                expected_sha256=dataset.sha256,
                latest_run_id=latest,
            )
        )
    return items


def find_incident(incident_id: str, run_id: str | None, root: Path | None = None) -> Path:
    if not incident_id.startswith("finc-") or not incident_id[5:].isalnum():
        raise RunError(404, "not_found", f"incident {incident_id} not found")
    if run_id:
        folder = run_dir(run_id, root) / "incidents" / incident_id
        if folder.is_dir():
            return folder
        raise RunError(404, "not_found", f"incident {incident_id} not found in run {run_id}")
    for state in list_runs(root):
        folder = runs_dir(root) / str(state["run_id"]) / "incidents" / incident_id
        if folder.is_dir():
            return folder
    raise RunError(404, "not_found", f"incident {incident_id} not found")
