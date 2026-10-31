"""FireX data contracts (docs/FIREX_CANONICAL_SCHEMA.md, docs/INCIDENT_GRAPH_CONTRACT.md).

Everything an API returns is one of these. Candidates stay `unconfirmed`: nothing here asserts a confirmed
attack.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from halt.contracts.common import Contract

TimestampQuality = Literal["normal", "collapsed", "conflicting"]
Basis = Literal["observed", "inferred"]
RunStatus = Literal["queued", "running", "cancelling", "cancelled", "interrupted", "failed", "completed"]
Layer = Literal["external", "network_edge", "endpoint", "identity", "application", "critical_asset"]
KillChainStage = Literal[
    "reconnaissance",
    "delivery",
    "exploitation",
    "installation",
    "command_and_control",
    "actions_on_objectives",
    "defense_evasion",
    "credential_access",
    "lateral_movement",
    "impact",
]


class DatasetDescriptor(Contract):
    """A server-side registered log. The API never accepts a path: only one of these ids."""

    dataset_id: str
    title: str
    filename: str
    available: bool
    size_bytes: int | None = None
    expected_sha256: str | None = None
    latest_run_id: str | None = None


class TimezoneConflict(Contract):
    declared_tz: list[str]
    interpretation: str
    affected_records: int


class CollapsedTimestamp(Contract):
    event_ns: int
    event_utc: str
    affected_records: int
    first_offset: int
    last_offset: int
    first_line: int
    last_line: int
    threshold_records: int
    config_version: str


class QuarantineSample(Contract):
    offset: int
    line: int
    length: int
    text: str  # printable, escaped, truncated; credentials masked


class QuarantineSegment(Contract):
    segment_id: str
    reason: str
    start_offset: int
    end_offset: int  # exclusive
    start_line: int
    end_line: int
    rejected_records: int
    blank_lines: int
    samples: list[QuarantineSample]
    source_sha256: str
    parser_version: str


class DatasetQualitySummary(Contract):
    bytes_total: int
    bytes_valid: int
    bytes_quarantined: int
    bytes_blank: int
    bytes_accounted: bool
    lines_total: int
    records_valid: int
    records_rejected: int
    lines_blank: int
    quarantine_segments: int
    quarantine_segments_truncated: int = 0
    reject_reasons: dict[str, int]
    timezone_conflict: TimezoneConflict | None
    collapsed_timestamps: list[CollapsedTimestamp]
    records_in_collapsed_timestamps: int
    records_with_conflicting_time: int
    exact_duplicates: int
    earliest_utc: str | None
    latest_utc: str | None


class RunMetrics(Contract):
    bytes_processed: int = 0
    bytes_total: int = 0
    records_processed: int = 0
    canonical_records: int = 0
    rejected_records: int = 0
    quarantine_segments: int = 0
    exact_duplicates: int | None = None
    behavioural_bursts: int | None = None
    detections: int | None = None
    incidents: int | None = None
    duration_s: float = 0.0
    records_per_second: float = 0.0
    mb_per_second: float = 0.0
    peak_memory_mb: float | None = None
    output_bytes: int | None = None
    compression_ratio: float | None = None


class RunRequest(Contract):
    dataset_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")
    # A controlled run reads only the first max_bytes of the source. Omit for the whole file.
    max_bytes: int | None = Field(default=None, ge=1)


class DatasetRun(Contract):
    run_id: str
    dataset_id: str
    status: RunStatus
    stage: Literal["read", "prepare", "reconstruct", "explain", "done"]
    detail: str
    byte_range: list[int] | None
    chunks_total: int
    chunks_done: int
    created_at: str
    updated_at: str
    pid: int | None = None
    resume_count: int = 0
    recovered: bool = False
    error: str | None = None
    metrics: RunMetrics


class BehaviouralBurst(Contract):
    burst_id: str
    rule_id: str
    rule_version: str
    grouping_key: dict[str, str | None]
    count: int
    first_utc: str
    last_utc: str
    timestamp_quality: TimestampQuality
    representative: dict[str, Any]
    evidence_refs: list[str]
    evidence_refs_truncated: bool


class EvidenceEvent(Contract):
    """One canonical record, cited by evidence id. Missing source fields stay null."""

    evidence_id: str
    event_utc: str
    timestamp_quality: TimestampQuality
    date: str | None = None
    time: str | None = None
    tz: str | None = None
    byte_offset: int
    line: int
    source_sha256: str
    raw_sha256: str
    canonical_sha256: str
    event_type: str | None = None
    subtype: str | None = None
    logid: str | None = None
    level: str | None = None
    action: str | None = None
    status: str | None = None
    user: str | None = None
    src_ip: str | None = None
    src_port: int | None = None
    dst_ip: str | None = None
    dst_port: int | None = None
    src_role: str | None = None
    dst_role: str | None = None
    session_id: str | None = None
    service: str | None = None
    hostname: str | None = None
    url: str | None = None
    category: str | None = None
    app: str | None = None
    app_risk: str | None = None
    attack: str | None = None
    attack_id: str | None = None
    virus: str | None = None
    message: str | None = None


class DetectionStep(Contract):
    """One labelled action inside a detection. Merged steps carry a count and sample evidence."""

    label: str
    utc: str
    ns: int
    last_utc: str
    last_ns: int
    offset: int
    count: int
    evidence_refs: list[str]
    technique_id: str
    technique_name: str
    stage: KillChainStage
    layer: Layer
    actor: str | None = None
    target: str | None = None


class Detection(Contract):
    steps: list[DetectionStep]
    target_kind: Literal["device", "host", "service", "account"]
    detection_id: str
    rule_id: str
    rule_version: str
    title: str
    reason: str
    evidence_refs: list[str]
    evidence_refs_truncated: bool = False
    risk_contribution: float
    technique_id: str
    technique_name: str
    tactic: str
    kill_chain_stage: KillChainStage
    confidence: float
    basis: Basis
    first_utc: str
    last_utc: str
    first_ns: int
    last_ns: int
    first_offset: int
    merged_events: int
    config_hash: str
    timestamp_quality: TimestampQuality
    entities: dict[str, list[str]]
    status: Literal["unconfirmed"] = "unconfirmed"


class ScoreComponent(Contract):
    name: str
    value: float
    weight: float
    detail: str


class FirexGraphNode(Contract):
    node_id: str
    kind: Literal[
        "event", "account", "host", "ip", "session", "application", "service", "critical_asset", "burst"
    ]
    label: str
    layer: Layer
    order: int  # source order within the incident; x in the 3D view
    stage: KillChainStage | None = None
    first_utc: str | None = None
    last_utc: str | None = None
    count: int = 1
    on_selected_path: bool = False
    is_context: bool = False
    evidence_refs: list[str] = Field(default_factory=list)
    detection_id: str | None = None
    attributes: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class FirexGraphEdge(Contract):
    edge_id: str
    relation: str
    source: str
    target: str
    confidence: float
    rule: str
    rule_version: str
    evidence_refs: list[str]
    first_utc: str | None = None
    last_utc: str | None = None
    classification: Literal["observed", "inferred", "reachable"]
    contradictions: list[str] = Field(default_factory=list)
    components: list[ScoreComponent] = Field(default_factory=list)
    on_selected_path: bool = False
    missing_evidence: bool = False


class IncidentGraph(Contract):
    incident_id: str
    nodes: list[FirexGraphNode]
    edges: list[FirexGraphEdge]
    graph_hash: str
    truncated: bool
    node_cap: int


class AttackHypothesis(Contract):
    hypothesis_id: str
    rank: int
    status: Literal["selected", "alternate"]
    title: str
    description: str
    detection_ids: list[str]
    node_ids: list[str]
    edge_ids: list[str]
    score: float
    components: list[ScoreComponent]
    evidence_gaps: list[str]


class FirexHypotheses(Contract):
    incident_id: str
    selected: AttackHypothesis
    alternates: list[AttackHypothesis]
    uncertainty_margin: float


class ReachableTarget(Contract):
    target: str
    layer: Layer
    via: str
    basis: str
    observed_connections: int
    evidence_refs: list[str]
    confidence: float
    hypothetical: Literal[True] = True


class ReachabilityResult(Contract):
    incident_id: str
    label: str = "Hypothetical: what could be reached next. This is not observed attacker activity."
    targets: list[ReachableTarget]
    limitations: list[str]


class FirexIncidentSummary(Contract):
    incident_id: str
    run_id: str
    title: str
    status: Literal["unconfirmed"] = "unconfirmed"
    first_utc: str
    last_utc: str
    timestamp_quality: TimestampQuality
    entry_point: str
    affected_identity: str | None
    affected_devices: list[str]
    critical_target: str | None
    evidence_count: int
    merged_events: int
    detection_count: int
    confidence: float
    risk: float
    stages: list[str]
    techniques: list[str]


class TimelineEntry(Contract):
    order: int
    utc: str
    title: str
    detail: str
    stage: str
    basis: Basis
    timestamp_quality: TimestampQuality
    detection_id: str
    evidence_refs: list[str]


class FirexStoryStatement(Contract):
    statement_id: str
    text: str
    kind: Literal["observed", "inferred", "gap", "hypothetical"]
    evidence_ids: list[str]


class FirexAttackStory(Contract):
    incident_id: str
    what_happened: str
    where_started: str
    who_compromised: str
    systems_affected: str
    strongest_evidence: str
    uncertain: str
    reachable_next: str
    statements: list[FirexStoryStatement]
    checked_statements: int
    unsupported_claims: int


class IncidentDetail(Contract):
    summary: FirexIncidentSummary
    root_cause: str
    selected_path_id: str
    affected_entities: dict[str, list[str]]
    evidence_gaps: list[str]
    uncertainty_margin: float
    alert_merge_count: int
    detections: list[Detection]
    timeline: list[TimelineEntry]
    evidence: list[EvidenceEvent]
    related_incidents: list[str]
    response_simulation: ResponseEligibility


class ResponseEligibility(Contract):
    """Response simulation needs business topology and control context this data does not carry."""

    available: bool
    label: str = "SIMULATED — NO REAL SECURITY ACTION IS EXECUTED"
    missing: list[str]


class FirexIncidentList(Contract):
    run_id: str
    items: list[FirexIncidentSummary]
    quality: DatasetQualitySummary | None


class HostInfo(Contract):
    os: str
    cpu: str
    cores: int
    ram_gb: float | None
    python: str
    node: str | None


class BenchmarkReceipt(Contract):
    schema_version: Literal["halt.firex.benchmark/1.0"] = "halt.firex.benchmark/1.0"
    receipt_id: str
    run_id: str
    dataset_id: str
    source_filename: str
    source_sha256: str
    source_sha256_verified: bool
    range_sha256: str
    source_size_bytes: int
    processed_byte_range: list[int]
    parser_version: str
    schema_version_canonical: str
    engine_version: str
    detection_config_hash: str
    git_commit: str | None
    started_at: str
    completed_at: str
    host: HostInfo
    bytes_processed: int
    records_valid: int
    records_rejected: int
    quarantine_segments: int
    quarantine_bytes: int
    exact_duplicates: int
    behavioural_bursts: int
    detections: int
    incidents: int
    duration_s: float
    stage_durations_s: dict[str, float]
    records_per_second: float
    mb_per_second: float
    peak_memory_mb: float | None
    peak_memory_scope: str
    output_bytes: int
    incident_open_latency_ms: float | None
    status: str
    error_summary: str | None
    artifact_hashes: dict[str, str]
    seal_algorithm: Literal["sha256-canonical-json"] = "sha256-canonical-json"
    seal: str = ""


class ProofReceipt(Contract):
    schema_version: Literal["halt.firex.proof/1.0"] = "halt.firex.proof/1.0"
    receipt_id: str
    incident_id: str
    run_id: str
    dataset_id: str
    source_sha256: str
    processed_byte_range: list[int]
    parser_version: str
    engine_version: str
    detection_config_hash: str
    git_commit: str | None
    graph_hash: str
    selected_path_id: str
    evidence_coverage: float
    unsupported_claims: int
    uncertainty_margin: float
    cited_evidence: list[str]
    deterministic_replay_id: str
    status: Literal["unconfirmed"] = "unconfirmed"
    seal_algorithm: Literal["sha256-canonical-json"] = "sha256-canonical-json"
    seal: str = ""


class SealVerification(Contract):
    valid: bool
    expected: str
    recorded: str


class NarrativeStatement(Contract):
    text: str
    evidence_ids: list[str]


class NarrativeRequest(Contract):
    audience: Literal["analyst", "executive"] = "analyst"
    question: str | None = Field(default=None, max_length=500)


class NarrativeResult(Contract):
    incident_id: str
    summary: str
    statements: list[NarrativeStatement]
    uncertainty_notes: list[str]
    unsupported_claims: int
    rejected_statements: int
    provider: str
    model: str | None
    prompt_version: str
    generated_at: str
    fallback_used: bool
    fallback_reason: str | None
    label: str


TrustLabel = Literal["Verified", "Needs review", "Not measured", "Not applicable", "Failed"]
HealthState = Literal["Verified", "Degraded", "Unconfirmed", "Failed"]


class TrustItem(Contract):
    label: str
    value: str
    status: TrustLabel | None = None
    is_hash: bool = False


class TrustDimension(Contract):
    id: Literal["source", "processing", "reconstruction", "ground_truth"]
    title: str
    status: TrustLabel
    verdict: str
    items: list[TrustItem]


class TimeQuality(Contract):
    """Which records can be ordered in time, and which share one collapsed timestamp."""

    total_records: int
    usable_records: int
    collapsed_records: int
    usable_fraction: float
    collapsed_fraction: float
    collapsed_utc: str
    collapsed_first_line: int
    collapsed_last_line: int
    collapsed_first_offset: int
    collapsed_last_offset: int
    earliest_utc: str | None
    latest_utc: str | None
    timezone_conflict_records: int
    records_rejected: int


class IncidentTimeScope(Contract):
    """Whether an incident's stored evidence reaches the collapsed region. Read from stored files only."""

    incident_id: str
    title: str
    status: str
    scope: Literal["trustworthy_only", "collapsed_only", "both"]
    scope_label: str
    cited_records: int
    cited_in_collapsed: int
    first_utc: str
    last_utc: str
    span_includes_collapsed: bool


