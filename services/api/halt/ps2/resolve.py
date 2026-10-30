"""Entity resolution (`halt.resolve/1.0`): exact, explainable, no fuzzy matching.

Identifiers are normalised (case, whitespace, IP canonical form) and become deterministic entity ids such as
`user:m.verma@contoso.example`. A second identifier seen in the same record as the first (an object id
beside a
UPN, a device name beside a device id) becomes an *alias* with the events that showed them together; nothing
is
merged silently. A value that should be single-valued but is not (one session used by two users, one alias
claimed by two users, one device id with two names) is recorded as a *contradiction* on the entity.
"""

from __future__ import annotations

import ipaddress
from collections import defaultdict
from dataclasses import dataclass

from halt.ps2.schema import Alias, CanonicalEvent, Contradiction, Entity, EntityType, OrgContext

RESOLUTION_VERSION = "halt.resolve/1.0"

_RESOURCE_ENTITY: dict[str, EntityType] = {
    "api": "api",
    "database": "database",
    "cloud_service": "cloud_service",
    "file_share": "cloud_service",
    "mailbox": "cloud_service",
    "application": "application",
}


def norm_ip(value: str) -> str:
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return value.strip().lower()


@dataclass
class _Acc:
    entity_type: EntityType
    label: str
    method: str
    fields: set[str]
    events: set[str]


@dataclass(frozen=True)
class Resolution:
    entities: dict[str, Entity]
    roles: dict[str, dict[str, str]]  # event_id → role → entity_id
    contradicted: set[str]  # entity ids with at least one contradiction


def resolve(events: list[CanonicalEvent], context: OrgContext) -> Resolution:
    acc: dict[str, _Acc] = {}
    roles: dict[str, dict[str, str]] = defaultdict(dict)
    aliases: dict[str, dict[tuple[str, str], set[str]]] = defaultdict(lambda: defaultdict(set))
    alias_owner: dict[tuple[str, str], set[str]] = defaultdict(set)
    seen_with: dict[tuple[str, str], dict[str, set[str]]] = defaultdict(
        lambda: defaultdict(set)
    )  # (entity, field) → value → events
    asset_type = {a.resource.lower(): a.resource_type for a in context.assets}

    def add(
        eid: str,
        role: str,
        etype: EntityType,
        key: str,
        label: str,
        fld: str,
        method: str = "exact-identifier",
    ) -> str:
        entity_id = f"{etype}:{key}"
        a = acc.setdefault(entity_id, _Acc(etype, label, method, set(), set()))
        a.fields.add(fld)
        a.events.add(eid)
        roles[eid][role] = entity_id
        return entity_id

    for e in events:
        eid = e.event_id
        if e.actor_user:
            etype: EntityType = "service_account" if e.actor_kind == "service" else "user"
            uid = add(eid, "actor", etype, e.actor_user, e.actor_user, "actor_user")
            if e.actor_alias and e.actor_alias != e.actor_user:
                aliases[uid][("actor_alias", e.actor_alias)].add(eid)
                alias_owner[("actor_alias", e.actor_alias)].add(uid)
        if e.target_user:
            add(eid, "target_user", "user", e.target_user, e.target_user, "target_user")
        if e.src_ip:
            add(eid, "src_ip", "ip", norm_ip(e.src_ip), norm_ip(e.src_ip), "src_ip")
        if e.device_id or e.device:
            key = e.device_id or e.device or ""
            did = add(eid, "device", "device", key, e.device or key, "device_id" if e.device_id else "device")
            if e.device_id and e.device:
                aliases[did][("device", e.device)].add(eid)
                seen_with[(did, "device_name")][e.device].add(eid)
        elif e.host:
            add(eid, "device", "device", e.host, e.host, "host")
        if e.session:
            sid = add(eid, "session", "session", e.session, e.session, "session")
            if e.actor_user:
                seen_with[(sid, "actor_user")][e.actor_user].add(eid)
        if e.token:
            tid = add(eid, "token", "token", e.token, e.token, "token")
            if e.actor_user:
                seen_with[(tid, "actor_user")][e.actor_user].add(eid)
        if e.token_issued:
            add(eid, "token_issued", "token", e.token_issued, e.token_issued, "token_issued")
        if e.application:
            add(
                eid,
                "application",
                "application",
                e.application,
                e.application_name or e.application,
                "application",
            )
        if e.process and e.host and e.process_id is not None:
            add(
                eid,
                "process",
                "process",
                f"{e.host}:{e.process_id}:{e.process}",
                f"{e.process} ({e.host}:{e.process_id})",
                "process",
            )
        if e.parent_process and e.host and e.parent_process_id is not None:
            add(
                eid,
                "parent_process",
                "process",
                f"{e.host}:{e.parent_process_id}:{e.parent_process}",
                f"{e.parent_process} ({e.host}:{e.parent_process_id})",
                "parent_process",
            )
        if e.resource and e.resource_type != "url":
            rtype = _RESOURCE_ENTITY.get(
                asset_type.get(e.resource.lower(), e.resource_type or ""), "cloud_service"
            )
            add(
                eid,
                "resource",
                rtype,
                e.resource,
                e.resource,
                "resource",
                "exact-identifier+context" if e.resource.lower() in asset_type else "exact-identifier",
            )
        if e.business_service:
            add(
                eid,
                "business_service",
                "business_service",
                e.business_service.lower(),
                e.business_service,
                "business_service",
                "organisation-context",
            )

    contradictions: dict[str, list[Contradiction]] = defaultdict(list)
    for (entity_id, fld), values in seen_with.items():
        if len(values) > 1:
            contradictions[entity_id].append(
                Contradiction(
                    field=fld,
                    values=sorted(values),
                    event_ids=sorted({x for evs in values.values() for x in evs}),
                )
            )
    for (fld, value), owners in alias_owner.items():
        if len(owners) > 1:
            evs = sorted({x for o in owners for x in aliases[o][(fld, value)]})
            for o in owners:
                contradictions[o].append(
                    Contradiction(field=f"alias:{fld}", values=sorted(owners), event_ids=evs)
                )

    entities: dict[str, Entity] = {}
    for entity_id in sorted(acc):
        a = acc[entity_id]
        al = [
            Alias(value=v, field=f, event_ids=sorted(evs))
            for (f, v), evs in sorted(aliases[entity_id].items())
        ]
        cons = sorted(contradictions.get(entity_id, []), key=lambda c: (c.field, c.values))
        method = a.method if not al else f"{a.method}+co-observed-alias"
        conf = 1.0 if not al else 0.95
        if cons:
            conf = 0.6
        entities[entity_id] = Entity(
            entity_id=entity_id,
            entity_type=a.entity_type,
            label=a.label,
            aliases=al,
            matching_fields=sorted(a.fields),
            method=method,
            confidence=conf,
            contradictions=cons,
            source_event_ids=sorted(a.events),
            resolution_version=RESOLUTION_VERSION,
        )
    return Resolution(
        entities=entities,
        roles={k: dict(v) for k, v in roles.items()},
        contradicted={k for k, v in entities.items() if v.contradictions},
    )
