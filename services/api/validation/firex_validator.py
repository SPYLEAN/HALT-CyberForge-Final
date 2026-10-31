"""Compare a finished run with candidate patterns from the read-only profile.

These are profile candidates, not organiser ground truth: results show whether the pipeline found what
profiling
surfaced, not that those patterns are attacks. Only this tool reads candidate files.

    python -m validation.firex_validator --run-dir RUN --candidates DIR --out DIR
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

CANDIDATE_NOTICE = (
    "Expected cases come from profile candidates and remain unconfirmed. They are not organiser ground "
    "truth, so "
    "these metrics do not measure real detection accuracy."
)

# case id → rule, the entity that must appear on the detection, its stage, and where profile evidence begins.
CASE_SPECS: tuple[dict[str, Any], ...] = (
    {
        "case_id": "temp-admin-lifecycle",
        "rule_id": "account_lifecycle",
        "entity": ("users", "svc_backup30"),
        "stage": "installation",
        "timeline": "203.228.177.117",
        "steps": 3,
    },
    {
        "case_id": "logging-off-around-purge",
        "rule_id": "logging_tamper",
        "entity": ("users", "Tejas.Roy"),
        "stage": "defense_evasion",
        "timeline": "78.120.139.0",
        "steps": 3,
    },
    {
        "case_id": "web-attack-concentration",
        "rule_id": "web_attack_concentration",
        "entity": ("dst_ips", "10.10.20.20"),
        "stage": "exploitation",
        "group": "ips_web_attack_group",
        "steps": 1,
    },
    {
        "case_id": "smb-rdp-fanout",
        "rule_id": "internal_fanout",
        "entity": ("src_ips", "10.10.10.44"),
        "stage": "lateral_movement",
        "group": "traffic_internal_to_internal",
        "steps": 1,
    },
    {
        "case_id": "smb-rdp-fanout-second-host",
        "rule_id": "internal_fanout",
        "entity": ("src_ips", "10.10.10.63"),
        "stage": "lateral_movement",
        "group": "traffic_internal_to_internal",
        "steps": 1,
    },
    {
        "case_id": "sustained-dns",
        "rule_id": "sustained_dns",
        "entity": ("src_ips", "10.10.10.88"),
        "stage": "command_and_control",
        "group": "dns_with_byte_fields",
        "steps": 1,
    },
    {
        "case_id": "repeated-malware-a",
        "rule_id": "repeated_malware",
        "entity": ("src_ips", "10.10.10.51"),
        "stage": "delivery",
        "timeline": "111.253.167.34",
        "steps": 1,
    },
    {
        "case_id": "repeated-malware-b",
        "rule_id": "repeated_malware",
        "entity": ("src_ips", "10.10.10.118"),
        "stage": "delivery",
        "timeline": "7.154.5.35",
        "steps": 1,
    },
    {
        "case_id": "flood-web",
        "rule_id": "denial_flood",
        "entity": ("dst_ips", "10.10.20.20"),
        "stage": "impact",
        "group": "traffic_deny_warning",
        "steps": 1,
    },
    {
        "case_id": "flood-vpn-gateway",
        "rule_id": "denial_flood",
        "entity": ("dst_ips", "203.0.113.5"),
        "stage": "impact",
        "group": "traffic_deny_warning",
        "steps": 1,
    },
    {
        "case_id": "vpn-alternation",
        "rule_id": "vpn_alternation",
        "entity": ("users", "keerat.ghughal"),
        "stage": "credential_access",
        "timeline": "9.222.114.167",
        "steps": 3,
    },
)


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, doc: Any) -> None:
    path.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


def build_expected_cases(followup: dict[str, Any]) -> list[dict[str, Any]]:
    """Attach each case's first known byte offset, read from the candidate follow-up."""
    cases = []
    for spec in CASE_SPECS:
        first_offset = None
        if "timeline" in spec:
            rows = followup["entity_timelines"].get(spec["timeline"], {}).get("rows", [])
            offsets = [r["offset"] for r in rows]
            first_offset = min(offsets) if offsets else None
        elif "group" in spec:
            first_offset = followup["groups"].get(spec["group"], {}).get("first_offset")
        cases.append(
            {
                "case_id": spec["case_id"],
                "rule_id": spec["rule_id"],
                "entity_kind": spec["entity"][0],
                "entity": spec["entity"][1],
                "stage": spec["stage"],
                "expected_steps": spec["steps"],
                "first_offset": first_offset,
                "status": "unconfirmed profile candidate",
            }
        )
    return cases


def metric(numerator: int, denominator: int, note: str = "") -> dict[str, Any]:
    value = round(numerator / denominator, 6) if denominator else None
    return {"numerator": numerator, "denominator": denominator, "value": value, "note": note}


