"""PS2 reconstruction: resolution, edge evidence, reduction, ranked paths, story citations, determinism,
input-order invariance and the separation of ground truth from inference."""

from __future__ import annotations

import ast
import json
import random
import subprocess
import sys
from pathlib import Path

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from halt.ps2.attack import validate_flow_shape
from halt.ps2.config import load_config
from halt.ps2.datasets import load_dataset
from halt.ps2.edges import candidate_edges
from halt.ps2.engine import Reconstruction, reconstruct
from halt.ps2.reduce import reduce
from halt.ps2.resolve import resolve
from halt.ps2.schema import RawFile
from halt.ps2.seeds import Suspicion
from tests.ps2_support import CONTEXT, api_file, api_record, dataset_run, ingest_dataset, ingest_files

PS2 = Path(__file__).resolve().parents[1] / "halt" / "ps2"


def _edges(records: list[dict[str, object]]):  # type: ignore[no-untyped-def]
    ing = ingest_files([api_file(records)])
    res = resolve(ing.events, CONTEXT)
    sus = {e.event_id: Suspicion(0.0) for e in ing.events}
    return ing, res, candidate_edges(ing.events, res, {}, sus, load_config())


# --- resolution ---------------------------------------------------------------------------------------


def test_aliases_are_recorded_not_merged() -> None:
    ing = ingest_dataset("scenario-a")
    res = resolve(ing.events, ing.context)
    with_alias = [e for e in res.entities.values() if e.aliases]
    assert with_alias, "co-observed identifiers should be recorded as aliases"
    for ent in with_alias:
        assert ent.confidence < 1.0 and "co-observed-alias" in ent.method
        assert all(a.event_ids for a in ent.aliases)


def test_contradictions_lower_confidence_and_penalise_edges() -> None:
    recs = [
        api_record("r1", "2026-10-29T09:00:00Z", "a@org.example", "shared", "10.0.0.5"),
        api_record("r2", "2026-10-29T09:01:00Z", "b@org.example", "shared", "10.0.0.6"),
    ]
    ing, res, edges = _edges(recs)
    session = res.entities["session:shared"]
    assert session.contradictions and session.confidence == 0.6
    assert session.contradictions[0].values == ["a@org.example", "b@org.example"]
    (edge,) = [e for e in edges if any(c.name == "shared_session" for c in e.components)]
    assert any(c.name == "contradiction" for c in edge.components)
    clean_ing, _, clean = _edges([recs[0], {**recs[1], "UserId": "a@org.example", "ClientIP": "10.0.0.6"}])
    (clean_edge,) = [e for e in clean if any(c.name == "shared_session" for c in e.components)]
    assert edge.confidence < clean_edge.confidence


# --- edges --------------------------------------------------------------------------------------------


def test_temporal_proximity_alone_is_low_confidence() -> None:
    cfg = load_config()
    _, _, edges = _edges(
        [
            api_record("r1", "2026-10-29T09:00:00Z", "u@org.example", "s1", "10.0.0.5"),
            api_record("r2", "2026-10-29T09:00:30Z", "u@org.example", "s2", "10.0.0.9"),
        ]
    )
    (edge,) = edges
    names = {c.name for c in edge.components}
    assert names <= {"temporal_succession", "stage_transition", "anomaly_continuity"}
    assert edge.confidence <= cfg.temporal_only_cap < cfg.edge_select_threshold
    red = reduce(
        [e for e in (edge.source, edge.target)],
        edges,
        {edge.source: Suspicion(1.0), edge.target: Suspicion(1.0)},
        cfg,
    )
    assert not red.selected and red.rejected[0].rejection_reason == "temporal proximity only"


def test_shared_session_is_observed_and_strong() -> None:
    cfg = load_config()
    _, _, edges = _edges(
        [
            api_record("r1", "2026-10-29T09:00:00Z", "u@org.example", "s1", "10.0.0.5"),
            api_record("r2", "2026-10-29T09:20:00Z", "u@org.example", "s1", "10.0.0.9"),
        ]
    )
    (edge,) = edges
    assert edge.classification == "observed"
    assert edge.confidence >= cfg.edge_weights["shared_session"] >= cfg.edge_select_threshold
    assert "session" in edge.evidence_fields and edge.evidence_event_ids == [edge.source, edge.target]


def test_identity_and_ip_is_inferred_and_decays() -> None:
    near = _edges(
        [
            api_record("r1", "2026-10-29T09:00:00Z", "u@org.example", "s1", "10.0.0.5"),
            api_record("r2", "2026-10-29T09:01:00Z", "u@org.example", "s2", "10.0.0.5"),
        ]
    )[2][0]
    far = _edges(
        [
            api_record("r1", "2026-10-29T09:00:00Z", "u@org.example", "s1", "10.0.0.5"),
            api_record("r2", "2026-10-29T09:14:00Z", "u@org.example", "s2", "10.0.0.5"),
        ]
    )[2][0]
    assert near.classification == far.classification == "inferred"
    ip = {c.name: c.value for c in near.components}["identity_ip"]
    ip_far = {c.name: c.value for c in far.components}["identity_ip"]
    assert ip_far < ip


