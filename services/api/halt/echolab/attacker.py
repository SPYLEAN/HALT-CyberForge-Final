"""Seeded attacker model.

Per rollout, every live hostile edge independently
- succeeds with its transition probability p,
- after a delay drawn uniformly (integer seconds) from its delay_s range.
A soft-cut edge is usable only if the attacker evades the cut (probability soft_cut_evasion_p) and then
costs SOFT_REROUTE_S extra. A hard cut on any node or edge of a route blocks the route outright.

A route reaches the target when all its edges succeed and the summed delay fits in the horizon. All
futures reuse the same draws (common random numbers), so differences come only from the response.
Only `Generator.random()` is used, keeping the stream stable for a given seed.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from halt.contracts.graph import GraphEdge
from halt.threadgraph.cuts import Removal, Route, blocks

SOFT_REROUTE_S = 60


@dataclass(frozen=True)
class EdgeDraws:
    success: NDArray[np.bool_]
    delay: NDArray[np.int64]
    evade: NDArray[np.bool_]


def draw(edges: Sequence[GraphEdge], rollouts: int, seed: int, evasion_p: float) -> dict[str, EdgeDraws]:
    rng = np.random.default_rng(seed)
    out: dict[str, EdgeDraws] = {}
    for e in sorted((e for e in edges if e.transition is not None), key=lambda e: e.id):
        assert e.transition is not None
        lo, hi = e.transition.delay_s
        u_success, u_delay, u_evade = rng.random(rollouts), rng.random(rollouts), rng.random(rollouts)
        out[e.id] = EdgeDraws(
            success=u_success < e.transition.p,
            delay=(lo + np.floor(u_delay * (hi - lo + 1))).astype(np.int64),
            evade=u_evade < evasion_p,
        )
    return out


def route_reached(
    route: Route,
    draws: dict[str, EdgeDraws],
    hard: Removal,
    soft_edge_ids: frozenset[str],
    horizon_s: int,
    rollouts: int,
) -> tuple[NDArray[np.bool_], NDArray[np.int64]]:
    """Per rollout: did the attacker reach the target along this route, and when (seconds)."""
    if blocks(route, hard):
        return np.zeros(rollouts, dtype=bool), np.full(rollouts, np.iinfo(np.int64).max)
    ok = np.ones(rollouts, dtype=bool)
    t = np.zeros(rollouts, dtype=np.int64)
    for edge_id in route.edge_ids:
        d = draws[edge_id]
        ok &= d.success
        t += d.delay
        if edge_id in soft_edge_ids:
            ok &= d.evade
            t += SOFT_REROUTE_S
    return ok & (t <= horizon_s), t
