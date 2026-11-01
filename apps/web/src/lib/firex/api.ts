// Typed FireX calls over the generated OpenAPI client. A failure is reported as a failure, never replaced with
// authored data: an official run's views show only what its API returned.
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type S = components["schemas"];
export type DatasetDescriptor = S["DatasetDescriptor"];
export type DatasetRun = S["DatasetRun"];
export type RunMetrics = S["RunMetrics"];
export type IncidentSummary = S["FirexIncidentSummary"];
export type IncidentList = S["FirexIncidentList"];
export type IncidentDetail = S["IncidentDetail"];
export type IncidentGraph = S["IncidentGraph"];
export type GraphNode = S["FirexGraphNode"];
export type GraphEdge = S["FirexGraphEdge"];
export type AttackStory = S["FirexAttackStory"];
export type Hypotheses = S["FirexHypotheses"];
export type AttackHypothesis = S["AttackHypothesis"];
export type ReachabilityResult = S["ReachabilityResult"];
export type ProofView = S["ProofView"];
export type BenchmarkView = S["BenchmarkView"];
export type EvidenceEvent = S["EvidenceEvent"];
export type Detection = S["Detection"];
export type NarrativeResult = S["NarrativeResult"];
export type DatasetQualitySummary = S["DatasetQualitySummary"];
export type QuarantineSegment = S["QuarantineSegment"];
export type DatasetHealth = S["DatasetHealth"];
export type TrustReport = S["TrustReport"];
export type TimeQuality = S["TimeQuality"];
export type ResponseHandoff = S["ResponseHandoff"];
export type LiveFile = S["LiveFile"];
export type AdaptiveProfile = S["AdaptiveProfile"];
export type LiveFileList = S["LiveFileList"];
export type LivePreflight = S["LivePreflight"];
export type UploadState = S["UploadState"];
export type SearchResponse = S["SearchResponse"];
export type TraceRecord = S["TraceRecord"];
export type ProvenanceChain = S["ProvenanceChain"];
export type ProvenanceSummary = S["ProvenanceSummary"];
export type AnalystReview = S["AnalystReview"];
export type ReviewDecision = S["ReviewRequest"]["decision"];
export type ProvenanceQuery = { incident_id?: string | null; evidence_id?: string | null; statement_id?: string | null; node_id?: string | null; edge_id?: string | null };
export const REVIEW_DECISIONS: ReviewDecision[] = ["Confirmed", "False positive", "Incorrect mapping", "Incorrect correlation", "Needs more evidence", "Benign administrative activity"];
export type IncidentTimeScope = S["IncidentTimeScope"];
export type QualityCase = S["QualityCase"];
export type CaseCandidates = S["CaseCandidates"];
export type CaseManifest = S["CaseManifest"];
export type CaseChapter = S["CaseChapter"];
export type FactsResponse = S["FactsResponse"];
export type IncidentGuide = S["IncidentGuide"];
export type StepGuide = S["StepGuide"];
export type RecordedFact = S["RecordedFact"];

export const ACTIVE_STATUSES: ReadonlyArray<DatasetRun["status"]> = ["queued", "running", "cancelling"];
export const RESUMABLE_STATUSES: ReadonlyArray<DatasetRun["status"]> = ["cancelled", "interrupted", "failed"];

const runPath = (run_id: string) => ({ params: { path: { run_id } } });
const incidentPath = (incident_id: string, run_id?: string) => ({
  params: { path: { incident_id }, query: run_id ? { run_id } : {} },
});

