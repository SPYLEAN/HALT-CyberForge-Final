// AT-8.1 (recorded API), AT-8.2, AT-8.5, AT-8.6: views render API data only, fail honestly, gate execution.
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionGateDrawer } from "@/components/gate/ActionGateDrawer";
import { EchoLabView } from "@/components/views/EchoLabView";
import { OverviewView } from "@/components/views/OverviewView";
import { PoliciesView } from "@/components/views/PoliciesView";
import { ProofSealView } from "@/components/views/ProofSealView";
import { SafeCutView } from "@/components/views/SafeCutView";
import { ThreadGraphView } from "@/components/views/ThreadGraphView";
import { TimelineView } from "@/components/views/TimelineView";
import { CommandCenter } from "@/components/views/CommandCenter";

import { failingApi, Providers, useStage } from "./support/api-stub";

// Cytoscape needs a real canvas; the graph model and stylesheet are tested separately (graph-model.test.ts).
vi.mock("@/components/graph/ThreadGraphCanvas", () => ({
  ThreadGraphCanvas: ({ model }: { model: { summary: string; rings: unknown[] } }) => (
    <div data-testid="threadgraph" data-rings={model.rings.length}>
      {model.summary}
    </div>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const noop = () => undefined;

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("AT-8.1 views render recorded API data", () => {
  it("Overview shows confidence, paths, users and coverage from the API", async () => {
    useStage("contained");
    render(<Providers><OverviewView onOpenGate={noop} /></Providers>);
    expect(await screen.findByText("16 of 16")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "High-risk paths" })).toHaveTextContent("6");
    expect(screen.getByRole("group", { name: "Users affected by the plan" })).toHaveTextContent("3 users");
    expect(screen.getByRole("group", { name: "Paths reachable after plan" })).toHaveTextContent("0 of 6");
  });

  it("Overview states the residual reach the plan leaves open, by route", async () => {
    useStage("contained");
    render(<Providers><OverviewView onOpenGate={noop} /></Providers>);
    const residual = await screen.findByRole("group", { name: "Residual reach under the plan" });
    expect(residual).toHaveTextContent("502 of 6,000");
    expect(residual).toHaveTextContent("Via U1 (502, below threshold)");
  });

  it("Overview states the risk threshold and rollouts from the API, not literals", async () => {
    useStage("contained");
    render(<Providers><OverviewView onOpenGate={noop} /></Providers>);
    expect(await screen.findByRole("group", { name: "High-risk paths" })).toHaveTextContent("Risk ≥ 0.2 over 6,000 rollouts");
  });

  it("EchoLab runs with the incident's own parameters", async () => {
    const responses = useStage("forecast");
    const incident = responses["GET /api/v1/incidents/INC-2417"]!.body as { params: { rollouts: number; horizon_s: number; seed: number } };
    const recordedFetch = globalThis.fetch;
    let sent: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", async (request: Request) => {
      if (request.method === "POST" && request.url.endsWith("/simulations")) sent = (await request.clone().json()) as Record<string, unknown>;
      return recordedFetch(request);
    });
    render(<Providers view="echolab"><EchoLabView /></Providers>);
    // The button is re-rendered once the paths arrive, so query it again until it is enabled.
    await waitFor(() => expect(screen.getByRole("button", { name: /RUN ECHOLAB/ })).toBeEnabled());
    screen.getByRole("button", { name: /RUN ECHOLAB/ }).click();
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({ rollouts: incident.params.rollouts, horizon_s: incident.params.horizon_s, seed: incident.params.seed });
  });

  it("ThreadGraph lists every path with simulated reach counts and the cut status", async () => {
    useStage("contained");
    render(<Providers view="graph"><ThreadGraphView /></Providers>);
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(8); // header + P1..P6 + U1
    expect(within(table).getByText("4,335 of 6,000")).toBeInTheDocument();
    expect(within(table).getByText("Below threshold · uncertain")).toBeInTheDocument();
    expect(within(table).getAllByText("Cut")).toHaveLength(6);
    expect(screen.getByTestId("threadgraph")).toHaveAttribute("data-rings", "6");
  });

  it("EchoLab shows three futures with counts", async () => {
    useStage("contained");
    render(<Providers view="echolab"><EchoLabView /></Providers>);
    const passive = await screen.findByRole("article", { name: "B · Passive monitoring" });
    expect(passive).toHaveTextContent("5,782 of 6,000");
    expect(screen.getByRole("article", { name: "A · Aggressive isolation" })).toHaveTextContent("NOT REVERSIBLE IN 300 S");
    expect(screen.getByRole("article", { name: "C · SafeCut plan" })).toHaveTextContent("6 of 6");
  });

  it("SafeCut shows the derived envelope, constraints and every rejection", async () => {
    useStage("sealed");
    render(<Providers view="safecut"><SafeCutView onOpenGate={noop} /></Providers>);
    expect(await screen.findByText("Revoke DocuSync Pro OAuth grant")).toBeInTheDocument();
    expect(screen.getByText("Revoke 2 compromised sessions")).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(8);
    expect(screen.getByText(/Only soft cuts on P1, P3/)).toBeInTheDocument();
  });

  it("SafeCut shows closest options when no safe plan exists", async () => {
    useStage("blocked");
    render(<Providers view="safecut"><SafeCutView onOpenGate={noop} /></Providers>);
    expect(await screen.findByText("No feasible safe plan")).toBeInTheDocument();
    expect(screen.getByText(/missing: C04 needs finance_ops_owner/)).toBeInTheDocument();
  });

  it("ProofSeal shows nine verified claims, the enumeration and what is not covered", async () => {
    useStage("sealed");
    render(<Providers view="proofseal"><ProofSealView /></Providers>);
    expect(await screen.findByText("9 of 9")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Subsets checked" })).toHaveTextContent("4,096");
    expect(screen.getByText(/U1 .* stays open/)).toBeInTheDocument();
  });

  it("Timeline merges observed events and audit entries", async () => {
    useStage("contained");
    render(<Providers view="timeline"><TimelineView /></Providers>);
    expect(await screen.findByText(/step applied · C01/)).toBeInTheDocument();
    expect(screen.getByText(/execution applied/)).toBeInTheDocument();
  });

  it("Policies lists policies, approvers and constraints", async () => {
    useStage("blocked");
    render(<Providers view="policies"><PoliciesView /></Providers>);
    expect(await screen.findByText("Finance close change freeze, 09:00–11:00Z")).toBeInTheDocument();
    expect(screen.getByText("UNAVAILABLE")).toBeInTheDocument(); // S. Iyer in this variant
  });

  it("Policies shows the variants and the running one from the API", async () => {
    const responses = useStage("blocked");
    const listed = responses["GET /api/v1/incidents/INC-2417/variants"]!.body as { items: Array<{ key: string; title: string }>; active: string };
    render(<Providers view="policies"><PoliciesView /></Providers>);
    const select = (await screen.findByLabelText("Variant")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("approver_unavailable"));
    expect(listed.active).toBe("approver_unavailable");
    expect(Array.from(select.options).map((o) => o.value)).toEqual(listed.items.map((v) => v.key));
    expect(screen.getByRole("option", { name: /\(running\)/ })).toHaveValue("approver_unavailable");
  });

  it("Policies says 'Every action' only when a policy covers the whole catalogue", async () => {
    useStage("blocked");
    const recordedFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (request: Request) => {
      const response = await recordedFetch(request);
      if (!request.url.endsWith("/policies")) return response;
      const body = (await response.json()) as { policies: Array<Record<string, unknown>> };
      const partial = { ...body.policies[0], id: "IR-TEST-04", title: "Covers four types", window: null,
        applies_to_action_types: ["revoke_session", "isolate_api", "isolate_database", "isolate_subnet"] };
      return new Response(JSON.stringify({ ...body, policies: [...body.policies, partial] }), { headers: { "content-type": "application/json" } });
    });
    render(<Providers view="policies"><PoliciesView /></Providers>);
    const partial = (await screen.findByText("Covers four types")).closest("tr")!;
    expect(partial).toHaveTextContent("revoke session, isolate api, isolate database, isolate subnet");
    expect(partial).not.toHaveTextContent("Every action");
    expect(screen.getByText("Preserve evidence before containment").closest("tr")).toHaveTextContent("Every action");
  });
});

