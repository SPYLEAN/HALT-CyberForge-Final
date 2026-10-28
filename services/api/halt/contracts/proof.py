"""ProofSeal. See docs/DATA_CONTRACTS.md §8."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AwareDatetime, StringConstraints

from halt.contracts.common import Contract, Derivation, Meta, Sha256


class ProofClaim(Contract):
    id: Annotated[str, StringConstraints(pattern=r"^CHK-\d{2}$")]
    text: str
    method: str
    evidence_ids: list[str]
    result: Derivation
    status: Literal["verified", "failed", "stale", "not_run"]


class Enumeration(Contract):
    subsets_checked: int
    feasible: int
    optimal_count: int
    unique: bool


class Signature(Contract):
    alg: Literal["Ed25519"] = "Ed25519"
    key_id: str
    value: str
    demo_key: Literal[True] = True


class Proof(Contract):
    id: str
    plan_id: str
    snapshot_hash: Sha256
    post_snapshot_hash: Sha256
    claims: list[ProofClaim]
    enumeration: Enumeration
    not_covered: list[str]
    versions: dict[str, str]
    certificate: Sha256
    signature: Signature
    sealed_at: AwareDatetime
    valid_until: AwareDatetime | None
    meta: Meta
