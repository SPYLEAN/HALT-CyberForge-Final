// Replays API responses recorded from the real backend (services/api/scripts/record_fixtures.py).
import type { ReactNode } from "react";
import { vi } from "vitest";

import { OpsProvider } from "@/lib/api/ops";
import type { GraphSnapshot } from "@/lib/api/types";
import { IncidentProvider, initialState, type IncidentState, type ViewId } from "@/lib/state/incident-store";

import recorded from "../../fixtures/api/stages.json";

export type StageName = keyof typeof recorded.stages;
type Recorded = Record<string, { status: number; body: unknown }>;

export const graph = recorded.graph as unknown as GraphSnapshot;

/** Stub fetch with one recorded stage. Unknown routes fail loudly instead of inventing data. */
export function useStage(stage: StageName): Recorded {
  const responses = recorded.stages[stage] as Recorded;
  vi.stubGlobal("fetch", async (input: Request | string) => {
    const request = typeof input === "string" ? new Request(input) : input;
    const url = new URL(request.url);
    const key = `${request.method} ${url.pathname}${url.search}`;
    const hit = responses[key];
    if (!hit) return new Response(JSON.stringify({ code: "not_recorded", message: key, request_id: "test" }), { status: 599 });
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { "content-type": "application/json" } });
  });
  return responses;
}

export function failingApi(): void {
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
}

/** The incident store as it is after a full replay (graph from the API, cursor at the end). */
export function replayedState(view: ViewId = "overview"): Partial<IncidentState> {
  return {
    ...initialState("INC-2417", view),
    nodes: Object.fromEntries(graph.nodes.map((n) => [n.id, n])),
    edges: Object.fromEntries(graph.edges.map((e) => [e.id, e])),
    stage: "forecast_ready",
    cursor: 666,
  };
}

export function Providers({ children, view = "overview" }: { children: ReactNode; view?: ViewId }) {
  return (
    <IncidentProvider incidentId="INC-2417" connect={false} initial={replayedState(view)}>
      <OpsProvider incidentId="INC-2417">{children}</OpsProvider>
    </IncidentProvider>
  );
}
