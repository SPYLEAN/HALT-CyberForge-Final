"""Hash-chained audit log.

hash = sha256(prev_hash || canonical JSON of the entry without its hash); the first entry chains from
GENESIS. The in-memory store exposes append and read only. The PostgreSQL table (Phase 6) adds a trigger
that rejects UPDATE and DELETE; `verify` detects tampering with either store.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from halt.canonical import canonical_json
from halt.contracts.audit import AuditEntry

GENESIS = "0" * 64


def entry_hash(
    prev_hash: str, seq: int, at: datetime, actor: str, kind: str, subject_id: str, payload: object
) -> str:
    body = {
        "seq": seq,
        "at": at,
        "actor": actor,
        "kind": kind,
        "subject_id": subject_id,
        "payload": payload,
        "prev_hash": prev_hash,
    }
    return hashlib.sha256(prev_hash.encode() + canonical_json(body)).hexdigest()


class AuditStore(Protocol):
    def append(self, entry: AuditEntry) -> None: ...
    def entries(self) -> Sequence[AuditEntry]: ...


class MemoryAuditStore:
    """Append-only by construction: there is no update or delete method."""

    def __init__(self) -> None:
        self._entries: list[AuditEntry] = []

    def append(self, entry: AuditEntry) -> None:
        self._entries.append(entry)

    def entries(self) -> Sequence[AuditEntry]:
        return tuple(self._entries)


@dataclass(frozen=True)
class ChainCheck:
    valid: bool
    length: int
    head_hash: str
    first_bad_seq: int | None = None


class AuditLog:
    def __init__(self, store: AuditStore | None = None) -> None:
        self.store = store or MemoryAuditStore()

    def append(
        self, at: datetime, actor: str, kind: str, subject_id: str, payload: object = None
    ) -> AuditEntry:
        existing = self.store.entries()
        seq = len(existing) + 1
        prev = existing[-1].hash if existing else GENESIS
        entry = AuditEntry(
            seq=seq,
            at=at,
            actor=actor,
            kind=kind,
            subject_id=subject_id,
            payload=payload,
            prev_hash=prev,
            hash=entry_hash(prev, seq, at, actor, kind, subject_id, payload),
        )
        self.store.append(entry)
        return entry

    def __iter__(self) -> Iterator[AuditEntry]:
        return iter(self.store.entries())

    def kinds(self) -> list[str]:
        return [e.kind for e in self.store.entries()]

    def verify(self) -> ChainCheck:
        return verify_chain(self.store.entries())


def verify_chain(entries: Sequence[AuditEntry]) -> ChainCheck:
    prev = GENESIS
    for i, e in enumerate(entries, start=1):
        expected = entry_hash(prev, i, e.at, e.actor, e.kind, e.subject_id, e.payload)
        if e.seq != i or e.prev_hash != prev or e.hash != expected:
            return ChainCheck(False, len(entries), entries[-1].hash, first_bad_seq=i)
        prev = e.hash
    return ChainCheck(True, len(entries), prev)
