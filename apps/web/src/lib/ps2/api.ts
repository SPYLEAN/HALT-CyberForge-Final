// Typed PS2 calls over the generated OpenAPI client. Each call returns the API's data or throws: a failure is
// classified (unavailable, expired, rejected), never replaced by a fallback value.
import { api, ApiFailure, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type S = components["schemas"];
export type DatasetInfo = S["DatasetInfo"];
export type IntakeCapabilities = S["IntakeCapabilities"];
export type AdapterInfo = S["AdapterInfo"];
export type RawFile = S["RawFile"];
export type OrgContext = S["OrgContext"];
export type IngestionResult = S["IngestionResult"];
export type IngestedRecord = S["IngestedRecord"];
export type CanonicalEvent = S["CanonicalEvent"];
export type ReconstructionSummary = S["ReconstructionSummary"];
export type ReconstructedGraph = S["ReconstructedGraph"];
export type ThreadNode = S["ThreadNode"];
export type CandidateEdge = S["CandidateEdge"];
export type AttackStory = S["AttackStory"];
export type StoryStatement = S["StoryStatement"];
export type Hypotheses = S["Hypotheses"];
export type PathHypothesis = S["PathHypothesis"];
export type Entity = S["Entity"];
export type StageAssignment = S["StageAssignment"];
export type TechniqueCandidate = S["TechniqueCandidate"];
export type ReconstructionReceipt = S["ReconstructionReceipt"];
export type EvaluationReport = S["EvaluationReport"];
export type MetricResult = S["MetricResult"];

export type FailureKind = "unavailable" | "expired" | "rejected";

export interface Ps2Failure {
  kind: FailureKind;
  status?: number;
  code?: string;
  message: string;
}

/** Network errors and 5xx are "unavailable"; 404 on a run or batch is "expired"; other 4xx are "rejected". */
export function classify(error: unknown): Ps2Failure {
  if (error instanceof ApiFailure) {
    const { status, body } = error;
    if (status === 404) return { kind: "expired", status, code: body?.code, message: body?.message ?? "not found" };
    if (status >= 500) return { kind: "unavailable", status, code: body?.code, message: body?.message ?? `HTTP ${status}` };
    return { kind: "rejected", status, code: body?.code, message: body?.message ?? `HTTP ${status}` };
  }
  return { kind: "unavailable", message: "The reconstruction service could not be reached." };
}

const run = (run_id: string) => ({ params: { path: { run_id } } });

export const ps2 = {
  datasets: async () => unwrap(await api.GET("/api/v1/ps2/datasets")).items,
  intake: async () => unwrap(await api.GET("/api/v1/ps2/intake")),
  ingestDataset: async (dataset_id: string) => unwrap(await api.POST("/api/v1/ps2/ingestions", { body: { dataset_id } })),
  ingestFiles: async (files: RawFile[], context?: OrgContext) =>
    unwrap(await api.POST("/api/v1/ps2/ingestions", { body: context ? { files, context } : { files } })),
  /** Every canonical event of a batch, page by page (the API caps a page at 500). */
  events: async (batch_id: string) => {
    const out: CanonicalEvent[] = [];
    for (let offset = 0; ; ) {
      const page = unwrap(
        await api.GET("/api/v1/ps2/ingestions/{batch_id}/events", { params: { path: { batch_id }, query: { offset, limit: 500 } } }),
      );
      out.push(...page.items);
      offset += page.items.length;
      if (!page.items.length || offset >= page.total) return out;
    }
  },
  reconstruct: async (batch_id: string) => unwrap(await api.POST("/api/v1/ps2/reconstructions", { body: { batch_id } })),
  summary: async (id: string) => unwrap(await api.GET("/api/v1/ps2/reconstructions/{run_id}", run(id))),
  graph: async (id: string) => unwrap(await api.GET("/api/v1/ps2/reconstructions/{run_id}/graph", run(id))),
  story: async (id: string) => unwrap(await api.GET("/api/v1/ps2/reconstructions/{run_id}/story", run(id))),
  hypotheses: async (id: string) => unwrap(await api.GET("/api/v1/ps2/reconstructions/{run_id}/hypotheses", run(id))),
  entities: async (id: string) => unwrap(await api.GET("/api/v1/ps2/reconstructions/{run_id}/entities", run(id))).items,
  stages: async (id: string) => unwrap(await api.GET("/api/v1/ps2/reconstructions/{run_id}/stages", run(id))).items,
  receipt: async (id: string) => unwrap(await api.GET("/api/v1/ps2/reconstructions/{run_id}/receipt", run(id))),
  /** 404 means this input has no ground truth (uploads never do): the caller shows no evaluation at all. */
  evaluation: async (id: string): Promise<EvaluationReport | null> => {
    const r = await api.GET("/api/v1/ps2/reconstructions/{run_id}/evaluation", run(id));
    if (r.response.status === 404) return null;
    return unwrap(r);
  },
};

export const RUN_ID = /^run-[0-9a-f]{16}$/;
