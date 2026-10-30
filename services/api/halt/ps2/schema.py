"""PS2 contracts: raw-record intake, the canonical event, and every reconstruction output.

The canonical event is OCSF-inspired (names and the class/activity split follow OCSF where practical), but it
is HALT's own versioned model and does not claim OCSF conformance. Mappings:
docs/PS2_RECONSTRUCTION_ENGINE.md.
"""

from __future__ import annotations

from typing import Annotated, Final, Literal

from pydantic import AwareDatetime, Field, StringConstraints

from halt.contracts.common import Contract, Sha256

CANONICAL_SCHEMA: Final = "halt.canonical/1.0"

SourceType = Literal[
    "identity_signin", "identity_audit", "email", "api_activity", "cloud_audit", "process", "database_audit"
]
EventKind = Literal[
    "email_delivery",
    "authentication",
    "mfa_method_change",
    "app_consent",
    "credential_change",
    "token_use",
    "token_issued",
    "role_assumption",
    "permission_change",
    "resource_enumeration",
    "resource_access",
    "access_denied",
    "process_start",
    "database_query",
]
Outcome = Literal["success", "failure", "unknown"]
Severity = Literal["info", "low", "medium", "high"]
RecordStatus = Literal["normalised", "normalised_with_warnings", "rejected"]
Tactic = Literal[
    "reconnaissance",
    "resource-development",
    "initial-access",
    "execution",
    "persistence",
    "privilege-escalation",
    "defense-evasion",
    "credential-access",
    "discovery",
    "lateral-movement",
    "collection",
    "command-and-control",
    "exfiltration",
    "impact",
]
TechniqueId = Annotated[str, StringConstraints(pattern=r"^T\d{4}(\.\d{3})?$")]
EntityType = Literal[
    "user",
    "service_account",
    "device",
    "ip",
    "session",
    "token",
    "application",
    "process",
    "api",
    "cloud_service",
    "database",
    "business_service",
]
Criticality = Literal["low", "medium", "high", "critical"]


# ---- intake


class EvidenceRef(Contract):
    """Where an event came from. The raw record itself is kept only as its SHA-256 and a redacted preview."""

    source_name: str
    source_record_id: str
    line: int | None = None
    raw_sha256: Sha256
    parser: str  # adapter id and version, e.g. "idp_signin@1.0"


class RecordIssue(Contract):
    code: str
    message: str
    field: str | None = None


class IngestedRecord(Contract):
    source_name: str
    source_record_id: str
    line: int | None
    raw_sha256: Sha256
    parser: str
    ingested_at: AwareDatetime
    occurred_at: AwareDatetime | None
    status: RecordStatus
    issues: list[RecordIssue] = Field(default_factory=list)
    event_id: str | None = None
    preview: str = Field(max_length=240)  # redacted, truncated; never the full raw record


class FileReport(Contract):
    filename: str
    adapter: str
    file_sha256: Sha256
    accepted: int
    rejected: int
    warnings: int
    records: list[IngestedRecord]


class TechniqueCandidate(Contract):
    technique_id: TechniqueId
    technique_name: str
    tactic: Tactic
    # observed: the log line itself evidences the technique. rule_inferred: a rule concluded it from context.
    # uncertain: one of several plausible techniques for the same behaviour.
    basis: Literal["observed", "rule_inferred", "uncertain"]
    rule: str


