// PS2 graph model and upload checks: pure functions over recorded API responses.
import { describe, expect, it } from "vitest";

import type { CanonicalEvent, Hypotheses, IntakeCapabilities, ReconstructedGraph } from "@/lib/ps2/api";
import { buildModel, DEFAULT_OPTIONS } from "@/lib/ps2/graph";
import { suggestAdapter, validate, type Selected } from "@/lib/ps2/upload";

import { body, runPath, runs } from "./support/ps2-stub";

type Story = { statements: Parameters<typeof buildModel>[2] };

function model(run: string, options = DEFAULT_OPTIONS, shuffle = false) {
  const graph = body<ReconstructedGraph>(runPath(run, "/graph"));
  const hyp = body<Hypotheses>(runPath(run, "/hypotheses"));
  const story = body<Story>(runPath(run, "/story"));
  const summary = body<{ batch_id: string }>(runPath(run));
  const events = body<{ items: CanonicalEvent[] }>(`GET /api/v1/ps2/ingestions/${summary.batch_id}/events?offset=0&limit=500`).items;
  const g = shuffle ? { ...graph, nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() } : graph;
  return { m: buildModel(g, hyp, story.statements, Object.fromEntries(events.map((e) => [e.event_id, e])), options), graph, hyp };
}

describe("PS2 graph model (recorded scenario A and B)", () => {
  it("scenario A: the selected path, its edges, critical services and missing-evidence markers come from the API", () => {
    const { m, hyp, graph } = model(runs["scenario-a"]);
    expect(m.pathEventIds).toEqual(hyp.selected!.event_ids);
    expect(m.pathEventIds).toHaveLength(7);
    const pathEdges = m.elements.filter((e) => e.group === "edges" && e.classes.split(" ").includes("path"));
    expect(pathEdges.map((e) => e.data.id).sort()).toEqual([...hyp.selected!.edge_ids].sort());
    const services = graph.nodes.filter((n) => n.node_kind === "business_service");
    for (const s of services) {
      const el = m.elements.find((e) => e.data.id === s.node_id)!;
      expect(el.classes.includes("critical")).toBe(s.criticality === "critical" || s.criticality === "high");
    }
    expect(m.gaps.length).toBe(2);
    expect(m.elements.filter((e) => e.classes === "gap")).toHaveLength(2);
    // The one inferred hop stays visibly inferred even on the selected path.
    expect(pathEdges.filter((e) => e.classes.includes("inferred"))).toHaveLength(1);
  });

  it("scenario B produces a different graph from scenario A", () => {
    const a = model(runs["scenario-a"]).m;
    const b = model(runs["scenario-b"]).m;
    expect(b.pathEventIds).not.toEqual(a.pathEventIds);
    const ids = (x: typeof a) => x.elements.filter((e) => e.group === "nodes").map((e) => e.data.id).sort();
    expect(ids(b)).not.toEqual(ids(a));
    expect(b.summary).not.toEqual(a.summary);
  });

  it("toggles hide inferred edges, alternates and entities; rejected hypotheses are opt-in", () => {
    const all = model(runs["scenario-a"]).m;
    const none = model(runs["scenario-a"], { alternates: false, inferred: false, rejected: false, entities: false }).m;
    const withRejected = model(runs["scenario-a"], { ...DEFAULT_OPTIONS, rejected: true }).m;
    expect(all.elements.some((e) => e.classes.includes("causal inferred"))).toBe(true);
    expect(none.elements.some((e) => e.classes.includes("causal inferred"))).toBe(false);
    expect(none.elements.some((e) => e.classes.split(" ").includes("alt") && e.group === "edges")).toBe(false);
    expect(none.elements.some((e) => e.data.kind === "entity")).toBe(false);
    expect(all.elements.some((e) => e.classes === "rejected")).toBe(false);
    expect(withRejected.elements.some((e) => e.classes === "rejected")).toBe(true);
  });

  it("layout does not depend on the order the API listed nodes and edges in", () => {
    const pos = (x: ReturnType<typeof model>["m"]) =>
      Object.fromEntries(x.elements.filter((e) => e.position).map((e) => [e.data.id, e.position]));
    expect(pos(model(runs["scenario-b"], DEFAULT_OPTIONS, true).m)).toEqual(pos(model(runs["scenario-b"]).m));
  });

  it("an upload with no suspicious seed yields an empty model, not an invented path", () => {
    const { m } = model(runs.upload);
    expect(m.pathEventIds).toEqual([]);
    expect(m.elements).toEqual([]);
  });
});

describe("upload checks", () => {
  const caps = body<IntakeCapabilities>("GET /api/v1/ps2/intake");
  const file = (name: string, size = 10) => new File(["x".repeat(size)], name);
  const sel = (name: string, adapter = "api_activity", size = 10): Selected => ({
    file: file(name, size),
    format: name.endsWith(".csv") ? "csv" : name.endsWith(".json") ? "json" : name.endsWith(".jsonl") ? "jsonl" : null,
    adapter,
  });

  it("accepts a valid selection", () => {
    expect(validate([sel("api_activity.jsonl")], caps)).toEqual([]);
  });

  it("rejects unsupported types, unsafe names, missing adapters and limits from the API", () => {
    expect(validate([sel("notes.txt", "")], caps).join(" ")).toMatch(/only .*files are accepted/);
    expect(validate([sel("../evil.jsonl")], caps).join(" ")).toMatch(/no spaces or folders/);
    expect(validate([sel("a.jsonl", "")], caps).join(" ")).toMatch(/choose the log source/);
    expect(validate([sel("big.jsonl", "api_activity", caps.limits.max_file_bytes + 1)], caps).join(" ")).toMatch(/per-file limit/);
    const many = Array.from({ length: caps.limits.max_files + 1 }, (_, i) => sel(`f${i}.jsonl`));
    expect(validate(many, caps).join(" ")).toMatch(new RegExp(`At most ${caps.limits.max_files} files`));
    expect(validate([sel("a.jsonl"), sel("a.jsonl")], caps).join(" ")).toMatch(/unique/);
    expect(validate([], caps)).toEqual(["Choose at least one file."]);
  });

  it("preselects an adapter only when the file is named after one that reads its format", () => {
    expect(suggestAdapter("idp_signin.jsonl", caps)).toBe("idp_signin");
    expect(suggestAdapter("idp_signin.csv", caps)).toBe("");
    expect(suggestAdapter("logs.jsonl", caps)).toBe("");
  });
});
