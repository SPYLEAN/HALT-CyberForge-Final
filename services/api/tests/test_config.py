"""AT-0.5: the API refuses to start on missing or invalid configuration, with one readable error."""

from __future__ import annotations

from pathlib import Path

import pytest

from halt.config import ConfigError, load_settings


def test_AT_0_5_missing_db_url(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("HALT_DB_URL", raising=False)
    monkeypatch.chdir(tmp_path)  # no .env file
    with pytest.raises(ConfigError, match="HALT_DB_URL"):
        load_settings()


def test_AT_0_5_invalid_db_scheme(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HALT_DB_URL", "mysql://root@localhost/halt")
    with pytest.raises(ConfigError, match="HALT_DB_URL: Value error, must start with"):
        load_settings()


def test_valid_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HALT_DB_URL", "postgresql+psycopg://halt:halt@db:5432/halt")
    s = load_settings()
    assert s.seed == 2417
    assert s.llm_enabled is False
    assert s.audit_enforcement == "db"