class CanonicalEvent(Contract):
    canonical_schema: Literal["halt.canonical/1.0"] = CANONICAL_SCHEMA
    event_id: str
    occurred_at: AwareDatetime
    source_type: SourceType
    source_name: str
    event_kind: EventKind
    action: str
    outcome: Outcome
    severity: Severity = "info"
    # identities
    actor_user: str | None = None
    actor_kind: Literal["human", "service"] | None = None
    actor_alias: str | None = (
        None  # a second identifier for the same actor seen in the record (e.g. object id)
    )
    target_user: str | None = None
    # network and device
    src_ip: str | None = None
    dst_ip: str | None = None
    asn: int | None = None
    user_agent: str | None = None
    device: str | None = None
    device_id: str | None = None
    host: str | None = None
    # sessions and tokens
    session: str | None = None
    token: str | None = None  # credential used by this event
    token_issued: str | None = None  # credential or session minted by this event
    # application and process
    application: str | None = None
    application_name: str | None = None
    process: str | None = None
    process_id: int | None = None
    parent_process: str | None = None
    parent_process_id: int | None = None
    # targets
    resource: str | None = None
    resource_type: str | None = None
    business_service: str | None = None
    # typed details used by rules
    request_count: int | None = None
    window_s: int | None = None
    scopes: list[str] = Field(default_factory=list)
    publisher_verified: bool | None = None
    app_age_days: int | None = None
    credential_type: str | None = None
    interactive: bool | None = None
    link_type: str | None = None
    sender_domain: str | None = None
    sender_domain_age_days: int | None = None
    role: str | None = None
    permission: str | None = None
    # analysis
    attack_candidates: list[TechniqueCandidate] = Field(default_factory=list)
    anomaly_score: float | None = None  # HALT-R1 probability where the event kind is one R1 scores
    evidence: EvidenceRef
    raw_sha256: Sha256


# ---- organisation context (an input, never ground truth)


class AssetContext(Contract):
    resource: str
    resource_type: Literal["api", "cloud_service", "database", "file_share", "mailbox", "application"]
    business_service: str
    criticality: Criticality
    depends_on: list[str] = Field(default_factory=list)  # resources this one needs


class BusinessService(Contract):
    name: str
    criticality: Criticality


class OrgContext(Contract):
    organisation: str
    assets: list[AssetContext] = Field(default_factory=list)
    business_services: list[BusinessService] = Field(default_factory=list)
    internal_cidrs: list[str] = Field(
        default_factory=list
    )  # the organisation's own networks (RFC 1918 is always internal)
    known_egress_cidrs: list[str] = Field(default_factory=list)  # e.g. corporate VPN egress
    managed_hosts: list[str] = Field(default_factory=list)
    service_accounts: list[str] = Field(default_factory=list)


class RawFile(Contract):
    filename: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")]
    adapter: str
    content_type: Literal["application/json", "application/x-ndjson", "application/jsonl", "text/csv"]
    content: str


class IngestionResult(Contract):
    batch_id: str
    dataset_id: str | None
    canonical_schema: Literal["halt.canonical/1.0"] = CANONICAL_SCHEMA
    files: list[FileReport]
    accepted: int
    rejected: int
    warnings: int
    event_count: int
    context_sha256: Sha256
    input_hashes: dict[str, Sha256]


# ---- reconstruction


class Alias(Contract):
    value: str
    field: str
    event_ids: list[str]


class Contradiction(Contract):
    field: str
    values: list[str]
    event_ids: list[str]


class Entity(Contract):
    entity_id: str
    entity_type: EntityType
    label: str
    aliases: list[Alias] = Field(default_factory=list)
    matching_fields: list[str]
    method: str
    confidence: float = Field(ge=0, le=1)
    contradictions: list[Contradiction] = Field(default_factory=list)
    source_event_ids: list[str]
    resolution_version: str


class ConfidenceComponent(Contract):
    name: str
    value: float
    weight: float
    detail: str


EdgeClass = Literal["observed", "inferred", "forecast", "context"]


class CandidateEdge(Contract):
    edge_id: str
    edge_type: str
    source: str
    target: str
    first_observed: AwareDatetime | None
    last_observed: AwareDatetime | None
    evidence_event_ids: list[str]
    evidence_fields: list[str]
    confidence: float = Field(ge=0, le=1)
    components: list[ConfidenceComponent]
    classification: EdgeClass
    rule_version: str
    selected: bool
    rejection_reason: str | None = None