def validate(run_dir: Path, cases: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    plan = _read(run_dir / "plan.json")
    detections = _read(run_dir / "detections.json")
    summaries = _read(run_dir / "incidents" / "index.json")
    end = plan["end"]
    in_range = [c for c in cases if c["first_offset"] is not None and c["first_offset"] < end]
    outcomes = []
    matched_detections: set[str] = set()
    for case in cases:
        hits = [
            d
            for d in detections
            if d["rule_id"] == case["rule_id"]
            and case["entity"] in d["entities"].get(case["entity_kind"], [])
        ]
        for hit in hits:
            matched_detections.add(hit["detection_id"])
        outcomes.append(
            {
                **case,
                "in_processed_range": case in in_range,
                "detected": bool(hits),
                "label_correct": any(h["kill_chain_stage"] == case["stage"] for h in hits),
                "steps_found": max((len(h["steps"]) for h in hits), default=0),
                "detection_ids": [h["detection_id"] for h in hits],
            }
        )
    scored = [o for o in outcomes if o["in_processed_range"]]
    detected = [o for o in scored if o["detected"]]

    incident_ids = [s["incident_id"] for s in summaries]
    unmatched, ordering, unsupported, links = 0, 0, 0, 0
    seen_shapes: dict[str, int] = {}
    for incident_id in incident_ids:
        detail = _read(run_dir / "incidents" / incident_id / "detail.json")
        graph = _read(run_dir / "incidents" / incident_id / "graph.json")
        if not {d["detection_id"] for d in detail["detections"]} & matched_detections:
            unmatched += 1
        for det in detail["detections"]:
            offsets = [s["ns"] for s in det["steps"]]
            ordering += sum(a > b for a, b in zip(offsets, offsets[1:], strict=False))
        chain = [e for e in graph["edges"] if e["relation"] == "next_step"]
        links += len(chain)
        unsupported += sum(1 for e in chain if e["missing_evidence"])
        shape = json.dumps(sorted((d["rule_id"], d["first_utc"]) for d in detail["detections"]))
        seen_shapes[shape] = seen_shapes.get(shape, 0) + 1
    duplicates = sum(n - 1 for n in seen_shapes.values())
    paths_recovered = [o for o in detected if o["steps_found"] >= o["expected_steps"]]
    metrics = {
        "notice": CANDIDATE_NOTICE,
        "run_id": run_dir.name,
        "processed_byte_range": [plan["start"], plan["end"]],
        "cases_total": len(cases),
        "cases_in_processed_range": len(scored),
        "candidate_steps_detected": metric(
            len(detected), len(scored), "candidates whose evidence starts in range"
        ),
        "labels_correct": metric(sum(o["label_correct"] for o in detected), len(detected)),
        "paths_recovered": metric(len(paths_recovered), len(scored), "all expected steps found"),
        "incidents_matching_no_candidate": metric(
            unmatched,
            len(incident_ids),
            "Not proven false positives: a candidate list cannot prove an incident is false.",
        ),
        "ordering_errors": metric(
            ordering, sum(1 for _ in incident_ids), "step pairs out of time order, per incident"
        ),
        "unsupported_correlations": metric(unsupported, links, "next_step links with no shared entity"),
        "duplicate_incidents": metric(duplicates, len(incident_ids)),
    }
    return metrics, {"notice": CANDIDATE_NOTICE, "outcomes": outcomes, "incidents": incident_ids}


def report_text(metrics: dict[str, Any], actual: dict[str, Any]) -> str:
    lines = ["# FireX validation report", "", f"> {CANDIDATE_NOTICE}", "", f"Run: `{metrics['run_id']}`", ""]
    lines += ["| Metric | Numerator | Denominator | Value |", "|---|---|---|---|"]
    for key, value in metrics.items():
        if isinstance(value, dict):
            lines.append(f"| {key} | {value['numerator']} | {value['denominator']} | {value['value']} |")
    lines += ["", "| Case | In range | Detected | Label | Steps |", "|---|---|---|---|---|"]
    for o in actual["outcomes"]:
        lines.append(
            f"| {o['case_id']} | {o['in_processed_range']} | {o['detected']} | {o['label_correct']} | "
            f"{o['steps_found']}/{o['expected_steps']} |"
        )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    cases = build_expected_cases(_read(args.candidates / "candidate_followup.json"))
    metrics, actual = validate(args.run_dir, cases)
    _write(args.out / "validation_expected_cases.json", cases)
    _write(args.out / "validation_actual_results.json", actual)
    _write(args.out / "validation_metrics.json", metrics)
    (args.out / "validation_report.md").write_text(
        report_text(metrics, actual), encoding="utf-8", newline="\n"
    )
    print(json.dumps({k: v for k, v in metrics.items() if isinstance(v, dict)}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
