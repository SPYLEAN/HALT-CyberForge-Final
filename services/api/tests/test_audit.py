"""AT-5.9 (application half): the audit chain verifies and tampering is detected.

The database half (a PostgreSQL trigger rejecting UPDATE/DELETE on audit_log) arrives with the Phase 6
migration and is tested there against PostgreSQL.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from halt.audit.log import GENESIS, AuditLog, MemoryAuditStore, verify_chain

T = datetime(2026, 10, 27, 9, 56, tzinfo=UTC)


def filled(n: int = 5) -> AuditLog:
    log = AuditLog()
    for i in range(n):
        log.append(T + timedelta(seconds=i), "a_rahman", f"kind_{i}", f"S-{i}", {"i": i})
    return log


def test_AT_5_9_chain_verifies() -> None:
    log = filled()
    check = log.verify()
    assert check.valid and check.length == 5
    entries = list(log)
    assert entries[0].prev_hash == GENESIS
    assert all(b.prev_hash == a.hash for a, b in zip(entries, entries[1:], strict=False))


def test_AT_5_9_tampering_detected() -> None:
    entries = list(filled())
    edited = [*entries[:2], entries[2].model_copy(update={"payload": {"i": 99}}), *entries[3:]]
    check = verify_chain(edited)
    assert not check.valid and check.first_bad_seq == 3
    deleted = entries[:2] + entries[3:]
    assert not verify_chain(deleted).valid
    reordered = [entries[1], entries[0], *entries[2:]]
    assert not verify_chain(reordered).valid


def test_AT_5_9_store_is_append_only() -> None:
    store = MemoryAuditStore()
    assert not any(hasattr(store, name) for name in ("update", "delete", "remove", "clear", "__setitem__"))
    log = AuditLog(store)
    log.append(T, "system", "plan_received", "PLAN-x")
    assert isinstance(store.entries(), tuple)  # callers get a read-only view