export const firex = {
  datasets: async () => unwrap(await api.GET("/api/v1/ps2/datasets")).registered,
  runs: async () => unwrap(await api.GET("/api/v1/ps2/runs")).items,
  start: async (dataset_id: string, max_bytes: number | null) =>
    unwrap(await api.POST("/api/v1/ps2/runs", { body: { dataset_id, max_bytes } })),
  run: async (run_id: string) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/progress", runPath(run_id))),
  cancel: async (run_id: string) => unwrap(await api.POST("/api/v1/ps2/runs/{run_id}/cancel", runPath(run_id))),
  resume: async (run_id: string) => unwrap(await api.POST("/api/v1/ps2/runs/{run_id}/resume", runPath(run_id))),
  incidents: async (run_id: string) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/incidents", runPath(run_id))),
  quarantine: async (run_id: string) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/quarantine", runPath(run_id))),
  benchmark: async (run_id: string) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/benchmark", runPath(run_id))),
  health: async (run_id: string) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/health", runPath(run_id))),
  trust: async (run_id: string) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/trust", runPath(run_id))),
  qualityCase: async (run_id: string) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/quality-case", runPath(run_id))),
  candidates: async (run_id: string) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/case-candidates", runPath(run_id))),
  createCase: async (run_id: string, subject: "incident" | "quality" | "partial", incident_id: string | null = null) =>
    unwrap(await api.POST("/api/v1/ps2/cases", { body: { run_id, subject, incident_id } })),
  getCase: async (case_id: string) => unwrap(await api.GET("/api/v1/ps2/cases/{case_id}", { params: { path: { case_id } } })),
  facts: async () => unwrap(await api.GET("/api/v1/ps2/facts")),
  handoff: async (id: string, run?: string) => unwrap(await api.GET("/api/v1/ps2/incidents/{incident_id}/handoff", incidentPath(id, run))),
  liveFiles: async () => unwrap(await api.GET("/api/v1/ps2/live/files")),
  livePreflight: async (name: string) => unwrap(await api.GET("/api/v1/ps2/live/files/{name}/preflight", { params: { path: { name } } })),
  liveProfile: async (name: string) => unwrap(await api.GET("/api/v1/ps2/live/files/{name}/profile", { params: { path: { name } } })),
  liveStart: async (name: string, confirm_duplicate = false) => unwrap(await api.POST("/api/v1/ps2/live/files/{name}/start", { params: { path: { name } }, body: { confirm_duplicate } })),
  liveCreateUpload: async (body: S["UploadRequest"]) => unwrap(await api.POST("/api/v1/ps2/live/uploads", { body })),
  liveUpload: async (upload_id: string) => unwrap(await api.GET("/api/v1/ps2/live/uploads/{upload_id}", { params: { path: { upload_id } } })),
  liveSendChunk: async (upload_id: string, index: number, chunk: Blob, checksum?: string) =>
    unwrap(
      await api.PUT("/api/v1/ps2/live/uploads/{upload_id}/chunks/{index}", {
        params: { path: { upload_id, index }, header: checksum ? { "x-chunk-sha256": checksum } : {} },
        body: chunk as never,
        bodySerializer: (body: unknown) => body as BodyInit,
        headers: { "content-type": "application/octet-stream" },
      }),
    ),
  liveCompleteUpload: async (upload_id: string) => unwrap(await api.POST("/api/v1/ps2/live/uploads/{upload_id}/complete", { params: { path: { upload_id } } })),
  liveCancelUpload: async (upload_id: string) => {
    await api.DELETE("/api/v1/ps2/live/uploads/{upload_id}", { params: { path: { upload_id } } });
  },
  search: async (run_id: string, q: string, options: { field?: string; relationship?: string; cursor?: string } = {}) =>
    unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/search", { params: { path: { run_id }, query: { q, ...options } as never } })),
  suggest: async (run_id: string, q: string) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/search/suggestions", { params: { path: { run_id }, query: { q } } })),
  provenance: async (run_id: string, query: ProvenanceQuery) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/provenance", { params: { path: { run_id }, query: query as never } })),
  provenanceSummary: async (run_id: string) => unwrap(await api.GET("/api/v1/ps2/runs/{run_id}/provenance-summary", runPath(run_id))),
  addReview: async (run_id: string, body: S["ReviewRequest"]) => unwrap(await api.POST("/api/v1/ps2/runs/{run_id}/reviews", { params: { path: { run_id } }, body })),
  incident: async (id: string, run?: string) => unwrap(await api.GET("/api/v1/ps2/incidents/{incident_id}", incidentPath(id, run))),
  guide: async (id: string, run?: string) => unwrap(await api.GET("/api/v1/ps2/incidents/{incident_id}/guide", incidentPath(id, run))),
  graph: async (id: string, run?: string) => unwrap(await api.GET("/api/v1/ps2/incidents/{incident_id}/graph", incidentPath(id, run))),
  story: async (id: string, run?: string) => unwrap(await api.GET("/api/v1/ps2/incidents/{incident_id}/story", incidentPath(id, run))),
  hypotheses: async (id: string, run?: string) => unwrap(await api.GET("/api/v1/ps2/incidents/{incident_id}/hypotheses", incidentPath(id, run))),
  reachability: async (id: string, run?: string) => unwrap(await api.GET("/api/v1/ps2/incidents/{incident_id}/reachability", incidentPath(id, run))),
  proof: async (id: string, run?: string) => unwrap(await api.GET("/api/v1/ps2/incidents/{incident_id}/proof", incidentPath(id, run))),
  narrative: async (id: string, audience: "analyst" | "executive", run?: string) =>
    unwrap(await api.POST("/api/v1/ps2/incidents/{incident_id}/narrative", { ...incidentPath(id, run), body: { audience, question: null } })),
};

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} MB`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} KB`;
  return `${value} B`;
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("en-US");
}