def test_token_lineage_links_minting_to_use() -> None:
    _, rec = dataset_run("scenario-b")
    lineage = [e for e in rec.candidate_edges if any(c.name == "token_lineage" for c in e.components)]
    assert lineage and all(e.classification == "observed" for e in lineage)


def test_event_graph_is_acyclic_by_construction() -> None:
    _, rec = dataset_run("scenario-a")
    t = {e.event_id: (e.occurred_at, e.event_id) for e in rec.events}
    assert all(t[e.source] < t[e.target] for e in rec.candidate_edges)


# --- reduction, paths, alternates ---------------------------------------------------------------------


def test_reduction_keeps_rejected_hypotheses_with_reasons() -> None:
    _, rec = dataset_run("scenario-a")
    assert rec.hypotheses.rejected_edges
    assert all(e.rejection_reason for e in rec.hypotheses.rejected_edges)
    assert any(e.rejection_reason == "temporal proximity only" for e in rec.hypotheses.rejected_edges)
    assert len(rec.graph.edges) < len(rec.candidate_edges)


def test_selected_path_and_alternates() -> None:
    _, rec = dataset_run("scenario-a")
    selected = [p for p in rec.paths if p.status == "selected"]
    assert len(selected) == 1
    assert 1 <= len(rec.hypotheses.alternates) <= load_config().alternates
    assert all(a.score <= selected[0].score for a in rec.hypotheses.alternates)
    assert rec.receipt.selected_path_id == selected[0].path_id
    assert rec.receipt.alternate_path_ids == [a.path_id for a in rec.hypotheses.alternates]


def test_missing_evidence_is_surfaced() -> None:
    # Remove the sign-in log: the mail → consent chain loses its authentication link.
    ds = load_dataset("scenario-a")
    files = [f for f in ds.files if f.filename != "idp_signin.jsonl"]
    rec = reconstruct(ingest_dataset("scenario-a", files), load_config())
    missing = [s for s in rec.story.statements if s.section == "missing_evidence"]
    assert missing, "a gap in the evidence must be stated, not papered over"
    assert rec.story.unsupported_claims == 0


def test_two_scenarios_produce_different_graphs() -> None:
    _, a = dataset_run("scenario-a")
    _, b = dataset_run("scenario-b")
    assert a.summary.graph_hash != b.summary.graph_hash

    def kinds(r: Reconstruction) -> list[str]:
        by_id = {e.event_id: e for e in r.events}
        return [by_id[i].event_kind for i in r.receipt.selected_event_ids]

    def tactics(r: Reconstruction) -> set[str]:
        return {r.stages[i].tactic for i in r.receipt.selected_event_ids if i in r.stages}

    assert kinds(a) != kinds(b)
    assert a.summary.affected_services != b.summary.affected_services
    assert tactics(a) != tactics(b)


# --- story, ATT&CK, Attack Flow -----------------------------------------------------------------------


def test_every_story_statement_cites_evidence() -> None:
    for ds in ("scenario-a", "scenario-b"):
        _, rec = dataset_run(ds)
        assert rec.story.unsupported_claims == 0
        assert rec.story.checked_statements == len(rec.story.statements) > 0
        for s in rec.story.statements:
            assert s.event_ids or s.section == "missing_evidence"
            assert 0 <= s.confidence <= 1 and s.status
            for value in s.facts.values():
                assert value in s.text
        edge_ids = {e.edge_id for e in rec.candidate_edges} | {e.edge_id for e in rec.graph.forecast_edges}
        assert all(eid in edge_ids for s in rec.story.statements for eid in s.edge_ids)


def test_story_checker_catches_a_tampered_claim() -> None:
    from halt.ps2 import story

    _, rec = dataset_run("scenario-a")
    by_id = {e.event_id: e for e in rec.events}
    edges = {e.edge_id: e for e in rec.candidate_edges} | {e.edge_id: e for e in rec.graph.forecast_edges}
    s0 = rec.story.statements[0]
    tampered = s0.model_copy(update={"text": s0.text.replace(next(iter(s0.facts.values())), "someone-else")})
    checked = story.check(
        rec.story.run_id,
        [tampered, *rec.story.statements[1:]],
        by_id,
        edges,
        rec.stages,
        ingest_dataset("scenario-a").context,
    )
    assert checked.unsupported_claims == 1


def test_attack_mapping_basis_and_flow_export() -> None:
    _, rec = dataset_run("scenario-a")
    bases = {c.basis for s in rec.stages.values() for c in s.candidates}
    assert bases <= {"observed", "rule_inferred", "uncertain"}
    assert validate_flow_shape(rec.attack_flow) == []
    blob = json.dumps(rec.attack_flow)
    assert "complete" not in blob.lower() or "x_halt_conformance" in blob


