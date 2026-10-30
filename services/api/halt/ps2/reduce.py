"""The suspicious semantic graph: only what is relevant to suspicious seeds, with everything else kept for
audit.

Seeds are events whose suspicion (rules + HALT-R1) reaches the seed threshold. Relevance spreads from seeds
forward and backward over edges at or above the selection threshold, up to `max_depth` hops, multiplied by
edge
confidence and a per-hop decay. Events below the relevance threshold, and edges that are below the selection
threshold, temporal-only, contradicted or touch an irrelevant event, are returned as rejected hypotheses
with a
reason. Ground truth is never read here.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from halt.ps2.config import ReconstructionConfig
from halt.ps2.schema import CandidateEdge
from halt.ps2.seeds import Suspicion


@dataclass(frozen=True)
class Reduced:
    seeds: list[str]
    relevance: dict[str, float]
    kept_events: set[str]
    selected: list[CandidateEdge]
    rejected: list[CandidateEdge]


def reduce(
    event_ids: list[str],
    edges: list[CandidateEdge],
    suspicion: dict[str, Suspicion],
    config: ReconstructionConfig,
) -> Reduced:
    thr = config.edge_select_threshold
    seeds = [e for e in event_ids if suspicion[e].score >= config.seed.threshold]
    strong = [e for e in edges if e.confidence >= thr]
    nbrs: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for e in strong:
        nbrs[e.source].append((e.target, e.confidence))
        nbrs[e.target].append((e.source, e.confidence))
    relevance: dict[str, float] = {s: suspicion[s].score for s in seeds}
    frontier = sorted(seeds)
    for _ in range(config.reduction.max_depth):
        nxt: set[str] = set()
        for n in frontier:
            for m, conf in sorted(nbrs[n]):
                r = relevance[n] * conf * config.reduction.propagation_decay
                if r > relevance.get(m, 0.0) + 1e-12:
                    relevance[m] = round(r, 6)
                    nxt.add(m)
        frontier = sorted(nxt)
        if not frontier:
            break
    kept = {e for e, r in relevance.items() if r >= config.reduction.relevance_threshold or e in seeds}
    selected: list[CandidateEdge] = []
    rejected: list[CandidateEdge] = []
    for e in edges:
        reason = None
        names = {c.name for c in e.components}
        if e.confidence < thr:
            reason = (
                "temporal proximity only"
                if not names - {"temporal_succession", "stage_transition", "anomaly_continuity"}
                else f"confidence {e.confidence:.2f} below the selection threshold {thr:.2f}"
            )
            if "contradiction" in names:
                reason += "; the shared entity has contradicting observations"
        elif e.source not in kept or e.target not in kept:
            reason = "an endpoint is not relevant to any suspicious seed"
        if reason is None:
            selected.append(e.model_copy(update={"selected": True}))
        elif e.source in kept or e.target in kept:
            rejected.append(e.model_copy(update={"selected": False, "rejection_reason": reason}))
    return Reduced(
        seeds=sorted(seeds), relevance=relevance, kept_events=kept, selected=selected, rejected=rejected
    )
