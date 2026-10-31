"""Bounded incident reconstruction: detections → incidents → graphs, hypotheses, reachability, stories and
proofs.

No global graph exists and nothing joins on time alone. Two detections share an incident only through a shared
account or source address, or a pivot (a target of one is the source of a later one). An entity seen in many
detections is too common to join on. Everything produced is `unconfirmed`, and reachability is hypothetical.
"""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Any

import duckdb

from halt.firex.contracts import (
    AttackHypothesis,
    AttackStory,
    Detection,
    EvidenceEvent,
    GraphEdge,
    GraphNode,
    Hypotheses,
    IncidentDetail,
    IncidentGraph,
    IncidentSummary,
    ReachabilityResult,
    ReachableTarget,
    ResponseEligibility,
    ScoreComponent,
    StoryStatement,
    TimelineEntry,
)
from halt.firex.detect import behavioural_bursts, run_detection
from halt.firex.receipts import git_commit, make_proof
from halt.firex.store import connect
from halt.firex.util import atomic_write_json, stable_hash, utc_text

if TYPE_CHECKING:
    from halt.firex.pipeline import Runner

RULE_VERSION = "halt.firex.graph/1.0"
BENIGN_EXPLANATIONS = {
    "account_lifecycle": "A legitimate temporary account used for maintenance and then removed.",
    "logging_tamper": "A planned maintenance change that briefly turned logging off.",
    "web_attack_concentration": "Internet scanning of an exposed service that had no effect on it.",
    "internal_fanout": "An administrator tool or vulnerability scanner reaching many hosts.",
    "sustained_dns": "A chatty application or resolver forwarding, not tunnelling.",
    "repeated_malware": "A blocked update or download retried automatically, with no infection.",
    "denial_flood": "Internet background traffic correctly stopped by the firewall.",
    "vpn_alternation": "A legitimate user moving between networks.",
    "failure_then_success": "A user mistyping a password and then getting it right.",
}
RESPONSE_MISSING = [
    "Business service map for the affected systems",
    "Available response controls for these systems",
    "Asset ownership and criticality context",
]


def _is_private(ip: str | None) -> bool:
    if not ip:
        return False
    if ip.startswith(("10.", "192.168.", "127.", "169.254.")):
        return True
    if ip.startswith("172."):
        second = ip.split(".")[1]
        return second.isdigit() and 16 <= int(second) <= 31
    return False


