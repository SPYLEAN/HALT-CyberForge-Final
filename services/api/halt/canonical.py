"""Canonical JSON and hashing. Every persisted artefact is hashed this way.

Sorted keys, no insignificant whitespace, UTF-8, NaN/Infinity rejected (RFC 8785-style for the value
shapes HALT produces).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from pydantic_core import to_jsonable_python


def canonical_json(value: Any) -> bytes:
    """Models may appear at any depth (inside dicts and lists)."""
    return json.dumps(
        to_jsonable_python(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode()


def sha256_hex(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()
