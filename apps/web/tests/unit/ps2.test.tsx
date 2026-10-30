// PS2 intake and workspace over recorded backend responses: every value asserted here came from the real API.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Intake } from "@/components/ps2/Intake";
import { Workspace } from "@/components/ps2/Workspace";
import type { AttackStory, EvaluationReport, Hypotheses, ReconstructionReceipt } from "@/lib/ps2/api";
import { ps2Session } from "@/lib/ps2/session";

import { body, calls, partialUpload, ps2ApiDown, runPath, runs, replayPs2Recording } from "./support/ps2-stub";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
// Cytoscape needs a real canvas; the graph model is tested in ps2-model.test.ts and the canvas in E2E.
vi.mock("@/components/ps2/Ps2GraphCanvas", () => ({
  Ps2GraphCanvas: ({ model, onSelect }: { model: { summary: string; pathEventIds: string[] }; onSelect: (id: string) => void }) => (
    <div data-testid="ps2-graph" data-path={model.pathEventIds.join(" ")}>
      {model.pathEventIds.map((id) => (
        <button key={id} type="button" onClick={() => onSelect(id)}>{`node ${id}`}</button>
      ))}
    </div>
  ),
}));

beforeEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
  ps2Session.reset();
});
afterEach(() => vi.unstubAllGlobals());

const POST_INGEST = "POST /api/v1/ps2/ingestions";
const POST_RECON = "POST /api/v1/ps2/reconstructions";

