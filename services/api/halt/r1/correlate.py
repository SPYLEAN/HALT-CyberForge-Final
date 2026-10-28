"""Correlate a mixed event stream into incidents and turn the incident into findings.

1. Walk events in timestamp order; extract features; evaluate rules; an event scoring >= SUSPICIOUS
   is suspicious and raises the user's prior-suspicion feature for later events.
2. Cluster suspicious events by user, splitting on gaps longer than CLUSTER_GAP_S.
3. An incident is a cluster with at least MIN_EVENTS suspicious events across at least MIN_STAGES stages.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from halt.contracts.common import Derivation
from halt.contracts.events import SecurityEvent
from halt.contracts.findings import Finding, FindingScore, Stage
from halt.r1.attack_map import stage, technique
from halt.r1.features import FeatureExtractor, vector
from halt.r1.rules import SUSPICIOUS, RuleHit, evaluate

CLUSTER_GAP_S = 3600
MIN_EVENTS = 3
MIN_STAGES = 2

STAGE_ORDER: list[Stage] = [
    "initial_access",
    "credential_persistence",
    "token_abuse",
    "discovery",
    "collection",
    "exfiltration",
]
STAGE_TITLES: dict[Stage, str] = {
    "initial_access": "Initial access through consent phishing and a suspicious sign-in",
    "credential_persistence": "Persistence through an added authenticator and a malicious OAuth grant",
    "token_abuse": "Session-token replay from attacker infrastructure",
    "discovery": "Finance-resource discovery at an unusual request rate",
    "collection": "Collection",
    "exfiltration": "Exfiltration",
}


@dataclass(frozen=True)
class ScoredEvent:
    event: SecurityEvent
    features: list[float]
    hit: RuleHit | None

    @property
    def suspicious(self) -> bool:
        return self.hit is not None and self.hit.score >= SUSPICIOUS


@dataclass(frozen=True)
class Cluster:
    user: str
    events: list[ScoredEvent]

    @property
    def stages(self) -> set[Stage]:
        return {stage(s.event.kind) for s in self.events}

    @property
    def is_incident(self) -> bool:
        return len(self.events) >= MIN_EVENTS and len(self.stages) >= MIN_STAGES


def score_stream(events: list[SecurityEvent]) -> list[ScoredEvent]:
    extractor = FeatureExtractor()
    scored = []
    for e in sorted(events, key=lambda e: (e.ts, e.source.record_id)):
        f = extractor.extract(e)
        hit = evaluate(f)
        se = ScoredEvent(e, vector(f), hit)
        if se.suspicious:
            extractor.mark_suspicious(e)
        scored.append(se)
    return scored


def cluster(scored: list[ScoredEvent]) -> list[Cluster]:
    by_user: dict[str, list[ScoredEvent]] = {}
    for s in scored:
        if s.suspicious:
            by_user.setdefault(FeatureExtractor.upn(s.event), []).append(s)
    clusters = []
    for user, items in sorted(by_user.items()):
        current: list[ScoredEvent] = []
        for s in items:
            if current and (s.event.ts - current[-1].event.ts).total_seconds() > CLUSTER_GAP_S:
                clusters.append(Cluster(user, current))
                current = []
            current.append(s)
        clusters.append(Cluster(user, current))
    return sorted(clusters, key=lambda c: (-len(c.events), c.user))


def incidents(events: list[SecurityEvent]) -> list[Cluster]:
    return [c for c in cluster(score_stream(events)) if c.is_incident]


def findings(
    incident: Cluster, model: Callable[[list[float]], float] | None = None, model_method: str = "logreg"
) -> list[Finding]:
    by_stage: dict[Stage, list[ScoredEvent]] = {}
    for s in incident.events:
        by_stage.setdefault(stage(s.event.kind), []).append(s)

    out: list[Finding] = []
    for st in STAGE_ORDER:
        items = by_stage.get(st)
        if not items:
            continue
        hits = [s.hit for s in items if s.hit is not None]
        met = sum(len(h.met) for h in hits)
        checked = sum(len(h.checked) for h in hits)
        ids = [s.event.id for s in items]
        conditions = "; ".join(f"{h.rule_id}: {', '.join(h.met)}" for h in hits)
        score = FindingScore(
            value=round(max(h.score for h in hits), 4),
            derivation=Derivation(
                numerator=met,
                denominator=checked,
                method=f"{met} of {checked} rule conditions met. {conditions}",
                source_ids=ids,
            ),
            method="rule",
        )
        model_score = None
        if model is not None:
            probs = [model(s.features) for s in items]
            model_score = FindingScore(
                value=round(max(probs), 4),
                derivation=Derivation(
                    method=f"Highest {model_method} probability over {len(items)} event(s); "
                    "trained on synthetic data only (seed 2417)",
                    source_ids=ids,
                ),
                method=model_method,
            )
        techniques = {technique(s.event.kind).technique_id: technique(s.event.kind) for s in items}
        out.append(
            Finding(
                id=f"F-{len(out) + 1:02d}",
                title=STAGE_TITLES[st],
                stage=st,
                evidence_ids=[i for i in ids if i.startswith("EV-")],
                score=score,
                model_score=model_score,
                attack=[techniques[k] for k in sorted(techniques)],
                limits=_limits(st),
            )
        )
    return out


def _limits(st: Stage) -> list[str]:
    return {
        "initial_access": ["A travel or VPN record for the sign-in ASN would lower this."],
        "credential_persistence": [
            "A change ticket approving the app or the authenticator would lower this."
        ],
        "token_abuse": ["A matching managed-device record would lower this."],
        "discovery": ["A scheduled export job for this user would lower this."],
    }.get(st, [])


def enrich(events: list[SecurityEvent], incident: Cluster) -> list[SecurityEvent]:
    """Fill the ATT&CK technique on the incident's events (the fixture leaves it null)."""
    ids = {s.event.id for s in incident.events}
    return [e.model_copy(update={"attack": technique(e.kind)}) if e.id in ids else e for e in events]