describe("AT-8.2 no invented numbers when the API is down", () => {
  it("shows the API's 503 reason when the database is unavailable, and no figures", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify({ code: "dependency_unavailable", message: "The HALT database is unavailable (OperationalError: connection refused). Nothing was changed; retry shortly.", detail: null, request_id: "t" }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );
    render(<Providers view="overview"><CommandCenter /></Providers>);
    expect(await screen.findByText(/Request failed \(503\)/)).toBeInTheDocument();
    expect(screen.getByText(/database is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/of 6,000/)).toBeNull();
    expect(screen.queryByText("16 of 16")).toBeNull();
  });

  it("shows an error and no figures", async () => {
    failingApi();
    render(<Providers view="overview"><CommandCenter /></Providers>);
    expect(await screen.findByText(/could not be reached/)).toBeInTheDocument();
    expect(screen.queryByText(/of 6,000/)).toBeNull();
    expect(screen.queryByText("16 of 16")).toBeNull();
  });
});

describe("AT-8.5 Action Gate", () => {
  it("keeps Execute disabled, with the reason, until both approvals are recorded", async () => {
    useStage("sealed");
    render(<Providers><ActionGateDrawer open onClose={noop} /></Providers>);
    const execute = await screen.findByRole("button", { name: /EXECUTE 3 ACTIONS/ });
    expect(execute).toBeDisabled();
    expect(screen.getByText(/Disabled until approvals are recorded: .*finance_ops_owner/)).toHaveTextContent("tier2_analyst");
    expect(screen.getAllByText("AWAITING")).toHaveLength(2);
  });

  it("offers rollback once applied", async () => {
    useStage("contained");
    render(<Providers><ActionGateDrawer open onClose={noop} /></Providers>);
    expect(await screen.findByRole("button", { name: /ROLL BACK ALL/ })).toBeEnabled();
    await waitFor(() => expect(screen.getAllByText("APPROVED")).toHaveLength(2));
  });
});
