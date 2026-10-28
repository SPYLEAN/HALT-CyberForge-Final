"""Shared contract primitives. See docs/DATA_CONTRACTS.md §0."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints

Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]

# observed: an event is behind it. inferred: HALT derived it. forecast: a simulated future.
# structural: a directory / inventory / dependency-map fact, not an incident event.
Provenance = Literal["observed", "inferred", "forecast", "structural"]

# hard: removes the capability. soft: the modelled attacker can evade it.
Strength = Literal["hard", "soft"]

EvidenceId = Annotated[str, StringConstraints(pattern=r"^EV-\d{2}$")]


class Contract(BaseModel):
    """Base for every contract model: unknown fields are rejected, instances are immutable."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class Meta(Contract):
    incident_id: str
    simulated: Literal[True] = True
    seed: int
    schema_version: Literal["1.0"] = "1.0"
    generated_at: AwareDatetime
    input_hashes: dict[str, Sha256] = Field(default_factory=dict)


class Derivation(Contract):
    """Required wherever a number is shown: counts with their denominator, never a bare score."""

    numerator: int | None = None
    denominator: int | None = None
    method: str = Field(min_length=1)
    source_ids: list[str] = Field(default_factory=list)


class ApiError(Contract):
    code: str
    message: str
    detail: object | None = None
    request_id: str
