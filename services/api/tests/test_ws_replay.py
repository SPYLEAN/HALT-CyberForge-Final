"""AT-6.2, AT-6.3: deterministic seek, increasing seq, REST and WebSocket agree; live broadcasts."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

WS = "/ws/incidents/INC-2417"


def collect(ws: Any, t: float, expected: int) -> list[dict[str, Any]]:
    ws.send_json({"type": "seek", "t": t})
    return [ws.receive_json() for _ in range(expected)]


def count_for(client: TestClient, t: float) -> int:
    from halt.replay.stream import seek as replay_seek  # noqa: PLC0415

    return len(replay_seek(client.app.state.service.runtime("INC-2417").scenario, t))  # type: ignore[attr-defined]


def strip(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{k: v for k, v in m.items() if k != "seq"} for m in messages]


@pytest.mark.parametrize("t", [0, 130, 400, 700])
def test_AT_6_2_seek_is_deterministic(client: TestClient, t: float) -> None:
    n = count_for(client, t)
    with client.websocket_connect(WS) as ws:
        a = collect(ws, t, n)
        b = collect(ws, t, n)
    assert strip(a) == strip(b)
    seqs = [m["seq"] for m in a + b]
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)
    assert all(m["t"] <= t for m in a)


def test_AT_6_3_websocket_graph_matches_rest(client: TestClient) -> None:
    for t in (100, 400, 700):
        with client.websocket_connect(WS) as ws:
            messages = collect(ws, t, count_for(client, t))
        nodes = {n["id"] for m in messages if m["type"] == "graph_delta" for n in m["add_nodes"]}
        edges = {e["id"] for m in messages if m["type"] == "graph_delta" for e in m["add_edges"]}
        rest = client.get("/api/v1/incidents/INC-2417/graph", params={"at": t}).json()
        assert nodes == {n["id"] for n in rest["nodes"]}, t
        assert edges == {e["id"] for e in rest["edges"]}, t


def test_forecast_layer_appears_with_last_event(client: TestClient) -> None:
    with client.websocket_connect(WS) as ws:
        early = collect(ws, 600, count_for(client, 600))
        late = collect(ws, 700, count_for(client, 700))
    stages = lambda ms: [m["state"] for m in ms if m["type"] == "stage"]  # noqa: E731
    assert stages(early) == ["new", "correlating"]
    assert stages(late) == ["new", "correlating", "forecast_ready"]
    assert not any(
        n["provenance"] == "forecast" for m in early if m["type"] == "graph_delta" for n in m["add_nodes"]
    )


def test_live_stage_broadcast(client: TestClient) -> None:
    with client.websocket_connect(WS) as ws:
        ws.send_json({"type": "subscribe"})
        assert ws.receive_json()["type"] == "clock"
        client.post("/api/v1/incidents/INC-2417/correlate", json={})
        msg = ws.receive_json()
        assert msg["type"] == "stage" and msg["state"] == "forecast_ready"


def test_unknown_incident_closes(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as e, client.websocket_connect("/ws/incidents/INC-0000") as ws:
        ws.receive_json()
    assert e.value.code == 4404
