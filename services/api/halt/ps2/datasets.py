"""Bundled synthetic datasets (inference inputs only: raw files, manifest, organisation context).

Fixture mode is deterministic: the ingestion time is the dataset's declared capture time, not the wall clock.
Ground truth lives elsewhere (halt/ps2/ground_truth) and is not read here.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from halt.ps2.schema import OrgContext, RawFile

DATASET_DIR = Path(__file__).resolve().parent / "datasets"
_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


@dataclass(frozen=True)
class Dataset:
    dataset_id: str
    title: str
    seed: int
    captured_at: datetime
    files: list[RawFile]
    context: OrgContext


def dataset_ids() -> list[str]:
    return (
        sorted(p.name for p in DATASET_DIR.iterdir() if (p / "manifest.json").is_file())
        if DATASET_DIR.is_dir()
        else []
    )


def load_dataset(dataset_id: str) -> Dataset:
    if not _ID.match(dataset_id) or dataset_id not in dataset_ids():
        raise KeyError(dataset_id)
    base = DATASET_DIR / dataset_id
    manifest = json.loads((base / "manifest.json").read_text(encoding="utf-8"))
    files = [
        RawFile(
            filename=f["filename"],
            adapter=f["adapter"],
            content_type=f["content_type"],
            content=(base / "raw" / f["filename"]).read_text(encoding="utf-8"),
        )
        for f in manifest["files"]
    ]
    return Dataset(
        dataset_id=dataset_id,
        title=manifest["title"],
        seed=manifest["seed"],
        captured_at=datetime.fromisoformat(manifest["captured_at"].replace("Z", "+00:00")),
        files=files,
        context=OrgContext.model_validate(json.loads((base / "context.json").read_text(encoding="utf-8"))),
    )
