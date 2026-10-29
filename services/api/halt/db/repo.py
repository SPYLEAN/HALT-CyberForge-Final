"""Repositories: plain reads and writes, no domain logic."""

from __future__ import annotations

import threading
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import Connection, Engine, func, insert, select

from halt.contracts.audit import AuditEntry
from halt.db.models import artefacts, audit_log, incidents, operations, replay_positions


@dataclass(frozen=True)
class Operation:
    """One journaled state-changing call: what was asked, and how it ended."""

    seq: int
    kind: str
    args: dict[str, Any]
    outcome: str
    at: datetime


@dataclass(frozen=True)
class StoredArtefact:
    kind: str
    hash: str | None
    body: dict[str, Any]


_active = threading.local()  # the unit of work open on this thread, per engine


@contextmanager
def _connect(engine: Engine, *, write: bool) -> Iterator[Connection]:
    """Join the unit of work open on this thread (Repository.transaction), or use a connection of our own."""
    conn: Connection | None = getattr(_active, "by_engine", {}).get(id(engine))
    if conn is not None:
        yield conn
        return
    with engine.begin() if write else engine.connect() as own:
        yield own


def _utc(at: datetime) -> datetime:
    """SQLite drops tz info; every timestamp HALT writes is UTC."""
    return at if at.tzinfo is not None else at.replace(tzinfo=UTC)


class Repository:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    @contextmanager
    def transaction(self) -> Iterator[None]:
        """One database transaction for everything written on this thread inside the block, the audit log
        included: an operation's audit entries, artefacts and journal entry commit together or not at all."""
        by_engine: dict[int, Connection] = _active.__dict__.setdefault("by_engine", {})
        if id(self.engine) in by_engine:
            yield
            return
        with self.engine.begin() as conn:
            by_engine[id(self.engine)] = conn
            try:
                yield
            finally:
                del by_engine[id(self.engine)]

    def save_incident(self, incident_id: str, variant: str, at: datetime, body: BaseModel) -> None:
        with _connect(self.engine, write=True) as conn:
            conn.execute(incidents.delete().where(incidents.c.id == incident_id))
            conn.execute(
                insert(incidents).values(
                    id=incident_id, variant=variant, created_at=at, body=body.model_dump(mode="json")
                )
            )

    def save_artefact(
        self, kind: str, artefact_id: str, incident_id: str, at: datetime, body: BaseModel, digest: str | None
    ) -> None:
        with _connect(self.engine, write=True) as conn:
            conn.execute(artefacts.delete().where(artefacts.c.id == artefact_id))
            conn.execute(
                insert(artefacts).values(
                    id=artefact_id,
                    incident_id=incident_id,
                    kind=kind,
                    hash=digest,
                    created_at=at,
                    body=body.model_dump(mode="json"),
                )
            )

    def incident_ids(self) -> list[str]:
        with _connect(self.engine, write=False) as conn:
            return [r.id for r in conn.execute(select(incidents.c.id).order_by(incidents.c.id))]

    def artefact(self, artefact_id: str) -> StoredArtefact | None:
        with _connect(self.engine, write=False) as conn:
            row = conn.execute(select(artefacts).where(artefacts.c.id == artefact_id)).first()
            return StoredArtefact(row.kind, row.hash, row.body) if row else None

    def append_operation(
        self, incident_id: str, kind: str, args: dict[str, Any], outcome: str, at: datetime
    ) -> None:
        with _connect(self.engine, write=True) as conn:
            last = conn.execute(
                select(func.max(operations.c.seq)).where(operations.c.incident_id == incident_id)
            ).scalar()
            conn.execute(
                insert(operations).values(
                    incident_id=incident_id, seq=(last or 0) + 1, kind=kind, args=args, outcome=outcome, at=at
                )
            )

    def operations(self, incident_id: str) -> list[Operation]:
        with _connect(self.engine, write=False) as conn:
            rows = conn.execute(
                select(operations).where(operations.c.incident_id == incident_id).order_by(operations.c.seq)
            )
            return [Operation(r.seq, r.kind, r.args, r.outcome, _utc(r.at)) for r in rows]

    def save_cursor(self, incident_id: str, t: float | None) -> None:
        with _connect(self.engine, write=True) as conn:
            conn.execute(replay_positions.delete().where(replay_positions.c.incident_id == incident_id))
            conn.execute(insert(replay_positions).values(incident_id=incident_id, t=t))

    def cursor(self, incident_id: str) -> float | None:
        with _connect(self.engine, write=False) as conn:
            row = conn.execute(
                select(replay_positions.c.t).where(replay_positions.c.incident_id == incident_id)
            ).first()
            # row[0], not row.t: Row.t is SQLAlchemy's tuple accessor, not this column.
            return None if row is None else float(row[0]) if row[0] is not None else None

    def artefact_kinds(self, incident_id: str) -> list[str]:
        with _connect(self.engine, write=False) as conn:
            rows = conn.execute(
                select(artefacts.c.kind)
                .where(artefacts.c.incident_id == incident_id)
                .order_by(artefacts.c.created_at)
            )
            return [r.kind for r in rows]


class DbAuditStore:
    """AuditStore over the audit_log table, one hash chain per incident."""

    def __init__(self, engine: Engine, incident_id: str) -> None:
        self.engine, self.incident_id = engine, incident_id

    def append(self, entry: AuditEntry) -> None:
        with _connect(self.engine, write=True) as conn:
            conn.execute(
                insert(audit_log).values(
                    incident_id=self.incident_id,
                    seq=entry.seq,
                    at=entry.at,
                    actor=entry.actor,
                    kind=entry.kind,
                    subject_id=entry.subject_id,
                    payload=entry.payload,
                    prev_hash=entry.prev_hash,
                    hash=entry.hash,
                )
            )

    def entries(self) -> Sequence[AuditEntry]:
        with _connect(self.engine, write=False) as conn:
            rows = conn.execute(
                select(audit_log).where(audit_log.c.incident_id == self.incident_id).order_by(audit_log.c.seq)
            )
            return tuple(
                AuditEntry(
                    seq=r.seq,
                    at=_utc(r.at),
                    actor=r.actor,
                    kind=r.kind,
                    subject_id=r.subject_id,
                    payload=r.payload,
                    prev_hash=r.prev_hash,
                    hash=r.hash,
                )
                for r in rows
            )
