"""Repositories: plain reads and writes, no domain logic."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from pydantic import BaseModel
from sqlalchemy import Engine, insert, select

from halt.contracts.audit import AuditEntry
from halt.db.models import artefacts, audit_log, incidents


def _utc(at: datetime) -> datetime:
    """SQLite drops tz info; every timestamp HALT writes is UTC."""
    return at if at.tzinfo is not None else at.replace(tzinfo=UTC)


class Repository:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    def save_incident(self, incident_id: str, variant: str, at: datetime, body: BaseModel) -> None:
        with self.engine.begin() as conn:
            conn.execute(incidents.delete().where(incidents.c.id == incident_id))
            conn.execute(
                insert(incidents).values(
                    id=incident_id, variant=variant, created_at=at, body=body.model_dump(mode="json")
                )
            )

    def save_artefact(
        self, kind: str, artefact_id: str, incident_id: str, at: datetime, body: BaseModel, digest: str | None
    ) -> None:
        with self.engine.begin() as conn:
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

    def artefact_kinds(self, incident_id: str) -> list[str]:
        with self.engine.connect() as conn:
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
        with self.engine.begin() as conn:
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
        with self.engine.connect() as conn:
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
