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

export function stageState(run: DatasetRun, stage: DatasetRun["stage"]): "done" | "active" | "waiting" | "stopped" {
  const order = STAGES.map((s) => s.id);
  if (run.stage === "done") return "done";
  const at = order.indexOf(run.stage);
  const here = order.indexOf(stage);
  if (here < at) return "done";
  if (here > at) return "waiting";
  return ACTIVE_STATUSES.includes(run.status) ? "active" : "stopped";
}