def cluster_detections(
    detections: list[dict[str, Any]], correlation: dict[str, Any]
) -> list[list[dict[str, Any]]]:
    """Union-find over shared accounts, shared sources and pivots, with a cap on over-common entities."""
    parent = list(range(len(detections)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    gap = int(correlation["max_join_gap_seconds"]) * 1_000_000_000
    seen: dict[tuple[str, str], list[int]] = defaultdict(list)
    for index, det in enumerate(detections):
        ents = det["entities"]
        for user in ents.get("users", []):
            seen[("user", user)].append(index)
        for src in ents.get("src_ips", []):
            seen[("ip", src)].append(index)
        # A target joins only as a pivot: it must also be the source elsewhere, and then only for internal
        # hosts.
        for dst in ents.get("dst_ips", []):
            if _is_private(dst):
                seen[("pivot_target", dst)].append(index)
    limit = int(correlation["max_entity_detections"])
    for (kind, value), members in sorted(seen.items()):
        pool = list(members)
        if kind == "pivot_target":
            pool += seen.get(("ip", value), [])
            if not seen.get(("ip", value)):
                continue
        pool = sorted(set(pool))
        if len(pool) < 2 or len(pool) > limit:
            continue
        for a, b in zip(pool, pool[1:], strict=False):
            if abs(detections[a]["first_ns"] - detections[b]["first_ns"]) <= gap:
                parent[find(b)] = find(a)
    groups: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for index, det in enumerate(detections):
        groups[find(index)].append(det)
    ordered = [sorted(g, key=lambda d: (d["first_ns"], d["first_offset"])) for g in groups.values()]
    return sorted(ordered, key=lambda g: (g[0]["first_ns"], g[0]["first_offset"]))


def _rows_by_refs(
    con: duckdb.DuckDBPyConnection, refs: list[str], plan: dict[str, Any], quality: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    if not refs:
        return {}
    bases = {c["chunk_id"]: c["line_base"] for c in plan["chunks"]}
    collapsed = {c["event_ns"] for c in quality["collapsed_timestamps"]}
    con.execute("CREATE OR REPLACE TEMP TABLE wanted(evidence_id VARCHAR)")
    con.executemany("INSERT INTO wanted VALUES (?)", [[r] for r in refs])
    cursor = con.execute(
        """SELECT e.evidence_id, event_ns, time_delta_s, date, time, tz, byte_offset, chunk_id,
        line_in_chunk, raw_sha256,
                  canonical_sha256, event_type, subtype, logid, level, action, status, user, src_ip,
                  src_port, dst_ip,
                  dst_port, src_role, dst_role, session_id, service, hostname, url, category, app, app_risk,
                  attack,
                  attack_id, virus, message
           FROM raw_events e JOIN wanted w ON e.evidence_id = w.evidence_id"""
    )
    names = [d[0] for d in cursor.description or []]
    out: dict[str, dict[str, Any]] = {}
    for values in cursor.fetchall():
        row = dict(zip(names, values, strict=True))
        quality_value = (
            "collapsed"
            if row["event_ns"] in collapsed
            else ("conflicting" if row["time_delta_s"] else "normal")
        )
        out[row["evidence_id"]] = EvidenceEvent(
            evidence_id=row["evidence_id"],
            event_utc=utc_text(row["event_ns"]),
            timestamp_quality=quality_value,
            date=row["date"],
            time=row["time"],
            tz=row["tz"],
            byte_offset=row["byte_offset"],
            line=bases[row["chunk_id"]] + row["line_in_chunk"] + 1,
            source_sha256=plan["source_sha256"],
            raw_sha256=row["raw_sha256"],
            canonical_sha256=row["canonical_sha256"],
            event_type=row["event_type"],
            subtype=row["subtype"],
            logid=row["logid"],
            level=row["level"],
            action=row["action"],
            status=row["status"],
            user=row["user"],
            src_ip=row["src_ip"],
            src_port=row["src_port"],
            dst_ip=row["dst_ip"],
            dst_port=row["dst_port"],
            src_role=row["src_role"],
            dst_role=row["dst_role"],
            session_id=row["session_id"],
            service=row["service"],
            hostname=row["hostname"],
            url=row["url"],
            category=row["category"],
            app=row["app"],
            app_risk=row["app_risk"],
            attack=row["attack"],
            attack_id=row["attack_id"],
            virus=row["virus"],
            message=row["message"],
        ).model_dump(mode="json")
    return out


def _context_activity(
    con: duckdb.DuckDBPyConnection, ips: list[str], per_ip: int
) -> dict[str, list[dict[str, Any]]]:
    """Bounded neighbours: other recorded activity from an incident's source addresses, grouped, never row by
    row."""
    if not ips:
        return {}
    con.execute("CREATE OR REPLACE TEMP TABLE watch_ips(ip VARCHAR)")
    con.executemany("INSERT INTO watch_ips VALUES (?)", [[i] for i in ips])
    rows = con.execute(
        """SELECT src_ip, dst_ip, event_type, subtype, action, service, count(*) AS n, min(event_ns),
        max(event_ns),
                  min(byte_offset), min_by(evidence_id, byte_offset, 5)
           FROM events JOIN watch_ips w ON src_ip = w.ip
           GROUP BY ALL ORDER BY n DESC, min(byte_offset) LIMIT 2000"""
    ).fetchall()
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for src, dst, kind, subtype, action, service, n, low, high, first, refs in rows:
        if len(out[src]) < per_ip:
            out[src].append(
                {
                    "src": src,
                    "dst": dst,
                    "kind": f"{kind}/{subtype}",
                    "action": action,
                    "service": service,
                    "count": int(n),
                    "first_ns": low,
                    "last_ns": high,
                    "offset": first,
                    "refs": list(refs),
                }
            )
    return out


def _reachable(con: duckdb.DuckDBPyConnection, ips: list[str], limit: int) -> dict[str, list[dict[str, Any]]]:
    """Internal systems an affected internal host has an accepted connection to. Connectivity, not attacker
    action."""
    if not ips:
        return {}
    con.execute("CREATE OR REPLACE TEMP TABLE reach_ips(ip VARCHAR)")
    con.executemany("INSERT INTO reach_ips VALUES (?)", [[i] for i in ips])
    rows = con.execute(
        """SELECT src_ip, dst_ip, service, count(*) AS n, min_by(evidence_id, byte_offset, 3)
           FROM events JOIN reach_ips r ON src_ip = r.ip
           WHERE event_type = 'traffic' AND action = 'accept' AND dst_role IN ('lan', 'dmz')
           GROUP BY src_ip, dst_ip, service ORDER BY n DESC, dst_ip LIMIT 20000"""
    ).fetchall()
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for src, dst, service, n, refs in rows:
        # Kept wider than the display cap: already-touched systems are removed per incident afterwards.
        if len(out[src]) < limit * 20:
            out[src].append({"dst": dst, "service": service, "count": int(n), "refs": list(refs)})
    return out


def _ip_layer(ip: str) -> str:
    return "endpoint" if _is_private(ip) else "external"


class _IncidentBuilder:
    """Builds one incident's graph, hypotheses, story and summary from its detections."""

    def __init__(self, run_id: str, group: list[dict[str, Any]], rules: dict[str, Any]) -> None:
        self.run_id, self.group, self.rules = run_id, group, rules
        self.incident_id = "finc-" + stable_hash(sorted(d["detection_id"] for d in group), 12)
        self.steps = sorted(
            [(d, s) for d in group for s in d["steps"]], key=lambda x: (x[1]["ns"], x[1]["offset"])
        )
        self.nodes: dict[str, GraphNode] = {}
        self.edges: dict[str, GraphEdge] = {}
        self.node_cap = int(rules["limits"]["node_cap"])
        self.truncated = False

    def _node(self, node: GraphNode) -> str:
        if node.node_id in self.nodes:
            return node.node_id
        if len(self.nodes) >= self.node_cap:
            self.truncated = True
            return ""
        self.nodes[node.node_id] = node
        return node.node_id

    def _edge(self, source: str, target: str, relation: str, **kwargs: Any) -> str:
        if not source or not target or source == target:
            return ""
        edge_id = "fedge-" + stable_hash([source, target, relation])
        if edge_id not in self.edges:
            kwargs.setdefault("rule", relation)
            self.edges[edge_id] = GraphEdge(
                edge_id=edge_id,
                relation=relation,
                source=source,
                target=target,
                rule_version=RULE_VERSION,
                **kwargs,
            )
        return edge_id

    def _entity(self, kind: str, value: str, order: int, refs: list[str]) -> str:
        layer: Any = "identity" if kind == "account" else _ip_layer(value)
        node_kind: Any = {
            "account": "account",
            "ip": "ip" if layer == "external" else "host",
            "device": "critical_asset",
        }[kind]
        if kind == "device":
            layer = "critical_asset"
        return self._node(
            GraphNode(
                node_id=f"entity:{kind}:{value}",
                kind=node_kind,
                label=value,
                layer=layer,
                order=order,
                evidence_refs=refs[:5],
            )
        )

    def build_graph(self, context: dict[str, list[dict[str, Any]]]) -> tuple[list[str], list[str]]:
        path_nodes: list[str] = []
        path_edges: list[str] = []
        previous: tuple[str, dict[str, Any], dict[str, Any]] | None = None
        for order, (det, step) in enumerate(self.steps):
            node_id = f"step:{det['detection_id']}:{order}"
            created = self._node(
                GraphNode(
                    node_id=node_id,
                    kind="burst" if step["count"] > 1 else "event",
                    label=step["label"],
                    layer=step["layer"],
                    order=order,
                    stage=step["stage"],
                    first_utc=step["utc"],
                    last_utc=step["last_utc"],
                    count=step["count"],
                    on_selected_path=True,
                    evidence_refs=step["evidence_refs"],
                    detection_id=det["detection_id"],
                    attributes={"technique": step["technique_id"], "technique_name": step["technique_name"]},
                )
            )
            if not created:
                continue
            path_nodes.append(node_id)
            for kind, value in (
                ("account" if step["actor"] and not _looks_ip(step["actor"]) else "ip", step["actor"]),
                (
                    "account"
                    if step["target"] and not _looks_ip(step["target"]) and det["target_kind"] == "account"
                    else None,
                    step["target"],
                ),
            ):
                if value and kind:
                    self._edge(
                        node_id,
                        self._entity(kind, value, order, step["evidence_refs"]),
                        "involves",
                        confidence=1.0,
                        evidence_refs=step["evidence_refs"][:5],
                        first_utc=step["utc"],
                        last_utc=step["utc"],
                        classification="observed",
                    )
            target = step["target"]
            if target and _looks_ip(target):
                self._edge(
                    node_id,
                    self._entity("ip", target, order, step["evidence_refs"]),
                    "targets",
                    confidence=1.0,
                    evidence_refs=step["evidence_refs"][:5],
                    first_utc=step["utc"],
                    last_utc=step["utc"],
                    classification="observed",
                )
            elif target and det["target_kind"] == "device":
                self._edge(
                    node_id,
                    self._entity("device", target, order, step["evidence_refs"]),
                    "targets",
                    confidence=1.0,
                    evidence_refs=step["evidence_refs"][:5],
                    first_utc=step["utc"],
                    last_utc=step["utc"],
                    classification="observed",
                )
            if previous is not None:
                edge = self._link(previous, node_id, det, step)
                if edge:
                    path_edges.append(edge)
            previous = (node_id, det, step)
        self._add_context(context)
        return path_nodes, path_edges

    def _link(
        self,
        previous: tuple[str, dict[str, Any], dict[str, Any]],
        node_id: str,
        det: dict[str, Any],
        step: dict[str, Any],
    ) -> str:
        prior_id, prior_det, prior_step = previous
        same_rule = prior_det["detection_id"] == det["detection_id"]
        shared = sorted(
            {x for x in (prior_step["actor"], prior_step["target"]) if x}
            & {x for x in (step["actor"], step["target"]) if x}
        )
        ents_a = {v for vs in prior_det["entities"].values() for v in vs}
        ents_b = {v for vs in det["entities"].values() for v in vs}
        shared_any = sorted(ents_a & ents_b)
        gap_s = max(0, (step["ns"] - prior_step["ns"]) // 1_000_000_000)
        continuity = 1.0 if shared else (0.8 if shared_any else 0.0)
        confidence = round(min(0.95, 0.3 + 0.35 * continuity + (0.25 if same_rule else 0.1)), 3)
        contradictions = []
        if prior_step["ns"] == step["ns"]:
            contradictions.append(
                "Both records have the same timestamp; order comes from their position in the file."
            )
        if not shared_any:
            contradictions.append("No shared entity supports this link.")
        return self._edge(
            prior_id,
            node_id,
            "next_step",
            confidence=confidence,
            rule="same_detection_sequence" if same_rule else "shared_entity_sequence",
            evidence_refs=sorted({*prior_step["evidence_refs"][:3], *step["evidence_refs"][:3]}),
            first_utc=prior_step["utc"],
            last_utc=step["utc"],
            classification="inferred",
            contradictions=contradictions,
            components=[
                ScoreComponent(
                    name="entity_continuity",
                    value=continuity,
                    weight=0.35,
                    detail=", ".join((shared or shared_any)[:4]) or "none",
                ),
                ScoreComponent(
                    name="same_detection", value=1.0 if same_rule else 0.0, weight=0.25, detail=det["rule_id"]
                ),
                ScoreComponent(
                    name="gap_seconds",
                    value=float(gap_s),
                    weight=0.0,
                    detail="time between steps; not used to link on its own",
                ),
            ],
            on_selected_path=True,
            missing_evidence=not shared_any,
        )

    def _add_context(self, context: dict[str, list[dict[str, Any]]]) -> None:
        order = len(self.steps)
        steps_refs = {r for _, s in self.steps for r in s["evidence_refs"]}
        for src in self.source_ips():
            for item in context.get(src, []):
                if set(item["refs"]) & steps_refs and item["kind"] in ("utm/ips", "utm/virus"):
                    continue
                node_id = "context:" + stable_hash(
                    [src, item["dst"], item["kind"], item["action"], item["service"]]
                )
                created = self._node(
                    GraphNode(
                        node_id=node_id,
                        kind="burst" if item["count"] > 1 else "event",
                        label=_context_label(item),
                        layer=_ip_layer(item["dst"] or ""),
                        order=order,
                        first_utc=utc_text(item["first_ns"]),
                        last_utc=utc_text(item["last_ns"]),
                        count=item["count"],
                        is_context=True,
                        evidence_refs=item["refs"],
                        attributes={"service": item["service"]},
                    )
                )
                order += 1
                self._edge(
                    self._entity("ip", src, order, item["refs"]),
                    created,
                    "also_recorded",
                    confidence=1.0,
                    evidence_refs=item["refs"],
                    first_utc=utc_text(item["first_ns"]),
                    last_utc=utc_text(item["last_ns"]),
                    classification="observed",
                )

    def source_ips(self) -> list[str]:
        return sorted({ip for d in self.group for ip in d["entities"].get("src_ips", [])})

    def internal_hosts(self) -> list[str]:
        ips = {ip for d in self.group for key in ("src_ips", "dst_ips") for ip in d["entities"].get(key, [])}
        return sorted(ip for ip in ips if _is_private(ip))

    def hypotheses(self, path_nodes: list[str], path_edges: list[str]) -> Hypotheses:
        confidence = sum(d["confidence"] for d in self.group) / len(self.group)
        edges = [self.edges[e] for e in path_edges]
        continuity = sum(1 for e in edges if not e.missing_evidence) / len(edges) if edges else 1.0
        stages = {s["stage"] for _, s in self.steps}
        volume = min(1.0, sum(d["merged_events"] for d in self.group) / 500)
        components = [
            ScoreComponent(
                name="rule_confidence",
                value=round(confidence, 3),
                weight=0.55,
                detail="mean across detections",
            ),
            ScoreComponent(
                name="entity_continuity",
                value=round(continuity, 3),
                weight=0.25,
                detail="links with a shared entity",
            ),
            ScoreComponent(
                name="stage_coverage",
                value=round(min(1.0, len(stages) / 4), 3),
                weight=0.1,
                detail=f"{len(stages)} stages",
            ),
            ScoreComponent(
                name="evidence_volume",
                value=round(volume, 3),
                weight=0.1,
                detail="records behind the path, capped at 500",
            ),
        ]
        score = round(sum(c.value * c.weight for c in components), 3)
        gaps = self.evidence_gaps()
        selected = AttackHypothesis(
            hypothesis_id="fhyp-" + stable_hash([self.incident_id, "selected"]),
            rank=1,
            status="selected",
            title="One connected attack sequence",
            description="The steps belong to one actor or chain, linked by shared accounts or addresses.",
            detection_ids=[d["detection_id"] for d in self.group],
            node_ids=path_nodes,
            edge_ids=path_edges,
            score=score,
            components=components,
            evidence_gaps=gaps,
        )
        alternates = []
        if len(self.group) > 1:
            best = max(self.group, key=lambda d: d["confidence"])
            nodes = [n for n in path_nodes if self.nodes[n].detection_id == best["detection_id"]]
            alternates.append(
                AttackHypothesis(
                    hypothesis_id="fhyp-" + stable_hash([self.incident_id, "independent"]),
                    rank=2,
                    status="alternate",
                    title="Unrelated activity sharing an entity",
                    description=f"Only “{best['title']}” is one sequence. The others share an address or "
                    "account by coincidence.",
                    detection_ids=[best["detection_id"]],
                    node_ids=nodes,
                    edge_ids=[],
                    score=round(score * 0.6, 3),
                    components=[
                        ScoreComponent(
                            name="single_detection_share",
                            value=0.6,
                            weight=1.0,
                            detail="discounted because shared entities would be unexplained",
                        )
                    ],
                    evidence_gaps=["Would need another reason for the shared entities."],
                )
            )
        rule = self.group[0]["rule_id"]
        alternates.append(
            AttackHypothesis(
                hypothesis_id="fhyp-" + stable_hash([self.incident_id, "benign"]),
                rank=len(alternates) + 2,
                status="alternate",
                title="Benign explanation",
                description=BENIGN_EXPLANATIONS.get(rule, "Legitimate activity that resembles an attack."),
                detection_ids=[],
                node_ids=[],
                edge_ids=[],
                score=round(max(0.05, 1 - confidence) * 0.8, 3),
                components=[
                    ScoreComponent(
                        name="one_minus_confidence",
                        value=round(1 - confidence, 3),
                        weight=0.8,
                        detail="the logs cannot rule this out without change or ticket records",
                    )
                ],
                evidence_gaps=[
                    "No change-management or ticket data is available to confirm or rule this out."
                ],
            )
        )
        margin = round(score - max(a.score for a in alternates), 3)
        return Hypotheses(
            incident_id=self.incident_id, selected=selected, alternates=alternates, uncertainty_margin=margin
        )

    def evidence_gaps(self) -> list[str]:
        gaps = []
        if any(d["timestamp_quality"] == "collapsed" for d in self.group):
            gaps.append("Some evidence has a collapsed timestamp, so its order comes from file position.")
        if any(d["confidence"] < self.rules["rules"][d["rule_id"]]["confidence"] for d in self.group):
            gaps.append("At least one expected step of a sequence was not found.")
        if any(d["evidence_refs_truncated"] for d in self.group):
            gaps.append("Merged activity is cited by a sample of its evidence, not every record.")
        if not any(_is_private(h) for h in self.internal_hosts()):
            gaps.append("No internal host is named, so effect inside the network is not shown.")
        gaps.append(
            "These logs have no payload or endpoint data, so success of an action cannot be proven from them."
        )
        return gaps

    def story(self, hypotheses: Hypotheses, reach: ReachabilityResult, valid: set[str]) -> AttackStory:
        statements: list[StoryStatement] = []
        for index, (det, step) in enumerate(self.steps):
            statements.append(
                StoryStatement(
                    statement_id=f"s{index + 1}",
                    text=f"{step['utc']}: {step['label']}.",
                    kind="observed",
                    evidence_ids=[r for r in step["evidence_refs"][:5] if r in valid],
                )
            )
            del det
        for edge_id in hypotheses.selected.edge_ids:
            edge = self.edges[edge_id]
            if edge.missing_evidence:
                statements.append(
                    StoryStatement(
                        statement_id=f"g{len(statements) + 1}",
                        text="This link in the sequence has no shared entity behind it.",
                        kind="gap",
                        evidence_ids=[r for r in edge.evidence_refs if r in valid],
                    )
                )
        unsupported = sum(1 for s in statements if not s.evidence_ids)
        first_det, first = self.steps[0]
        strongest = max(self.group, key=lambda d: (d["confidence"], d["merged_events"]))
        hosts = self.internal_hosts()
        users = sorted({u for d in self.group for u in d["entities"].get("users", [])})
        reachable = (
            ", ".join(t.target for t in reach.targets[:5]) + " could be reached next. This is hypothetical."
            if reach.targets
            else "No reachable next system could be established from these logs."
        )
        del first_det
        return AttackStory(
            incident_id=self.incident_id,
            what_happened=" ".join(d["reason"] for d in self.group[:3]),
            where_started=f"{first['label']} at {first['utc']}.",
            who_compromised=(
                f"Accounts involved: {', '.join(users[:5])}."
                if users
                else "No account is named in this evidence."
            )
            + " Compromise is a candidate, not confirmed.",
            systems_affected=f"Hosts named: {', '.join(hosts[:6])}."
            if hosts
            else "No internal host is named in the evidence.",
            strongest_evidence=(
                f"{strongest['title']}: {strongest['merged_events']} record(s), "
                f"confidence {strongest['confidence']}."
            ),
            uncertain=" ".join(self.evidence_gaps()[:3]),
            reachable_next=reachable,
            statements=statements,
            checked_statements=len(statements),
            unsupported_claims=unsupported,
        )

    def summary(self) -> IncidentSummary:
        hosts = self.internal_hosts()
        users = sorted({u for d in self.group for u in d["entities"].get("users", [])})
        devices = sorted({x for d in self.group for x in d["entities"].get("devices", [])})
        first = self.steps[0][1]
        confidence = round(sum(d["confidence"] for d in self.group) / len(self.group), 3)
        risk = round(1 - _prod(1 - d["risk_contribution"] for d in self.group), 3)
        target_det = max(self.group, key=lambda d: d["risk_contribution"])
        critical = (
            (target_det["entities"].get("devices") or target_det["entities"].get("dst_ips") or [None])[0]
            if target_det["target_kind"] in ("device", "service")
            else None
        )
        quality: Any = (
            "collapsed" if any(d["timestamp_quality"] == "collapsed" for d in self.group) else "normal"
        )
        return IncidentSummary(
            incident_id=self.incident_id,
            run_id=self.run_id,
            title=target_det["title"]
            if len(self.group) == 1
            else f"{target_det['title']} and {len(self.group) - 1} related",
            first_utc=min(d["first_utc"] for d in self.group),
            last_utc=max(d["last_utc"] for d in self.group),
            timestamp_quality=quality,
            entry_point=first["actor"] or first["label"],
            affected_identity=users[0] if users else None,
            affected_devices=(devices + hosts)[:8],
            critical_target=critical,
            evidence_count=sum(len(d["evidence_refs"]) for d in self.group),
            merged_events=sum(d["merged_events"] for d in self.group),
            detection_count=len(self.group),
            confidence=confidence,
            risk=risk,
            stages=sorted({s["stage"] for _, s in self.steps}),
            techniques=sorted({s["technique_id"] for _, s in self.steps}),
        )


def _context_label(item: dict[str, Any]) -> str:
    return f"{item['count']} {item['kind']} {item['action'] or ''} to {item['dst']}".replace("  ", " ")


def _prod(values: Any) -> float:
    out = 1.0
    for value in values:
        out *= value
    return out


def _looks_ip(value: str) -> bool:
    parts = value.split(".")
    return len(parts) == 4 and all(p.isdigit() for p in parts)


def reconstruct_run(runner: Runner, plan: dict[str, Any], quality: dict[str, Any]) -> dict[str, Any]:
    """Detect, then write every incident's files. Repeating this on the same parts gives the same hashes."""
    run_dir: Path = runner.dir
    rules = runner.rules
    con = connect(run_dir, runner.memory_limit_gb)
    collapsed = {int(c["event_ns"]) for c in quality["collapsed_timestamps"]}
    total_bursts, bursts = behavioural_bursts(con, rules)
    atomic_write_json(run_dir / "bursts.json", {"total": total_bursts, "kept": len(bursts), "items": bursts})
    runner.check_cancel()
    detections = run_detection(con, rules, runner.config_hash, collapsed)
    atomic_write_json(run_dir / "detections.json", detections)
    runner.check_cancel()

    correlation = rules["correlation"]
    groups = cluster_detections(detections, correlation)
    builders = [_IncidentBuilder(runner.run_id, g, rules) for g in groups]
    source_ips = sorted({ip for b in builders for ip in b.source_ips()})
    context = _context_activity(con, source_ips, int(correlation["follow_on_max_groups"]))
    internal = sorted({ip for b in builders for ip in b.internal_hosts()})
    reach_map = _reachable(con, internal, int(correlation["reachability_limit"]))

    incidents_dir = run_dir / "incidents"
    commit = git_commit()
    limit = int(rules["limits"]["evidence_events_per_incident"])
    summaries = []
    for builder in builders:
        path_nodes, path_edges = builder.build_graph(context)
        hypotheses = builder.hypotheses(path_nodes, path_edges)
        refs: list[str] = []
        for det in builder.group:
            for ref in det["evidence_refs"]:
                if ref not in refs:
                    refs.append(ref)
        for node in builder.nodes.values():
            for ref in node.evidence_refs:
                if ref not in refs:
                    refs.append(ref)
        evidence = _rows_by_refs(con, refs[: limit * 3], plan, quality)
        valid = set(evidence)

        targets: dict[str, ReachableTarget] = {}
        # A system the activity already touched is observed, so it can never be listed as hypothetical.
        touched = {v for det in builder.group for vs in det["entities"].values() for v in vs}
        for host in builder.internal_hosts():
            for item in reach_map.get(host, []):
                if item["dst"] in touched or item["dst"] in targets:
                    continue
                targets[item["dst"]] = ReachableTarget(
                    target=item["dst"],
                    layer="endpoint",
                    via=host,
                    basis=(
                        f"{host} had {item['count']} accepted {item['service'] or 'network'} "
                        "connection(s) to this system."
                    ),
                    observed_connections=item["count"],
                    evidence_refs=item["refs"],
                    confidence=round(min(0.7, 0.3 + item["count"] / 500), 3),
                )
        reach = ReachabilityResult(
            incident_id=builder.incident_id,
            targets=sorted(targets.values(), key=lambda t: (-t.observed_connections, t.target))[
                : int(correlation["reachability_limit"])
            ],
            limitations=[
                "Based only on connections recorded in this log. No asset inventory or permissions data is "
                "available.",
                "A recorded connection shows a network path, not that an attacker used it.",
            ],
        )
        for target in reach.targets:
            for ref in target.evidence_refs:
                if ref not in valid:
                    refs.append(ref)
        if any(r not in evidence for r in refs[: limit * 3]):
            evidence = _rows_by_refs(con, refs[: limit * 3], plan, quality)
            valid = set(evidence)
        for target in reach.targets:
            builder._edge(
                builder._entity("ip", target.via, len(builder.steps), target.evidence_refs),
                builder._node(
                    GraphNode(
                        node_id=f"reach:{target.target}",
                        kind="host",
                        label=target.target,
                        layer="application",
                        order=len(builder.steps) + 1,
                        attributes={"hypothetical": True},
                        evidence_refs=target.evidence_refs,
                    )
                ),
                "could_reach",
                confidence=target.confidence,
                evidence_refs=target.evidence_refs,
                classification="reachable",
            )

        story = builder.story(hypotheses, reach, valid)
        summary = builder.summary()
        nodes = sorted(builder.nodes.values(), key=lambda n: (n.order, n.node_id))
        edges = sorted(builder.edges.values(), key=lambda e: e.edge_id)
        graph_hash = stable_hash(
            {
                "nodes": [n.model_dump(mode="json") for n in nodes],
                "edges": [e.model_dump(mode="json") for e in edges],
            },
            64,
        )
        graph = IncidentGraph(
            incident_id=builder.incident_id,
            nodes=nodes,
            edges=edges,
            graph_hash=graph_hash,
            truncated=builder.truncated,
            node_cap=builder.node_cap,
        )
        timeline = [
            TimelineEntry(
                order=i,
                utc=step["utc"],
                title=step["label"],
                detail=det["title"],
                stage=step["stage"],
                basis=det["basis"],
                timestamp_quality=det["timestamp_quality"],
                detection_id=det["detection_id"],
                evidence_refs=step["evidence_refs"][:10],
            )
            for i, (det, step) in enumerate(builder.steps)
        ]
        cited = sorted(valid & {r for s in story.statements for r in s.evidence_ids})
        all_cited = {r for _, s in builder.steps for r in s["evidence_refs"]}
        coverage = round(len(all_cited & valid) / len(all_cited), 6) if all_cited else 0.0
        affected: dict[str, list[str]] = defaultdict(list)
        for det in builder.group:
            for key, values in det["entities"].items():
                affected[key] = sorted({*affected[key], *values})[:40]
        related = [
            other.incident_id
            for other in builders
            if other is not builder and set(other.internal_hosts()) & set(builder.internal_hosts())
        ]
        detail = IncidentDetail(
            summary=summary,
            root_cause=(
                f"{builder.steps[0][1]['label']} ({builder.steps[0][0]['title']}). "
                "Candidate root cause; not confirmed."
            ),
            selected_path_id=hypotheses.selected.hypothesis_id,
            affected_entities=dict(affected),
            evidence_gaps=builder.evidence_gaps(),
            uncertainty_margin=hypotheses.uncertainty_margin,
            alert_merge_count=sum(d["merged_events"] for d in builder.group),
            detections=[Detection.model_validate(d) for d in builder.group],
            timeline=timeline,
            evidence=[EvidenceEvent.model_validate(evidence[r]) for r in refs if r in evidence][:limit],
            related_incidents=sorted(related),
            response_simulation=ResponseEligibility(available=False, missing=RESPONSE_MISSING),
        )
        proof = make_proof(
            incident_id=builder.incident_id,
            run_id=runner.run_id,
            dataset_id=runner.dataset.dataset_id,
            plan=plan,
            config_hash=runner.config_hash,
            commit=commit,
            graph_hash=graph_hash,
            selected_path_id=hypotheses.selected.hypothesis_id,
            evidence_coverage=coverage,
            unsupported_claims=story.unsupported_claims,
            uncertainty_margin=hypotheses.uncertainty_margin,
            cited=cited,
        )
        folder = incidents_dir / builder.incident_id
        for name, doc in (
            ("detail", detail.model_dump(mode="json")),
            ("graph", graph.model_dump(mode="json")),
            ("hypotheses", hypotheses.model_dump(mode="json")),
            ("reachability", reach.model_dump(mode="json")),
            ("story", story.model_dump(mode="json")),
            ("proof", proof),
        ):
            atomic_write_json(folder / f"{name}.json", doc)
        summaries.append(summary.model_dump(mode="json"))
    summaries.sort(key=lambda s: (-s["risk"], s["first_utc"], s["incident_id"]))
    atomic_write_json(incidents_dir / "index.json", summaries)
    con.close()
    return {"bursts": total_bursts, "detections": len(detections), "incidents": len(summaries)}
