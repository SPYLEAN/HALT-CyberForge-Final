"""Deterministic attack story from the reconstructed graph. No language model.

Each statement is rendered from `facts`, and every fact names where it comes from:
  "event:<event_id>:<field>"   a canonical-event field value
  "edge:<edge_id>:<attr>"      an edge attribute (type, classification, confidence)
  "stage:<event_id>"           the event's primary ATT&CK technique id
  "context:<resource>"         the business service the organisation context assigns to a resource
`check` re-derives every fact from those sources; a statement with a fact that does not match, or with no
cited
event, is an unsupported claim.
"""

from __future__ import annotations

from typing import Literal

from halt.ps2.schema import (
    AttackStory,
    CandidateEdge,
    CanonicalEvent,
    OrgContext,
    PathHypothesis,
    StageAssignment,
    StoryStatement,
)

_VERBS = {
    "email_delivery": (
        "{recipient} received mail from {sender_domain} (domain {domain_age} days old, link type {link_type})"
    ),
    "authentication": "{actor} signed in from {src_ip} (AS{asn})",
    "mfa_method_change": "{actor} registered a new MFA method",
    "app_consent": "{actor} consented to {application} (publisher verified: {verified})",
    "credential_change": "{actor} added credentials to {application}",
    "token_use": "a token {token} was presented for {actor} from {src_ip}",
    "token_issued": "{actor} minted credential {token_issued} for {resource}",
    "role_assumption": "{actor} assumed role {role} from {src_ip}",
    "permission_change": "{actor} changed permissions on {role}: {permission}",
    "resource_enumeration": "{actor} listed {resource} ({count} requests)",
    "resource_access": "{actor} read {resource}",
    "access_denied": "{actor} was denied access to {resource}",
    "database_query": "{actor} queried {resource} ({action})",
    "process_start": "{process} started on {host} by {actor}",
}

_FIELDS = {
    "recipient": "target_user",
    "sender_domain": "sender_domain",
    "domain_age": "sender_domain_age_days",
    "link_type": "link_type",
    "actor": "actor_user",
    "src_ip": "src_ip",
    "asn": "asn",
    "application": "application_name",
    "verified": "publisher_verified",
    "token": "token",
    "token_issued": "token_issued",
    "resource": "resource",
    "role": "role",
    "permission": "permission",
    "count": "request_count",
    "action": "action",
    "process": "process",
    "host": "host",
}


def _value(e: CanonicalEvent, fld: str) -> str | None:
    v = getattr(e, fld)
    if fld == "application_name" and v is None:
        v = e.application
    return None if v is None else str(v)


def _render(e: CanonicalEvent) -> tuple[str, dict[str, str]]:
    template = _VERBS[e.event_kind]
    facts: dict[str, str] = {}
    values: dict[str, str] = {}
    for name, fld in _FIELDS.items():
        if "{" + name + "}" in template:
            v = _value(e, fld)
            values[name] = v if v is not None else "unknown"
            if v is not None:
                facts[f"event:{e.event_id}:{fld}"] = v
    return template.format(**values), facts


def build(
    run_id: str,
    path: PathHypothesis | None,
    events: dict[str, CanonicalEvent],
    edges: dict[str, CandidateEdge],
    stages: dict[str, StageAssignment],
    forecasts: list[tuple[CandidateEdge, str]],
    gaps: list[tuple[str, list[str]]],
) -> list[StoryStatement]:
    out: list[StoryStatement] = []
    if path is None:
        return out
    for i, eid in enumerate(path.event_ids):
        e = events[eid]
        text, facts = _render(e)
        st = stages.get(eid)
        if st and st.primary:
            text += f" [{st.primary.tactic}: {st.primary.technique_id}, {st.primary.basis.replace('_', '-')}]"
            facts[f"stage:{eid}"] = st.primary.technique_id
        edge_ids: list[str] = []
        status: Literal["observed", "inferred"] = "observed"
        conf = 1.0
        if i > 0:
            edge = edges[path.edge_ids[i - 1]]
            edge_ids = [edge.edge_id]
            status = "observed" if edge.classification == "observed" else "inferred"
            conf = edge.confidence
            text += (
                f"; linked to the previous step by {edge.edge_type} "
                f"(confidence {edge.confidence:.2f}, {edge.classification})"
            )
            facts[f"edge:{edge.edge_id}:edge_type"] = edge.edge_type
            facts[f"edge:{edge.edge_id}:classification"] = edge.classification
            facts[f"edge:{edge.edge_id}:confidence"] = f"{edge.confidence:.2f}"
        out.append(
            StoryStatement(
                statement_id=f"S{len(out) + 1:02d}",
                section="observed" if status == "observed" else "inferred",
                text=text + ".",
                event_ids=[eid] if i == 0 else [path.event_ids[i - 1], eid],
                edge_ids=edge_ids,
                confidence=round(conf, 6),
                status=status,
                facts=facts,
            )
        )
    for message, cited in gaps:
        out.append(
            StoryStatement(
                statement_id=f"S{len(out) + 1:02d}",
                section="missing_evidence",
                text=message,
                event_ids=cited,
                edge_ids=[],
                confidence=1.0,
                status="missing",
                facts={},
            )
        )
    for f, service in forecasts:
        last = events[f.source]
        facts = {f"event:{last.event_id}:resource": last.resource or "", f"context:{service}": service}
        out.append(
            StoryStatement(
                statement_id=f"S{len(out) + 1:02d}",
                section="forecast",
                text=(
                    f"Forecast, not observed: from {last.resource}, the business service {service} "
                    "is reachable "
                    f"through recorded dependencies (confidence {f.confidence:.2f})."
                ),
                event_ids=[last.event_id],
                edge_ids=[f.edge_id],
                confidence=f.confidence,
                status="forecast",
                facts=facts,
            )
        )
    return out


def check(
    run_id: str,
    statements: list[StoryStatement],
    events: dict[str, CanonicalEvent],
    edges: dict[str, CandidateEdge],
    stages: dict[str, StageAssignment],
    context: OrgContext,
) -> AttackStory:
    services = {a.business_service for a in context.assets}
    unsupported = 0
    for s in statements:
        ok = (
            bool(s.event_ids)
            and all(e in events for e in s.event_ids)
            and all(x in edges for x in s.edge_ids)
        )
        for key, value in s.facts.items():
            kind, _, rest = key.partition(":")
            if kind == "event":
                eid, _, fld = rest.rpartition(":")
                ok &= eid in s.event_ids and eid in events and _value(events[eid], fld) == value
            elif kind == "edge":
                edge_id, _, attr = rest.rpartition(":")
                edge = edges.get(edge_id)
                actual = (
                    None
                    if edge is None
                    else (f"{edge.confidence:.2f}" if attr == "confidence" else str(getattr(edge, attr)))
                )
                ok &= edge_id in s.edge_ids and actual == value
            elif kind == "stage":
                st = stages.get(rest)
                ok &= (
                    rest in s.event_ids
                    and st is not None
                    and st.primary is not None
                    and st.primary.technique_id == value
                )
            elif kind == "context":
                ok &= value in services
            else:
                ok = False
            ok &= value in s.text
        if s.section != "missing_evidence" and not s.facts:
            ok = False
        unsupported += not ok
    return AttackStory(
        run_id=run_id,
        statements=statements,
        checked_statements=len(statements),
        unsupported_claims=unsupported,
    )
