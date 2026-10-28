"""AT-6.6: explanations are templates by default; an LLM may only reword, and invented ids are rejected."""

from __future__ import annotations

from fastapi.testclient import TestClient

from halt.config import Settings
from halt.main import create_app

URL = "/api/v1/incidents/INC-2417/explain"


class StubLlm:
    def __init__(self, reply: str) -> None:
        self.reply, self.prompts = reply, []

    def complete(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return self.reply


def correlated(settings: Settings, llm: StubLlm | None = None) -> TestClient:
    client = TestClient(create_app(settings))
    client.app.state.llm = llm  # type: ignore[attr-defined]
    client.post("/api/v1/incidents/INC-2417/correlate", json={})
    client.post("/api/v1/incidents/INC-2417/plans", json={})
    return client


def test_AT_6_6_template_by_default(settings: Settings) -> None:
    client = correlated(settings, StubLlm("ignored"))  # attached but HALT_LLM_ENABLED is false
    body = client.post(URL, json={"subject_id": "C09"}).json()
    assert body["engine"] == "template"
    assert "Rejected" in body["text"] and "soft cuts" in body["text"]
    assert "C09" in body["cited_ids"]


def test_AT_6_6_llm_rewording_accepted(settings: Settings) -> None:
    llm = StubLlm("Session replay path P1 is cut by A2; the replay is evidenced by EV-05 and EV-06.")
    client = correlated(settings.model_copy(update={"llm_enabled": True}), llm)
    body = client.post(URL, json={"subject_id": "P1"}).json()
    assert body["engine"] == "llm" and set(body["cited_ids"]) == {"P1", "A2", "EV-05", "EV-06"}
    assert "P1" in llm.prompts[0]


def test_AT_6_6_invented_ids_rejected(settings: Settings) -> None:
    llm = StubLlm("P1 is cut by A2, as shown in EV-99.")
    client = correlated(settings.model_copy(update={"llm_enabled": True}), llm)
    r = client.post(URL, json={"subject_id": "P1"})
    assert r.status_code == 422 and "EV-99" in r.json()["message"]


def test_llm_enabled_without_client_falls_back(settings: Settings) -> None:
    client = correlated(settings.model_copy(update={"llm_enabled": True}), None)
    assert client.post(URL, json={"subject_id": "F-01"}).json()["engine"] == "template"
