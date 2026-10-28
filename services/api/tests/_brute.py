"""Brute-force reference: enumerate every subset of candidates (test helper, independent of CP-SAT)."""

from __future__ import annotations

from itertools import combinations

from halt.safecut.instance import Instance, evaluate, feasible


def brute_force(inst: Instance) -> tuple[int | None, list[tuple[str, ...]], int]:
    """(best objective, every optimal subset, subsets checked)."""
    cands = list(inst.candidates)
    best: int | None = None
    optimal: list[tuple[str, ...]] = []
    checked = 0
    for k in range(len(cands) + 1):
        for subset in combinations(cands, k):
            checked += 1
            chosen = list(subset)
            if not feasible(inst, chosen):
                continue
            obj = evaluate(inst, chosen).objective
            ids = tuple(c.id for c in chosen)
            if best is None or obj < best:
                best, optimal = obj, [ids]
            elif obj == best:
                optimal.append(ids)
    return best, optimal, checked