# --- determinism, order invariance, ground-truth isolation --------------------------------------------


def test_reconstruction_is_deterministic() -> None:
    cfg = load_config()
    a = reconstruct(ingest_dataset("scenario-b"), cfg)
    b = reconstruct(ingest_dataset("scenario-b"), cfg)
    assert a.summary.replay_id == b.summary.replay_id
    assert a.summary.graph_hash == b.summary.graph_hash
    assert a.story == b.story
    assert a.receipt.model_dump(exclude={"processing_ms"}) == b.receipt.model_dump(exclude={"processing_ms"})


def _shuffle(f: RawFile, rnd: random.Random) -> RawFile:
    if f.content_type == "text/csv":
        header, *rows = f.content.splitlines()
        rnd.shuffle(rows)
        content = "\n".join([header, *rows]) + "\n"
    elif f.content_type == "application/json":
        doc = json.loads(f.content)
        for v in doc.values() if isinstance(doc, dict) else []:
            if isinstance(v, list):
                rnd.shuffle(v)
        content = json.dumps(doc)
    else:
        lines = f.content.splitlines()
        rnd.shuffle(lines)
        content = "\n".join(lines) + "\n"
    return f.model_copy(update={"content": content})


def _fingerprint(dataset_id: str, files: list[RawFile]) -> tuple[object, ...]:
    rec = reconstruct(ingest_dataset(dataset_id, files), load_config())
    return (
        sorted(e.event_id for e in rec.events),
        rec.receipt.selected_event_ids,
        sorted((e.edge_id, e.confidence) for e in rec.candidate_edges),
        sorted(e.edge_id for e in rec.graph.edges),
        [s.text for s in rec.story.statements],
        rec.summary.affected_services,
    )


@settings(max_examples=6, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    seed=st.integers(min_value=0, max_value=2**32 - 1),
    dataset_id=st.sampled_from(["scenario-a", "scenario-b"]),
)
def test_input_order_does_not_change_reconstruction(seed: int, dataset_id: str) -> None:
    rnd = random.Random(seed)
    files = load_dataset(dataset_id).files
    shuffled = [_shuffle(f, rnd) for f in files]
    rnd.shuffle(shuffled)
    assert _fingerprint(dataset_id, shuffled) == _fingerprint(dataset_id, files)


ENGINE_MODULES = [
    "engine.py",
    "edges.py",
    "reduce.py",
    "paths.py",
    "resolve.py",
    "seeds.py",
    "story.py",
    "attack.py",
    "r1_bridge.py",
    "datasets.py",
    "config.py",
    "schema.py",
    "intake/intake.py",
    "intake/adapters.py",
    "intake/parse.py",
    "intake/redact.py",
]


def _code_strings(tree: ast.Module, names: bool = True) -> list[str]:
    """String constants (and, with `names`, identifiers) that the code uses; docstrings are excluded."""
    docstrings = {
        id(n.body[0].value)
        for n in ast.walk(tree)
        if isinstance(n, ast.Module | ast.ClassDef | ast.FunctionDef)
        and n.body
        and isinstance(n.body[0], ast.Expr)
        and isinstance(n.body[0].value, ast.Constant)
    }
    out: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
            out.append(node.value)
        elif names and isinstance(node, ast.Name):
            out.append(node.id)
        elif names and isinstance(node, ast.Attribute):
            out.append(node.attr)
    return out


def test_inference_modules_never_reference_ground_truth() -> None:
    for rel in ENGINE_MODULES:
        tree = ast.parse((PS2 / rel).read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or "").startswith(("halt.ps2.evaluate", "halt.ps2.foundry")), rel
            if isinstance(node, ast.Import):
                assert not any(
                    a.name.startswith(("halt.ps2.evaluate", "halt.ps2.foundry")) for a in node.names
                ), rel
        # No path or key literal that could locate ground truth (the report schema may name its hash field).
        assert not any("truth" in v.lower() for v in _code_strings(tree, names=False)), rel
    assert not list((PS2 / "datasets").rglob("*truth*"))


def test_engine_has_no_scenario_specific_conditionals() -> None:
    forbidden = (
        "scenario-a",
        "scenario-b",
        "contoso",
        "northwind",
        "m.verma",
        "docusync",
        "203.0.113",
        "2417",
    )
    for rel in ENGINE_MODULES:
        values = [v.lower() for v in _code_strings(ast.parse((PS2 / rel).read_text(encoding="utf-8")))]
        for word in forbidden:
            assert not any(word in v for v in values), f"{rel} uses {word}"


def test_foundry_output_matches_committed_datasets() -> None:
    out = subprocess.run(
        [sys.executable, "-m", "halt.ps2.foundry", "--check"],
        capture_output=True,
        text=True,
        check=False,
        cwd=PS2.parents[1],
    )
    assert out.returncode == 0, out.stdout + out.stderr
