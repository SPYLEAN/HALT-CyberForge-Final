"""Simulated connectors: apply and roll back an action's hard cuts on the graph snapshot.

No real system is touched. Each applied action records exactly which refs it added, so rolling it back
removes only those (a ref another applied action also cut stays removed).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from halt.contracts.actions import ResponseAction
from halt.contracts.graph import Removed
from halt.scenario.models import Scenario
from halt.threadgraph.build import snapshot


@dataclass
class SimulatedEnvironment:
    scenario: Scenario
    _nodes: Counter[str] = field(default_factory=Counter)
    _edges: Counter[str] = field(default_factory=Counter)

    def removed(self) -> Removed:
        return Removed(
            node_ids=sorted(k for k, v in self._nodes.items() if v > 0),
            edge_ids=sorted(k for k, v in self._edges.items() if v > 0),
        )

    def snapshot_hash(self) -> str:
        return snapshot(self.scenario, removed=self.removed()).hash

    def _change(self, action: ResponseAction, delta: int) -> str:
        if action.connector != "simulated":
            raise ValueError(f"{action.id}: only simulated connectors exist")
        for c in action.cuts:
            if c.strength == "hard":
                (self._nodes if c.ref_type == "node" else self._edges)[c.ref] += delta
        return self.snapshot_hash()

    def apply(self, action: ResponseAction) -> str:
        return self._change(action, +1)

    def rollback(self, action: ResponseAction) -> str:
        return self._change(action, -1)