class DatasetHealth(Contract):
    """A verdict derived from stored files. Verified source or processing never means an incident is true."""

    run_id: str
    dataset_id: str
    state: HealthState
    headline: str
    explanation: str
    is_sample: bool
    reconstruction: Literal["ran", "partial", "withheld", "not_run"]
    reconstruction_reason: str
    narrative: str
    time_quality: TimeQuality | None
    incident_count: int
    source_bytes: int | None
    valid_fraction: float | None
    quarantined_fraction: float | None
    canonical_records: int | None
    exact_duplicates: int | None
    duration_s: float | None
    mb_per_second: float | None
    peak_memory_mb: float | None
    incident_open_latency_ms: float | None
    incident_open_latency_label: str
    dimensions: list[TrustDimension]


class IncidentProofStatus(Contract):
    incident_id: str
    title: str
    seal_valid: bool
    graph_hash: str
    evidence_coverage: float
    unsupported_claims: int


class TrustReport(Contract):
    health: DatasetHealth
    benchmark_seal_valid: bool | None
    benchmark_seal: str | None
    seal_algorithm: str | None
    artifact_hashes: dict[str, str]
    proofs: list[IncidentProofStatus]
    incident_scopes: list[IncidentTimeScope]
    scope_note: str | None


class QualitySegment(Contract):
    segment_id: str
    reason: str
    start_offset: int
    end_offset: int
    bytes: int


