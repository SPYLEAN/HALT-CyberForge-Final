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
    expect(screen.getByRole("article", { name: "A · Aggressive isolation" })).toHaveTextContent("NOT REVERSIBLE IN 5 MIN");
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
});

describe("AT-8.2 no invented numbers when the API is down", () => {
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
