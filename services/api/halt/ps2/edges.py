"""Candidate causal edges between canonical events (`halt.edges/1.0`).

An edge e1 → e2 needs e1 strictly earlier (ties broken by event id), so the event graph is a DAG by
construction; repeated entities and cyclic entity relations are kept as separate events, never collapsed.

Confidence is a noisy-OR of evidence components, each weighted in config:
  exact identifier (observed): shared session, token lineage (minted → used), shared token, parent/child
                               process, application just granted or credentialed → used
  identity + context (inferred): same identity and device, same identity and IP, mail recipient → sign-in;
                               decayed by exp(-Δt / τ)
  supporting only:             temporal succession, ATT&CK stage progression, both endpoints suspicious
An edge with no exact or identity component is "temporal only" and capped at `temporal_only_cap`, below the
selection threshold: time proximity alone never makes a causal link. A contradiction on the shared entity
multiplies confidence by (1 − contradiction_penalty).
"""

from __future__ import annotations

import math
from bisect import bisect_left
from collections import defaultdict
from collections.abc import Iterable

from halt.canonical import sha256_hex
from halt.ps2.attack import TACTIC_INDEX
from halt.ps2.config import ReconstructionConfig
from halt.ps2.resolve import Resolution
from halt.ps2.schema import CandidateEdge, CanonicalEvent, ConfidenceComponent, StageAssignment
from halt.ps2.seeds import Suspicion

RULE_VERSION = "halt.edges/1.0"
IDENTITY = ("identity_device", "identity_ip", "email_recipient_auth")
SUPPORTING = ("temporal_succession", "stage_transition", "anomaly_continuity")


def edge_id(src: str, dst: str) -> str:
    return "edge-" + sha256_hex([src, dst])[:16]


def _add(
    comps: list[ConfidenceComponent],
    fields: list[str],
    w: dict[str, float],
    name: str,
    value: float,
    detail: str,
    *flds: str,
) -> None:
    comps.append(ConfidenceComponent(name=name, value=round(value, 6), weight=w[name], detail=detail))
    fields.extend(flds)


def _before(a: CanonicalEvent, b: CanonicalEvent) -> bool:
    return (a.occurred_at, a.event_id) < (b.occurred_at, b.event_id)


