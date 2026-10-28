"""Append-only, hash-chained audit log entries."""

from __future__ import annotations

from pydantic import AwareDatetime

from halt.contracts.common import Contract, Sha256


class AuditEntry(Contract):
    seq: int
    at: AwareDatetime
    actor: str
    kind: str
    subject_id: str
    payload: object
    prev_hash: Sha256
    hash: Sha256