class QualityCase(Contract):
    """Why a source cannot support reconstruction. It deliberately has no graph."""

    run_id: str
    dataset_id: str
    filename: str
    source_bytes: int
    source_sha256: str
    source_hash_verified: bool
    bytes_valid: int
    bytes_quarantined: int
    bytes_blank: int
    bytes_accounted: bool
    valid_fraction: float
    quarantined_fraction: float
    canonical_records: int
    exact_duplicates: int
    collapsed_utc: str
    collapsed_records: int
    declared_tz: list[str]
    timezone_interpretation: str | None
    segments: list[QualitySegment]
    reason: str
    withheld_statement: str
    zero_statement: str
    incident_open_latency_label: str
    benchmark_seal_valid: bool


class RecordedFact(Contract):
    run_id: str
    dataset_id: str
    source_bytes: int
    duration_s: float
    exact_duplicates: int
    peak_memory_mb: float | None
    incidents: int
    reconstruction: Literal["ran", "partial", "withheld", "not_run"]
    state: HealthState
    narrative: str
    canonical_records: int
    usable_records: int
    collapsed_records: int
    proofs_valid: int
    benchmark_seal_valid: bool


class FactsResponse(Contract):
    items: list[RecordedFact]
    note: str


class CaseCandidate(Contract):
    incident_id: str
    title: str
    status: str
    risk: float
    path_steps: int
    score: float
    components: list[ScoreComponent]
    recommended: bool


