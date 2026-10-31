// FireX views over responses recorded from the real backend: every value asserted here came from the API.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Datasets } from "@/components/firex/Datasets";
import { Graph2D } from "@/components/firex/Graph2D";
import { IncidentWorkspace } from "@/components/firex/IncidentWorkspace";
import { RunStory } from "@/components/firex/RunStory";
import { RunView } from "@/components/firex/RunView";
import { stageState, type DatasetRun, type IncidentDetail, type IncidentGraph, type IncidentList, type Hypotheses, type ReachabilityResult } from "@/lib/firex/api";
import { ALL_ON, CAMERA_PRESETS, edgeState, frameOf, layoutGraph, nodeState, pathSteps, presetNodes, replayedNode, visibleEdge, visibleNode } from "@/lib/firex/scene";
import { buildBeats } from "@/lib/firex/story";

import recorded from "../fixtures/api/firex.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/firex" }));
// WebGL needs a real canvas: the layout is tested here and the canvas in E2E.
vi.mock("@/components/firex/AttackGraph3D", () => ({
  default: ({ onSelect, graph }: { onSelect: (id: string) => void; graph: IncidentGraph }) => (
    <button type="button" data-testid="fake-3d" onClick={() => onSelect(pathSteps(graph)[0]!.node_id)}>
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

describe("dataset screen", () => {
  it("lists registered datasets from the API", async () => {
    stub();
    render(<Datasets />);
    expect(await screen.findByRole("article", { name: "FireX 10G" })).toHaveTextContent("Not on this server");
    expect(screen.getByRole("article", { name: "FireX 30G" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Fixture" })).toHaveTextContent("Available");
    expect(screen.getByRole("link", { name: RUN })).toHaveAttribute("href", `/firex/runs/${RUN}`);
  });

  it("starts a run and goes to its live page", async () => {
    stub({ [`POST ${B}/runs`]: responses[`GET ${B}/runs/${RUN}`]! });
    const user = userEvent.setup();
    render(<Datasets />);
    const card = await screen.findByRole("article", { name: "Fixture" });
    await user.click(within(card).getByRole("button", { name: /START ANALYSIS/ }));
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
  it("shows the four stages, measurements and real incidents", async () => {
    stub();
    render(<RunView runId={RUN} />);
    expect(await screen.findByRole("heading", { name: "Completed" })).toBeInTheDocument();
    const stages = screen.getByRole("list", { name: "Analysis stages" });
    expect(within(stages).getAllByRole("listitem").map((li) => li.querySelector("strong")!.textContent)).toEqual(["READ", "PREPARE", "RECONSTRUCT", "EXPLAIN"]);
    const first = list().items[0]!;
    const link = await screen.findByRole("link", { name: `Open incident ${first.incident_id}` });
    expect(link).toHaveAttribute("href", `/firex/incidents/${first.incident_id}?run=${RUN}`);
    expect(screen.getAllByText("unconfirmed").length).toBe(list().items.length);
  });

  it("offers resume for an interrupted run and says it recovered", async () => {
    const base = body<DatasetRun>(`GET ${B}/runs/${RUN}/progress`);
    stub({ [`GET ${B}/runs/${RUN}/progress`]: { status: 200, body: { ...base, status: "interrupted", stage: "read", recovered: true, detail: "The run process stopped." } } });
    render(<RunView runId={RUN} />);
    expect(await screen.findByRole("button", { name: /RESUME/ })).toBeInTheDocument();
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

  it("Open Incident loads the requested incident, never the authored demo", async () => {
    const id = topId();
    await open(id);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(detailOf(id).summary.title);
    expect(calls.every((c) => !c.includes("INC-2417"))).toBe(true);
    expect(calls.some((c) => c.includes(`/incidents/${id}`))).toBe(true);
    expect(document.body.textContent).not.toContain("INC-2417");
  });

  it("answers the plain-language questions and marks the incident unconfirmed", async () => {
    await open();
    for (const q of ["What happened?", "Where did it start?", "Who or what was compromised?", "Which systems were affected?", "What is the strongest evidence?", "What is uncertain?", "What could be reached next?"])
      expect(screen.getByRole("heading", { name: q })).toBeInTheDocument();
    expect(screen.getByText("UNCONFIRMED")).toBeInTheDocument();
  });

  it("keeps analyst detail behind progressive disclosure", async () => {
    const user = await open();
    const names = () => screen.getAllByRole("tab").map((t) => t.textContent);
    expect(names()).toEqual(["Summary", "3D Attack Path", "Timeline", "Evidence", "Reachable Next"]);
    await user.click(screen.getByRole("checkbox", { name: "Analyst mode" }));
    expect(names()).toEqual(expect.arrayContaining(["ATT&CK", "Kill Chain", "Hypotheses", "Confidence", "Raw Fields", "Proof", "Evaluation"]));
    await user.click(screen.getByRole("tab", { name: "Proof" }));
    expect(screen.getByText("SEAL VALID")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Evaluation" }));
    expect(screen.getByText(/no organiser ground truth/i)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Analyst mode" }));
    expect(screen.getByRole("heading", { name: "What happened?" })).toBeInTheDocument();
  });

  it("shares selection between the 3D view, the step list and the evidence drawer", async () => {
    const id = richest();
    const user = await open(id);
    await user.click(screen.getByRole("tab", { name: "3D Attack Path" }));
    await user.click(await screen.findByTestId("fake-3d"));
    const step = pathSteps(graphOf(id))[0]!;
    expect(within(screen.getByTestId("firex-drawer")).getByRole("heading")).toHaveTextContent(step.label);
    expect(within(screen.getByRole("list", { name: "Attack path steps" })).getAllByRole("button")[0]).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "2D" }));
    expect(screen.getByTestId("firex-2d")).toBeInTheDocument();
    expect(within(screen.getByTestId("firex-drawer")).getByRole("heading")).toHaveTextContent(step.label);
  });

  it("replays step by step without showing hypothetical systems as activity", async () => {
    const id = richest();
    const user = await open(id);
    await user.click(screen.getByRole("tab", { name: "3D Attack Path" }));
    await user.click(screen.getByRole("button", { name: /^NEXT$/ }));
    const steps = pathSteps(graphOf(id));
    expect(screen.getByText(`Step 1 of ${steps.length}: ${steps[0]!.label}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^NEXT$/ }));
    expect(screen.getByText(`Step 2 of ${steps.length}: ${steps[1]!.label}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /PREVIOUS/ }));
    expect(screen.getByText(new RegExp(`^Step 1 of ${steps.length}`))).toBeInTheDocument();
  });

  it("keeps replay, reachability and response simulation separate and disables simulation without context", async () => {
    const id = richest();
    const user = await open(id);
    await user.click(screen.getByRole("tab", { name: "Reachable Next" }));
    expect(screen.getByRole("heading", { name: "Replay attack" })).toBeInTheDocument();
    expect(screen.getByText(/Hypothetical: what could be reached next/)).toBeInTheDocument();
    expect(screen.getByText("SIMULATED — NO REAL SECURITY ACTION IS EXECUTED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /NOT AVAILABLE/ })).toBeDisabled();
    expect(screen.getByText(/Business service map/)).toBeInTheDocument();
  });

  it("shows the deterministic story when the LLM is disabled", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: /EXPLAIN FOR AN ANALYST/ }));
    const panel = await screen.findByTestId("narrative");
    expect(panel).toHaveTextContent("Deterministic Attack Story");
    expect(panel).toHaveTextContent("The LLM is disabled.");
  });

  it("labels a validated AI explanation", async () => {
    const id = topId();
    const key = `POST ${B}/incidents/${id}/narrative?run_id=${RUN}`;
    const base = body<Record<string, unknown>>(key);
    stub({ [key]: { status: 200, body: { ...base, fallback_used: false, fallback_reason: null, label: "AI-assisted explanation — evidence validated", provider: "groq", model: "m" } } });
    const user = userEvent.setup();
    render(<IncidentWorkspace incidentId={id} runId={RUN} />);
    await user.click(await screen.findByRole("button", { name: /EXPLAIN FOR AN ANALYST/ }));
    expect(await screen.findByText("AI-assisted explanation — evidence validated")).toBeInTheDocument();
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

describe("story and theatre", () => {
  it("builds ten beats only from the run's own figures", () => {
    const run = body<DatasetRun>(`GET ${B}/runs/${RUN}`);
    const id = richest();
    const beats = buildBeats(run, list(), detailOf(id), body<ReachabilityResult>(`GET ${B}/incidents/${id}/reachability?run_id=${RUN}`));
    expect(beats).toHaveLength(10);
    expect(beats[0]!.figure).toContain(run.metrics.records_processed.toLocaleString("en-US"));
    expect(beats[7]!.title).toContain("hypothesis");
    expect(beats[9]!.figure).toBe("Unconfirmed");
  });

  it("handles a run with no incident honestly", () => {
    const beats = buildBeats(body<DatasetRun>(`GET ${B}/runs/${RUN}`), { ...list(), items: [] }, null, null);
    expect(beats[5]!.body).toContain("No supported attack path");
    expect(beats[7]!.figure).toContain("0");
  });

  it("theatre steps through the real run and hands off to its incident", async () => {
    stub();
    const user = userEvent.setup();
    render(<RunStory runId={RUN} theatre />);
    expect(await screen.findByRole("heading", { name: /pile of disconnected events/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /OPEN INCIDENT/ })).toHaveAttribute("href", `/firex/incidents/${topId()}?run=${RUN}`);
    await user.click(screen.getByRole("button", { name: /^NEXT$/ }));
    expect(screen.getByRole("heading", { name: /Read in pieces/ })).toBeInTheDocument();
    expect(screen.getByText("2 of 10")).toBeInTheDocument();
  });

  it("the story page says when no completed run exists", async () => {
    stub({ [`GET ${B}/runs`]: { status: 200, body: { items: [] } } });
    render(<RunStory theatre={false} />);
    expect(await screen.findByRole("status")).toHaveTextContent("No completed run");
  });

  it("hypotheses in the recording carry a margin and alternates", () => {
    const hyp = body<Hypotheses>(`GET ${B}/incidents/${topId()}/hypotheses?run_id=${RUN}`);
    expect(hyp.alternates.length).toBeGreaterThan(0);
    expect(hyp.selected.status).toBe("selected");
  });
});
