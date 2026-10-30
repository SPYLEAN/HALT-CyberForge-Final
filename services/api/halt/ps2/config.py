"""Reconstruction configuration: every weight, window and threshold lives in reconstruction_config.json."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from halt.canonical import sha256_hex

CONFIG_PATH = Path(__file__).resolve().parent / "reconstruction_config.json"


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Limits(_Model):
    max_file_bytes: int
    max_files: int
    max_total_bytes: int
    max_records_per_file: int
    max_paths: int
    max_path_hops: int


class Windows(_Model):
    edge_max_gap: int
    identity_ip: int
    identity_device: int
    temporal_succession: int
    email_to_auth: int
    temporal_decay_tau: int


class Seed(_Model):
    threshold: float
    r1_weight: float
    rules: dict[str, float]
    enumeration_rate_per_min: float
    high_privilege_scopes: list[str]
    young_days: int


class Reduction(_Model):
    max_depth: int
    relevance_threshold: float
    propagation_decay: float


class Forecast(_Model):
    hop_confidence: float
    max_hops: int
    criticalities: list[str]


class ReconstructionConfig(_Model):
    version: str
    limits: Limits
    windows_s: Windows
    temporal_successors_per_event: int
    edge_weights: dict[str, float]
    exact_components: list[str]
    temporal_only_cap: float
    contradiction_penalty: float
    edge_select_threshold: float
    seed: Seed
    reduction: Reduction
    path_weights: dict[str, float]
    alternates: int
    attack_map_version: str
    forecast: Forecast

    @property
    def sha256(self) -> str:
        return sha256_hex(self.model_dump(mode="json"))


@lru_cache
def load_config(path: Path = CONFIG_PATH) -> ReconstructionConfig:
    return ReconstructionConfig.model_validate(json.loads(path.read_text(encoding="utf-8")))
