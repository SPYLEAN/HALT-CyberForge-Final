"""Evaluation against ground truth. The only PS2 module that reads halt/ps2/ground_truth.

Every value in a `measured` metric is computed here from an actual run. Targets come from
docs/PS2_EVALUATION_AND_ACCEPTANCE.md and are stored only in `target`, never in `value`.

    python -m halt.ps2.evaluate   # writes services/api/reports/ps2_eval.json
"""

from __future__ import annotations

import json
import statistics
import time
from pathlib import Path
from typing import Any

from halt.canonical import sha256_hex
from halt.ps2.config import ReconstructionConfig, load_config
from halt.ps2.datasets import load_dataset
from halt.ps2.engine import Reconstruction, reconstruct
from halt.ps2.foundry import scenario_a, scenario_b
from halt.ps2.intake.intake import Ingestion, ingest
from halt.ps2.schema import EvaluationReport, MetricResult, OrgContext, RawFile

GROUND_TRUTH_DIR = Path(__file__).resolve().parent / "ground_truth"
REPORT_PATH = Path(__file__).resolve().parents[2] / "reports" / "ps2_eval.json"
TARGETS = {
    "relevant_event_recall": 0.90,
    "edge_precision": 0.85,
    "false_link_rate": 0.05,
    "stage_mapping_accuracy": 0.85,
    "root_cause_top3": 0.90,
    "evidence_coverage": 1.0,
    "unsupported_story_claims": 0.0,
    "deterministic_replay": 1.0,
    "reconstruction_latency_ms": 3000.0,
}
LOWER_IS_BETTER = {"false_link_rate", "unsupported_story_claims", "reconstruction_latency_ms"}
GENERATORS = {"scenario-a": scenario_a, "scenario-b": scenario_b}


def load_truth(dataset_id: str) -> dict[str, Any]:
    truth: dict[str, Any] = json.loads((GROUND_TRUTH_DIR / f"{dataset_id}.json").read_text(encoding="utf-8"))
    return truth


def _metric(
    name: str, num: int | None, den: int | None, value: float | None = None, note: str = ""
) -> MetricResult:
    if value is None and (den is None or den == 0):
        return MetricResult(
            name=name,
            status="unavailable",
            value=None,
            numerator=num,
            denominator=den,
            target=TARGETS.get(name),
            note=note or "no denominator",
        )
    v = round(value if value is not None else (num or 0) / (den or 1), 6)
    target = TARGETS.get(name)
    met = None if target is None else (v <= target if name in LOWER_IS_BETTER else v >= target)
    return MetricResult(
        name=name,
        status="measured",
        value=v,
        numerator=num,
        denominator=den,
        target=target,
        target_met=met,
        note=note,
    )


def record_map(ing: Ingestion) -> dict[str, str]:
    """ground-truth record key ("file#record_id") → canonical event id."""
    return {
        f"{r.source_name}#{r.source_record_id}": r.event_id
        for f in ing.result.files
        for r in f.records
        if r.event_id
    }


def score_run(rec: Reconstruction, ing: Ingestion, truth: dict[str, Any]) -> dict[str, MetricResult]:
    ids = record_map(ing)
    gt_events = {ids[k] for k in truth["relevant_records"] if k in ids}
    gt_path = [ids[k] for k in truth["path"] if k in ids]
    valid = {(ids[a], ids[b]) for a, b in truth["valid_edges"] if a in ids and b in ids}
    chain = {(ids[a], ids[b]) for a, b in truth["chain_edges"] if a in ids and b in ids}
    kept = {n.node_id for n in rec.graph.nodes if n.node_kind == "event"}
    causal = [e for e in rec.graph.edges if e.edge_type.split(":")[0] != "involves"]
    pairs = {(e.source, e.target) for e in causal}
    path = rec.paths[0].event_ids if rec.paths else []
    gt_stage = {ids[k]: t for k, t in truth["stages"].items() if k in ids}
    on_path = [e for e in path if e in gt_stage]
    stage_hits = sum(rec.stages[e].tactic == gt_stage[e] for e in on_path)
    root = ids.get(truth["root_cause"])
    correct = len(pairs & valid)
    return {
        "relevant_event_precision": _metric("relevant_event_precision", len(kept & gt_events), len(kept)),
        "relevant_event_recall": _metric("relevant_event_recall", len(kept & gt_events), len(gt_events)),
        "edge_precision": _metric(
            "edge_precision",
            correct,
            len(pairs),
            note="a selected causal edge is correct if both events are attack steps sharing an attacker "
            "artefact",
        ),
        "false_link_rate": _metric("false_link_rate", len(pairs) - correct, len(pairs)),
        "edge_recall": _metric(
            "edge_recall",
            len(pairs & chain),
            len(chain),
            note="consecutive ground-truth steps recovered as a selected edge",
        ),
        "path_node_precision": _metric("path_node_precision", len(set(path) & set(gt_path)), len(path)),
        "path_node_recall": _metric("path_node_recall", len(set(path) & set(gt_path)), len(gt_path)),
        "stage_mapping_accuracy": _metric(
            "stage_mapping_accuracy",
            stage_hits,
            len(on_path),
            note="primary tactic vs ground truth for attack steps on the selected path",
        ),
        "root_cause_top3": _metric("root_cause_top3", int(root in rec.root_candidates[:3]), 1),
        "evidence_coverage": _metric(
            "evidence_coverage",
            sum(bool(e.evidence_event_ids and e.evidence_fields) for e in causal),
            len(causal),
            note="selected causal edges carrying evidence events and fields",
        ),
        "unsupported_story_claims": _metric(
            "unsupported_story_claims", rec.story.unsupported_claims, rec.story.checked_statements
        ),
    }


