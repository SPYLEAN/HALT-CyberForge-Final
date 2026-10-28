"""AT-1.4 (API half): the committed openapi.json matches the code and publishes every contract model."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from halt.contracts import CONTRACT_MODELS

API_DIR = Path(__file__).resolve().parent.parent


def test_AT_1_4_openapi_is_current() -> None:
    result = subprocess.run(
        [sys.executable, "scripts/export_openapi.py", "--check"], cwd=API_DIR, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr


def test_AT_1_4_contracts_published() -> None:
    schemas = json.loads((API_DIR / "openapi.json").read_text(encoding="utf-8"))["components"]["schemas"]
    for model in CONTRACT_MODELS:
        assert model.__name__ in schemas, model.__name__