class ThreadNode(Contract):
    node_id: str
    node_kind: Literal["event", "entity", "business_service"]
    label: str
    event_kind: EventKind | None = None
    entity_type: EntityType | None = None
    occurred_at: AwareDatetime | None = None
    suspicion: float = 0.0
    seed: bool = False
    tactic: Tactic | None = None
    criticality: Criticality | None = None  # business services only, from the organisation context


class ReconstructedGraph(Contract):
    run_id: str
    nodes: list[ThreadNode]
    edges: list[CandidateEdge]  # selected causal edges plus entity and context edges
    forecast_edges: list[CandidateEdge]
    graph_hash: Sha256


class PathHypothesis(Contract):
    path_id: str
    rank: int
    status: Literal["selected", "alternate", "rejected"]
    event_ids: list[str]
    edge_ids: list[str]
    score: float
    components: list[ConfidenceComponent]
    root_event_id: str
    terminal_event_id: str
    missing_evidence: list[str] = Field(default_factory=list)
    unsupported_hops: list[str] = Field(default_factory=list)
    rejection_reason: str | None = None


class StageAssignment(Contract):
    event_id: str
    tactic: Tactic | None
    primary: TechniqueCandidate | None
    candidates: list[TechniqueCandidate]


class StoryStatement(Contract):
    statement_id: str
    section: Literal["observed", "inferred", "missing_evidence", "forecast"]
    text: str
    event_ids: list[str]
    edge_ids: list[str]
    confidence: float = Field(ge=0, le=1)
    status: Literal["observed", "inferred", "missing", "forecast"]
    facts: dict[str, str]  # every value rendered into `text`, each checkable against the cited events


class AttackStory(Contract):
    run_id: str
    statements: list[StoryStatement]
    checked_statements: int
    unsupported_claims: int


class Hypotheses(Contract):
    run_id: str
    selected: PathHypothesis | None = None  # the selected path, for comparison with the alternates
    alternates: list[PathHypothesis]
    rejected_paths: list[PathHypothesis]
    rejected_edges: list[CandidateEdge]


class Uncertainty(Contract):
    score_margin: float  # selected path score minus the best alternate's (0 when there is none)
    min_edge_confidence: float
    inferred_hops: int
    coverage_gaps: list[str]


class MetricResult(Contract):
    name: str
    status: Literal["measured", "unavailable"]
    value: float | None
    numerator: int | None = None
    denominator: int | None = None
    target: float | None = None  # a development target, never a result
    target_met: bool | None = None
    note: str = ""


class EvaluationReport(Contract):
    dataset_id: str
    ground_truth_sha256: Sha256
    replay_id: Sha256
    metrics: list[MetricResult]


class ReconstructionReceipt(Contract):
    receipt_id: str
    run_id: str
    replay_id: Sha256  # same inputs + config + engine → same id
    engine_version: str
    canonical_schema: str
    config_sha256: Sha256
    adapter_versions: dict[str, str]
    input_hashes: dict[str, Sha256]
    context_sha256: Sha256
    graph_hash: Sha256
    selected_path_id: str | None
    selected_event_ids: list[str]
    alternate_path_ids: list[str]
    evidence_coverage: (
        float  # share of selected-path hops with at least one exact-identifier evidence component
    )
    story_citation_coverage: float
    uncertainty: Uncertainty
    metrics: list[MetricResult] = Field(default_factory=list)
    processing_ms: float  # excluded from replay_id and graph_hash


class ReconstructionSummary(Contract):
    run_id: str
    batch_id: str
    dataset_id: str | None
    replay_id: Sha256
    graph_hash: Sha256
    event_count: int
    entity_count: int
    candidate_edges: int
    selected_edges: int
    seeds: int
    selected_path_id: str | None
    root_event_id: str | None
    affected_services: list[str]
    processing_ms: float
