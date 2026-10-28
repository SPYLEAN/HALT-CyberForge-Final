"""Environment configuration. The API refuses to start on invalid settings (AT-0.5)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from halt.scenario.loader import DEFAULT_SCENARIO_DIR

ALLOWED_DB_SCHEMES = ("postgresql+psycopg://", "sqlite+pysqlite://")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HALT_", env_file=".env", extra="ignore")

    db_url: str = Field(description="postgresql+psycopg://... or sqlite+pysqlite:///...")
    seed: int = 2417
    signing_key_path: str = "./secrets/demo-signing-key.pem"
    llm_enabled: bool = False
    cors_origins: list[str] = ["http://localhost:3000"]
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    scenario_dir: Path = DEFAULT_SCENARIO_DIR
    scenario_variant: str = "baseline"

    @field_validator("db_url")
    @classmethod
    def _check_db_url(cls, v: str) -> str:
        if not v.startswith(ALLOWED_DB_SCHEMES):
            raise ValueError(f"must start with one of {', '.join(ALLOWED_DB_SCHEMES)}")
        return v

    @property
    def audit_enforcement(self) -> Literal["db", "app"]:
        # Only PostgreSQL gets the no-update/no-delete trigger on audit_log.
        return "db" if self.db_url.startswith("postgresql") else "app"


class ConfigError(RuntimeError):
    """Raised with one readable message listing every invalid setting."""


def load_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        problems = "; ".join(
            f"HALT_{'_'.join(str(p) for p in err['loc']).upper()}: {err['msg']}" for err in exc.errors()
        )
        raise ConfigError(f"Invalid HALT configuration: {problems}") from None


@lru_cache
def get_settings() -> Settings:
    return load_settings()
