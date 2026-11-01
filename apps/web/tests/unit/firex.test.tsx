// FireX views over responses recorded from the real backend: every value asserted here came from the API.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Datasets } from "@/components/firex/Datasets";
import { Graph2D } from "@/components/firex/Graph2D";
import { SearchEvidence, WhyHere } from "@/components/firex/SourceTrace";
import { IncidentWorkspace } from "@/components/firex/IncidentWorkspace";
import { LiveIntake } from "@/components/firex/LiveIntake";
import { RunView } from "@/components/firex/RunView";
import { TheatreView } from "@/components/firex/TheatreView";
import { TrustIndex, TrustRun } from "@/components/firex/TrustCentre";
import { plainResult, stageState, type CaseManifest, type DatasetHealth, type DatasetRun, type IncidentDetail, type ProvenanceChain, type IncidentGraph, type IncidentList, type Hypotheses, type TrustReport } from "@/lib/firex/api";
import { ALL_ON, CAMERA_PRESETS, edgeState, frameOf, layoutGraph, nodeState, pathSteps, presetNodes, replayedNode, visibleEdge, visibleNode } from "@/lib/firex/scene";
import { presentTitle } from "@/lib/firex/wording";
import { buildWorld, formOf } from "@/lib/firex/world";
import { edgeMeaning, graphSummary, nodeMeaning } from "@/lib/firex/lens";

import recorded from "../fixtures/api/firex.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/firex" }));
// WebGL needs a real canvas: the layout is tested here and the canvas in E2E.
vi.mock("@/components/firex/AttackWorld", () => ({
  default: ({ onSelect, world }: { onSelect: (id: string) => void; world: { stepIds: string[] } }) => (
    <button type="button" data-testid="fake-3d" onClick={() => onSelect(world.stepIds[0]!)}>
      3D canvas
    </button>
  ),
}));

type Hit = { status: number; body: unknown };
const responses = recorded.responses as unknown as Record<string, Hit>;
const B = "/api/v1/ps2";
const RUN = recorded.run_id;
const body = <T,>(key: string): T => responses[key]!.body as T;
const list = () => body<IncidentList>(`GET ${B}/runs/${RUN}/incidents`);
const topId = () => list().items[0]!.incident_id;
const graphOf = (id = topId()) => body<IncidentGraph>(`GET ${B}/incidents/${id}/graph?run_id=${RUN}`);
const detailOf = (id = topId()) => body<IncidentDetail>(`GET ${B}/incidents/${id}?run_id=${RUN}`);
/** The incident with a selected-path link and a reachable target, whichever rank it holds. */
const richest = () => list().items.map((i) => i.incident_id).find((id) => graphOf(id).edges.some((e) => e.classification === "reachable"))!;

