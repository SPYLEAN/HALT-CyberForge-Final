"""Attack-path hypotheses over the reduced event DAG, ranked by configured components.

Paths run from root events (no selected incoming edge) to leaf events (no selected outgoing edge).
Enumeration is
deterministic and bounded (`max_paths`, `max_path_hops`). A seed with no selected edges is a one-event path,
so a
missing link is reported as a gap rather than bridged.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from halt.canonical import sha256_hex
from halt.ps2.attack import TACTIC_INDEX
from halt.ps2.config import ReconstructionConfig
from halt.ps2.reduce import Reduced
from halt.ps2.resolve import Resolution
from halt.ps2.schema import (
    CandidateEdge,
    CanonicalEvent,
    ConfidenceComponent,
    PathHypothesis,
    StageAssignment,
)
from halt.ps2.seeds import CRITICALITY_SCORE, Suspicion

_SHARED_ROLES = ("actor", "session", "token", "token_issued", "src_ip", "device", "application", "process")


def _anomaly(s: Suspicion) -> float:
    return s.anomaly if s.anomaly is not None else s.score


@dataclass(frozen=True)
class Ranked:
    paths: list[PathHypothesis]
    selected: PathHypothesis | None


def _components(
    ids: list[str],
    edges: list[CandidateEdge],
    events: dict[str, CanonicalEvent],
    res: Resolution,
    stages: dict[str, StageAssignment],
    suspicion: dict[str, Suspicion],
    component_seeds: set[str],
    crit: Mapping[str, str],
    config: ReconstructionConfig,
) -> list[ConfidenceComponent]:
    w = config.path_weights
    hops = len(edges)
    exact = set(config.exact_components)

    def c(name: str, value: float, detail: str) -> ConfidenceComponent:
        return ConfidenceComponent(name=name, value=round(value, 6), weight=w[name], detail=detail)

    mean_conf = sum(e.confidence for e in edges) / hops if hops else 0.0
    names = {x.name for e in edges for x in e.components if x.name not in ("contradiction",)}
    continuity = 0.0
    progression = 0.0
    gaps = 0.0
    for e in edges:
        ra, rb = res.roles.get(e.source, {}), res.roles.get(e.target, {})
        if any(ra.get(r) and ra.get(r) in set(rb.values()) for r in _SHARED_ROLES) or (
            rb.get("token") and rb.get("token") == ra.get("token_issued")
        ):
            continuity += 1
        ta, tb = stages[e.source].tactic, stages[e.target].tactic
        progression += 0.5 if ta is None or tb is None else float(TACTIC_INDEX[ta] <= TACTIC_INDEX[tb])
        gaps += min(
            1.0,
            (events[e.target].occurred_at - events[e.source].occurred_at).total_seconds()
            / config.windows_s.edge_max_gap,
        )
    seeds_on = len(set(ids) & component_seeds)
    critical = max(
        (CRITICALITY_SCORE.get(crit.get((events[i].resource or "").lower(), ""), 0.0) for i in ids),
        default=0.0,
    )
    anomaly = sum(_anomaly(suspicion[i]) for i in ids) / len(ids)
    contradicted = sum(any(x.name == "contradiction" for x in e.components) for e in edges)
    unsupported = sum(not ({x.name for x in e.components} & exact) for e in edges)
    return [
        c("mean_edge_confidence", mean_conf, f"mean over {hops} hops"),
        c("evidence_diversity", min(1.0, len(names) / 6), f"{len(names)} distinct evidence kinds"),
        c("entity_continuity", continuity / hops if hops else 0.0, "hops whose events share an entity"),
        c(
            "attack_progression",
            progression / hops if hops else 0.0,
            "hops that do not go backwards in ATT&CK tactic order",
        ),
        c(
            "seed_coverage",
            seeds_on / len(component_seeds) if component_seeds else 0.0,
            f"{seeds_on} of {len(component_seeds)} suspicious seeds in this connected component",
        ),
        c("critical_reach", critical, "highest business criticality of a resource on the path"),
        c("temporal_coherence", 1.0 - gaps / hops if hops else 0.0, "1 − mean hop gap / edge window"),
        c("anomaly", anomaly, "mean HALT-R1 anomaly (rule suspicion where R1 does not apply)"),
        c(
            "contradiction_penalty",
            contradicted / hops if hops else 0.0,
            "hops relying on a contradicted entity",
        ),
        c(
            "unsupported_hop_penalty",
            unsupported / hops if hops else 0.0,
            "hops without an exact-identifier component",
        ),
    ]


def rank(
    reduced: Reduced,
    events: dict[str, CanonicalEvent],
    res: Resolution,
    stages: dict[str, StageAssignment],
    suspicion: dict[str, Suspicion],
    crit: Mapping[str, str],
    config: ReconstructionConfig,
) -> Ranked:
    out_e: dict[str, list[CandidateEdge]] = defaultdict(list)
    has_in: set[str] = set()
    for e in reduced.selected:
        out_e[e.source].append(e)
        has_in.add(e.target)

    def key(i: str) -> tuple[datetime, str]:
        return (events[i].occurred_at, i)

    for k in out_e:
        out_e[k].sort(key=lambda e: key(e.target))
    nodes = sorted(reduced.kept_events, key=key)

    # connected components (undirected) for seed coverage
    parent = {n: n for n in nodes}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for e in reduced.selected:
        a, b = find(e.source), find(e.target)
        if a != b:
            parent[max(a, b)] = min(a, b)
    comp_seeds: dict[str, set[str]] = defaultdict(set)
    for s in reduced.seeds:
        if s in parent:
            comp_seeds[find(s)].add(s)

    raw: list[tuple[list[str], list[CandidateEdge]]] = []
    lim = config.limits
    for root in (n for n in nodes if n not in has_in):
        stack: list[tuple[str, list[str], list[CandidateEdge]]] = [(root, [root], [])]
        while stack and len(raw) < lim.max_paths:
            n, ids, es = stack.pop()
            nxt = out_e.get(n, [])
            if not nxt or len(es) >= lim.max_path_hops:
                raw.append((ids, es))
                continue
            for e in reversed(nxt):  # reversed so the earliest successor is explored first
                stack.append((e.target, [*ids, e.target], [*es, e]))

    scored: list[tuple[float, list[str], list[CandidateEdge], list[ConfidenceComponent]]] = []
    for ids, es in raw:
        comps = _components(ids, es, events, res, stages, suspicion, comp_seeds[find(ids[0])], crit, config)
        penalties = {"contradiction_penalty", "unsupported_hop_penalty"}
        total = sum(c.value * c.weight for c in comps if c.name not in penalties) - sum(
            c.value * c.weight for c in comps if c.name in penalties
        )
        scored.append((round(total, 6), ids, es, comps))
    scored.sort(key=lambda t: (-t[0], -len(t[1]), t[1]))

    paths: list[PathHypothesis] = []
    exact = set(config.exact_components)
    for i, (path_score, ids, es, comps) in enumerate(scored):
        status: Literal["selected", "alternate", "rejected"] = (
            "selected" if i == 0 else ("alternate" if i <= config.alternates else "rejected")
        )
        missing: list[str] = []
        if not es:
            missing.append(f"{ids[0]} has no evidence linking it to any other suspicious event")
        unsupported = [e.edge_id for e in es if not ({c.name for c in e.components} & exact)]
        missing.extend(
            f"{e.edge_id} is inferred from identity and time, not an exact identifier"
            for e in es
            if e.edge_id in unsupported
        )
        paths.append(
            PathHypothesis(
                path_id="path-" + sha256_hex(ids)[:12],
                rank=i + 1,
                status=status,
                event_ids=ids,
                edge_ids=[e.edge_id for e in es],
                score=path_score,
                components=comps,
                root_event_id=ids[0],
                terminal_event_id=ids[-1],
                missing_evidence=missing,
                unsupported_hops=unsupported,
                rejection_reason=None
                if status != "rejected"
                else f"score {path_score:.3f} is below the top {config.alternates + 1}",
            )
        )
    return Ranked(paths=paths, selected=paths[0] if paths else None)