def candidate_edges(
    events: list[CanonicalEvent],
    res: Resolution,
    stages: dict[str, StageAssignment],
    suspicion: dict[str, Suspicion],
    config: ReconstructionConfig,
) -> list[CandidateEdge]:
    win = config.windows_s
    w = config.edge_weights
    by_session: dict[str, list[CanonicalEvent]] = defaultdict(list)
    by_token_use: dict[str, list[CanonicalEvent]] = defaultdict(list)
    by_actor: dict[str, list[CanonicalEvent]] = defaultdict(list)
    by_process: dict[tuple[str, int], list[CanonicalEvent]] = defaultdict(list)
    by_app: dict[str, list[CanonicalEvent]] = defaultdict(list)
    by_recipient: dict[str, list[CanonicalEvent]] = defaultdict(list)
    for e in events:
        if e.session:
            by_session[e.session].append(e)
        if e.token:
            by_token_use[e.token].append(e)
        if e.actor_user:
            by_actor[e.actor_user].append(e)
        if e.host and e.process_id is not None:
            by_process[(e.host, e.process_id)].append(e)
        if e.application:
            by_app[e.application].append(e)
        if e.event_kind == "email_delivery" and e.target_user:
            by_recipient[e.target_user].append(e)
    actor_times = {a: [x.occurred_at.timestamp() for x in evs] for a, evs in by_actor.items()}

    # Temporal succession is allowed only to each event's nearest K same-identity successors.
    succ: set[tuple[str, str]] = set()
    for evs in by_actor.values():
        for i, e1 in enumerate(evs):
            for n, e2 in enumerate(evs[i + 1 :]):
                if (
                    e2.occurred_at - e1.occurred_at
                ).total_seconds() > win.temporal_succession or n >= config.temporal_successors_per_event:
                    break
                succ.add((e1.event_id, e2.event_id))

    pairs: set[tuple[str, str]] = set()
    lookup = {e.event_id: e for e in events}

    def within(a: CanonicalEvent, b: CanonicalEvent, limit: int) -> bool:
        return 0 <= (b.occurred_at - a.occurred_at).total_seconds() <= limit

    def add_pairs(group: Iterable[CanonicalEvent], target: CanonicalEvent, limit: int) -> None:
        for a in group:
            if a.event_id != target.event_id and _before(a, target) and within(a, target, limit):
                pairs.add((a.event_id, target.event_id))

    issued_by: dict[str, CanonicalEvent] = {}
    for e in events:
        if e.token_issued:
            issued_by.setdefault(e.token_issued, e)
    for e2 in events:
        if e2.session:
            add_pairs(by_session[e2.session], e2, win.edge_max_gap)
        if e2.token:
            add_pairs(by_token_use[e2.token], e2, win.edge_max_gap)
            src = issued_by.get(e2.token)
            if src:
                add_pairs([src], e2, win.edge_max_gap)
        if e2.host and e2.parent_process_id is not None:
            add_pairs(by_process.get((e2.host, e2.parent_process_id), []), e2, win.edge_max_gap)
        if e2.application:
            add_pairs(
                [x for x in by_app[e2.application] if x.event_kind in ("app_consent", "credential_change")],
                e2,
                win.edge_max_gap,
            )
        if e2.event_kind == "authentication" and e2.actor_user:
            add_pairs(by_recipient.get(e2.actor_user, []), e2, win.email_to_auth)
        if e2.actor_user:
            times = actor_times[e2.actor_user]
            t2 = e2.occurred_at.timestamp()
            lo = bisect_left(times, t2 - max(win.identity_ip, win.identity_device))
            add_pairs(by_actor[e2.actor_user][lo:], e2, max(win.identity_ip, win.identity_device))
    pairs |= succ

    edges: list[CandidateEdge] = []
    for src_id, dst_id in sorted(pairs):
        a, b = lookup[src_id], lookup[dst_id]
        if not _before(a, b):
            continue
        dt = (b.occurred_at - a.occurred_at).total_seconds()
        decay = math.exp(-dt / win.temporal_decay_tau)
        comps: list[ConfidenceComponent] = []
        fields: list[str] = []
        contradicted = False
        ra, rb = res.roles.get(src_id, {}), res.roles.get(dst_id, {})

        if a.session and a.session == b.session:
            _add(
                comps,
                fields,
                w,
                "shared_session",
                w["shared_session"],
                f"both events carry session {a.session}",
                "session",
            )
            contradicted |= ra.get("session", "") in res.contradicted
        if a.token_issued and a.token_issued == b.token:
            _add(
                comps,
                fields,
                w,
                "token_lineage",
                w["token_lineage"],
                f"{a.token_issued} minted by the first event, presented by the second",
                "token_issued",
                "token",
            )
            contradicted |= rb.get("token", "") in res.contradicted
        elif a.token and a.token == b.token:
            _add(
                comps,
                fields,
                w,
                "shared_token",
                w["shared_token"],
                f"both events present credential {a.token}",
                "token",
            )
            contradicted |= ra.get("token", "") in res.contradicted
        if (
            a.host
            and a.host == b.host
            and a.process_id is not None
            and a.process_id == b.parent_process_id
            and a.process == b.parent_process
        ):
            _add(
                comps,
                fields,
                w,
                "parent_child_process",
                w["parent_child_process"],
                f"{b.process} spawned by {a.process} (pid {a.process_id}) on {a.host}",
                "process_id",
                "parent_process_id",
            )
        if (
            a.application
            and a.application == b.application
            and a.event_kind in ("app_consent", "credential_change")
        ):
            _add(
                comps,
                fields,
                w,
                "shared_application",
                w["shared_application"],
                f"application {a.application_name or a.application} granted, then used",
                "application",
            )
        same_actor = bool(a.actor_user and a.actor_user == b.actor_user)
        if same_actor and a.device_id and a.device_id == b.device_id and dt <= win.identity_device:
            _add(
                comps,
                fields,
                w,
                "identity_device",
                w["identity_device"] * decay,
                f"{a.actor_user} on device {a.device or a.device_id}",
                "actor_user",
                "device_id",
            )
        if same_actor and a.src_ip and a.src_ip == b.src_ip and dt <= win.identity_ip:
            _add(
                comps,
                fields,
                w,
                "identity_ip",
                w["identity_ip"] * decay,
                f"{a.actor_user} from {a.src_ip}",
                "actor_user",
                "src_ip",
            )
        if (
            a.event_kind == "email_delivery"
            and b.event_kind == "authentication"
            and a.target_user
            and a.target_user == b.actor_user
            and dt <= win.email_to_auth
        ):
            _add(
                comps,
                fields,
                w,
                "email_recipient_auth",
                w["email_recipient_auth"] * decay,
                f"{b.actor_user} received mail from {a.sender_domain}, then signed in",
                "target_user",
                "actor_user",
            )
        strong = bool(comps)
        if (src_id, dst_id) in succ:
            _add(
                comps,
                fields,
                w,
                "temporal_succession",
                w["temporal_succession"] * decay,
                f"{dt:.0f} s apart for the same identity",
                "occurred_at",
            )
        sa, sb = stages.get(src_id), stages.get(dst_id)
        if sa and sb and sa.tactic and sb.tactic and TACTIC_INDEX[sa.tactic] <= TACTIC_INDEX[sb.tactic]:
            _add(
                comps,
                fields,
                w,
                "stage_transition",
                w["stage_transition"],
                f"{sa.tactic} → {sb.tactic}",
                "attack_candidates",
            )
        threshold = config.seed.threshold
        if suspicion[src_id].score >= threshold and suspicion[dst_id].score >= threshold:
            _add(
                comps,
                fields,
                w,
                "anomaly_continuity",
                w["anomaly_continuity"],
                "both events independently suspicious",
                "suspicion",
            )
        if not comps or all(c.name in ("stage_transition", "anomaly_continuity") for c in comps):
            continue
        conf = 1.0 - math.prod(1.0 - c.value for c in comps)
        names = {c.name for c in comps}
        exact = bool(names & set(config.exact_components))
        if not strong:
            conf = min(conf, config.temporal_only_cap)
        if contradicted:
            comps.append(
                ConfidenceComponent(
                    name="contradiction",
                    value=-config.contradiction_penalty,
                    weight=config.contradiction_penalty,
                    detail="the shared entity has contradicting observations",
                )
            )
            conf *= 1.0 - config.contradiction_penalty
        primary = max(
            (c for c in comps if c.name not in SUPPORTING and c.name != "contradiction"),
            key=lambda c: c.value,
            default=comps[0],
        )
        edges.append(
            CandidateEdge(
                edge_id=edge_id(src_id, dst_id),
                edge_type=primary.name,
                source=src_id,
                target=dst_id,
                first_observed=a.occurred_at,
                last_observed=b.occurred_at,
                evidence_event_ids=[src_id, dst_id],
                evidence_fields=sorted(set(fields)),
                confidence=round(min(1.0, conf), 6),
                components=comps,
                classification="observed" if exact else "inferred",
                rule_version=RULE_VERSION,
                selected=False,
            )
        )
    return edges
