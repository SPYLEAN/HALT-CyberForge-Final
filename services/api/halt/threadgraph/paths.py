"""Attack-path enumeration over the live part of the graph.

Rule (docs/DEMO_SCENARIO.md §3):
- live edges = hostile edges that are not historical (they can still be traversed, and cut);
- footholds = attacker-controlled nodes plus every node the attacker already reached through
  historical hostile edges;
- a path is a simple path over live edges from a foothold to the target;
- only maximal paths are kept: a path that is a suffix of another path is dropped;
- the entry route is every historical hostile edge leading (through historical edges) into the path.

Path ids (P1.., U1..) are assigned after EchoLab ranks the paths by risk; ThreadGraph identifies a
path by its live edge sequence.
"""

from __future__ import annotations

from typing import Literal, cast

import networkx as nx

from halt.contracts.common import Contract
from halt.contracts.graph import GraphEdge, GraphNode
from halt.threadgraph.build import build_graph

UNCERTAIN_BELOW = 0.8  # an inferred edge with lower confidence makes the path uncertain


class PathCandidate(Contract):
    key: str  # live edge ids joined with ">"
    node_ids: list[str]
    edge_ids: list[str]
    entry_edge_ids: list[str]
    target_id: str
    provenance: Literal["observed", "mixed", "forecast"]
    uncertain: bool


def footholds(nodes: list[GraphNode], edges: list[GraphEdge]) -> set[str]:
    reached = {n.id for n in nodes if n.attacker_controlled}
    historical = [e for e in edges if e.kind == "hostile" and e.historical]
    changed = True
    while changed:
        changed = False
        for e in historical:
            if e.source in reached and e.target not in reached:
                reached.add(e.target)
                changed = True
    return reached


def _entry_edges(path_nodes: list[str], edges: list[GraphEdge]) -> list[str]:
    historical = [e for e in edges if e.kind == "hostile" and e.historical]
    frontier, seen_nodes, found = list(path_nodes), set(path_nodes), set()
    while frontier:
        node = frontier.pop()
        for e in historical:
            if e.target == node and e.id not in found:
                found.add(e.id)
                if e.source not in seen_nodes:
                    seen_nodes.add(e.source)
                    frontier.append(e.source)
    return sorted(found)


def _provenance(live: list[GraphEdge]) -> Literal["observed", "mixed", "forecast"]:
    observed = [e.provenance == "observed" for e in live]
    if all(observed):
        return "observed"
    return "mixed" if any(observed) else "forecast"


def enumerate_paths(nodes: list[GraphNode], edges: list[GraphEdge], target_id: str) -> list[PathCandidate]:
    by_id = {e.id: e for e in edges}
    live = [e for e in edges if e.kind == "hostile" and not e.historical]
    g = build_graph(nodes, live)
    if target_id not in g:
        return []

    sequences: list[list[str]] = []
    for start in sorted(footholds(nodes, edges)):
        if start == target_id or start not in g:
            continue
        for edge_path in nx.all_simple_edge_paths(g, start, target_id):
            steps = cast(list[tuple[str, str, str]], edge_path)  # multigraph paths carry the edge key
            sequences.append([key for _, _, key in steps])

    def is_suffix(short: list[str], long: list[str]) -> bool:
        return len(short) < len(long) and long[-len(short) :] == short

    maximal = [s for s in sequences if not any(is_suffix(s, other) for other in sequences)]

    result = []
    for seq in maximal:
        live_edges = [by_id[i] for i in seq]
        node_ids = [live_edges[0].source, *(e.target for e in live_edges)]
        result.append(
            PathCandidate(
                key=">".join(seq),
                node_ids=node_ids,
                edge_ids=seq,
                entry_edge_ids=_entry_edges(node_ids, edges),
                target_id=target_id,
                provenance=_provenance(live_edges),
                uncertain=any(
                    e.inference is not None and e.inference.confidence < UNCERTAIN_BELOW for e in live_edges
                ),
            )
        )
    return sorted(result, key=lambda p: p.key)
