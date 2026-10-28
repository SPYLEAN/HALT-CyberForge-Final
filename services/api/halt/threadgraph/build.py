"""Graph construction and time-sliced snapshots."""

from __future__ import annotations

from datetime import datetime, timedelta

import networkx as nx

from halt.canonical import sha256_hex
from halt.contracts.common import Meta
from halt.contracts.graph import GraphEdge, GraphNode, GraphSnapshot, Removed
from halt.scenario.loader import scenario_hashes
from halt.scenario.models import Scenario


def build_graph(nodes: list[GraphNode], edges: list[GraphEdge]) -> nx.MultiDiGraph[str]:
    """MultiDiGraph keyed by edge id; node attr `node`, edge attr `edge` hold the contract models."""
    g: nx.MultiDiGraph[str] = nx.MultiDiGraph()
    for n in nodes:
        g.add_node(n.id, node=n)
    for e in edges:
        g.add_edge(e.source, e.target, key=e.id, edge=e)
    return g


def _visible(first_seen: datetime | None, at: datetime) -> bool:
    return first_seen is None or first_seen <= at


def snapshot(
    scenario: Scenario,
    t: float | None = None,
    *,
    include_forecast: bool = True,
    removed: Removed | None = None,
) -> GraphSnapshot:
    """The graph as known `t` replay seconds after incident t0 (None = everything).

    Forecast nodes and edges have no first_seen; `include_forecast=False` hides them until the replay
    reaches the forecast stage. `removed` marks a post-action snapshot.
    """
    removed = removed or Removed()
    t0 = scenario.incident.t0
    if t is not None:
        at = t0 + timedelta(seconds=t)
    else:
        seen = [n.first_seen for n in scenario.topology.nodes] + [
            e.first_seen for e in scenario.topology.edges
        ]
        at = max([t0, *(s for s in seen if s is not None)])

    def keep_provenance(provenance: str) -> bool:
        return include_forecast or provenance != "forecast"

    nodes = [
        n
        for n in scenario.topology.nodes
        if _visible(n.first_seen, at) and keep_provenance(n.provenance) and n.id not in removed.node_ids
    ]
    node_ids = {n.id for n in nodes}
    edges = [
        e
        for e in scenario.topology.edges
        if _visible(e.first_seen, at)
        and keep_provenance(e.provenance)
        and e.id not in removed.edge_ids
        and e.source in node_ids
        and e.target in node_ids
    ]
    digest = sha256_hex({"nodes": nodes, "edges": edges, "removed": removed.model_dump(mode="json")})
    hashes = scenario_hashes(scenario)
    return GraphSnapshot(
        id=f"GS-{digest[:12]}",
        hash=digest,
        at=at,
        nodes=nodes,
        edges=edges,
        removed=removed,
        meta=Meta(
            incident_id=scenario.incident.id,
            seed=scenario.incident.params.seed,
            generated_at=at,
            input_hashes={"graph": hashes["graph"], "events": hashes["events"]},
        ),
    )
