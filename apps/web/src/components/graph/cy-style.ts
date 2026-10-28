// Cytoscape stylesheet built from tokens (3-graph.md edge treatments). Colours are resolved literals
// from tokens.ts because the canvas cannot read CSS variables.
import type { StylesheetJson } from "cytoscape";

import { NODE, type NodeKind, type NodeState } from "@/components/halt";
import { borderWidth, color, type Theme } from "@/styles/tokens";

import { glyphUri } from "./glyphs";

const STATES: NodeState[] = ["observed", "forecast", "inferred", "held", "verified"];

/** Cytoscape accepts rgba() but not 8-digit hex, which the alpha tokens (threat-held, threat-soft) use. */
export function canvasColor(value: string): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(value);
  if (!m) return value;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${(parseInt(m[2]!, 16) / 255).toFixed(3)})`;
}

export function stylesheet(theme: Theme = "dark"): StylesheetJson {
  const c = Object.fromEntries(Object.entries(color[theme]).map(([k, v]) => [k, canvasColor(v)])) as Record<keyof (typeof color)["dark"], string>;
  const glyphs = (Object.keys(NODE) as NodeKind[]).flatMap((kind) =>
    STATES.map((state) => ({
      selector: `node.kind-${kind}.state-${state}`,
      style: { "background-image": glyphUri(kind, state, theme) },
    })),
  );
  return [
    {
      selector: "node",
      style: {
        width: 32,
        height: 32,
        shape: "rectangle",
        "background-opacity": 0,
        "border-width": 0,
        "background-fit": "contain",
        "background-clip": "none",
        label: "data(label)",
        color: c["text-secondary"],
        "font-family": "IBM Plex Mono, ui-monospace, monospace",
        "font-size": 9,
        "text-valign": "bottom",
        "text-margin-y": 4,
        "text-wrap": "wrap",
        "text-max-width": "110px",
      },
    },
    ...glyphs,
    { selector: "node.cut-proposed", style: { "underlay-color": c["proof-ring"], "underlay-opacity": 0.12, "underlay-padding": 6, "underlay-shape": "ellipse" } },
    { selector: "edge", style: { "curve-style": "bezier", "target-arrow-shape": "none", width: 1, "line-color": c["border-strong"], opacity: 1 } },
    // Observed hostile: solid Ember 3px
    { selector: "edge.hostile.observed", style: { "line-style": "solid", width: borderWidth["edge-threat-observed"], "line-color": c["threat-observed"] } },
    // Inferred: neutral dashed 6 4, 1.5px
    { selector: "edge.hostile.inferred", style: { "line-style": "dashed", "line-dash-pattern": [6, 4], width: borderWidth["edge-neutral"], "line-color": c["neutral-evidence"] } },
    // Forecast: Ember dotted 2 6, 2px, marching
    { selector: "edge.hostile.forecast", style: { "line-style": "dashed", "line-dash-pattern": [2, 6], width: borderWidth["edge-threat-forecast"], "line-color": c["threat-forecast"] } },
    // Uncertain (below-threshold, inferred-backed) paths read as inferred, never as observed threat
    { selector: "edge.uncertain", style: { "line-color": c["neutral-evidence"], "line-dash-pattern": [6, 4], "line-style": "dashed", width: borderWidth["edge-neutral"] } },
    // Business dependency: solid Verdigris 2px, hollow circle ends
    {
      selector: "edge.dependency",
      style: {
        "line-style": "solid", width: borderWidth["edge-business-dependency"], "line-color": c.business,
        "source-arrow-shape": "circle", "target-arrow-shape": "circle", "source-arrow-fill": "hollow", "target-arrow-fill": "hollow",
        "source-arrow-color": c.business, "target-arrow-color": c.business, "arrow-scale": 0.6,
      },
    },
    // The business thread is drawn continuous and pulsing by the SVG overlay, never broken by a redraw.
    { selector: "edge.thread", style: { opacity: 0 } },
    { selector: "edge.identity", style: { "line-style": "solid", width: 1, "line-color": c["border-strong"] } },
    { selector: "edge.historical", style: { opacity: 0.55 } },
    // Held: downstream of a cut, Ember at 30%; stays visible so the cut can be audited
    { selector: "edge.held", style: { "line-color": c["threat-held"], "line-style": "solid" } },
    { selector: "edge.cut-proposed", style: { "underlay-color": c["proof-ring"], "underlay-opacity": 0.15, "underlay-padding": 4 } },
    // Focus: dim everything else to 14%, never hide it
    { selector: ".dimmed", style: { opacity: 0.14 } },
  ];
}