describe("Reconstruction intake", () => {
  it("lists only the bundled datasets the API returns, then ingests one and reports the result", async () => {
    replayPs2Recording();
    const user = userEvent.setup();
    render(<Intake />);
    const datasets = body<{ items: Array<{ title: string; dataset_id: string }> }>("GET /api/v1/ps2/datasets").items;
    const group = await screen.findByRole("radiogroup", { name: "Bundled datasets" });
    expect(within(group).getAllByRole("radio")).toHaveLength(datasets.length);
    for (const d of datasets) expect(group).toHaveTextContent(d.title);
    const ingest = screen.getByRole("button", { name: /INGEST DATASET/ });
    expect(ingest).toBeDisabled();
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual([]); // nothing posted before confirmation

    await user.click(within(group).getAllByRole("radio")[0]!);
    await user.click(ingest);
    expect(await screen.findByRole("region", { name: "Ingestion result" })).toBeInTheDocument();
    const ing = body<{ batch_id: string; accepted: number; rejected: number; canonical_schema: string }>(`${POST_INGEST} {"dataset_id":"scenario-a"}`);
    const totals = screen.getByLabelText("Ingestion totals");
    expect(totals).toHaveTextContent(`Total records${ing.accepted + ing.rejected}`);
    expect(totals).toHaveTextContent(`Rejected${ing.rejected}`);
    expect(screen.getByText(ing.batch_id)).toBeInTheDocument();
    expect(screen.getAllByText(ing.canonical_schema).length).toBeGreaterThan(0);
    // Stages 1–4 done only after their requests answered; 5–8 still waiting.
    const stages = screen.getByRole("region", { name: "Reconstruction stages" });
    await waitFor(() => expect(within(stages).getByText("Canonical events created").closest("li")).toHaveAttribute("data-state", "done"));
    expect(within(stages).getByText("Reconstruction requested").closest("li")).toHaveAttribute("data-state", "pending");
  });

  it("starts the reconstruction once and navigates to its URL; returning never posts it again", async () => {
    replayPs2Recording();
    const user = userEvent.setup();
    const { unmount } = render(<Intake />);
    await user.click((await screen.findAllByRole("radio", { name: /Service-account abuse/ }))[0]!);
    await user.click(screen.getByRole("button", { name: /INGEST DATASET/ }));
    await user.click(await screen.findByRole("button", { name: /RECONSTRUCT ATTACK PATH/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/reconstructions/${runs["scenario-b"]}`));
    expect(calls.filter((c) => c.startsWith(POST_RECON))).toHaveLength(1);
    unmount();

    // Browser back: the page remounts from the session and offers the existing run instead of re-posting.
    render(<Intake />);
    await user.click(await screen.findByRole("button", { name: /OPEN RECONSTRUCTION/ }));
    expect(push).toHaveBeenLastCalledWith(`/reconstructions/${runs["scenario-b"]}`);
    expect(calls.filter((c) => c.startsWith(POST_RECON))).toHaveLength(1);
  });

  it("uploads files only after confirmation, reports partial rejection, and never renders the secret", async () => {
    replayPs2Recording();
    const user = userEvent.setup();
    render(<Intake />);
    await user.click(await screen.findByRole("radio", { name: "UPLOAD FILES" }));
    const f = partialUpload[0]!;
    await user.upload(screen.getByLabelText(/^Log files/), new File([f.content], f.filename, { type: "" }));
    await user.upload(screen.getByLabelText(/^Organisation context/), new File([JSON.stringify({ organisation: "Contoso Finance" })], "context.json"));
    // The file is named after its adapter, so it is preselected; the upload still waits for confirmation.
    expect(screen.getByRole("combobox", { name: `Log source for ${f.filename}` })).toHaveValue(f.adapter);
    const upload = screen.getByRole("button", { name: /UPLOAD 1 FILE/ });
    expect(upload).toBeDisabled();
    expect(calls.filter((c) => c.startsWith("POST"))).toEqual([]);
    await user.click(screen.getByRole("checkbox", { name: /synthetic or public-demo data only/ }));
    await user.click(upload);
    const totals = await screen.findByLabelText("Ingestion totals");
    expect(totals).toHaveTextContent("Rejected2");
    await user.click(screen.getByText(/api_activity\.jsonl: 2 rejected/));
    expect(screen.getAllByText("malformed_record").length).toBe(1);
    expect(screen.getAllByText(/Redacted preview/).length).toBeGreaterThan(0);
    expect(document.body.innerHTML).not.toContain("hunter2");
  });

  it("shows validation problems and keeps the upload disabled", async () => {
    replayPs2Recording();
    const user = userEvent.setup({ applyAccept: false });
    render(<Intake />);
    await user.click(await screen.findByRole("radio", { name: "UPLOAD FILES" }));
    await user.upload(screen.getByLabelText(/^Log files/), new File(["x"], "notes.txt"));
    expect(screen.getByRole("list", { name: "Problems to fix before uploading" })).toHaveTextContent("only");
    expect(screen.getByRole("button", { name: /UPLOAD 1 FILE/ })).toBeDisabled();
  });

  it("with the service down shows no figures, only the unavailable state and retry", async () => {
    ps2ApiDown();
    render(<Intake />);
    expect(await screen.findByRole("region", { name: "Reconstruction service unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /TRY AGAIN/ })).toBeInTheDocument();
    expect(screen.queryByText(/MB per file/)).not.toBeInTheDocument();
  });
});

async function openWorkspace(run: string) {
  replayPs2Recording();
  const user = userEvent.setup();
  render(<Workspace runId={run} />);
  await screen.findByRole("tablist", { name: "Reconstruction detail" }, { timeout: 5000 });
  return user;
}

describe("Reconstruction workspace", () => {
  it("scenario A: stages, the session notice and the selected path all come from the API", async () => {
    await openWorkspace(runs["scenario-a"]);
    const hyp = body<Hypotheses>(runPath(runs["scenario-a"], "/hypotheses"));
    expect(screen.getByTestId("ps2-graph")).toHaveAttribute("data-path", hyp.selected!.event_ids.join(" "));
    expect(screen.getByTestId("session-note")).toHaveTextContent("Demo-session reconstruction — restart clears this run.");
    const stages = screen.getByRole("region", { name: "Reconstruction stages" });
    for (const label of ["Graph ready", "Story verified", "Receipt sealed"]) expect(within(stages).getByText(label).closest("li")).toHaveAttribute("data-state", "done");
  });

  it("selecting a node shows that event's evidence; an edge shows its confidence components", async () => {
    const user = await openWorkspace(runs["scenario-a"]);
    const hyp = body<Hypotheses>(runPath(runs["scenario-a"], "/hypotheses"));
    const eventId = hyp.selected!.event_ids[1]!;
    await user.click(screen.getByRole("button", { name: `node ${eventId}` }));
    const inspector = screen.getByTestId("inspector");
    expect(inspector).toHaveTextContent("Event evidence");
    expect(inspector).toHaveTextContent(eventId);
    expect(inspector).toHaveTextContent("Raw-record hash");
    expect(inspector).toHaveTextContent("Parser");

    const edgeId = hyp.selected!.edge_ids[0]!;
    await user.click(screen.getAllByRole("button", { name: `Inspect ${edgeId}` })[0]!);
    expect(inspector).toHaveTextContent("Edge evidence");
    expect(within(screen.getByTestId("inspector")).getByRole("region", { name: "Confidence components table" })).toBeInTheDocument();
  });

  it("every story claim exposes its events, edges, confidence and status, and references open the evidence", async () => {
    const user = await openWorkspace(runs["scenario-a"]);
    const story = body<AttackStory>(runPath(runs["scenario-a"], "/story"));
    const rows = screen.getAllByTestId("story-statement");
    expect(rows).toHaveLength(story.statements.length);
    story.statements.forEach((st, i) => {
      for (const id of [...st.event_ids, ...st.edge_ids]) expect(within(rows[i]!).getByRole("button", { name: `Inspect ${id}` })).toBeInTheDocument();
      expect(rows[i]).toHaveTextContent(st.text);
      expect(rows[i]).toHaveAttribute("data-section", st.section);
    });
    const missing = story.statements.find((s) => s.section === "missing_evidence")!;
    await user.click(within(rows[story.statements.indexOf(missing)]!).getByRole("button", { name: `Inspect ${missing.event_ids[0]}` }));
    expect(screen.getByTestId("inspector")).toHaveTextContent(missing.event_ids[0]!);
  });

  it("missing-evidence markers open the statement that names the gap", async () => {
    const user = await openWorkspace(runs["scenario-a"]);
    const story = body<AttackStory>(runPath(runs["scenario-a"], "/story"));
    const gap = story.statements.find((s) => s.section === "missing_evidence")!;
    await user.click(screen.getAllByRole("button", { name: `Inspect ${gap.text}` })[0]!);
    expect(screen.getByTestId("inspector")).toHaveTextContent("Missing evidence");
    expect(screen.getByTestId("inspector")).toHaveTextContent(gap.text);
  });

  it("ATT&CK progression lists every mapped stage with its basis, never implying certainty", async () => {
    const user = await openWorkspace(runs["scenario-a"]);
    await user.click(screen.getByRole("tab", { name: "ATT&CK" }));
    const stages = body<{ items: Array<{ primary: { technique_id: string; basis: string } | null }> }>(runPath(runs["scenario-a"], "/stages")).items;
    const rows = screen.getAllByTestId("attack-row");
    expect(rows).toHaveLength(stages.length);
    stages.forEach((s, i) => {
      expect(rows[i]).toHaveTextContent(s.primary!.technique_id);
      expect(rows[i]).toHaveTextContent({ observed: "DIRECT · OBSERVED", rule_inferred: "RULE-INFERRED", uncertain: "UNCERTAIN CANDIDATE" }[s.primary!.basis]!);
    });
  });

  it("hypotheses: alternates with scores; scenario B's near tie is shown as ambiguity", async () => {
    const user = await openWorkspace(runs["scenario-b"]);
    await user.click(screen.getByRole("tab", { name: "HYPOTHESES" }));
    const hyp = body<Hypotheses>(runPath(runs["scenario-b"], "/hypotheses"));
    expect(screen.getAllByTestId("hypothesis")).toHaveLength(1 + hyp.alternates.length);
    const receipt = body<ReconstructionReceipt>(runPath(runs["scenario-b"], "/receipt"));
    expect(screen.getByTestId("ambiguity")).toHaveTextContent(receipt.uncertainty.score_margin.toLocaleString("en-GB", { maximumFractionDigits: 4 }));
  });

  it("the receipt is labelled a reconstruction proof, not a signature, and shows the API's hashes", async () => {
    const user = await openWorkspace(runs["scenario-a"]);
    await user.click(screen.getByRole("tab", { name: "PROOF" }));
    const receipt = body<ReconstructionReceipt>(runPath(runs["scenario-a"], "/receipt"));
    expect(screen.getByRole("heading", { name: "Reconstruction proof" })).toBeInTheDocument();
    expect(screen.getByText(/not cryptographically signed/)).toBeInTheDocument();
    for (const v of [receipt.replay_id, receipt.graph_hash, receipt.config_sha256, receipt.engine_version]) expect(screen.getByText(v)).toBeInTheDocument();
  });

  it("evaluation carries the synthetic disclosure and shows only measured values; targets stay in their own column", async () => {
    const user = await openWorkspace(runs["scenario-a"]);
    await user.click(screen.getByRole("tab", { name: "EVALUATION" }));
    expect(await screen.findByTestId("synthetic-disclosure")).toHaveTextContent(
      "Synthetic evaluation — demonstrates pipeline behaviour, not real-world accuracy.",
    );
    const report = body<EvaluationReport>(runPath(runs["scenario-a"], "/evaluation"));
    const rows = screen.getAllByTestId("metric-row");
    expect(rows).toHaveLength(report.metrics.length);
    report.metrics.forEach((m, i) => {
      const cells = within(rows[i]!).getAllByRole("cell");
      expect(cells[0]).toHaveTextContent(m.value != null ? m.value.toLocaleString("en-GB", { maximumFractionDigits: 3 }) : "unavailable");
      expect(cells[2]).toHaveTextContent(m.target != null ? m.target.toLocaleString("en-GB", { maximumFractionDigits: 3 }) : "—");
    });
  });

  it("an upload without ground truth shows no evaluation and no invented path", async () => {
    const user = await openWorkspace(runs.upload);
    expect(screen.getByTestId("empty-graph")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "EVALUATION" }));
    expect(await screen.findByText(/No ground truth exists for this input/)).toBeInTheDocument();
    expect(screen.queryByTestId("metric-row")).not.toBeInTheDocument();
  });

  it("an expired in-memory run is said plainly, with nothing shown for it", async () => {
    replayPs2Recording();
    render(<Workspace runId="run-0000000000000000" />);
    expect(await screen.findByRole("region", { name: "Reconstruction run not found" })).toHaveTextContent("This demo-session reconstruction has expired.");
    expect(screen.queryByTestId("ps2-graph")).not.toBeInTheDocument();
  });

  it("with the service down shows no figures and retries on request", async () => {
    ps2ApiDown();
    const user = userEvent.setup();
    render(<Workspace runId={runs["scenario-a"]} />);
    expect(await screen.findByRole("region", { name: "Reconstruction service unavailable" })).toBeInTheDocument();
    expect(screen.queryByText(runs["scenario-a"])).not.toBeInTheDocument();
    replayPs2Recording();
    await act(async () => user.click(screen.getByRole("button", { name: /TRY AGAIN/ })));
    expect(await screen.findByRole("tablist", { name: "Reconstruction detail" }, { timeout: 5000 })).toBeInTheDocument();
  });
});
