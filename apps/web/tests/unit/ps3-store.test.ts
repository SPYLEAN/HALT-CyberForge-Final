// Connector Atlas state: rapid input applies to the latest state, and selection, payload, panel and URL agree.
import { describe, expect, it } from "vitest";

import { defaultQuery, parseQuery, toSearch } from "@/lib/ps3/atlas";
import { loadFixtures } from "@/lib/ps3/engine";
import { pipelineOrder } from "@/lib/ps3/scene";
import { initialState, reduceAtlas, stepNode, type AtlasAction, type AtlasStoreState } from "@/lib/ps3/store";

const fx = loadFixtures();
const start = () => initialState(fx, defaultQuery(fx));
const run = (s: AtlasStoreState, actions: AtlasAction[]) => actions.reduce((acc, a) => reduceAtlas(fx, acc, a), s);
const next: AtlasAction = { type: "patch", patch: (q, a) => ({ node: stepNode(q, a, 1) }), focus: true };
const prev: AtlasAction = { type: "patch", patch: (q, a) => ({ node: stepNode(q, a, -1) }), focus: true };
const order = pipelineOrder(start().atlas);

describe("rapid keyboard stepping", () => {
  it("six `]` in a row reach the sixth stage; three `[` come back three", () => {
    const s6 = run(start(), [next, next, next, next, next, next]);
    expect(s6.q.node).toBe(order[5]);
    expect(s6.focus.seq).toBe(6);
    expect(run(s6, [prev, prev, prev]).q.node).toBe(order[2]);
  });

  it("stops at both ends instead of wrapping", () => {
    const end = run(start(), Array.from({ length: 40 }, () => next));
    expect(end.q.node).toBe(order[order.length - 1]);
    expect(run(end, Array.from({ length: 40 }, () => prev)).q.node).toBe(order[0]);
  });
});

describe("timeline", () => {
  const step: AtlasAction = { type: "patch", patch: (q) => ({ t: q.t + 1 }), mode: "replace" };
  it("five rapid steps land on step 5 and select the stage the payload is at", () => {
    const s = run(start(), [step, step, step, step, step]);
    expect(s.q.t).toBe(5);
    expect(s.q.node).toBe(order[5]);
    expect(s.q.panel).toBe("flight");
    expect(s.mode).toBe("replace");
  });

  it("scrubbing past the end clamps to the last reachable step", () => {
    const s = run(start(), [{ type: "patch", patch: { t: 99 } }]);
    expect(s.q.t).toBe(11);
  });
});

describe("selection synchronisation", () => {
  it.each([
    ["northwind-edr-alerts/source.fetch", "lens", 0],
    ["northwind-edr-alerts/acq.paginate", "flight", 2],
    ["northwind-edr-alerts/xf.map", "mapping", 4],
    ["northwind-edr-alerts/val.schema", "flight", 6],
    ["dst.siem-queue", "proof", 10],
  ])("selecting %s opens %s and moves the payload to step %i", (node, panel, t) => {
    const s = run(start(), [{ type: "patch", patch: { node }, focus: true }]);
    expect(s.q).toMatchObject({ node, panel, t });
    expect(s.focus).toEqual({ node, seq: 1 });
  });

  it("selecting a stage beyond where the record stopped keeps the payload where it stopped", () => {
    const s0 = run(start(), [{ type: "patch", patch: { drift: "rename-detected-at" } }]);
    const s = run(s0, [{ type: "patch", patch: { node: "dst.case-api" } }]);
    expect(s.q.node).toBe("dst.case-api");
    expect(s.q.t).toBe(4); // the mapping failed at step 4; the record never reached the Case API
  });

  it("selecting another connector's stage switches connector and resets its run", () => {
    const s0 = run(start(), [{ type: "patch", patch: { drift: "rename-detected-at", t: 3 } }]);
    const s = run(s0, [{ type: "patch", patch: { node: "lumen-idp-signins/xf.map" } }]);
    expect(s.q).toMatchObject({ connector: "lumen-idp-signins", drift: null, node: "lumen-idp-signins/xf.map", panel: "mapping", t: 4 });
  });

  it("an explicit panel choice wins over the stage's default panel", () => {
    const s = run(start(), [{ type: "patch", patch: { node: "northwind-edr-alerts/xf.map", panel: "proof" } }]);
    expect(s.q.panel).toBe("proof");
  });
});

describe("URL restoration", () => {
  it("round-trips through the URL and `load` (Back/Forward, reload)", () => {
    const s = run(start(), [{ type: "patch", patch: { node: "northwind-edr-alerts/val.policy" } }, { type: "patch", patch: { drift: "remove-host-name", panel: "drift" } }]);
    const restored = parseQuery(new URLSearchParams(toSearch(s.q, fx)), fx);
    expect(restored).toEqual(s.q);
    const loaded = reduceAtlas(fx, start(), { type: "load", q: restored });
    expect(loaded.q).toEqual(s.q);
    expect(loaded.mode).toBe("none"); // loading from history never pushes history
  });
});
