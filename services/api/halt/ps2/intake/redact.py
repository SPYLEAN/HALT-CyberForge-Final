"""Secret redaction for anything derived from a raw record that may be stored or shown (previews, issues).

Identifiers (token ids, session ids) are kept: they are evidence. Secret material (passwords, client secrets,
session tokens, bearer values, access-key pairs) is removed by key name and by value pattern.
"""

from __future__ import annotations

import json
import re
from typing import Any

REDACTED = "[redacted]"
_SECRET_KEY = re.compile(
    r"(password|passwd|secret|client_?secret|access_?token|refresh_?token|id_?token|session_?token|authorization|"
    r"cookie|api_?key|secret_?access_?key|credentials?|private_?key|signature)$",
    re.IGNORECASE,
)
_SECRET_VALUE = re.compile(
    r"(Bearer\s+[A-Za-z0-9._~+/=-]+|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+)"
)
# `password=…` / `client_secret: …` written inside free text: keep the key, drop the value.
_SECRET_ASSIGNMENT = re.compile(
    r"\b(password|passwd|pwd|secret|client_?secret|api_?key|access_?token|refresh_?token|session_?token)"
    r"(\s*[=:]\s*)[^\s,;&\"']+",
    re.IGNORECASE,
)


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: (REDACTED if _SECRET_KEY.search(str(k)) else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return _SECRET_ASSIGNMENT.sub(rf"\1\2{REDACTED}", _SECRET_VALUE.sub(REDACTED, value))
    return value


def preview(value: Any, limit: int = 240) -> str:
    text = json.dumps(redact(value), sort_keys=True, ensure_ascii=False) if value is not None else ""
    return text if len(text) <= limit else text[: limit - 1] + "…"