def run(
    files: list[RawFile], context: OrgContext, captured: Any, dataset_id: str, config: ReconstructionConfig
) -> tuple[Ingestion, Reconstruction, float]:
    t0 = time.perf_counter()
    ing = ingest(files, context, config=config, ingested_at=captured, dataset_id=dataset_id)
    rec = reconstruct(ing, config)
    return ing, rec, (time.perf_counter() - t0) * 1000


def evaluate_dataset(
    dataset_id: str, config: ReconstructionConfig | None = None, repeats: int = 3
) -> EvaluationReport:
    config = config or load_config()
    d = load_dataset(dataset_id)
    truth = load_truth(dataset_id)
    runs = [run(d.files, d.context, d.captured_at, dataset_id, config) for _ in range(repeats)]
    ing, rec, _ = runs[0]
    m = score_run(rec, ing, truth)
    fingerprints = {
        sha256_hex(
            [r.graph.graph_hash, r.story.model_dump(mode="json"), r.paths[0].event_ids if r.paths else []]
        )
        for _, r, _ in runs
    }
    m["deterministic_replay"] = _metric(
        "deterministic_replay",
        1 if len(fingerprints) == 1 else 0,
        1,
        note=f"{repeats} runs: identical graph hash, story and selected path",
    )
    latencies = [ms for _, _, ms in runs]
    m["reconstruction_latency_ms"] = _metric(
        "reconstruction_latency_ms",
        None,
        None,
        value=statistics.median(latencies),
        note=f"median of {repeats} runs, ingest + reconstruct, on the machine that ran the evaluation",
    )
    return EvaluationReport(
        dataset_id=dataset_id,
        ground_truth_sha256=sha256_hex(truth),
        replay_id=rec.receipt.replay_id,
        metrics=list(m.values()),
    )


def variant_root_cause(config: ReconstructionConfig, seeds: int = 5) -> MetricResult:
    """Root-cause Top-3 over seeded noise variants of both scenarios (generated in memory, never tuned on)."""
    hits = total = 0
    for dataset_id, module in GENERATORS.items():
        base = load_dataset(dataset_id)
        manifest_files = {f.filename: f for f in base.files}
        for offset in range(1, seeds + 1):
            files, context, truth = module.generate(base.seed + offset)
            raw = [
                RawFile(
                    filename=n,
                    adapter=manifest_files[n].adapter,
                    content_type=manifest_files[n].content_type,
                    content=text,
                )
                for n, text in sorted(files.items())
            ]
            ing, rec, _ = run(
                raw, OrgContext.model_validate(context), base.captured_at, f"{dataset_id}+{offset}", config
            )
            ids = record_map(ing)
            hits += int(ids.get(truth["root_cause"]) in rec.root_candidates[:3])
            total += 1
    return _metric("root_cause_top3", hits, total, note=f"{seeds} seeded noise variants per scenario")


def main() -> int:
    config = load_config()
    reports = {d: evaluate_dataset(d, config).model_dump(mode="json") for d in ("scenario-a", "scenario-b")}
    variants = variant_root_cause(config).model_dump(mode="json")
    out = {
        "generated_by": "python -m halt.ps2.evaluate",
        "config_sha256": config.sha256,
        "note": (
            "Synthetic-on-synthetic results: they measure pipeline correctness against the generator's "
            "ground "
            "truth, not real-world detection efficacy. Targets are development targets."
        ),
        "datasets": reports,
        "variants": {"root_cause_top3": variants},
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {REPORT_PATH}")
    for d, r in reports.items():
        for x in r["metrics"]:
            print(
                f"{d:11s} {x['name']:28s} {x['status']:11s} {x['value']}  "
                f"({x['numerator']}/{x['denominator']})  target={x['target']} met={x['target_met']}"
            )
    print(
        f"variants    root_cause_top3 {variants['value']} ({variants['numerator']}/{variants['denominator']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
