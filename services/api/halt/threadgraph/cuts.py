"""Applying response-action cuts: which paths they block and which business processes they break.

Used by SafeCut (coverage, downtime) and, independently re-run, by ProofSeal.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Protocol

from halt.contracts.actions import ResponseAction
from halt.contracts.common import Strength
from halt.contracts.graph import GraphEdge, GraphNode


@dataclass(frozen=True)
class Removal:
    node_ids: frozenset[str] = field(default_factory=frozenset)
    edge_ids: frozenset[str] = field(default_factory=frozenset)

    def __or__(self, other: Removal) -> Removal:
        return Removal(self.node_ids | other.node_ids, self.edge_ids | other.edge_ids)


def removal_for(actions: Iterable[ResponseAction], strengths: Iterable[Strength] = ("hard",)) -> Removal:
    allowed = set(strengths)
    nodes: set[str] = set()
    edge_ids: set[str] = set()
    for a in actions:
        for c in a.cuts:
            if c.strength in allowed:
                (nodes if c.ref_type == "node" else edge_ids).add(c.ref)
    return Removal(frozenset(nodes), frozenset(edge_ids))


class Route(Protocol):
    """Anything with a live route: PathCandidate or the AttackPath contract."""

    @property
    def node_ids(self) -> list[str]: ...
    @property
    def edge_ids(self) -> list[str]: ...


def blocks(path: Route, removal: Removal) -> bool:
    """A cut blocks a path only when it hits a node or edge on the live route."""
    return bool(removal.node_ids.intersection(path.node_ids) or removal.edge_ids.intersection(path.edge_ids))


def dependency_closure(node_id: str, edges: list[GraphEdge]) -> tuple[set[str], set[str]]:
    """Nodes and dependency edges a node transitively requires (dependency edges: dependent -> dependency)."""
    deps = [e for e in edges if e.kind == "dependency"]
    nodes, used, frontier = {node_id}, set(), [node_id]
    while frontier:
        current = frontier.pop()
        for e in deps:
            if e.source == current:
                used.add(e.id)
                if e.target not in nodes:
                    nodes.add(e.target)
                    frontier.append(e.target)
    return nodes, used


def broken_processes(
    nodes: list[GraphNode], edges: list[GraphEdge], removal: Removal
) -> dict[str, list[str]]:
    """Process id -> the removed nodes/edges in its dependency closure (empty dict = nothing broken)."""
    broken: dict[str, list[str]] = {}
    for n in nodes:
        if n.kind != "process":
            continue
        closure_nodes, closure_edges = dependency_closure(n.id, edges)
        hits = sorted(removal.node_ids & closure_nodes) + sorted(removal.edge_ids & closure_edges)
        if hits:
            broken[n.id] = hits
    return broken
