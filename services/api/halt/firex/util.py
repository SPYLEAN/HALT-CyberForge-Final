"""Shared helpers: atomic writes, canonical hashing and memory measurement."""

from __future__ import annotations

import ctypes
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from halt.canonical import canonical_json


def atomic_write_json(path: Path, doc: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    temp.write_text(json.dumps(doc, indent=1, sort_keys=True), encoding="utf-8", newline="\n")
    for attempt in range(5):
        try:
            os.replace(temp, path)
            return
        except PermissionError:  # another process has the file open for a moment on Windows
            if attempt == 4:
                raise
            time.sleep(0.05 * (attempt + 1))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        while block := f.read(1 << 20):
            digest.update(block)
    return digest.hexdigest()


def seal_of(doc: dict[str, Any]) -> str:
    """SHA-256 of the canonical JSON with the seal field removed."""
    body = {k: v for k, v in doc.items() if k != "seal"}
    return hashlib.sha256(canonical_json(body)).hexdigest()


def stable_hash(value: Any, length: int = 16) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()[:length]


def utc_text(ns: int | None) -> str:
    if ns is None:
        return ""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ns // 1_000_000_000))


def peak_memory_mb() -> float | None:
    """This process's peak working set where it can be measured; otherwise None, never a guess."""
    if sys.platform == "win32":

        class Counters(ctypes.Structure):
            _fields_ = [
                ("cb", ctypes.c_ulong),
                ("PageFaultCount", ctypes.c_ulong),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]

        info = Counters()
        info.cb = ctypes.sizeof(Counters)
        kernel = ctypes.WinDLL("kernel32")  # type: ignore[attr-defined,unused-ignore]
        kernel.GetCurrentProcess.restype = ctypes.c_void_p
        kernel.K32GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong]
        if kernel.K32GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(info), info.cb):
            return float(round(info.PeakWorkingSetSize / 1024 / 1024, 1))
        return None
    try:
        import resource

        return round(float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) / 1024, 1)
    except (ImportError, OSError):
        return None