const calls: string[] = [];
function stub(overrides: Record<string, Hit> = {}) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (input: Request | string) => {
    const request = typeof input === "string" ? new Request(input) : input;
    const url = new URL(request.url);
    const key = `${request.method} ${url.pathname}${url.search}`;
    calls.push(key);
    const hit = overrides[key] ?? responses[key];
    if (!hit) throw new Error(`unrecorded request: ${key}`);
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { "content-type": "application/json" } });
  });
}
function apiDown() {
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("network down");
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("semantic layout", () => {
  it("gives every node a position from order, stage and layer, deterministically", () => {
    const graph = graphOf(richest());
    const a = layoutGraph(graph);
    const b = layoutGraph(graph);
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect(a.size).toBe(graph.nodes.length);
    const steps = pathSteps(graph);
    for (let i = 1; i < steps.length; i++) expect(a.get(steps[i]!.node_id)!.x).toBeGreaterThan(a.get(steps[i - 1]!.node_id)!.x);
  });

  it("separates observed, inferred, reachable and context states", () => {
    const graph = graphOf(richest());
    const reach = graph.nodes.find((n) => n.attributes.hypothetical === true)!;
    expect(nodeState(reach)).toBe("reachable");
    expect(reach.on_selected_path).toBe(false);
    expect(edgeState(graph.edges.find((e) => e.classification === "reachable")!)).toBe("reachable");
    expect(pathSteps(graph).every((n) => nodeState(n) === "selected_path")).toBe(true);
  });

  it("applies toggles without ever hiding the selected path", () => {
    const graph = graphOf(richest());
    const off = { observed: false, inferred: false, reachable: false };
    expect(pathSteps(graph).every((n) => visibleNode(n, off))).toBe(true);
    expect(graph.nodes.filter((n) => n.attributes.hypothetical === true).every((n) => !visibleNode(n, off))).toBe(true);
    expect(graph.edges.every((e) => !visibleEdge(e, off))).toBe(true);
    expect(graph.edges.every((e) => visibleEdge(e, ALL_ON))).toBe(true);
  });

  it("replays only what occurred, in order, and never hypothetical nodes", () => {
    const graph = graphOf(richest());
    const steps = pathSteps(graph);
    expect(graph.nodes.filter((n) => n.attributes.hypothetical === true).every((n) => !replayedNode(n, steps.length - 1, steps))).toBe(true);
    expect(steps.filter((n) => replayedNode(n, 0, steps))).toEqual([steps[0]]);
    expect(graph.nodes.every((n) => replayedNode(n, null, steps))).toBe(true);
  });

  it("frames presets, and returns nothing for what an incident lacks", () => {
    const graph = graphOf(richest());
    expect(presetNodes(graph, "Full Incident", null)).toHaveLength(graph.nodes.length);
    expect(presetNodes(graph, "Entry Point", null)).toEqual([pathSteps(graph)[0]!.node_id]);
    expect(presetNodes(graph, "Reachable Next", null).length).toBeGreaterThan(0);
    expect(presetNodes(graph, "Alternate Hypothesis", null)).toEqual([]);
    expect(CAMERA_PRESETS).toHaveLength(7);
    const frame = frameOf(presetNodes(graph, "Full Incident", null), layoutGraph(graph));
    expect(frame.radius).toBeGreaterThanOrEqual(4);
  });
});

describe("run stages", () => {
  const run = (over: Partial<DatasetRun>) => ({ ...body<DatasetRun>(`GET ${B}/runs/${RUN}`), ...over }) as DatasetRun;
  it("shows done, active and waiting from the real stage", () => {
    const active = run({ status: "running", stage: "prepare" });
    expect(stageState(active, "read")).toBe("done");
    expect(stageState(active, "prepare")).toBe("active");
    expect(stageState(active, "explain")).toBe("waiting");
    expect(stageState(run({ status: "interrupted", stage: "read" }), "read")).toBe("stopped");
    expect(stageState(run({ stage: "done" }), "explain")).toBe("done");
  });
});

describe("attack world model", () => {
  const every = () => list().items.map((i) => graphOf(i.incident_id));

  it("is deterministic and places every node honestly", () => {
    for (const graph of every()) {
      const a = buildWorld(graph);
      expect(a).toEqual(buildWorld(graph));
      expect(a.nodes).toHaveLength(graph.nodes.length);
      expect(a.stepIds).toEqual(pathSteps(graph).map((n) => n.node_id));
      const steps = a.nodes.filter((n) => n.step !== null).sort((x, y) => x.step! - y.step!);
      for (let i = 1; i < steps.length; i++) expect(steps[i]!.position.x).toBeGreaterThan(steps[i - 1]!.position.x);
      // An entity has no stage, so only path steps may leave the floor.
      expect(a.nodes.filter((n) => n.step === null).every((n) => n.position.y === 0)).toBe(true);
    }
  });

  it("gives entity kinds distinct forms and leaves an unknown kind visibly incomplete", () => {
    const node = graphOf().nodes[0]!;
    const forms = ["ip", "account", "host", "service", "critical_asset", "burst", "event", "other"].map((kind) => formOf({ ...node, kind } as typeof node));
    expect(forms).toEqual(["beacon", "ring", "terminal", "portal", "tower", "field", "marker", "unknown"]);
  });

  it("uses only the stages and layers an incident actually reaches", () => {
    for (const graph of every()) {
      const world = buildWorld(graph);
      expect(world.stages.length).toBeLessThanOrEqual(new Set(pathSteps(graph).map((n) => n.stage)).size);
      expect(world.lanes.length).toBeLessThanOrEqual(new Set(graph.nodes.map((n) => n.layer)).size);
    }
  });

  it("contains no incident identifier in the model's placement logic", () => {
    const worlds = every().map(buildWorld);
    expect(worlds.every((w) => w.nodes.length > 0)).toBe(true);
    expect(new Set(worlds.map((w) => w.stepIds.join())).size).toBe(worlds.length);
  });
});

describe("evidence lens text", () => {
  it("says what a node and a link mean, and marks hypothetical systems", () => {
    const graph = graphOf(richest());
    const reach = graph.nodes.find((n) => n.attributes.hypothetical === true)!;
    expect(nodeMeaning(reach).toLowerCase()).toContain("hypothetical");
    const link = graph.edges.find((e) => e.classification === "reachable")!;
    expect(edgeMeaning(link).toLowerCase()).toContain("hypothetical");
    expect(graphSummary(graph)).toContain("selected path");
  });
});

describe("dataset screen", () => {
  it("lists registered datasets from the API", async () => {
    stub();
    render(<Datasets />);
    expect(await screen.findByRole("article", { name: "FireX 10G" })).toHaveTextContent("Not on this server");
    expect(screen.getByRole("article", { name: "FireX 30G" })).toBeInTheDocument();
    const links = within(screen.getByRole("article", { name: "Fixture" })).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(expect.arrayContaining([`/firex/runs/${RUN}`, `/trust/${RUN}`]));
  });

  it("states a verdict for a dataset with a stored run", async () => {
    stub();
    render(<Datasets />);
    const card = await screen.findByRole("article", { name: "Fixture" });
    const health = body<{ state: string }>(`GET ${B}/runs/${RUN}/health`);
    await waitFor(() => expect(within(card).getAllByText(new RegExp(`^${health.state}$`, "i")).length).toBeGreaterThan(0));
  });

  it("starts a run and goes to its live page", async () => {
    const datasets = body<{ registered: Array<Record<string, unknown>> }>(`GET ${B}/datasets`);
    const fresh = { ...datasets, registered: datasets.registered.map((d) => ({ ...d, latest_run_id: null })) };
    stub({ [`POST ${B}/runs`]: responses[`GET ${B}/runs/${RUN}`]!, [`GET ${B}/datasets`]: { status: 200, body: fresh } });
    const user = userEvent.setup();
    render(<Datasets />);
    const card = await screen.findByRole("article", { name: "Fixture" });
    await user.click(within(card).getByRole("button", { name: /Start analysis/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/firex/runs/${RUN}`));
  });

  it("says when the API is unavailable and shows no invented data", async () => {
    apiDown();
    render(<Datasets />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be reached");
    expect(screen.queryByRole("article")).toBeNull();
  });
});

describe("run screen", () => {
  it("shows the verdict, the stages and real incidents, never a safe-sounding claim", async () => {
    stub();
    render(<RunView runId={RUN} />);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    const first = list().items[0]!;
    await waitFor(() => expect(document.querySelector(`a[href="/firex/incidents/${first.incident_id}?run=${RUN}"]`)).not.toBeNull());
    expect(screen.getAllByText(presentTitle(first.title)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/no threats found/i);
  });

  it("shows the four stages while a run is still working", async () => {
    const base = body<DatasetRun>(`GET ${B}/runs/${RUN}/progress`);
    stub({ [`GET ${B}/runs/${RUN}/progress`]: { status: 200, body: { ...base, status: "running", stage: "prepare" } } });
    render(<RunView runId={RUN} />);
    const stages = await screen.findByRole("list", { name: "Analysis stages" });
    expect(within(stages).getAllByRole("listitem")).toHaveLength(4);
  });

  it("offers resume for an interrupted run and says it recovered", async () => {
    const base = body<DatasetRun>(`GET ${B}/runs/${RUN}/progress`);
    stub({ [`GET ${B}/runs/${RUN}/progress`]: { status: 200, body: { ...base, status: "interrupted", stage: "read", recovered: true, detail: "The run process stopped." } } });
    render(<RunView runId={RUN} />);
    expect(await screen.findByRole("button", { name: /Resume/i })).toBeInTheDocument();
    expect(screen.getByText(/recovered from its stored progress/)).toBeInTheDocument();
  });

  it("reports an unknown run instead of showing another one", async () => {
    stub({ [`GET ${B}/runs/${RUN}/progress`]: { status: 404, body: { code: "not_found", message: "not found", request_id: "x" } } });
    render(<RunView runId={RUN} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not found");
  });
});

describe("incident workspace", () => {
  const open = async (id = topId()) => {
    stub();
    const user = userEvent.setup();
    render(<IncidentWorkspace incidentId={id} runId={RUN} />);
    await screen.findByRole("tablist");
    return user;
  };

  it("loads the requested incident, never the authored demo", async () => {
    const id = topId();
    await open(id);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(presentTitle(detailOf(id).summary.title));
    expect(screen.getByText(new RegExp(`Stored as: ${detailOf(id).summary.title}`))).toBeInTheDocument();
    expect(calls.every((c) => !c.includes("INC-2417"))).toBe(true);
    expect(calls.some((c) => c.includes(`/incidents/${id}`))).toBe(true);
    expect(document.body.textContent).not.toContain("INC-2417");
  });

  it("answers the investigator's questions and marks the incident unconfirmed", async () => {
    await open();
    expect(screen.getByRole("heading", { name: "What happened?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next checks" })).toBeInTheDocument();
    expect(screen.getAllByText("Unconfirmed").length).toBeGreaterThan(0);
  });

  it("has the eight investigator tabs, and analyst detail only in analyst mode", async () => {
    const user = await open();
    const names = () => screen.getAllByRole("tab").map((t) => t.textContent);
    expect(names()).toEqual(["Overview", "Attack World", "Timeline", "Evidence", "Reachable Next", "Verification", "Response Handoff", "Theatre"]);
    await user.click(screen.getByRole("checkbox", { name: "Analyst mode" }));
    expect(names()).toEqual(expect.arrayContaining(["ATT&CK", "Hypotheses", "Confidence", "Raw Fields"]));
    await user.click(screen.getByRole("tab", { name: "Raw Fields" }));
    await user.click(screen.getByRole("checkbox", { name: "Analyst mode" }));
    expect(screen.getByRole("heading", { name: "What happened?" })).toBeInTheDocument();
  });

  it("gives the investigator only the five replay controls and Present", async () => {
    const user = await open();
    await user.click(screen.getByRole("tab", { name: "Attack World" }));
    const replay = await screen.findByRole("region", { name: "Replay" });
    expect(within(replay).getAllByRole("button").map((b) => b.textContent)).toEqual(["Play", "Previous", "Next", "Focus path", "Inspect evidence", "Present"]);
    expect(screen.queryByLabelText("Camera preset")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Analyst mode" }));
    expect(screen.getByLabelText("Camera preset")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Legend" })).toBeInTheDocument();
  });

  it("shares a selection between the scene, the step list and the evidence lens, and returns focus", async () => {
    const id = richest();
    const user = await open(id);
    await user.click(screen.getByRole("tab", { name: "Attack World" }));
    await user.click(await screen.findByTestId("fake-3d"));
    const step = pathSteps(graphOf(id))[0]!;
    const lens = screen.getByTestId("firex-drawer");
    expect(within(lens).getByRole("heading", { level: 3 })).toHaveTextContent(step.label);
    expect(within(screen.getByRole("list", { name: "Attack path steps" })).getAllByRole("button")[0]).toHaveAttribute("aria-pressed", "true");
    await user.click(within(lens).getByRole("button", { name: "Close evidence" }));
    expect(screen.queryByTestId("firex-drawer")).toBeNull();
  });

  it("narrates each replay step in plain language from the stored guide", async () => {
    const id = richest();
    const user = await open(id);
    await user.click(screen.getByRole("tab", { name: "Attack World" }));
    const next = await screen.findByRole("button", { name: "Next" });
    await user.click(next);
    const steps = pathSteps(graphOf(id));
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(`Step 1 of ${steps.length}: ${steps[0]!.label}`);
    const guide = screen.getByRole("region", { name: "What this step means" });
    for (const label of ["Who", "What proves it", "Why it matters", "What is uncertain", "Check next"]) expect(within(guide).getByText(label)).toBeInTheDocument();
  });

  it("reports a missing incident and an unavailable API without substituting another", async () => {
    stub();
    render(<IncidentWorkspace incidentId="finc-000000000000" runId={RUN} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    vi.unstubAllGlobals();
    apiDown();
    render(<IncidentWorkspace incidentId={topId()} runId={RUN} />);
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(document.body.textContent).not.toContain("INC-2417");
  });
});

describe("2D view", () => {
  it("draws the same nodes as the shared graph and reports a click", async () => {
    const graph = graphOf(richest());
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Graph2D graph={graph} positions={layoutGraph(graph)} selected={null} onSelect={onSelect} toggles={ALL_ON} replayStep={null} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(graph.nodes.length);
    await user.click(container.querySelector("[data-node]")!);
    expect(onSelect).toHaveBeenCalled();
  });
});

describe("trust centre", () => {
  it("leads with the verdict and never calls an unconfirmed incident ground truth", async () => {
    stub();
    render(<TrustRun runId={RUN} />);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    const text = document.body.textContent!;
    for (const dimension of ["Source", "Processing", "Reconstruction", "Proof"]) expect(text).toContain(dimension);
    expect(text).toMatch(/Not measured/);
    expect(text).not.toMatch(/ground truth: verified/i);
  });

  it("lists stored runs on the index", async () => {
    stub();
    render(<TrustIndex />);
    expect(await screen.findByRole("link", { name: new RegExp(RUN) })).toBeInTheDocument();
  });
});

describe("case manifest and theatre", () => {
  const caseKey = Object.keys(responses).find((k) => k.startsWith(`GET ${B}/cases/`))!;
  const manifest = () => responses[caseKey]!.body as CaseManifest;

  it("recommends a case with an explained score that does not claim confirmation", () => {
    const data = body<{ items: Array<{ recommended: boolean; components: unknown[]; score: number }> }>(`GET ${B}/runs/${RUN}/case-candidates`);
    expect(data.items.filter((i) => i.recommended)).toHaveLength(1);
    expect(data.items.every((i) => i.components.length > 0)).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/confirmed attack/i);
  });

  it("orders the eight incident chapters and keeps the status unconfirmed", () => {
    const m = manifest();
    expect(m.chapters.map((c) => c.title)).toEqual(["Situation", "Entry point", "Attack progression", "Evidence", "Uncertainty", "Reachable next", "Verification", "Closing result"]);
    expect(m.status.toLowerCase()).toContain("unconfirmed");
  });

  it("steps by arrow keys, shows progress, and offers a one-button return to live evidence", async () => {
    stub();
    const user = userEvent.setup();
    render(<TheatreView caseId={manifest().case_id} />);
    await screen.findByTestId("theatre");
    expect(screen.getByText(/^1 of 8\. Situation/)).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText(/^2 of 8\. Entry point/)).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText(/^1 of 8\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open live evidence" })).toHaveAttribute("href", `/firex/incidents/${manifest().incident_id}?run=${RUN}`);
    await user.keyboard("{Escape}");
    expect(push).toHaveBeenCalledWith(`/firex/incidents/${manifest().incident_id}?run=${RUN}`);
  });

  it("hypotheses in the recording carry a margin and alternates", () => {
    const hyp = body<Hypotheses>(`GET ${B}/incidents/${topId()}/hypotheses?run_id=${RUN}`);
    expect(hyp.alternates.length).toBeGreaterThan(0);
    expect(hyp.selected.status).toBe("selected");
  });
});

describe("the three reconstruction outcomes stay apart", () => {
  const healthKey = `GET ${B}/runs/${RUN}/health`;
  const trustKey = `GET ${B}/runs/${RUN}/trust`;
  const base = () => body<DatasetHealth>(healthKey);
  const time = { total_records: 1000, usable_records: 295, collapsed_records: 705, usable_fraction: 0.295, collapsed_fraction: 0.705, collapsed_utc: "2026-01-01T00:00:00Z", collapsed_first_line: 296, collapsed_last_line: 1000, collapsed_first_offset: 1, collapsed_last_offset: 2, earliest_utc: "2025-12-31T00:00:00Z", latest_utc: "2026-01-01T00:00:00Z", timezone_conflict_records: 1000, records_rejected: 0 };
  const partialHealth = () => ({ ...base(), state: "Degraded", reconstruction: "partial", narrative: "Partial reconstruction from a degraded source", headline: "Partial reconstruction: 3 unconfirmed incidents from a degraded source.", reconstruction_reason: "705 of 1,000 valid records share one timestamp, so these results do not cover the complete source.", time_quality: time }) as DatasetHealth;

  it("a partial run shows its regions and its incidents, and offers no Quality Case", async () => {
    stub({ [healthKey]: { status: 200, body: partialHealth() } });
    render(<RunView runId={RUN} />);
    expect(await screen.findByRole("heading", { name: "Partial reconstruction" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /29\.50% of the records retain usable time order and 70\.50%/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open the Quality Case" })).toBeNull();
    expect(screen.queryByText("HALT refused to invent a story from this source.")).toBeNull();
    await waitFor(() => expect(document.querySelector(`a[href^="/firex/incidents/"]`)).not.toBeNull());
  });

  it("a withheld run shows the Quality Case and no incidents, and is not called partial", async () => {
    stub({ [healthKey]: { status: 200, body: { ...base(), state: "Degraded", reconstruction: "withheld", narrative: "Reconstruction withheld", headline: "Reconstruction withheld: this source has no trustworthy time axis." } } });
    render(<RunView runId={RUN} />);
    expect(await screen.findByRole("link", { name: "Open the Quality Case" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Partial reconstruction" })).toBeNull();
    expect(document.querySelector(`a[href^="/firex/incidents/"]`)).toBeNull();
  });

  it("a reconstructed run shows incidents, with neither of the others' findings", async () => {
    stub();
    render(<RunView runId={RUN} />);
    await waitFor(() => expect(document.querySelector(`a[href^="/firex/incidents/"]`)).not.toBeNull());
    expect(base().reconstruction).toBe("ran");
    expect(screen.queryByRole("heading", { name: "Partial reconstruction" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open the Quality Case" })).toBeNull();
  });

  it("the Trust Centre lists what each incident rests on, and keeps it unconfirmed", async () => {
    const report = body<TrustReport>(trustKey);
    const id = topId();
    stub({ [trustKey]: { status: 200, body: { ...report, health: partialHealth(), scope_note: "All 3 incidents rest only on the trustworthy time region.", incident_scopes: [{ incident_id: id, title: "Scoped incident", status: "unconfirmed", scope: "trustworthy_only", scope_label: "Trustworthy time region only", cited_records: 5, cited_in_collapsed: 0, first_utc: "a", last_utc: "b", span_includes_collapsed: false }] } } });
    render(<TrustRun runId={RUN} />);
    const table = await screen.findByRole("table", { name: "What each incident rests on" });
    expect(within(table).getByText("Trustworthy time region only")).toBeInTheDocument();
    expect(within(table).getByText("0 of 5")).toBeInTheDocument();
    expect(within(table).getByText("Unconfirmed")).toBeInTheDocument();
    expect(screen.getByText(/rest only on the trustworthy time region/)).toBeInTheDocument();
  });
});

describe("SourceTrace", () => {
  const openSearch = async () => {
    stub();
    const user = userEvent.setup();
    render(<SearchEvidence runId={RUN} advanced />);
    await user.click(screen.getByRole("button", { name: "Search evidence" }));
    return user;
  };

  it("finds an account by keyboard, names it, and connects it to its incident without calling it a file", async () => {
    const user = await openSearch();
    await user.keyboard("temp1{Enter}");
    const records = await screen.findByRole("region", { name: "Source records" });
    expect(within(records).getAllByText("RAW RECORD").length).toBeGreaterThan(0);
    expect(screen.getByText(/It is not a file/)).toBeInTheDocument();
    for (const group of ["Canonical events", "Detections", "Incident steps", "Graph relationships", "Proof receipts"]) expect(screen.getByRole("region", { name: group })).toBeInTheDocument();
    expect(within(records).getAllByRole("link").some((a) => a.textContent?.startsWith("Possible"))).toBe(true);
    expect(calls.every((c) => !c.includes("/runs/") || c.includes(RUN))).toBe(true);
  });

  it("says plainly when nothing was found and that nothing was substituted", async () => {
    const user = await openSearch();
    await user.keyboard("no-such-value{Enter}");
    expect(await screen.findByText(/has not substituted data from another dataset/)).toBeInTheDocument();
  });

  it("shows filters only where advanced search is offered", async () => {
    await openSearch();
    expect(screen.getByLabelText("Field")).toBeInTheDocument();
    expect(screen.getByLabelText("Relationship")).toBeInTheDocument();
  });

  it("why-is-this-here shows the plain explanation, the nine stages and the statuses", async () => {
    stub();
    const user = userEvent.setup();
    render(<WhyHere runId={RUN} query={{ incident_id: topId() }} />);
    const button = screen.getByRole("button", { name: "Why is this here?" });
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const panel = await screen.findByTestId("provenance");
    expect(within(panel).getByText("INCIDENT UNCONFIRMED")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Provenance chain" })).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Source record", "Parser mapping", "Canonical event", "Duplicate and burst handling", "Detection rule", "Evidence relationship", "Hypothesis", "Incident statement", "Proof receipt"]);
  });

  it("a failed claim names its link and is not presented as verified", async () => {
    const key = `GET ${B}/runs/${RUN}/provenance?incident_id=${topId()}`;
    const base = body<ProvenanceChain>(key);
    stub({ [key]: { status: 200, body: { ...base, statuses: ["PROVENANCE FAILED"], source_status: "PROVENANCE FAILED", failed_link: "The cited line resolves", plain: "This claim is not verified." } } });
    const user = userEvent.setup();
    render(<WhyHere runId={RUN} query={{ incident_id: topId() }} />);
    await user.click(screen.getByRole("button", { name: "Why is this here?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("PROVENANCE FAILED at: The cited line resolves");
    expect(screen.queryByText("SOURCE VERIFIED")).toBeNull();
  });

  it("presents any stored title as a hypothesis, leaving safe wording alone", () => {
    expect(presentTitle("Account created, used, then removed")).toBe("Possible short-lived administrator-account activity");
    expect(presentTitle("Denied-traffic flood against one target")).toBe("Possible denied-traffic flood against one target");
    expect(presentTitle("VPN identity alternating between source addresses")).toBe("Possible VPN identity alternating between source addresses");
    expect(presentTitle("Possible thing")).toBe("Possible thing");
  });

  it("the Trust Centre records provenance for each incident", async () => {
    stub();
    render(<TrustRun runId={RUN} />);
    const rows = await screen.findByRole("list", { name: "Provenance of each incident" });
    expect(within(rows).getAllByRole("listitem").length).toBeGreaterThanOrEqual(list().items.length);
    expect(within(rows).getAllByRole("button", { name: "Why is this here?" }).length).toBe(list().items.length);
  });
});

describe("Live Intake", () => {
  const file = { name: "new.log", size_bytes: 2048, modified_utc: "2026-11-01T00:00:00Z", detected_format: "fortigate_kv", format_label: "FortiGate key-value log", selectable: true, problem: null };
  const listing = { incoming_path: "C:\\HALT-DATA\\incoming", items: [file, { ...file, name: "other.csv", detected_format: "csv", format_label: "CSV", selectable: false, problem: "This analysis reads FortiGate key-value logs. No adapter here reads this format." }], max_upload_bytes: 2147483648, chunk_bytes: 8388608 };
  const check = { name: "new.log", size_bytes: 2048, modified_utc: "2026-11-01T00:00:00Z", sha256: "a".repeat(64), hashed_bytes: 2048, detected_format: "fortigate_kv", format_label: "FortiGate key-value log", adapter: "FortiGate key-value parser", parser_version: "p", engine_version: "e", parsing_confidence: "High", parsing_detail: "9 of 9 sample lines parsed.", time_interpretation: "eventtime is read as UTC.", sample_records: [], expected_destination: "results/firex-runs/frun-x", privacy_warning: "Logs can contain names.", duplicates: [], problems: [], warnings: [], can_start: true };
  const live = (preflight: unknown = check) => ({
    [`GET ${B}/live/files`]: { status: 200, body: listing },
    [`GET ${B}/live/files/new.log/preflight`]: { status: 200, body: preflight },
  });

  it("shows only add, start and open, with detail under Advanced, and starts on one press", async () => {
    stub({ ...live(), [`POST ${B}/live/files/new.log/start`]: responses[`GET ${B}/runs/${RUN}`]! });
    const user = userEvent.setup();
    render(<LiveIntake />);
    expect(await screen.findByRole("heading", { name: "Add data" })).toBeInTheDocument();
    expect(screen.getByText("C:\\HALT-DATA\\incoming")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Journey" })).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Add logs", "Analyse", "Investigate", "SourceTrace", "Verify", "Response Handoff", "Theatre"]);
    const files = screen.getByRole("list", { name: "Files in the incoming folder" });
    expect(within(files).getAllByRole("button", { name: "Select" })).toHaveLength(1);
    expect(within(files).getByText(/No adapter here reads this format/)).toBeInTheDocument();
    await user.click(within(files).getByRole("button", { name: "Select" }));
    const start = await screen.findByRole("button", { name: "START ANALYSIS" });
    expect(screen.getByText("a".repeat(64))).toBeInTheDocument();
    expect(screen.getByText("Logs can contain names.")).toBeInTheDocument();
    await user.click(start);
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/firex/runs/${RUN}`));
  });

  it("will not start until the hash is known, and shows real hashing progress", async () => {
    stub(live({ ...check, sha256: null, hashed_bytes: 1024, can_start: false }));
    const user = userEvent.setup();
    render(<LiveIntake />);
    await user.click(await screen.findByRole("button", { name: "Select" }));
    expect(await screen.findByRole("button", { name: "START ANALYSIS" })).toBeDisabled();
    expect(screen.getByText(/calculating/)).toBeInTheDocument();
  });

  it("offers the earlier result for a duplicate source, not a second run", async () => {
    stub(live({ ...check, duplicates: [{ run_id: RUN, dataset_id: "live-x", status: "completed" }], warnings: ["These exact bytes were already analysed."] }));
    const user = userEvent.setup();
    render(<LiveIntake />);
    await user.click(await screen.findByRole("button", { name: "Select" }));
    expect(await screen.findByRole("link", { name: "Open results" })).toHaveAttribute("href", `/firex/runs/${RUN}`);
    expect(screen.queryByRole("button", { name: "START ANALYSIS" })).toBeNull();
    expect(screen.getByText(/already analysed/)).toBeInTheDocument();
  });

  it("states a problem instead of offering a start", async () => {
    stub(live({ ...check, problems: [{ code: "insufficient_disk", message: "There may not be enough free disk space." }], can_start: false }));
    const user = userEvent.setup();
    render(<LiveIntake />);
    await user.click(await screen.findByRole("button", { name: "Select" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("enough free disk space");
    expect(screen.getByRole("button", { name: "START ANALYSIS" })).toBeDisabled();
  });

  it("labels a running result provisional, in plain language, and drops the label when complete", async () => {
    const base = body<DatasetRun>(`GET ${B}/runs/${RUN}/progress`);
    stub({ [`GET ${B}/runs/${RUN}/progress`]: { status: 200, body: { ...base, status: "running", stage: "prepare" } } });
    const { unmount } = render(<RunView runId={RUN} />);
    expect(await screen.findByRole("heading", { name: "Removing repeated activity" })).toBeInTheDocument();
    expect(screen.getByTestId("provisional")).toHaveTextContent("PROVISIONAL");
    expect(within(screen.getByRole("list", { name: "Live checks" })).getAllByRole("listitem")).toHaveLength(10);
    expect(document.body.textContent).not.toMatch(/Deduplication: \d+%/);
    unmount();
    stub();
    render(<RunView runId={RUN} />);
    await screen.findByText(/Ready for review|More evidence required/);
    expect(screen.queryByTestId("provisional")).toBeNull();
  });

  it("gives each outcome its own plain state", () => {
    const h = (over: Partial<DatasetHealth>) => ({ reconstruction: "ran", incident_count: 2, ...over }) as DatasetHealth;
    expect(plainResult(h({}))).toBe("Ready for review");
    expect(plainResult(h({ reconstruction: "withheld", incident_count: 0 }))).toBe("Source quality prevents reconstruction");
    expect(plainResult(h({ reconstruction: "partial" }))).toBe("More evidence required");
    expect(plainResult(h({ incident_count: 0 }))).toBe("More evidence required");
  });

  it("says so if adding files is unavailable, and leaves the rest of the page working", async () => {
    apiDown();
    render(<LiveIntake />);
    expect(await screen.findByRole("status")).toHaveTextContent("not available");
  });
});

describe("Response Handoff", () => {
  const openHandoff = async () => {
    stub();
    const user = userEvent.setup();
    render(<IncidentWorkspace incidentId={topId()} runId={RUN} />);
    await screen.findByRole("tablist");
    await user.click(screen.getByRole("tab", { name: "Response Handoff" }));
    return screen.findByTestId("response-handoff");
  };

  it("states NOT EXECUTED and draws only on the selected incident", async () => {
    const panel = await openHandoff();
    expect(within(panel).getAllByText("NOT EXECUTED").length).toBeGreaterThan(0);
    for (const name of ["Investigation actions", "Missing evidence to collect", "Identities and assets to validate", "Reachable systems to monitor", "Possible containment considerations", "Approval requirements", "Response system boundary"]) expect(within(panel).getByRole("heading", { name })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("INC-2417");
    expect(calls.some((c) => c.includes(`/incidents/${topId()}/handoff?run_id=${RUN}`))).toBe(true);
  });

  it("offers no way to execute, simulate or send a response", async () => {
    const panel = await openHandoff();
    expect(within(panel).queryAllByRole("button").filter((b) => /execute|simulate|contain|approve|send/i.test(b.textContent ?? ""))).toEqual([]);
    expect(within(panel).getByText(/No converter from a FireX incident/)).toBeInTheDocument();
  });

  it("says so when no containment is supported", async () => {
    const key = `GET ${B}/incidents/${topId()}/handoff?run_id=${RUN}`;
    stub({ [key]: { status: 200, body: { ...body<Record<string, unknown>>(key), containment_considerations: [] } } });
    const user = userEvent.setup();
    render(<IncidentWorkspace incidentId={topId()} runId={RUN} />);
    await screen.findByRole("tablist");
    await user.click(screen.getByRole("tab", { name: "Response Handoff" }));
    expect(await screen.findByText(/supports no containment consideration/)).toBeInTheDocument();
  });
});

describe("Adaptive Intake", () => {
  const vendor = { name: "vendor.jsonl", size_bytes: 200, modified_utc: "2026-11-01T00:00:00Z", detected_format: "jsonl", format_label: "JSON Lines", selectable: false, problem: "No adapter here reads this format.", profilable: true };
  const report = { name: "vendor.jsonl", size_bytes: 200, format: "jsonl", format_confidence: 1, format_reasons: [], sampled_lines: 2, parsed_records: 2, regions: { start: 2 }, schema_fingerprint: "f", fields: [], mappings: [{ source_field: "client_ip", proposed_field: "source.ip", halt_field: "src_ip", confidence: 0.86, reasons: [], requires_confirmation: true }], structure_state: "mapping_required", requires_confirmation: ["source.ip"], missing_requirements: [], can_analyse: false, statement: "HALT cannot analyse this file yet: no parser here reads this format." };
  const listing = (over = {}) => ({ incoming_path: "C:\\in", items: [{ ...vendor, ...over }], max_upload_bytes: 1, chunk_bytes: 1, adaptive_enabled: true });

  it("is absent when the flag is off", async () => {
    stub({ [`GET ${B}/live/files`]: { status: 200, body: { ...listing({ profilable: false }), adaptive_enabled: false } } });
    render(<LiveIntake />);
    await screen.findByRole("heading", { name: "Add data" });
    expect(screen.queryByRole("button", { name: "Profile its structure" })).toBeNull();
  });

  it("shows proposals clearly labelled, and offers no way to start the file", async () => {
    stub({ [`GET ${B}/live/files`]: { status: 200, body: listing() }, [`GET ${B}/live/files/vendor.jsonl/profile`]: { status: 200, body: report } });
    const user = userEvent.setup();
    render(<LiveIntake />);
    await user.click(await screen.findByRole("button", { name: "Profile its structure" }));
    const panel = await screen.findByTestId("adaptive-profile");
    expect(within(panel).getByText("PROPOSAL ONLY")).toBeInTheDocument();
    expect(within(panel).getByText(/cannot analyse this file yet/)).toBeInTheDocument();
    expect(within(panel).getByText("src_ip")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "START ANALYSIS" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
  });

  it("states a failure rather than showing an empty profile", async () => {
    stub({ [`GET ${B}/live/files`]: { status: 200, body: listing() }, [`GET ${B}/live/files/vendor.jsonl/profile`]: { status: 404, body: { code: "not_found", message: "vendor.jsonl is not in the incoming folder", request_id: "x" } } });
    const user = userEvent.setup();
    render(<LiveIntake />);
    await user.click(await screen.findByRole("button", { name: "Profile its structure" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be profiled");
  });
});
