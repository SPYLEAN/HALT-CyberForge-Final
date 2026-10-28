"""Replay timeline built from the scenario (t = replay seconds since incident t0).

- t = 0: stage `new`, plus the structural graph (business processes, directory, dependencies).
- each incident event at its timestamp: the event (ATT&CK filled once HALT-R1 has linked it), a graph
  delta for nodes and edges first seen at that moment, and any finding that appeared or changed.
- stage `correlating` when HALT-R1 first forms an incident.
- at the last incident event: stage `forecast_ready` and the forecast layer of the graph.

Later stages (plan, approval, execution) are driven by operators through the API and are broadcast live,
outside this deterministic timeline.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from halt.canonical import sha256_hex
from halt.contracts.ws import (
    ClockMessage,
    EventMessage,
    FindingMessage,
    GateMessage,
    GraphDeltaMessage,
    StageMessage,
    StaleMessage,
)
from halt.r1.correlate import enrich, findings, incidents
from halt.r1.model import configured_model
from halt.scenario.loader import scenario_hashes
from halt.scenario.models import Scenario

Item = tuple[float, dict[str, Any]]  # (t, message fields without seq)


def offset(s: Scenario, ts: Any) -> float:
    return float((ts - s.incident.t0).total_seconds())


def forecast_at(s: Scenario) -> float:
    """Forecast layer appears when the last incident event has been correlated."""
    return max(offset(s, e.ts) for e in s.events)


def _timeline(s: Scenario) -> list[Item]:
    items: list[Item] = []
    t0 = s.incident.t0
    nodes, edges = s.topology.nodes, s.topology.edges
    shown_nodes: set[str] = set()
    shown_edges: set[str] = set()

    def delta(t: float, include_forecast: bool) -> None:
        at = t0 + timedelta(seconds=t)
        add_n = [
            n
            for n in nodes
            if n.id not in shown_nodes
            and (n.first_seen is None or n.first_seen <= at)
            and (include_forecast or n.provenance != "forecast")
        ]
        shown_nodes.update(n.id for n in add_n)
        add_e = [
            e
            for e in edges
            if e.id not in shown_edges
            and (e.first_seen is None or e.first_seen <= at)
            and (include_forecast or e.provenance != "forecast")
            and e.source in shown_nodes
            and e.target in shown_nodes
        ]
        shown_edges.update(e.id for e in add_e)
        if add_n or add_e:
            items.append((t, {"type": "graph_delta", "add_nodes": add_n, "add_edges": add_e}))

    items.append((0.0, {"type": "stage", "state": "new"}))
    delta(0.0, include_forecast=False)

    stream = [*s.events, *s.background_events]
    model = configured_model()
    emitted: dict[str, str] = {}
    correlating = False
    for ev in sorted(s.events, key=lambda e: e.ts):
        t = offset(s, ev.ts)
        visible = [e for e in stream if e.ts <= ev.ts]
        found = incidents(visible)
        enriched = enrich([ev], found[0])[0] if found else ev
        items.append((t, {"type": "event", "event": enriched}))
        delta(t, include_forecast=False)
        if found and not correlating:
            correlating = True
            items.append((t, {"type": "stage", "state": "correlating"}))
        for f in findings(found[0], model) if found else []:
            digest = sha256_hex(f)
            if emitted.get(f.id) != digest:
                emitted[f.id] = digest
                items.append((t, {"type": "finding", "finding": f}))

    t_fc = forecast_at(s)
    delta(t_fc, include_forecast=True)
    items.append((t_fc, {"type": "stage", "state": "forecast_ready"}))
    return items


_CACHE: dict[str, tuple[Item, ...]] = {}


def timeline(s: Scenario) -> tuple[Item, ...]:
    key = f"{s.incident.id}:{s.variant}:{scenario_hashes(s)['graph']}:{scenario_hashes(s)['events']}"
    if key not in _CACHE:
        _CACHE[key] = tuple(_timeline(s))
    return _CACHE[key]


def end_t(s: Scenario) -> float:
    return timeline(s)[-1][0]


MESSAGE_TYPES = {
    "clock": ClockMessage,
    "event": EventMessage,
    "graph_delta": GraphDeltaMessage,
    "finding": FindingMessage,
    "stage": StageMessage,
    "gate": GateMessage,
    "stale": StaleMessage,
}


def build(seq: int, t: float, fields: dict[str, Any]) -> dict[str, Any]:
    """Validate against the contract and return the JSON-ready message."""
    model = MESSAGE_TYPES[fields["type"]](seq=seq, t=t, **fields)
    message: dict[str, Any] = model.model_dump(mode="json")
    return message


def seek(s: Scenario, t: float, start_seq: int = 0) -> list[dict[str, Any]]:
    """Clock message followed by every timeline message with time <= t, in order."""
    out = [build(start_seq, t, {"type": "clock", "playing": False, "speed": 1})]
    for item_t, fields in timeline(s):
        if item_t <= t:
            out.append(build(start_seq + len(out), item_t, fields))
    return out
