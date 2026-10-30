// Connector Atlas camera: the canonical view is derived from scene bounds and always shows all five zones.
import { describe, expect, it } from "vitest";

import { deriveAtlas, defaultQuery } from "@/lib/ps3/atlas";
import { corners, fits, frameBox, nodesBounds, overlayPadding, project, sceneBounds, type Viewport } from "@/lib/ps3/camera";
import { loadFixtures } from "@/lib/ps3/engine";
import { toScene } from "@/lib/ps3/scene";

const fx = loadFixtures();
const q = defaultQuery(fx);
const model = toScene(deriveAtlas(fx, q), q);
// Canvas sizes measured in the audit at 1440×900, 1280×800 and 1024×768, plus a wide and a narrow extreme.
const SIZES: [number, number][] = [[760, 768], [600, 668], [444, 636], [1400, 700], [360, 640]];
const vp = (w: number, h: number): Viewport => ({ width: w, height: h, fov: 38, pad: overlayPadding(w, h, true) });

describe("canonical view", () => {
  it.each(SIZES)("frames every zone of the complete journey inside the padded %ix%i canvas", (w, h) => {
    const box = sceneBounds(model);
    const view = frameBox(box, vp(w, h));
    expect(fits(box, view, vp(w, h))).toBe(true);
    for (const z of model.zones) {
      const zb = { min: [z.x - z.width / 2, -3.7, -1.6] as [number, number, number], max: [z.x + z.width / 2, 3.7, 1.6] as [number, number, number] };
      expect(fits(zb, view, vp(w, h)), z.zone).toBe(true);
    }
  });

  it("covers source and destinations with padding (not touching the canvas edge)", () => {
    const v = vp(760, 768);
    const view = frameBox(sceneBounds(model), v);
    const xs = corners(sceneBounds(model)).map((c) => project(c, view, v).x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(v.pad.left - 0.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(v.width - v.pad.right + 0.5);
  });

  it("is deterministic: Home, Reset and the initial view are the same numbers", () => {
    const a = frameBox(sceneBounds(model), vp(600, 668));
    const b = frameBox(sceneBounds(toScene(deriveAtlas(fx, q), q)), vp(600, 668));
    expect(b).toEqual(a);
  });

  it("is not one hardcoded position: different canvases give different cameras", () => {
    expect(frameBox(sceneBounds(model), vp(760, 768)).position).not.toEqual(frameBox(sceneBounds(model), vp(444, 636)).position);
  });
});

describe("drift framing", () => {
  it("frames every affected mapping and broken destination", () => {
    const dq = { ...q, drift: "rename-detected-at" };
    const m = toScene(deriveAtlas(fx, dq), dq);
    const critical = m.nodes.filter((n) => n.status === "drift" || n.status === "failed");
    expect(critical.map((n) => n.id)).toEqual(
      expect.arrayContaining(["northwind-edr-alerts/xf.map", "dst.case-api", "dst.siem-queue", "dst.evidence-lake"]),
    );
    for (const [w, h] of SIZES) {
      const view = frameBox(nodesBounds(critical, 1.6)!, vp(w, h));
      for (const n of critical) expect(fits(nodesBounds([n], 0.4)!, view, { ...vp(w, h), pad: { top: 0, right: 0, bottom: 0, left: 0 } }), `${n.id} @${w}`).toBe(true);
    }
  });
});
