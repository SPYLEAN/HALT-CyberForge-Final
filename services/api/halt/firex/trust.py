"""Dataset health and the Trust Centre: read-only verdicts derived from a run's stored files.

Four questions stay separate: is this the right file, was it processed completely, can its story be relied
on, and is it known
to be correct? `Verified` on the first two never means an incident is true. Nothing here changes a run, and
nothing here detects
anything: it reads the results that the engine and receipts already recorded.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from halt.firex.contracts import (
    DatasetHealth,
    FactsResponse,
    IncidentProofStatus,
    QualityCase,
    QualitySegment,
    RecordedFact,
    TrustDimension,
    TrustItem,
    TrustReport,
)
from halt.firex.jobs import RunError, list_runs, run_dir
from halt.firex.receipts import verify_seal
from halt.firex.util import read_json

# At or above this share of valid records in one collapsed timestamp, the source has no usable time axis.
WITHHOLD_COLLAPSED_FRACTION = 0.99
GROUND_TRUTH_NOTE = "Organiser ground truth was not provided, so accuracy has not been measured."


def _optional(path: Path) -> Any:
    return read_json(path) if path.is_file() else None


def _gb(value: int) -> str:
    return f"{value / 1e9:.2f} GB"


def _count(value: int | None) -> str:
    return "Not measured" if value is None else f"{value:,}"


def _reconstruction_state(state: dict[str, Any], quality: dict[str, Any] | None) -> tuple[str, str]:
    if state["status"] != "completed" or not quality:
        return "not_run", "This run has not completed, so reconstruction has no result to report."
    valid = quality["records_valid"]
    collapsed = quality["records_in_collapsed_timestamps"]
    if valid and collapsed / valid >= WITHHOLD_COLLAPSED_FRACTION:
        return (
            "withheld",
            f"{collapsed:,} of {valid:,} valid records share one timestamp, so this source has no "
            "trustworthy time axis. "
            "HALT will not present a temporal attack story from it. Rules that need a duration or rate had "
            "no usable records, "
            "and rules that group by entity found no candidate.",
        )
    if collapsed:
        return (
            "ran",
            f"Reconstruction ran. {collapsed:,} of {valid:,} valid records share one timestamp, so they "
            "could not support any "
            "rule that needs a duration or rate.",
        )
    return "ran", "Reconstruction ran on a usable time axis."


def _incident_links(folder: Path, index: list[dict[str, Any]]) -> dict[str, Any]:
    observed = inferred = missing = 0
    coverages: list[float] = []
    proofs: list[IncidentProofStatus] = []
    for summary in index:
        incident = folder / "incidents" / summary["incident_id"]
        graph = read_json(incident / "graph.json")
        for edge in graph["edges"]:
            if edge["classification"] == "observed":
                observed += 1
            elif edge["classification"] == "inferred":
                inferred += 1
            if edge["missing_evidence"]:
                missing += 1
        proof = read_json(incident / "proof.json")
        coverages.append(proof["evidence_coverage"])
        proofs.append(
            IncidentProofStatus(
                incident_id=summary["incident_id"],
                title=summary["title"],
                seal_valid=verify_seal(proof).valid,
                graph_hash=proof["graph_hash"],
                evidence_coverage=proof["evidence_coverage"],
                unsupported_claims=proof["unsupported_claims"],
            )
        )
    return {
        "observed": observed,
        "inferred": inferred,
        "missing": missing,
        "coverage": round(sum(coverages) / len(coverages), 4) if coverages else None,
        "proofs": proofs,
    }


def build_health(
    run_id: str, root: Path | None = None
) -> tuple[DatasetHealth, list[IncidentProofStatus], dict[str, Any]]:
    from halt.firex.jobs import read_state

    state = read_state(run_id, root)
    folder = run_dir(run_id, root)
    quality = _optional(folder / "quality.json")
    receipt = _optional(folder / "benchmark_receipt.json")
    plan = _optional(folder / "plan.json")
    index = _optional(folder / "incidents" / "index.json") or []
    reconstruction: Any
    reconstruction, reason = _reconstruction_state(state, quality)
    links = _incident_links(folder, index)
    seal_ok = verify_seal(receipt).valid if receipt else False
    is_sample = bool(state.get("max_bytes"))

    # Source integrity
    source_status: Any
    processing_status: Any
    reconstruction_status: Any
    overall: Any
    if not plan:
        source_status = "Not measured"
        source_verdict = "The source has not been read yet."
    elif plan["source_sha256_verified"]:
        source_status = "Verified"
        source_verdict = "This is the expected file: its whole-file hash matches."
    else:
        source_status = "Not measured"
        source_verdict = "This run read a sample, so the whole-file hash was not checked."
    source_items = [TrustItem(label="Filename", value=plan["filename"] if plan else "Not measured")]
    if plan:
        source_items += [
            TrustItem(label="Source size", value=f"{plan['source_size']:,} bytes"),
            TrustItem(label="Source hash", value=plan["source_sha256"], is_hash=True),
            TrustItem(label="Hash verification", value=source_status, status=source_status),
        ]
    if quality:
        conflict = quality["timezone_conflict"]
        collapsed = quality["records_in_collapsed_timestamps"]
        source_items += [
            TrustItem(label="Valid bytes", value=f"{quality['bytes_valid']:,}"),
            TrustItem(label="Quarantined bytes", value=f"{quality['bytes_quarantined']:,}"),
            TrustItem(
                label="Reject reasons",
                value=", ".join(f"{k}: {v:,}" for k, v in quality["reject_reasons"].items()) or "None",
            ),
            TrustItem(
                label="Timestamp quality",
                value=f"{collapsed:,} records in a collapsed timestamp"
                if collapsed
                else "No collapsed timestamp",
                status="Needs review" if collapsed else "Verified",
            ),
            TrustItem(
                label="Time-zone conflict",
                value=f"{conflict['affected_records']:,} records. {conflict['interpretation']}"
                if conflict
                else "None",
                status="Needs review" if conflict else "Verified",
            ),
        ]

    # Processing integrity
    if state["status"] == "failed":
        processing_status, processing_verdict = "Failed", "The run failed before it finished."
    elif state["status"] != "completed":
        processing_status, processing_verdict = "Not measured", "The run has not finished."
    elif not quality or not quality["bytes_accounted"] or not seal_ok:
        processing_status = "Failed"
        processing_verdict = (
            "A completed run must account for every byte and carry a valid seal. This one does not."
        )
    else:
        processing_status = "Verified"
        processing_verdict = "Every byte is accounted for and the benchmark receipt's seal is valid."
    processing_items = [
        TrustItem(label="Parser version", value=(plan or {}).get("parser_version", "Not measured")),
        TrustItem(label="Engine version", value=(plan or {}).get("engine_version", "Not measured")),
        TrustItem(
            label="Git commit", value=(receipt or {}).get("git_commit") or "Not measured", is_hash=True
        ),
        TrustItem(
            label="Bytes accounted for",
            value="Yes" if quality and quality["bytes_accounted"] else "Not measured",
            status="Verified" if quality and quality["bytes_accounted"] else "Not measured",
        ),
        TrustItem(label="Records parsed", value=_count(quality["records_valid"] if quality else None)),
        TrustItem(
            label="Exact duplicates removed", value=_count(quality["exact_duplicates"] if quality else None)
        ),
        TrustItem(label="Duration", value=f"{receipt['duration_s']} s" if receipt else "Not measured"),
        TrustItem(
            label="Throughput", value=f"{receipt['mb_per_second']} MB/s" if receipt else "Not measured"
        ),
        TrustItem(
            label="Peak memory",
            value=f"{receipt['peak_memory_mb']:,} MB, {receipt['peak_memory_scope']}"
            if receipt
            else "Not measured",
        ),
        TrustItem(
            label="Recovery",
            value=f"Resumed {state['resume_count']} time(s)"
            if state.get("resume_count")
            else "No resume recorded",
        ),
    ]

    # Reconstruction trust
    if reconstruction == "withheld":
        reconstruction_status, reconstruction_verdict = (
            "Needs review",
            "Withheld: this source has no trustworthy time axis.",
        )
    elif reconstruction == "not_run":
        reconstruction_status, reconstruction_verdict = "Not measured", "No reconstruction result exists yet."
    elif quality and quality["records_in_collapsed_timestamps"]:
        reconstruction_status = "Needs review"
        reconstruction_verdict = (
            "Incidents exist, but part of the data had no usable time, so some activity may be missing."
        )
    else:
        reconstruction_status, reconstruction_verdict = (
            "Needs review",
            "Incidents are candidates until someone validates them.",
        )
    latency = (receipt or {}).get("incident_open_latency_ms")
    reconstruction_items = [
        TrustItem(
            label="Incident count", value=f"{len(index)}" if reconstruction != "not_run" else "Not measured"
        ),
        TrustItem(label="Observed relationships", value=f"{links['observed']:,}"),
        TrustItem(label="Inferred relationships", value=f"{links['inferred']:,}"),
        TrustItem(label="Missing evidence", value=f"{links['missing']:,} link(s)"),
        TrustItem(
            label="Evidence coverage",
            value=f"{links['coverage']:.0%}" if links["coverage"] is not None else "Not applicable",
            status="Verified"
            if links["coverage"] == 1
            else ("Not applicable" if links["coverage"] is None else "Needs review"),
        ),
        TrustItem(label="Why it ran or was withheld", value=reason),
        TrustItem(
            label="Incident-open latency",
            value=f"{latency} ms" if latency is not None else "Not applicable: no incident exists to open",
            status=None if latency is not None else "Not applicable",
        ),
    ]

    ground_items = [
        TrustItem(label="Ground truth available", value="No", status="Not measured"),
        TrustItem(label="Accuracy", value="Not measured", status="Not measured"),
    ]
    dimensions = [
        TrustDimension(
            id="source",
            title="Source integrity",
            status=source_status,
            verdict=source_verdict,
            items=source_items,
        ),
        TrustDimension(
            id="processing",
            title="Processing integrity",
            status=processing_status,
            verdict=processing_verdict,
            items=processing_items,
        ),
        TrustDimension(
            id="reconstruction",
            title="Reconstruction trust",
            status=reconstruction_status,
            verdict=reconstruction_verdict,
            items=reconstruction_items,
        ),
        TrustDimension(
            id="ground_truth",
            title="Ground-truth validation",
            status="Not measured",
            verdict=GROUND_TRUTH_NOTE,
            items=ground_items,
        ),
    ]

    incidents = len(index)
    if processing_status == "Failed":
        overall, headline = "Failed", "This run cannot be relied on."
        explanation = processing_verdict
    elif state["status"] != "completed":
        overall, headline = "Unconfirmed", "This run has not finished."
        explanation = state["detail"]
    elif reconstruction == "withheld":
        overall = "Degraded"
        headline = "Reconstruction withheld: this source has no trustworthy time axis."
        explanation = (
            "Processing is sound, but the source cannot support an attack story. "
            "Zero incidents does not mean zero threats."
        )
    elif incidents:
        overall = "Unconfirmed"
        headline = f"{incidents} incident{'s' if incidents != 1 else ''} reconstructed, all unconfirmed."
        explanation = (
            "The source and processing check out. The conclusions are candidates, "
            "because no ground truth was provided."
        )
    else:
        overall = "Unconfirmed"
        headline = "No rule produced an incident from the data read."
        explanation = (
            "This is not proof that the data is clean: the rules cover specific patterns, "
            "and no ground truth was provided."
        )

    bytes_total = quality["bytes_total"] if quality else 0
    health = DatasetHealth(
        run_id=run_id,
        dataset_id=state["dataset_id"],
        state=overall,
        headline=headline,
        explanation=explanation,
        is_sample=is_sample,
        reconstruction=reconstruction,
        reconstruction_reason=reason,
        incident_count=incidents,
        source_bytes=(plan or {}).get("source_size"),
        valid_fraction=round(quality["bytes_valid"] / bytes_total, 4) if bytes_total else None,
        quarantined_fraction=round(quality["bytes_quarantined"] / bytes_total, 4) if bytes_total else None,
        canonical_records=quality["records_valid"] if quality else None,
        exact_duplicates=quality["exact_duplicates"] if quality else None,
        duration_s=(receipt or {}).get("duration_s"),
        mb_per_second=(receipt or {}).get("mb_per_second"),
        peak_memory_mb=(receipt or {}).get("peak_memory_mb"),
        incident_open_latency_ms=latency,
        incident_open_latency_label=f"{latency} ms" if latency is not None else "Not applicable",
        dimensions=dimensions,
    )
    return health, links["proofs"], receipt or {}


def build_trust(run_id: str, root: Path | None = None) -> TrustReport:
    health, proofs, receipt = build_health(run_id, root)
    seal = verify_seal(receipt) if receipt else None
    return TrustReport(
        health=health,
        benchmark_seal_valid=seal.valid if seal else None,
        benchmark_seal=receipt.get("seal"),
        seal_algorithm=receipt.get("seal_algorithm"),
        artifact_hashes=receipt.get("artifact_hashes", {}),
        proofs=proofs,
    )


def build_quality_case(run_id: str, root: Path | None = None) -> QualityCase:
    health, _, _ = build_health(run_id, root)
    if health.reconstruction != "withheld":
        raise RunError(404, "not_found", "this run has no quality case: reconstruction was not withheld")
    folder = run_dir(run_id, root)
    quality = read_json(folder / "quality.json")
    plan = read_json(folder / "plan.json")
    segments = read_json(folder / "quarantine.json")
    stamp = quality["collapsed_timestamps"][0]
    conflict = quality["timezone_conflict"]
    return QualityCase(
        run_id=run_id,
        dataset_id=health.dataset_id,
        filename=plan["filename"],
        source_bytes=plan["source_size"],
        source_sha256=plan["source_sha256"],
        source_hash_verified=plan["source_sha256_verified"],
        bytes_valid=quality["bytes_valid"],
        bytes_quarantined=quality["bytes_quarantined"],
        bytes_blank=quality["bytes_blank"],
        bytes_accounted=quality["bytes_accounted"],
        valid_fraction=health.valid_fraction or 0.0,
        quarantined_fraction=health.quarantined_fraction or 0.0,
        canonical_records=quality["records_valid"],
        exact_duplicates=quality["exact_duplicates"],
        collapsed_utc=stamp["event_utc"],
        collapsed_records=stamp["affected_records"],
        declared_tz=conflict["declared_tz"] if conflict else [],
        timezone_interpretation=conflict["interpretation"] if conflict else None,
        segments=[
            QualitySegment(
                segment_id=s["segment_id"],
                reason=s["reason"],
                start_offset=s["start_offset"],
                end_offset=s["end_offset"],
                bytes=s["end_offset"] - s["start_offset"],
            )
            for s in segments[:50]
        ],
        reason=health.reconstruction_reason,
        withheld_statement=(
            "Reconstruction withheld because the source does not provide a trustworthy time axis."
        ),
        zero_statement=(
            "Zero incidents does not mean zero threats. "
            "It means this source cannot support a defensible story."
        ),
        incident_open_latency_label=health.incident_open_latency_label,
        benchmark_seal_valid=health.dimensions[1].status == "Verified",
    )


def build_facts(root: Path | None = None) -> FactsResponse:
    """Measured results of completed whole-file runs on this server, for the landing page. Empty when none
    exist."""
    facts = []
    for state in list_runs(root):
        if state["status"] != "completed" or state.get("max_bytes"):
            continue
        health, _, _ = build_health(state["run_id"], root)
        if health.state == "Failed":
            continue
        facts.append(
            RecordedFact(
                run_id=health.run_id,
                dataset_id=health.dataset_id,
                source_bytes=health.source_bytes or 0,
                duration_s=health.duration_s or 0.0,
                exact_duplicates=health.exact_duplicates or 0,
                peak_memory_mb=health.peak_memory_mb,
                incidents=health.incident_count,
                reconstruction=health.reconstruction,
                state=health.state,
            )
        )
    return FactsResponse(
        items=sorted(facts, key=lambda f: f.dataset_id),
        note="Recorded FireX benchmark results on the recorded machine. Not a performance guarantee.",
    )