export function percentOf(run: DatasetRun): number {
  const { bytes_processed: done, bytes_total: total } = run.metrics;
  return total ? Math.min(100, Math.round((done / total) * 100)) : 0;
}

/** The four user-facing stages, each with what it covers. Detail stays under Analyst Details. */
export const STAGES: ReadonlyArray<{ id: DatasetRun["stage"]; label: string; description: string }> = [
  { id: "read", label: "Read", description: "File selected and ingestion started" },
  { id: "prepare", label: "Prepare", description: "Parsed, normalised, deduplicated and grouped" },
  { id: "reconstruct", label: "Reconstruct", description: "Suspicious activity detected and connected" },
  { id: "explain", label: "Explain", description: "Graph, story, hypotheses and receipts created" },
];

/** The ten checks a run passes through. The pipeline reports four phases, so each check shares its phase's state. It never invents a percentage. */
export const LIVE_CHECKS: ReadonlyArray<{ label: string; phase: DatasetRun["stage"] }> = [
  { label: "Source validation", phase: "read" },
  { label: "Reading", phase: "read" },
  { label: "Parsing", phase: "read" },
  { label: "Normalisation", phase: "read" },
  { label: "Deduplication", phase: "prepare" },
  { label: "Behavioural grouping", phase: "reconstruct" },
  { label: "Candidate detection", phase: "reconstruct" },
  { label: "Reconstruction", phase: "reconstruct" },
  { label: "Provenance verification", phase: "explain" },
  { label: "Receipt sealing", phase: "explain" },
];

/** A plain sentence for where a run has got to. */
export function plainProgress(run: DatasetRun): string {
  if (run.status === "queued") return "Preparing file";
  if (run.stage === "prepare") return "Removing repeated activity";
  if (run.stage === "reconstruct") return "Connecting suspicious events";
  if (run.stage === "explain") return "Checking evidence";
  return run.metrics.bytes_processed ? "Reading records" : "Preparing file";
}

/** A plain sentence for a finished run. Only the backend's verdict decides it. */
export function plainResult(health: DatasetHealth): string {
  if (health.reconstruction === "withheld") return "Source quality prevents reconstruction";
  if (!health.incident_count || health.reconstruction === "partial") return "More evidence required";
  return "Ready for review";
}

export function stageState(run: DatasetRun, stage: DatasetRun["stage"]): "done" | "active" | "waiting" | "stopped" {
  const order = STAGES.map((s) => s.id);
  if (run.stage === "done") return "done";
  const at = order.indexOf(run.stage);
  const here = order.indexOf(stage);
  if (here < at) return "done";
  if (here > at) return "waiting";
  return ACTIVE_STATUSES.includes(run.status) ? "active" : "stopped";
}