class CaseCandidates(Contract):
    run_id: str
    items: list[CaseCandidate]
    quality_case_available: bool
    partial_case_available: bool
    note: str


class CaseRequest(Contract):
    run_id: str = Field(pattern=r"^frun-[0-9a-f]{16}$")
    subject: Literal["incident", "quality", "partial"]
    incident_id: str | None = Field(default=None, pattern=r"^finc-[0-9a-f]{12}$")


class CaseCamera(Contract):
    shot: Literal["establish", "approach", "follow", "inspect", "reveal", "withdraw", "present"]
    node_ids: list[str]


class CaseMetric(Contract):
    label: str
    value: str


class CaseChapter(Contract):
    chapter_id: str
    title: str
    headline: str
    body: str
    presenter_notes: str
    evidence_refs: list[str]
    camera: CaseCamera
    metrics: list[CaseMetric]
    visual: Literal["world", "bytes", "time", "withheld", "regions"]


class CaseManifest(Contract):
    """Deterministic and free of wall-clock time. Building one never changes the run or incident behind it."""

    case_id: str
    builder_version: str
    run_id: str
    dataset_id: str
    subject: Literal["incident", "quality", "partial"]
    incident_id: str | None
    title: str
    status: str
    benchmark_receipt_id: str
    benchmark_seal: str
    proof_receipt_ids: list[str]
    chapters: list[CaseChapter]
    llm_notes: str | None


class StepGuide(Contract):
    """Plain language for one path step, from stored evidence."""

    node_id: str
    what_happened: str
    who: str
    evidence: str
    why_it_matters: str
    uncertain: str
    check_next: str
    evidence_refs: list[str]


class NextCheck(Contract):
    """Something an analyst could check. It is never remediation, and nothing here has been done."""

    kind: Literal[
        "inspect_records",
        "validate_identity",
        "validate_asset",
        "collect_telemetry",
        "review_reachable",
        "compare_hypothesis",
    ]
    action: str
    reason: str
    evidence_refs: list[str]


class IncidentGuide(Contract):
    incident_id: str
    steps: list[StepGuide]
    next_checks: list[NextCheck]
    note: str
