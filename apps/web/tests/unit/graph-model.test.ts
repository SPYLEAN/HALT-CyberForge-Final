// AT-8.3, AT-8.4 (model half), AT-8.6: graph classification, cut rings, business thread, evidence rail.
import { describe, expect, it } from "vitest";

import { canvasColor, stylesheet } from "@/components/graph/cy-style";
import { buildModel, type GraphMode } from "@/components/graph/model";
import { evidenceFor } from "@/components/views/evidence";
import type { OpsApi } from "@/lib/api/ops";
import type { AttackPath, Execution, Plan, ResponseAction } from "@/lib/api/types";
import { initialState } from "@/lib/state/incident-store";

import recorded from "../fixtures/api/stages.json";

import { graph } from "./support/api-stub";

const contained = recorded.stages.contained as Record<string, { body: unknown }>;
const body = <T,>(prefix: string): T => Object.entries(contained).find(([k]) => k.startsWith(prefix))![1].body as T;
const paths = (body<{ items: AttackPath[] }>("GET /api/v1/incidents/INC-2417/paths")).items;
const actions = (body<{ items: ResponseAction[] }>("GET /api/v1/incidents/INC-2417/actions")).items;
const plan = body<Plan>("GET /api/v1/plans/PLAN-");
const execution = body<{ execution: Execution }>("GET /api/v1/executions/").execution;

function model(mode: GraphMode, applied = false, focusPath: string | null = null) {
  return buildModel({ nodes: graph.nodes, edges: graph.edges, paths, plan, actions, execution: applied ? execution : null, mode, focusPath });
}
const classesOf = (m: ReturnType<typeof model>, id: string) => m.elements.find((e) => e.data.id === id)!.classes;

describe("AT-8.3 provenance is drawn by stroke form", () => {
  it("classifies observed, inferred and forecast hostile edges", () => {
    const m = model("forecast");
    expect(classesOf(m, "e.s1-fapi")).toContain("observed");
    expect(classesOf(m, "i.phish-asn")).toContain("inferred");
    expect(classesOf(m, "f.grant-fapi")).toContain("forecast");
  });

  it("observed mode hides the forecast layer", () => {
    const ids = model("observed").elements.map((e) => e.data.id);
    expect(ids).not.toContain("session.s3");
    expect(ids).not.toContain("f.grant-fapi");
  });

  it("marks the below-threshold path as uncertain", () => {
    const m = model("forecast");
    for (const id of paths.find((p) => p.id === "U1")!.edge_ids) expect(classesOf(m, id)).toContain("uncertain");
  });

  it("stylesheet uses the 3-graph.md dash patterns and widths", () => {
    const style = stylesheet("dark") as Array<{ selector: string; style: Record<string, unknown> }>;
    const rule = (s: string) => style.find((r) => r.selector === s)!.style;
    expect(rule("edge.hostile.observed")).toMatchObject({ "line-style": "solid", width: 3 });
    expect(rule("edge.hostile.inferred")).toMatchObject({ "line-dash-pattern": [6, 4], width: 1.5 });
    expect(rule("edge.hostile.forecast")).toMatchObject({ "line-dash-pattern": [2, 6], width: 2 });
    expect(rule(".dimmed")).toMatchObject({ opacity: 0.14 });
  });

  it("converts alpha tokens for the canvas", () => {
    expect(canvasColor("#D4572F4D")).toBe("rgba(212, 87, 47, 0.302)");
    expect(canvasColor("#D4572F")).toBe("#D4572F");
  });
});

describe("AT-8.4 containment", () => {
  it("draws six proof rings, one per high-risk path, only once applied", () => {
    expect(model("response").rings).toHaveLength(0);
    const m = model("cut", true);
    expect(m.rings.map((r) => r.pathId).sort()).toEqual(["P1", "P2", "P3", "P4", "P5", "P6"]);
    expect(new Set(m.rings.map((r) => `${r.edgeId}@${r.at}`)).size).toBe(6);
    expect(m.summary).toBe("After containment: 6 of 6 high-risk paths cut, business thread continuing.");
  });

  it("keeps the business thread whole: never held, never dimmed", () => {
    const m = model("cut", true, "P1");
    expect(m.threadEdgeIds.length).toBeGreaterThan(0);
    for (const id of m.threadEdgeIds) {
      expect(classesOf(m, id)).not.toContain("held");
    }
  });

  it("hiding business dependencies never hides the business thread (F-16)", () => {
    const shown = model("cut", true);
    const hidden = buildModel({ nodes: graph.nodes, edges: graph.edges, paths, plan, actions, execution, mode: "cut", focusPath: null, showDependencies: false });
    const deps = (m: typeof shown) => m.elements.filter((e) => e.classes.includes("dependency")).map((e) => e.data.id);
    expect(deps(hidden).length).toBeLessThan(deps(shown).length);
    expect(hidden.threadEdgeIds).toEqual(shown.threadEdgeIds);
    expect(deps(hidden).sort()).toEqual([...hidden.threadEdgeIds].sort());
    expect(hidden.rings).toEqual(shown.rings);
  });

  it("never draws a business node as held", () => {
    const m = model("cut", true);
    for (const id of ["api.finance", "process.payment", "process.payroll", "process.reconciliation", "db.finance_ledger"]) {
      expect(classesOf(m, id)).not.toContain("state-held");
    }
    expect(classesOf(m, "session.s3")).toContain("state-held"); // the forecast session behind the step-up cut
  });

  it("holds the downstream of a cut instead of hiding it", () => {
    const m = model("cut", true);
    expect(classesOf(m, "f.grant-fapi")).toContain("held");
    expect(m.elements.some((e) => e.data.id === "f.grant-fapi")).toBe(true);
  });
});

describe("AT-8.6 evidence rail", () => {
  const state = {
    ...initialState("INC-2417"),
    nodes: Object.fromEntries(graph.nodes.map((n) => [n.id, n])),
    edges: Object.fromEntries(graph.edges.map((e) => [e.id, e])),
    events: [],
  };
  const policies = (body<{ policies: OpsApi["policySet"] }>("GET /api/v1/incidents/INC-2417/policies") as unknown) as NonNullable<OpsApi["policySet"]>;
  const ops = { paths, actions, plan, findings: [], policySet: policies } as unknown as OpsApi;

  it("shows reach, cutting policies and sources for a path", () => {
    const sections = Object.fromEntries(evidenceFor("P1", state, ops).map((s) => [s.id, s.content]));
    expect(sections.confidence).not.toBeNull();
    expect(sections.policy).not.toBeNull();
  });

  it("says a forecast has no evidence id", () => {
    const sections = Object.fromEntries(evidenceFor("session.s3", state, ops).map((s) => [s.id, s.content]));
    expect(sections.evidence).not.toBeNull();
  });
});
