from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from halt.config import Settings
from halt.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(db_url="sqlite+pysqlite:///:memory:", signing_key_path=str(tmp_path / "demo-key.pem"))


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as c:
        yield c
