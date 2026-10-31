"""Presentation cases: deterministic manifests built from a run's stored files, for Theatre.

A manifest never changes the run or incident behind it. Same inputs give the same case id and bytes, so it
holds no wall-clock time.
A recommendation ranks how much an incident has to show. It says nothing about whether the incident is true.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from halt.firex.contracts import (
    CaseCamera,
    CaseCandidate,
    CaseCandidates,
    CaseChapter,
    CaseManifest,
    CaseMetric,
    CaseRequest,
    ScoreComponent,
)
from halt.firex.jobs import RunError, read_state, run_dir
from halt.firex.registry import runs_dir
from halt.firex.trust import build_health, build_quality_case, build_trust
from halt.firex.util import atomic_write_json, read_json, stable_hash

BUILDER_VERSION = "halt.firex.case/1.0"
RECOMMENDATION_NOTE = (
    "Recommended means this incident has the most to show. It does not mean the incident is confirmed."
)
MAX_CHAPTER_REFS = 12


def cases_dir(root: Path | None = None) -> Path:
    return runs_dir(root).parent / "firex-cases"


def _candidate(run_folder: Path, summary: dict[str, Any]) -> CaseCandidate:
    graph = read_json(run_folder / "incidents" / summary["incident_id"] / "graph.json")
    steps = sum(1 for n in graph["nodes"] if n["on_selected_path"])
    kinds = {n["kind"] for n in graph["nodes"]}
    layers = {n["layer"] for n in graph["nodes"] if not n["is_context"]}
    components = [
        ScoreComponent(
            name="risk", value=summary["risk"], weight=0.35, detail="The incident's rule-derived risk"
        ),
        ScoreComponent(
            name="path_steps",
            value=round(min(1.0, steps / 5), 3),
            weight=0.3,
            detail=f"{steps} step(s) on the path",
        ),
        ScoreComponent(
            name="entity_kinds",
            value=round(min(1.0, len(kinds) / 4), 3),
            weight=0.2,
            detail=f"{len(kinds)} kind(s) of entity",
        ),
        ScoreComponent(
            name="layers",
            value=round(min(1.0, len(layers) / 4), 3),
            weight=0.15,
            detail=f"{len(layers)} organisation layer(s)",
        ),
    ]
    return CaseCandidate(
        incident_id=summary["incident_id"],
        title=summary["title"],
        status=summary["status"],
        risk=summary["risk"],
        path_steps=steps,
        score=round(sum(c.value * c.weight for c in components), 3),
        components=components,
        recommended=False,
    )


def list_candidates(run_id: str, root: Path | None = None) -> CaseCandidates:
    state = read_state(run_id, root)
    folder = run_dir(run_id, root)
    index = folder / "incidents" / "index.json"
    summaries = read_json(index) if index.is_file() and state["status"] == "completed" else []
    candidates = sorted((_candidate(folder, s) for s in summaries), key=lambda c: (-c.score, c.incident_id))
    if candidates:
        candidates[0] = candidates[0].model_copy(update={"recommended": True})
    health, _, _ = build_health(run_id, root)
    return CaseCandidates(
        run_id=run_id,
        items=candidates,
        quality_case_available=health.reconstruction == "withheld",
        partial_case_available=health.reconstruction == "partial",
        note=RECOMMENDATION_NOTE,
    )


def _chapter(
    chapter_id: str,
    title: str,
    headline: str,
    body: str,
    notes: str,
    *,
    refs: list[str] | None = None,
    shot: Any = "establish",
    nodes: list[str] | None = None,
    metrics: list[tuple[str, str]] | None = None,
    visual: Any = "world",
) -> CaseChapter:
    return CaseChapter(
        chapter_id=chapter_id,
        title=title,
        headline=headline,
        body=body,
        presenter_notes=notes,
        evidence_refs=(refs or [])[:MAX_CHAPTER_REFS],
        camera=CaseCamera(shot=shot, node_ids=nodes or []),
        metrics=[CaseMetric(label=a, value=b) for a, b in (metrics or [])],
        visual=visual,
    )


def _incident_chapters(
    run_folder: Path, incident_id: str
) -> tuple[list[CaseChapter], dict[str, Any], list[str]]:
    folder = run_folder / "incidents" / incident_id
    if not folder.is_dir():
        raise RunError(404, "not_found", f"incident {incident_id} not found in this run")
    detail, graph, story, hypotheses, reach, proof = (
        read_json(folder / f"{name}.json")
        for name in ("detail", "graph", "story", "hypotheses", "reachability", "proof")
    )
    summary = detail["summary"]
    path = sorted((n for n in graph["nodes"] if n["on_selected_path"]), key=lambda n: n["order"])
    path_ids = [n["node_id"] for n in path]
    first = path[0]
    all_refs = [r for n in path for r in n["evidence_refs"]]
    reach_ids = [n["node_id"] for n in graph["nodes"] if n["attributes"].get("hypothetical") is True]
    gaps = detail["evidence_gaps"]
    best_alternate = hypotheses["alternates"][0] if hypotheses["alternates"] else None
    chapters = [
        _chapter(
            "situation",
            "Situation",
            summary["title"],
            story["what_happened"],
            f"Say what the rule found, then that it is unconfirmed. Status: {summary['status']}.",
            nodes=[n["node_id"] for n in graph["nodes"]],
            shot="establish",
            metrics=[("Records merged", f"{summary['merged_events']:,}"), ("Status", "Unconfirmed")],
        ),
        _chapter(
            "entry",
            "Entry point",
            story["where_started"],
            detail["root_cause"],
            "Point to the first step. This is the earliest evidence in this data, not proof of how access "
            "began.",
            refs=first["evidence_refs"],
            nodes=[first["node_id"]],
            shot="approach",
            metrics=[("First seen (UTC)", summary["first_utc"])],
        ),
        _chapter(
            "progression",
            "Attack progression",
            f"{len(path)} step{'s' if len(path) != 1 else ''} on the selected path",
            ". Then: ".join(n["label"] for n in path[:4]) + ".",
            "Follow the route. Steps are ordered by evidence; links between them are inferred by rules.",
            refs=all_refs,
            nodes=path_ids,
            shot="follow",
            metrics=[("Stages", ", ".join(s.replace("_", " ") for s in summary["stages"]).capitalize())],
        ),
        _chapter(
            "evidence",
            "Evidence",
            story["strongest_evidence"],
            f"{story['checked_statements']} statements checked, {story['unsupported_claims']} without "
            "evidence.",
            "Open a source record from here if asked. Every statement cites one.",
            refs=proof["cited_evidence"],
            nodes=path_ids[:1],
            shot="inspect",
            metrics=[
                ("Evidence coverage", f"{proof['evidence_coverage']:.0%}"),
                ("Unsupported claims", str(proof["unsupported_claims"])),
            ],
        ),
        _chapter(
            "uncertainty",
            "Uncertainty",
            gaps[0] if gaps else "No evidence gap was recorded.",
            (
                f"The best alternative: {best_alternate['title']}. {best_alternate['description']}"
                if best_alternate
                else ""
            )
            + (f" Other gaps: {' '.join(gaps[1:3])}" if len(gaps) > 1 else ""),
            "State this plainly. The scores rank explanations; they are not probabilities.",
            nodes=path_ids,
            shot="withdraw",
            metrics=[("Margin over the best alternative", str(hypotheses["uncertainty_margin"]))],
        ),
        _chapter(
            "reachable",
            "Reachable next",
            f"{len(reach['targets'])} system(s) could be reached next"
            if reach["targets"]
            else "No reachable next system could be established",
            reach["label"] + (f" {reach['limitations'][0]}" if reach["limitations"] else ""),
            "This is hypothetical. It is a network path seen in the log, not attacker activity.",
            refs=[r for t in reach["targets"] for r in t["evidence_refs"]],
            nodes=reach_ids or path_ids[-1:],
            shot="reveal",
            metrics=[("Hypothetical targets", str(len(reach["targets"])))],
        ),
        _chapter(
            "verification",
            "Verification",
            "The result is sealed and repeatable",
            "A seal shows that the receipt has not changed. It does not show that the conclusion is true.",
            "Offer to open the Trust Centre. Say the seal is tamper evidence, not a legal signature.",
            nodes=path_ids,
            shot="withdraw",
            metrics=[("Graph hash", proof["graph_hash"][:16]), ("Seal", proof["seal_algorithm"])],
        ),
        _chapter(
            "closing",
            "Closing result",
            "An evidence-backed candidate, ready for an analyst",
            "Unconfirmed until validated. No organiser ground truth was provided, so accuracy has not been "
            "measured.",
            "Hand off to the live evidence.",
            nodes=[n["node_id"] for n in graph["nodes"]],
            shot="present",
            metrics=[("Status", "Unconfirmed"), ("Accuracy", "Not measured")],
        ),
    ]
    subject = {"title": summary["title"], "status": "Unconfirmed", "incident_id": incident_id}
    return chapters, subject, [proof["receipt_id"]]


def _quality_chapters(run_id: str, root: Path | None) -> tuple[list[CaseChapter], dict[str, Any], list[str]]:
    q = build_quality_case(run_id, root)
    gb = f"{q.source_bytes / 1e9:.2f} GB"
    chapters = [
        _chapter(
            "received",
            f"{gb} received",
            f"{gb} received",
            f"{q.filename}. The whole-file hash "
            f"{'matches the registered value' if q.source_hash_verified else 'was not verified'}.",
            "Start with what arrived, before any conclusion.",
            visual="bytes",
            metrics=[
                ("Source bytes", f"{q.source_bytes:,}"),
                ("Hash", "Verified" if q.source_hash_verified else "Not measured"),
            ],
        ),
        _chapter(
            "accounted",
            "Every byte accounted for",
            "Every byte is accounted for" if q.bytes_accounted else "Not every byte is accounted for",
            f"{q.bytes_valid:,} valid, {q.bytes_quarantined:,} quarantined, {q.bytes_blank:,} blank.",
            "Nothing was dropped silently. Each byte is either usable or in a recorded segment.",
            visual="bytes",
            metrics=[("Valid", f"{q.valid_fraction:.2%}"), ("Quarantined", f"{q.quarantined_fraction:.2%}")],
        ),
        _chapter(
            "separated",
            "Valid and invalid regions separated",
            f"{q.quarantined_fraction:.2%} of the bytes are not log records",
            f"{len(q.segments)} quarantine segment(s). The parser kept running to the end of the file.",
            "Show the map. The invalid region is real file content, and HALT recorded where it is.",
            visual="bytes",
            metrics=[("Segments", str(len(q.segments))), ("Canonical records", f"{q.canonical_records:,}")],
        ),
        _chapter(
            "collapse",
            "Timestamp collapse discovered",
            "Every valid record shares one timestamp"
            if q.collapsed_records == q.canonical_records
            else f"{q.collapsed_records:,} records share one timestamp",
            f"{q.collapsed_utc}. {q.timezone_interpretation or ''}",
            "The source declares a time zone, but its fields behave as UTC. HALT records that and does not "
            "silently correct it.",
            visual="time",
            metrics=[
                ("Records at that instant", f"{q.collapsed_records:,}"),
                ("Declared zone", ", ".join(q.declared_tz) or "None"),
            ],
        ),
        _chapter(
            "withheld",
            "Temporal reconstruction withheld",
            q.withheld_statement,
            q.reason,
            "This is the point of the case. HALT could have drawn a story. It refuses, because the evidence "
            "cannot support one.",
            visual="withheld",
            metrics=[("Incidents", "0"), ("Incident-open latency", q.incident_open_latency_label)],
        ),
        _chapter(
            "zero",
            "Why zero incidents does not mean zero threats",
            q.zero_statement,
            "An attack in this file could not be ordered, timed or connected from this evidence. Its "
            "absence here says nothing about its absence in reality.",
            "Do not let anyone hear this as a clean result.",
            visual="withheld",
            metrics=[("Accuracy", "Not measured")],
        ),
        _chapter(
            "sealed",
            "Receipt sealed",
            "The finding itself is sealed",
            "The benchmark receipt records the hash, the byte accounting and the duplicates, under a "
            "SHA-256 seal.",
            "A seal shows the receipt has not changed. It is tamper evidence, not a legal signature.",
            visual="bytes",
            metrics=[
                ("Receipt seal", "Valid" if q.benchmark_seal_valid else "Failed"),
                ("Exact duplicates", f"{q.exact_duplicates:,}"),
            ],
        ),
        _chapter(
            "handoff",
            "Analyst handoff",
            "Ask for a corrected source",
            "The next step is a source with a usable time axis, not more analysis of this one.",
            "Open the Quality Case for the full detail.",
            visual="withheld",
            metrics=[("Status", "Degraded")],
        ),
    ]
    subject = {"title": "Reconstruction withheld", "status": "Degraded", "incident_id": None}
    return chapters, subject, []


def _millions(value: int) -> str:
    return f"{value / 1e6:.2f} million"


def _counted(value: int) -> str:
    words = (
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
    )
    return words[value] if value < len(words) else f"{value:,}"


def _partial_chapters(run_id: str, root: Path | None) -> tuple[list[CaseChapter], dict[str, Any], list[str]]:
    report = build_trust(run_id, root)
    health = report.health
    time = health.time_quality
    if health.reconstruction != "partial" or not time:
        raise RunError(404, "not_found", "this run has no partial case: its reconstruction was not partial")
    gb = f"{(health.source_bytes or 0) / 1e9:.2f} GB"
    source = next(d for d in health.dimensions if d.id == "source")
    hash_status = next(i.status for i in source.items if i.label == "Hash verification")
    duplicates = health.exact_duplicates or 0
    count = health.incident_count
    incidents = (
        f"{_counted(count).capitalize()} unconfirmed incident{'s' if count != 1 else ''} reconstructed"
    )
    valid_proofs = sum(1 for p in report.proofs if p.seal_valid)
    only = sum(1 for s in report.incident_scopes if s.scope == "trustworthy_only")
    matched = "matches the registered value" if hash_status == "Verified" else "was not verified"
    chapters = [
        _chapter(
            "received",
            f"{gb} received",
            f"{gb} received",
            f"The whole-file hash {matched}, and every byte is accounted for.",
            "Start with what arrived, before any conclusion. A verified file is not a verified story.",
            visual="regions",
            metrics=[("Source bytes", f"{health.source_bytes or 0:,}"), ("Source hash", str(hash_status))],
        ),
        _chapter(
            "processed",
            f"{_millions(time.total_records)} records processed",
            f"{_millions(time.total_records)} records processed",
            f"{time.records_rejected:,} records were rejected. That means every line parsed. It says nothing "
            "about whether their timestamps can be trusted.",
            "Do not let zero rejected records sound like a clean source.",
            visual="regions",
            metrics=[("Records", f"{time.total_records:,}"), ("Rejected", f"{time.records_rejected:,}")],
        ),
        _chapter(
            "duplicates",
            f"{_millions(duplicates)} duplicates removed",
            f"{_millions(duplicates)} exact duplicates removed",
            "Identical records were collapsed into one, and the originals stay accounted for.",
            "This shrinks the noise. It does not change what the evidence says.",
            visual="regions",
            metrics=[("Exact duplicates", f"{duplicates:,}")],
        ),
        _chapter(
            "usable",
            f"{_millions(time.usable_records)} records retained usable ordering",
            f"{_millions(time.usable_records)} records retained usable ordering",
            f"That is {time.usable_fraction:.2%} of the source, from line 1 to line "
            f"{time.collapsed_first_line - 1:,}, between {time.earliest_utc} and {time.collapsed_utc}.",
            "This is the only part of the file that time-based rules could use.",
            visual="regions",
            metrics=[("Usable", f"{time.usable_fraction:.2%}"), ("Records", f"{time.usable_records:,}")],
        ),
        _chapter(
            "collapsed",
            f"{_millions(time.collapsed_records)} records have collapsed time",
            f"{_millions(time.collapsed_records)} records share one timestamp",
            f"{time.collapsed_fraction:.2%} of the source, all at {time.collapsed_utc}. With no time between "
            "them, these records cannot be ordered, timed or connected in sequence.",
            "This is why the source is degraded, even though its hash and processing verify.",
            visual="regions",
            metrics=[
                ("Collapsed", f"{time.collapsed_fraction:.2%}"),
                ("Time-zone conflict", f"{time.timezone_conflict_records:,} records"),
            ],
        ),
        _chapter(
            "incidents",
            incidents,
            incidents,
            f"{report.scope_note or ''} They do not describe the complete source.",
            "Say both halves: the incidents have evidence, and they cover only part of the file.",
            visual="regions",
            metrics=[
                ("Incidents", str(count)),
                ("Resting only on the trustworthy region", f"{only} of {len(report.incident_scopes)}"),
            ],
        ),
        _chapter(
            "proofs",
            "Proof receipts verified",
            f"{valid_proofs} of {len(report.proofs)} proof receipts verify",
            "A seal shows that a receipt has not changed. It does not show that a conclusion is true.",
            "Offer to open the Trust Centre. The seal is tamper evidence, not a legal signature.",
            visual="regions",
            metrics=[
                ("Benchmark seal", "Valid" if report.benchmark_seal_valid else "Failed"),
                ("Proof receipts", f"{valid_proofs} of {len(report.proofs)}"),
            ],
        ),
        _chapter(
            "review",
            "Analyst review required",
            "An analyst must review this before anyone relies on it",
            "Every incident stays unconfirmed. Ask for a source with usable time for the collapsed region. "
            "No ground truth was provided, so accuracy has not been measured.",
            "Hand off to the Trust Centre, where each incident's time scope is listed.",
            visual="regions",
            metrics=[("Dataset health", health.state), ("Accuracy", "Not measured")],
        ),
    ]
    subject = {
        "title": "Partial reconstruction",
        "status": health.state,
        "incident_id": None,
    }
    return chapters, subject, []


def create_case(request: CaseRequest, root: Path | None = None) -> CaseManifest:
    state = read_state(request.run_id, root)
    if state["status"] != "completed":
        raise RunError(409, "run_not_completed", "a case can only be built from a completed run")
    folder = run_dir(request.run_id, root)
    if request.subject == "quality":
        chapters, subject, proofs = _quality_chapters(request.run_id, root)
    elif request.subject == "partial":
        chapters, subject, proofs = _partial_chapters(request.run_id, root)
    else:
        if not request.incident_id:
            raise RunError(422, "incident_required", "an incident case needs an incident id")
        chapters, subject, proofs = _incident_chapters(folder, request.incident_id)
    receipt = read_json(folder / "benchmark_receipt.json")
    body = {
        "builder": BUILDER_VERSION,
        "run_id": request.run_id,
        "subject": request.subject,
        "incident_id": subject["incident_id"],
        "benchmark_seal": receipt["seal"],
        "chapters": [c.model_dump(mode="json") for c in chapters],
    }
    case_id = "fcase-" + stable_hash(body)
    manifest = CaseManifest(
        case_id=case_id,
        builder_version=BUILDER_VERSION,
        run_id=request.run_id,
        dataset_id=state["dataset_id"],
        subject=request.subject,
        incident_id=subject["incident_id"],
        title=subject["title"],
        status=subject["status"],
        benchmark_receipt_id=receipt["receipt_id"],
        benchmark_seal=receipt["seal"],
        proof_receipt_ids=proofs,
        chapters=chapters,
        llm_notes=None,
    )
    atomic_write_json(cases_dir(root) / f"{case_id}.json", manifest.model_dump(mode="json"))
    return manifest


def read_case(case_id: str, root: Path | None = None) -> CaseManifest:
    if not case_id.startswith("fcase-") or not case_id[6:].isalnum():
        raise RunError(404, "not_found", f"case {case_id} not found")
    path = cases_dir(root) / f"{case_id}.json"
    if not path.is_file():
        raise RunError(404, "not_found", f"case {case_id} not found")
    return CaseManifest.model_validate(read_json(path))
