"""Source adapters: raw record (dict) → canonical event fields.

Each adapter is a small, explicit, versioned field mapping for one source shape. The shapes are modelled on
real formats (Entra ID sign-in and directory-audit logs, M365/Graph activity, AWS CloudTrail, Sysmon process
creation exported as JSON, a database audit CSV) but only the fields HALT reads are mapped; these are demo
adapters for the synthetic datasets, not complete production parsers. Zeek is reserved in the registry design
(`network`) and not implemented because no fixture needs it.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from halt.ps2.intake.parse import Format
from halt.ps2.schema import EventKind, RecordIssue, Severity, SourceType


@dataclass
class Mapped:
    """Adapter output: canonical fields, plus issues. `reject` means the record cannot become an event."""

    fields: dict[str, Any] = field(default_factory=dict)
    issues: list[RecordIssue] = field(default_factory=list)
    reject: bool = False

    def warn(self, code: str, message: str, fld: str | None = None) -> None:
        self.issues.append(RecordIssue(code=code, message=message, field=fld))

    def fail(self, code: str, message: str, fld: str | None = None) -> Mapped:
        self.warn(code, message, fld)
        self.reject = True
        return self


@dataclass(frozen=True)
class Adapter:
    adapter_id: str
    version: str
    fmt: Format
    source_type: SourceType
    description: str
    record_id_field: str
    mapper: Callable[[dict[str, Any], Mapped], Mapped]

    @property
    def parser(self) -> str:
        return f"{self.adapter_id}@{self.version}"


def get(d: dict[str, Any], path: str) -> Any:
    cur: Any = d
    for key in path.split("."):
        if isinstance(cur, list) and key.isdigit():
            cur = cur[int(key)] if int(key) < len(cur) else None
        elif isinstance(cur, dict):
            cur = cur.get(key)
        else:
            return None
    return cur


def text(d: dict[str, Any], path: str) -> str | None:
    v = get(d, path)
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    return str(v).strip()


def lower(d: dict[str, Any], path: str) -> str | None:
    v = text(d, path)
    return v.lower() if v else None


def as_int(d: dict[str, Any], path: str, m: Mapped) -> int | None:
    v = get(d, path)
    if v is None or v == "":
        return None
    try:
        return int(str(v))
    except ValueError:
        m.warn("invalid_integer", f"{path} is not an integer", path)
        return None


def as_bool(d: dict[str, Any], path: str) -> bool | None:
    v = get(d, path)
    if isinstance(v, bool):
        return v
    if isinstance(v, str) and v.lower() in ("true", "false"):
        return v.lower() == "true"
    return None


def timestamp(d: dict[str, Any], path: str, m: Mapped) -> datetime | None:
    v = text(d, path)
    if v is None:
        m.fail("missing_timestamp", f"{path} is required", path)
        return None
    try:
        ts = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        m.fail("invalid_timestamp", f"{path} is not ISO-8601", path)
        return None
    if ts.tzinfo is None:
        m.warn("timezone_assumed", f"{path} has no timezone; UTC assumed", path)
        ts = ts.replace(tzinfo=UTC)
    return ts.astimezone(UTC)


def require(m: Mapped, value: Any, name: str) -> None:
    if value in (None, ""):
        m.fail("missing_field", f"{name} is required", name)


def _severity(risk: str | None) -> Severity:
    return {"high": "high", "medium": "medium", "low": "low"}.get((risk or "").lower(), "info")  # type: ignore[return-value]


# ---- identity sign-in (Entra-like)


def _idp_signin(r: dict[str, Any], m: Mapped) -> Mapped:
    service = text(r, "signInEventType") == "servicePrincipal"
    incoming = text(r, "incomingTokenId")
    kind: EventKind = "token_use" if incoming else "authentication"
    error = as_int(r, "status.errorCode", m)
    m.fields.update(
        occurred_at=timestamp(r, "createdDateTime", m),
        event_kind=kind,
        action="token presented"
        if incoming
        else ("service principal sign-in" if service else "user sign-in"),
        outcome="success" if error == 0 else ("failure" if error is not None else "unknown"),
        severity=_severity(text(r, "riskLevelDuringSignIn")),
        actor_user=lower(r, "servicePrincipalName" if service else "userPrincipalName"),
        actor_alias=lower(r, "servicePrincipalId" if service else "userId"),
        actor_kind="service" if service else "human",
        application=lower(r, "appId"),
        application_name=text(r, "appDisplayName"),
        src_ip=text(r, "ipAddress"),
        asn=as_int(r, "autonomousSystemNumber", m),
        user_agent=text(r, "userAgent"),
        device=lower(r, "deviceDetail.displayName"),
        device_id=lower(r, "deviceDetail.deviceId"),
        session=text(r, "correlationId"),
        token=incoming,
        token_issued=None if incoming else text(r, "uniqueTokenIdentifier"),
        credential_type=text(r, "clientCredentialType"),
        interactive=as_bool(r, "isInteractive"),
    )
    require(m, m.fields["actor_user"], "userPrincipalName/servicePrincipalName")
    return m


# ---- identity directory audit (Entra-like)

_AUDIT_KIND: dict[str, EventKind] = {
    "user registered security info": "mfa_method_change",
    "update user: strongauthenticationmethod": "mfa_method_change",
    "consent to application": "app_consent",
    "add service principal credentials": "credential_change",
    "add app role assignment to service principal": "permission_change",
    "add member to role": "permission_change",
}


def _detail(r: dict[str, Any], key: str) -> str | None:
    for item in get(r, "additionalDetails") or []:
        if isinstance(item, dict) and str(item.get("key", "")).lower() == key.lower():
            v = item.get("value")
            return str(v) if v not in (None, "") else None
    return None


def _idp_audit(r: dict[str, Any], m: Mapped) -> Mapped:
    activity = (text(r, "activityDisplayName") or "").lower()
    kind = _AUDIT_KIND.get(activity)
    if kind is None:
        return m.fail(
            "unsupported_activity",
            f"activity {activity!r} is not mapped by this adapter",
            "activityDisplayName",
        )
    scopes = [s for s in (_detail(r, "ConsentScopes") or "").split() if s]
    verified = _detail(r, "PublisherVerified")
    age = _detail(r, "AppAgeDays")
    target = (get(r, "targetResources") or [{}])[0] if isinstance(get(r, "targetResources"), list) else {}
    m.fields.update(
        occurred_at=timestamp(r, "activityDateTime", m),
        event_kind=kind,
        action=text(r, "activityDisplayName") or activity,
        outcome="success" if (text(r, "result") or "").lower() == "success" else "failure",
        actor_user=lower(r, "initiatedBy.user.userPrincipalName")
        or lower(r, "initiatedBy.app.servicePrincipalName"),
        actor_alias=lower(r, "initiatedBy.user.id"),
        actor_kind="service" if get(r, "initiatedBy.app") else "human",
        src_ip=text(r, "initiatedBy.user.ipAddress"),
        session=text(r, "correlationId"),
        application=(_detail(r, "AppId") or "").lower() or None,
        application_name=_detail(r, "AppDisplayName")
        or (target.get("displayName") if isinstance(target, dict) else None),
        token_issued=_detail(r, "IssuedTokenId"),
        scopes=scopes,
        publisher_verified=None if verified is None else verified.lower() == "true",
        app_age_days=int(age) if age and age.isdigit() else None,
        target_user=lower(r, "targetResources.0.userPrincipalName"),
        role=_detail(r, "RoleName"),
        permission=_detail(r, "Permission"),
    )
    require(m, m.fields["actor_user"], "initiatedBy")
    return m


# ---- mail trace (CSV)


def _mail_trace(r: dict[str, Any], m: Mapped) -> Mapped:
    age = as_int(r, "sender_domain_age_days", m)
    m.fields.update(
        occurred_at=timestamp(r, "received_utc", m),
        event_kind="email_delivery",
        action=f"delivered: {text(r, 'delivery_action') or 'unknown'}",
        outcome="success" if (text(r, "delivery_action") or "").lower() == "delivered" else "failure",
        actor_user=lower(r, "sender"),
        target_user=lower(r, "recipient"),
        sender_domain=lower(r, "sender_domain"),
        sender_domain_age_days=age,
        link_type=lower(r, "link_type"),
        resource=lower(r, "link_domain"),
        resource_type="url",
    )
    require(m, m.fields["target_user"], "recipient")
    return m


# ---- API activity (M365/Graph-like)

_OPS: dict[str, EventKind] = {
    "folderlisted": "resource_enumeration",
    "listitems": "resource_enumeration",
    "fileaccessed": "resource_access",
    "filedownloaded": "resource_access",
    "resourceaccess": "resource_access",
}


def _api_activity(r: dict[str, Any], m: Mapped) -> Mapped:
    op = (text(r, "Operation") or "").lower()
    kind = _OPS.get(op)
    if kind is None:
        return m.fail("unsupported_operation", f"operation {op!r} is not mapped by this adapter", "Operation")
    result = (text(r, "ResultStatus") or "").lower()
    denied = result in ("denied", "forbidden", "failed")
    m.fields.update(
        occurred_at=timestamp(r, "CreationTime", m),
        event_kind="access_denied" if denied else kind,
        action=text(r, "Operation") or op,
        outcome="failure" if denied else "success",
        actor_user=lower(r, "UserId"),
        actor_kind="human",
        application=lower(r, "AppId"),
        token=text(r, "TokenId"),
        session=text(r, "SessionId"),
        src_ip=text(r, "ClientIP"),
        resource=lower(r, "ObjectId"),
        request_count=as_int(r, "RequestCount", m),
        window_s=as_int(r, "WindowSeconds", m),
    )
    require(m, m.fields["actor_user"], "UserId")
    require(m, m.fields["resource"], "ObjectId")
    return m


# ---- cloud audit (CloudTrail-like)

_CLOUD: dict[str, EventKind] = {
    "assumerole": "role_assumption",
    "putrolepolicy": "permission_change",
    "attachrolepolicy": "permission_change",
    "listbuckets": "resource_enumeration",
    "listobjects": "resource_enumeration",
    "listobjectsv2": "resource_enumeration",
    "getobject": "resource_access",
    "generatedbauthtoken": "token_issued",
}


def _cloud_audit(r: dict[str, Any], m: Mapped) -> Mapped:
    name = (text(r, "eventName") or "").lower()
    kind = _CLOUD.get(name)
    if kind is None:
        return m.fail("unsupported_event", f"eventName {name!r} is not mapped by this adapter", "eventName")
    denied = text(r, "errorCode") is not None
    resource = (
        lower(r, "requestParameters.bucketName")
        or lower(r, "requestParameters.dbInstanceIdentifier")
        or lower(r, "requestParameters.roleName")
        or (lower(r, "requestParameters.roleArn") or "").split("/")[-1]
        or None
    )
    m.fields.update(
        occurred_at=timestamp(r, "eventTime", m),
        event_kind="access_denied" if denied else kind,
        action=text(r, "eventName") or name,
        outcome="failure" if denied else "success",
        actor_user=lower(r, "userIdentity.sourceIdentity") or lower(r, "userIdentity.userName"),
        actor_kind="service"
        if (text(r, "userIdentity.type") or "") in ("AssumedRole", "ServicePrincipal")
        else "human",
        src_ip=text(r, "sourceIPAddress"),
        user_agent=text(r, "userAgent"),
        session=text(r, "requestParameters.sourceSession"),
        token=text(r, "userIdentity.accessKeyId"),
        token_issued=text(r, "responseElements.credentials.accessKeyId")
        or text(r, "responseElements.tokenId"),
        resource=resource,
        role=(lower(r, "requestParameters.roleArn") or "").split("/")[-1]
        or lower(r, "requestParameters.roleName"),
        permission=text(r, "requestParameters.policySummary") or text(r, "requestParameters.policyArn"),
        request_count=as_int(r, "additionalEventData.requestCount", m),
        window_s=as_int(r, "additionalEventData.windowSeconds", m),
    )
    require(m, m.fields["actor_user"], "userIdentity")
    return m


# ---- process creation (Sysmon EventID 1 exported as JSON)


def _process(r: dict[str, Any], m: Mapped) -> Mapped:
    if as_int(r, "EventID", m) != 1:
        return m.fail("unsupported_event", "only Sysmon EventID 1 (process creation) is mapped", "EventID")
    image = text(r, "Image") or ""
    parent = text(r, "ParentImage") or ""
    m.fields.update(
        occurred_at=timestamp(r, "UtcTime", m),
        event_kind="process_start",
        action="process created",
        outcome="success",
        actor_user=lower(r, "User"),
        host=lower(r, "Computer"),
        process=image.replace("\\", "/").split("/")[-1].lower() or None,
        process_id=as_int(r, "ProcessId", m),
        parent_process=parent.replace("\\", "/").split("/")[-1].lower() or None,
        parent_process_id=as_int(r, "ParentProcessId", m),
    )
    require(m, m.fields["host"], "Computer")
    require(m, m.fields["process_id"], "ProcessId")
    return m


# ---- database audit (CSV)


def _db_audit(r: dict[str, Any], m: Mapped) -> Mapped:
    ok = (text(r, "result") or "").lower() == "success"
    m.fields.update(
        occurred_at=timestamp(r, "event_time", m),
        event_kind="database_query" if ok else "access_denied",
        action=f"{text(r, 'statement_type') or 'query'} {text(r, 'object_name') or ''}".strip(),
        outcome="success" if ok else "failure",
        actor_user=lower(r, "db_user"),
        actor_kind="service" if (text(r, "auth_method") or "").lower() == "iam_token" else "human",
        src_ip=text(r, "client_ip"),
        token=text(r, "auth_token_id"),
        resource=lower(r, "db_name"),
        credential_type=lower(r, "auth_method"),
        request_count=as_int(r, "rows", m),
    )
    require(m, m.fields["resource"], "db_name")
    return m


ADAPTERS: dict[str, Adapter] = {
    a.adapter_id: a
    for a in [
        Adapter(
            "idp_signin",
            "1.0",
            "jsonl",
            "identity_signin",
            "Identity-provider sign-ins (Entra-like)",
            "id",
            _idp_signin,
        ),
        Adapter(
            "idp_audit", "1.0", "json", "identity_audit", "Directory audit (Entra-like)", "id", _idp_audit
        ),
        Adapter("mail_trace", "1.0", "csv", "email", "Mail gateway message trace", "message_id", _mail_trace),
        Adapter(
            "api_activity",
            "1.0",
            "jsonl",
            "api_activity",
            "Cloud app / API activity (M365-like)",
            "RecordId",
            _api_activity,
        ),
        Adapter(
            "cloud_audit",
            "1.0",
            "json",
            "cloud_audit",
            "Cloud control-plane audit (CloudTrail-like)",
            "eventID",
            _cloud_audit,
        ),
        Adapter(
            "process",
            "1.0",
            "jsonl",
            "process",
            "Process creation (Sysmon EventID 1 as JSON)",
            "RecordID",
            _process,
        ),
        Adapter("db_audit", "1.0", "csv", "database_audit", "Database audit log", "event_id", _db_audit),
    ]
}

CONTENT_TYPES: dict[Format, set[str]] = {
    "json": {"application/json"},
    "jsonl": {"application/x-ndjson", "application/jsonl"},
    "csv": {"text/csv"},
}
