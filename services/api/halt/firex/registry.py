"""Server-side dataset registry. Clients name a dataset id; no path ever comes from a request.

`<root>/registry.json` may add entries on the server ({"id": {"filename", "title", "sha256"}}), with bare
file names
only. Files live in `<root>/raw/`, run outputs in `<root>/results/firex-runs/`.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from halt.firex.util import read_json

ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


@dataclass(frozen=True)
class RegisteredDataset:
    dataset_id: str
    title: str
    filename: str
    sha256: str | None


BUILT_IN = (
    RegisteredDataset(
        "firex-10g",
        "FireX 10G",
        "firex-10G.log",
        "b71fc95eb5fef198912ba12a03f363c23ec6048ba699d5aad08b0d3ef3cba121",
    ),
    RegisteredDataset(
        "firex-30g",
        "FireX 30G",
        "firex-30G.log",
        "fedd72b052b5622a1f8e7fb6f54b8feab07418e2e145aca8ae66d27d799482b4",
    ),
    RegisteredDataset("firex-50g", "FireX 50G", "firex-50G.log", None),
)


def data_root() -> Path:
    return Path(os.environ.get("HALT_FIREX_DATA_ROOT", ".halt/firex-data")).resolve()


def runs_dir(root: Path | None = None) -> Path:
    return (root or data_root()) / "results" / "firex-runs"


def datasets(root: Path | None = None) -> dict[str, RegisteredDataset]:
    base = root or data_root()
    out = {d.dataset_id: d for d in BUILT_IN}
    extra = base / "registry.json"
    if extra.is_file():
        for dataset_id, spec in read_json(extra).items():
            if ID_PATTERN.match(dataset_id) and NAME_PATTERN.match(str(spec.get("filename", ""))):
                out[dataset_id] = RegisteredDataset(
                    dataset_id, str(spec.get("title", dataset_id)), spec["filename"], spec.get("sha256")
                )
    return out


def source_path(dataset: RegisteredDataset, root: Path | None = None) -> Path:
    return (root or data_root()) / "raw" / dataset.filename
