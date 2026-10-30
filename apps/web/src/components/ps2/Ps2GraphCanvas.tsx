"use client";

import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from "cytoscape";
import { useEffect, useRef, useState } from "react";

import { glyphUri } from "@/components/graph/glyphs";
import type { NodeKind } from "@/components/halt";
import type { Ps2GraphModel } from "@/lib/ps2/graph";
import { ps2Palette as P } from "@/styles/ps2-palette";

const GLYPHS: NodeKind[] = ["user", "device", "session", "token", "application", "api", "database", "service", "process"];

function stylesheet(): StylesheetJson {
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        color: P.text2,
        "font-family": "IBM Plex Mono, ui-monospace, monospace",
        "font-size": 12.5,
        "text-wrap": "wrap",
        "text-max-width": "120px",
        "min-zoomed-font-size": 6,
        "text-valign": "bottom",
        "text-margin-y": 6,
        "text-background-color": P.bg,
        "text-background-opacity": 0.9,
        "text-background-padding": "2px",
      },
    },
    { selector: "node.event", style: { shape: "round-rectangle", width: 30, height: 20, "background-color": P.bg, "border-width": 1.5, "border-color": P.neutral } },
    { selector: "node.event.seed", style: { "border-color": P.bone, "border-width": 2 } },
    { selector: "node.event.path", style: { "border-color": P.threat, "border-width": 3, color: P.bone } },
    { selector: "node.event.alt", style: { "border-color": P.forecast, "border-style": "dashed", "border-width": 2 } },
    { selector: "node.ghost", style: { "border-style": "dotted", "border-color": P.neutral, opacity: 0.7 } },
    { selector: "node.entity", style: { shape: "ellipse", width: 26, height: 26, "background-opacity": 0, "border-width": 1.5, "border-color": P.neutral, "background-fit": "contain", "background-clip": "none" } },
    ...GLYPHS.map((g) => ({ selector: `node.glyph-${g}`, style: { "border-width": 0, shape: "rectangle" as const, "background-image": glyphUri(g, "observed", "dark") } })),
    { selector: "node.type-process", style: { shape: "round-octagon" } },
    { selector: "node.service", style: { shape: "rectangle", width: 34, height: 34, "background-opacity": 0, "background-fit": "contain", "background-image": glyphUri("process", "observed", "dark"), color: P.bone } },
    { selector: "node.service.critical", style: { "underlay-color": P.continuity, "underlay-opacity": 0.35, "underlay-padding": 7, "underlay-shape": "ellipse", color: P.continuity } },
    { selector: "node.gap", style: { shape: "ellipse", width: 22, height: 22, "background-opacity": 0, "border-width": 2, "border-style": "dashed", "border-color": P.bone, "font-size": 10 } },
    { selector: "edge", style: { "curve-style": "bezier", width: 1, "line-color": P.faint, "target-arrow-shape": "none" } },
    { selector: "edge.involves", style: { width: 1, "line-color": P.faint, opacity: 0.8 } },
    { selector: "edge.involves.service", style: { "line-color": P.continuity, opacity: 0.6 } },
    { selector: "edge.causal", style: { "target-arrow-shape": "triangle", "arrow-scale": 0.8 } },
    { selector: "edge.causal.observed", style: { "line-style": "solid", width: 2, "line-color": P.proof, "target-arrow-color": P.proof } },
    { selector: "edge.causal.inferred", style: { "line-style": "dashed", "line-dash-pattern": [6, 4], width: 2, "line-color": P.inferred, "target-arrow-color": P.inferred } },
    { selector: "edge.causal.path", style: { width: 4, "line-color": P.threat, "target-arrow-color": P.threat } },
    { selector: "edge.causal.alt", style: { "line-style": "dashed", "line-dash-pattern": [10, 5], width: 2, "line-color": P.forecast, "target-arrow-color": P.forecast } },
    { selector: "edge.forecast", style: { "line-style": "dotted", width: 2, "line-color": P.forecast, "target-arrow-shape": "triangle", "target-arrow-color": P.forecast } },
    { selector: "edge.rejected", style: { "line-style": "dotted", width: 1.5, "line-color": P.neutral } },
    { selector: "edge.gap-edge", style: { "line-style": "dashed", "line-dash-pattern": [3, 3], width: 1, "line-color": P.bone } },
    { selector: ".selected-el", style: { "overlay-color": P.bone, "overlay-opacity": 0.16, "overlay-padding": 8 } },
    { selector: ".dimmed", style: { opacity: 0.14 } },
  ];
}

const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export interface CanvasControls {
  fit: () => void;
}

/**
 * Cytoscape canvas over the PS2 graph model. Positions are computed from the data (lib/ps2/graph.ts). The only
 * motion is the selected path revealing once, when the graph first arrives; reduced motion shows the end state.
 */
export function Ps2GraphCanvas({
  model,
  selectedId,
  focusPath,
  onSelect,
  controls,
  height = 520,
}: {
  model: Ps2GraphModel;
  selectedId: string | null;
  focusPath: boolean;
  onSelect: (id: string | null) => void;
  controls?: (c: CanvasControls) => void;
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const revealed = useRef(false);
  const [motion, setMotion] = useState<"pending" | "animated" | "instant">("pending");
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!container.current) return;
    const cy = cytoscape({
      container: container.current,
      style: stylesheet(),
      layout: { name: "preset" },
      boxSelectionEnabled: false,
      autoungrabify: true,
      minZoom: 0.25,
      maxZoom: 2.5,
    });
    cyRef.current = cy;
    cy.on("tap", "node, edge", (e) => select.current(e.target.id()));
    cy.on("tap", (e) => e.target === cy && select.current(null));
    controls?.({ fit: () => cy.fit(undefined, 32) });
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [controls]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(model.elements.map((el) => ({ group: el.group, data: el.data, position: el.position, classes: el.classes }) as ElementDefinition));
    });
    cy.fit(undefined, 32);
    if (!revealed.current && model.pathEdgeIds.size) {
      revealed.current = true;
      const animate = !reducedMotion();
      setMotion(animate ? "animated" : "instant");
      if (animate) {
        // Selected-path reveal, hop by hop in path order: runs once, when the graph is first ready.
        const hops = cy.edges(".path");
        hops.style("opacity", 0);
        model.pathEventIds.forEach((id, i) => {
          const hop = hops.filter((e) => e.target().id() === id);
          hop.delay(120 * i).animate({ style: { opacity: 1 } }, { duration: 240 });
        });
        window.setTimeout(() => !cy.destroyed() && hops.stop(true, false).removeStyle("opacity"), 120 * model.pathEventIds.length + 400);
      }
    }
  }, [model]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("selected-el dimmed");
    if (focusPath && model.pathEventIds.length) {
      const keep = new Set([...model.pathEventIds, ...model.pathEdgeIds]);
      cy.elements().forEach((el) => {
        if (!keep.has(el.id())) el.addClass("dimmed");
      });
      cy.fit(cy.elements().filter((el) => keep.has(el.id())), 48);
    }
    if (selectedId) {
      const el = cy.getElementById(selectedId);
      if (el.nonempty()) {
        el.addClass("selected-el").removeClass("dimmed");
        if (el.isNode() && !focusPath) cy.animate({ center: { eles: el } }, { duration: reducedMotion() ? 0 : 240 });
      }
    }
  }, [selectedId, focusPath, model]);

  return (
    <div style={{ position: "relative", height }}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} role="img" aria-label={model.summary} data-testid="ps2-graph" data-path={model.pathEventIds.join(" ")} data-path-reveal={motion} />
    </div>
  );
}
