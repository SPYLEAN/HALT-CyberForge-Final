"""The reconstruction pipeline: canonical events → entities → candidate edges → suspicious graph → ranked
paths
→ stages → story → receipt. Pure and deterministic for the same inputs, organisation context and
configuration.

Ground truth is never imported here (enforced by a test); evaluation lives in halt.ps2.evaluate.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from typing import Any

from halt.canonical import sha256_hex
from halt.ps2 import ENGINE_VERSION
from halt.ps2.attack import assign, attack_flow, candidates
from halt.ps2.config import ReconstructionConfig
from halt.ps2.edges import RULE_VERSION, candidate_edges, edge_id
from halt.ps2.intake.adapters import ADAPTERS
from halt.ps2.intake.intake import Ingestion
from halt.ps2.paths import rank
from halt.ps2.r1_bridge import anomaly_scores
from halt.ps2.reduce import reduce
from halt.ps2.resolve import resolve
from halt.ps2.schema import (
    CANONICAL_SCHEMA,
    AttackStory,
    CandidateEdge,
    CanonicalEvent,
    ConfidenceComponent,
    Entity,
    Hypotheses,
    PathHypothesis,
    ReconstructedGraph,
    ReconstructionReceipt,
    ReconstructionSummary,
    StageAssignment,
    ThreadNode,
    Uncertainty,
)
from halt.ps2.seeds import score
from halt.ps2.story import build, check


@dataclass(frozen=True)
class Reconstruction:
    summary: ReconstructionSummary
    events: list[CanonicalEvent]
    entities: list[Entity]
    candidate_edges: list[CandidateEdge]
    graph: ReconstructedGraph
    paths: list[PathHypothesis]
    hypotheses: Hypotheses
    stages: dict[str, StageAssignment]
    story: AttackStory
    receipt: ReconstructionReceipt
    attack_flow: dict[str, Any]
    root_candidates: list[str]  # distinct root events of the ranked paths, best first


def _forecasts(
    path: PathHypothesis | None,
    events: dict[str, CanonicalEvent],
    ing: Ingestion,
    config: ReconstructionConfig,
) -> list[tuple[CandidateEdge, str]]:
    if path is None:
        return []
    assets = {a.resource.lower(): a for a in ing.context.assets}
    reached = {
        events[i].business_service
        for i in path.event_ids
        if events[i].outcome == "success" and events[i].business_service
    }
    out: dict[str, tuple[CandidateEdge, str]] = {}
    for eid in path.event_ids:
        e = events[eid]
        start = (e.resource or "").lower()
        if start not in assets:
            continue
        queue: deque[tuple[str, int]] = deque([(start, 0)])
        seen = {start}
        while queue:
            res, hops = queue.popleft()
            a = assets[res]
            denied_here = hops == 0 and e.outcome != "success"
            if (
                (hops > 0 or denied_here)
                and a.criticality in config.forecast.criticalities
                and a.business_service not in reached
            ):
                conf = round(config.forecast.hop_confidence ** max(hops, 1), 6)
                target = f"business_service:{a.business_service.lower()}"
                prev = out.get(target)
                if prev is None or conf > prev[0].confidence:
                    detail = (
                        "access was attempted and denied"
                        if denied_here
                        else f"{hops} recorded dependency hop(s) from {start}"
                    )
                    out[target] = (
                        CandidateEdge(
                            edge_id=edge_id(eid, target),
                            edge_type="forecast_reach",
                            source=eid,
                            target=target,
                            first_observed=None,
                            last_observed=None,
                            evidence_event_ids=[eid],
                            evidence_fields=["resource", "organisation_context.depends_on"],
                            confidence=conf,
                            components=[
                                ConfidenceComponent(
                                    name="dependency_reach",
                                    value=conf,
                                    weight=config.forecast.hop_confidence,
                                    detail=detail,
                                )
                            ],
                            classification="forecast",
                            rule_version=RULE_VERSION,
                            selected=False,
                        ),
                        a.business_service,
                    )
            if hops < config.forecast.max_hops:
                for dep in a.depends_on:
                    d = dep.lower()
                    if d in assets and d not in seen:
                        seen.add(d)
                        queue.append((d, hops + 1))
    return [out[k] for k in sorted(out)]


def reconstruct(ing: Ingestion, config: ReconstructionConfig) -> Reconstruction:
    t0 = time.perf_counter()
    raw = ing.events
    by_id = {e.event_id: e for e in raw}
    anomaly = anomaly_scores(raw)
    suspicion = score(raw, ing.context, config, anomaly)
    cloud = {a.resource.lower() for a in ing.context.assets if a.resource_type == "cloud_service"}
    stages: dict[str, StageAssignment] = {}
    events: list[CanonicalEvent] = []
    for e in raw:
        cands = candidates(
            e, suspicion[e.event_id].score >= config.seed.threshold, (e.resource or "").lower() in cloud
        )
        stages[e.event_id] = assign(e, cands)
        events.append(
            e.model_copy(update={"attack_candidates": cands, "anomaly_score": anomaly.get(e.event_id)})
        )
    by_id = {e.event_id: e for e in events}
    res = resolve(events, ing.context)
    cands_e = candidate_edges(events, res, stages, suspicion, config)
    reduced = reduce([e.event_id for e in events], cands_e, suspicion, config)
    for eid in reduced.kept_events:
        if not stages[eid].candidates:
            e = by_id[eid]
            cands = candidates(e, True, (e.resource or "").lower() in cloud)
            stages[eid] = assign(e, cands)
            by_id[eid] = e.model_copy(update={"attack_candidates": cands})
    events = [by_id[e.event_id] for e in events]
    crit = {a.resource.lower(): a.criticality for a in ing.context.assets}
    ranked = rank(reduced, by_id, res, stages, suspicion, crit, config)
    selected = ranked.selected
    edge_map = {e.edge_id: e for e in reduced.selected}

    replay_id = sha256_hex(
        {
            "inputs": sorted(ing.result.input_hashes.values()),
            "context": ing.result.context_sha256,
            "config": config.sha256,
            "engine": ENGINE_VERSION,
        }
    )
    run_id = "run-" + replay_id[:16]

    # ---- graph: relevant events, their entities, context and forecast edges
    kept = sorted(reduced.kept_events, key=lambda i: (by_id[i].occurred_at, i))
    nodes: list[ThreadNode] = [
        ThreadNode(
            node_id=i,
            node_kind="event",
            label=by_id[i].action,
            event_kind=by_id[i].event_kind,
            occurred_at=by_id[i].occurred_at,
            suspicion=suspicion[i].score,
            seed=i in reduced.seeds,
            tactic=stages[i].tactic,
        )
        for i in kept
    ]
    entity_edges: list[CandidateEdge] = []
    used_entities: set[str] = set()
    for i in kept:
        for role, ent in sorted(res.roles.get(i, {}).items()):
            used_entities.add(ent)
            entity_edges.append(
                CandidateEdge(
                    edge_id=edge_id(i, f"{role}:{ent}"),
                    edge_type=f"involves:{role}",
                    source=i,
                    target=ent,
                    first_observed=by_id[i].occurred_at,
                    last_observed=by_id[i].occurred_at,
                    evidence_event_ids=[i],
                    evidence_fields=[role],
                    confidence=res.entities[ent].confidence,
                    components=[
                        ConfidenceComponent(
                            name="field_present",
                            value=1.0,
                            weight=1.0,
                            detail=f"{role} recorded in the event",
                        )
                    ],
                    classification="context" if ent.startswith("business_service:") else "observed",
                    rule_version=RULE_VERSION,
                    selected=True,
                )
            )
    for ent in sorted(used_entities):
        x = res.entities[ent]
        nodes.append(
            ThreadNode(
                node_id=ent,
                node_kind="business_service" if x.entity_type == "business_service" else "entity",
                label=x.label,
                entity_type=x.entity_type,
            )
        )
    forecasts = _forecasts(selected, by_id, ing, config)
    for f, service in forecasts:
        if f.target not in used_entities:
            used_entities.add(f.target)
            nodes.append(
                ThreadNode(
                    node_id=f.target,
                    node_kind="business_service",
                    label=service,
                    entity_type="business_service",
                )
            )
    graph_edges = sorted([*reduced.selected, *entity_edges], key=lambda e: e.edge_id)
    graph_hash = sha256_hex(
        {
            "nodes": [n.model_dump(mode="json") for n in sorted(nodes, key=lambda n: n.node_id)],
            "edges": [e.model_dump(mode="json") for e in graph_edges],
            "forecast": [f.model_dump(mode="json") for f, _ in forecasts],
        }
    )
    graph = ReconstructedGraph(
        run_id=run_id,
        nodes=sorted(nodes, key=lambda n: n.node_id),
        edges=graph_edges,
        forecast_edges=[f for f, _ in forecasts],
        graph_hash=graph_hash,
    )

    # ---- gaps, story
    on_path = set(selected.event_ids) if selected else set()
    gaps: list[tuple[str, list[str]]] = []
    if selected:
        gaps.append(
            (
                f"No earlier event in this batch is linked to {selected.root_event_id} by sufficient "
                "evidence; "
                "it is treated as the root cause.",
                [selected.root_event_id],
            )
        )
    for s in reduced.seeds:
        if s not in on_path:
            why = ", ".join(suspicion[s].rules) or "HALT-R1 model score"
            gaps.append(
                (
                    f"Suspicious event {s} ({why}) is not linked to the selected path "
                    "by sufficient evidence.",
                    [s],
                )
            )
    statements = build(run_id, selected, by_id, edge_map, stages, forecasts, gaps)
    story = check(
        run_id, statements, by_id, {**edge_map, **{f.edge_id: f for f, _ in forecasts}}, stages, ing.context
    )

    # ---- hypotheses, uncertainty, receipt
    alternates = [p for p in ranked.paths if p.status == "alternate"]
    rejected_paths = [p for p in ranked.paths if p.status == "rejected"]
    hops = [edge_map[x] for x in selected.edge_ids] if selected else []
    uncertainty = Uncertainty(
        score_margin=round(selected.score - alternates[0].score, 6) if selected and alternates else 0.0,
        min_edge_confidence=min((e.confidence for e in hops), default=0.0),
        inferred_hops=sum(e.classification == "inferred" for e in hops),
        coverage_gaps=[g for g, _ in gaps],
    )
    affected = sorted({svc for i in on_path if (svc := by_id[i].business_service)})
    elapsed = round((time.perf_counter() - t0) * 1000, 3)
    receipt = ReconstructionReceipt(
        receipt_id="rcpt-" + sha256_hex([run_id, graph_hash])[:16],
        run_id=run_id,
        replay_id=replay_id,
        engine_version=ENGINE_VERSION,
        canonical_schema=CANONICAL_SCHEMA,
        config_sha256=config.sha256,
        adapter_versions={a.adapter_id: a.version for a in ADAPTERS.values()},
        input_hashes=ing.result.input_hashes,
        context_sha256=ing.result.context_sha256,
        graph_hash=graph_hash,
        selected_path_id=selected.path_id if selected else None,
        selected_event_ids=selected.event_ids if selected else [],
        alternate_path_ids=[p.path_id for p in alternates],
        evidence_coverage=round(sum(e.classification == "observed" for e in hops) / len(hops), 6)
        if hops
        else 0.0,
        story_citation_coverage=round(
            sum(bool(s.event_ids) for s in story.statements) / len(story.statements), 6
        )
        if story.statements
        else 0.0,
        uncertainty=uncertainty,
        processing_ms=elapsed,
    )
    roots: list[str] = []
    for p in ranked.paths:
        if p.root_event_id not in roots:
            roots.append(p.root_event_id)
    summary = ReconstructionSummary(
        run_id=run_id,
        batch_id=ing.result.batch_id,
        dataset_id=ing.result.dataset_id,
        replay_id=replay_id,
        graph_hash=graph_hash,
        event_count=len(events),
        entity_count=len(res.entities),
        candidate_edges=len(cands_e),
        selected_edges=len(reduced.selected),
        seeds=len(reduced.seeds),
        selected_path_id=selected.path_id if selected else None,
        root_event_id=selected.root_event_id if selected else None,
        affected_services=affected,
        processing_ms=elapsed,
    )
    return Reconstruction(
        summary=summary,
        events=events,
        entities=list(res.entities.values()),
        candidate_edges=cands_e,
        graph=graph,
        paths=ranked.paths,
        hypotheses=Hypotheses(
            run_id=run_id,
            alternates=alternates,
            rejected_paths=rejected_paths,
            rejected_edges=reduced.rejected,
        ),
        stages=stages,
        story=story,
        receipt=receipt,
        attack_flow=attack_flow(
            run_id,
            f"Reconstructed path {selected.path_id if selected else '—'}",
            selected.event_ids if selected else [],
            stages,
        ),
        root_candidates=roots,
    )
