"""Runtime event scorer: the configured model from r1_model.json (written by train_eval)."""

from __future__ import annotations

import json
import math
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path

from halt.r1.features import FEATURE_NAMES

MODEL_PATH = Path(__file__).resolve().parent / "r1_model.json"


class Scorer:
    def __init__(self, method: str, coef: list[float], intercept: float) -> None:
        self.method = method
        self._coef = coef
        self._intercept = intercept

    def __call__(self, features: list[float]) -> float:
        z = self._intercept + sum(w * x for w, x in zip(self._coef, features, strict=True))
        return 1.0 / (1.0 + math.exp(-z))


@lru_cache
def configured_model(path: Path = MODEL_PATH) -> Scorer:
    artefact = json.loads(path.read_text(encoding="utf-8"))
    if artefact["model"] != "logreg":
        raise ValueError(f"unsupported model {artefact['model']!r}")
    if artefact["features"] != FEATURE_NAMES:
        raise ValueError("r1_model.json was trained on a different feature list; rerun halt.r1.train_eval")
    return Scorer("logreg", artefact["coef"], artefact["intercept"])


def as_callable() -> Callable[[list[float]], float]:
    return configured_model()
