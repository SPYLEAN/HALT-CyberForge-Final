"""HALT-R1 input events. See docs/DATA_CONTRACTS.md §1."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints

from halt.contracts.common import Contract

EventKind = Literal[
    "mail_delivered",
    "sign_in",
    "mfa_method_added",
    "oauth_consent",
    "token_replay",
    "resource_enumeration",
    "resource_access",
]


class EventSource(Contract):
    system: str = Field(min_length=1)
    record_id: str = Field(min_length=1)


class AttackTechnique(Contract):
    technique_id: Annotated[str, StringConstraints(pattern=r"^T\d{4}(\.\d{3})?$")]
    technique_name: str


class SecurityEvent(Contract):
    id: Annotated[str, StringConstraints(pattern=r"^(EV-\d{2}|BG-\d{4})$")]
    ts: AwareDatetime
    source: EventSource
    kind: EventKind
    actor_node_ids: list[str] = Field(default_factory=list)
    attributes: dict[str, str | int | float | bool] = Field(default_factory=dict)
    # Filled by HALT-R1 (attack_map). Always null in the scenario fixture so labels cannot leak.
    attack: AttackTechnique | None = None
    synthetic: Literal[True] = True
