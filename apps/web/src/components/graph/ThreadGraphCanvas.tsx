"use client";

import cytoscape, { type Core, type EdgeCollection, type EdgeSingular, type ElementDefinition } from "cytoscape";
import { useEffect, useRef, useState } from "react";

import { color, duration, easing } from "@/styles/tokens";

import { canvasColor, stylesheet } from "./cy-style";
import type { GraphModel, GraphMode } from "./model";

interface Point {
  x: number;
  y: number;
}
interface OverlayGeometry {
  thread: Array<{ id: string; from: Point; to: Point }>;
  rings: Array<{ id: string; at: Point }>;
}

const EMPTY: OverlayGeometry = { thread: [], rings: [] };
const MARCH_MS = 100;

const bezier = (e: readonly number[]) => `cubic-bezier(${e.join(", ")})` as never; // Cytoscape's typings omit cubic-bezier()

/**
 * Animate from a bypass style onto the stylesheet's end state. Cytoscape steps animations on animation
 * frames, which a hidden or background tab never delivers; the timer guarantees the end state anyway, so a
 * stalled animation can never leave an edge invisible.
 */
function settleInto(cy: Core, eles: EdgeCollection, props: string, animate: (e: EdgeSingular) => void, ms: number): void {
  eles.forEach(animate);
  window.setTimeout(() => {
    if (cy.destroyed()) return;
    eles.stop(true, false); // a stalled animation must not resume later and re-apply its bypass
    eles.removeStyle(props);
  }, ms + 120);
}
const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * Cuts already shown animating in this session (edge ids and ring ids). Every view mounts its own canvas, so
 * without this a view switch would replay the cut; ids leave the set when the cut is rolled back.
 */
const animatedCuts = new Set<string>();

function geometry(cy: Core, model: GraphModel): OverlayGeometry {
  const thread = model.threadEdgeIds.flatMap((id) => {
    const e = cy.getElementById(id);
    if (e.empty()) return [];
    return [{ id, from: e.source().renderedPosition(), to: e.target().renderedPosition() }];
  });
  const rings = model.rings.flatMap((r) => {
    const e = cy.getElementById(r.edgeId);
    if (e.empty()) return [];
    const a = e.source().renderedPosition();
    const b = e.target().renderedPosition();
    return [{ id: `${r.pathId}:${r.edgeId}`, at: { x: a.x + (b.x - a.x) * r.at, y: a.y + (b.y - a.y) * r.at } }];
  });
  return { thread, rings };
}

/**
 * Cytoscape canvas with a preset layout (coordinates are scenario data) plus an SVG overlay for what the
 * canvas must not draw: the continuous 8px business thread with its pulse, and proof rings in cut gaps.
 */
export function ThreadGraphCanvas({
  model,
  height = 440,
  onSelect,
}: {
  model: GraphModel;
  height?: number;
  onSelect?: (id: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const modelRef = useRef(model);
  const modeRef = useRef<GraphMode | null>(null);
  const [overlay, setOverlay] = useState<OverlayGeometry>(EMPTY);
  const [enteringRings, setEnteringRings] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    if (!container.current) return;
    const cy = cytoscape({
      container: container.current,
      style: stylesheet("dark"),
      layout: { name: "preset" },
      userZoomingEnabled: true,
      boxSelectionEnabled: false,
      autoungrabify: true,
      minZoom: 0.4,
      maxZoom: 2.5,
    });
    cyRef.current = cy;
    const redraw = () => setOverlay(geometry(cy, modelRef.current));
    cy.on("render viewport", redraw);
    cy.on("tap", "node, edge", (e) => onSelect?.(e.target.id()));
    cy.on("tap", (e) => e.target === cy && onSelect?.(null));

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let offset = 0;
    const march = reduced
      ? undefined
      : window.setInterval(() => {
          offset = (offset - 1) % 32;
          cy.style().selector("edge.hostile.forecast").style("line-dash-offset", offset).update();
        }, MARCH_MS);
    return () => {
      if (march) window.clearInterval(march);
      cy.destroy();
      cyRef.current = null;
    };
  }, [onSelect]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const wanted = new Set(model.elements.map((e) => e.data.id));
    cy.batch(() => {
      cy.elements().forEach((el) => {
        if (!wanted.has(el.id())) el.remove();
      });
      for (const el of model.elements) {
        const existing = cy.getElementById(el.data.id);
        if (existing.nonempty()) {
          existing.data(el.data);
          existing.classes(el.classes);
        } else {
          cy.add({ group: el.group, data: el.data, position: el.position, classes: el.classes } as ElementDefinition);
        }
      }
    });
    cy.fit(undefined, 36);
    setOverlay(geometry(cy, model));

    // Motion (4-motion.md). Each animation runs from a bypass style onto the stylesheet's end state, then
    // removes the bypass, so reduced motion (no animation) shows exactly the same final graph.
    const reduced = reducedMotion();
    const held = cy.edges(".held");
    const ringIds = model.rings.map((r) => `${r.pathId}:${r.edgeId}`);
    const current = new Set([...held.map((e) => e.id()), ...ringIds]);
    for (const id of [...animatedCuts]) if (!current.has(id)) animatedCuts.delete(id); // rolled back
    const fresh = new Set(ringIds.filter((id) => !animatedCuts.has(id)));
    if (!reduced) {
      // Path interruption: the downstream of each new cut drops from full Ember to its held 30 %.
      // threat-held is Ember at 30 % alpha: start from opaque Ember and fade the line to the same 30 %.
      settleInto(
        cy,
        held.filter((e) => !animatedCuts.has(e.id())),
        "line-color line-opacity",
        (e) => {
          e.style({ "line-color": canvasColor(color.dark["threat-observed"]), "line-opacity": 1 });
          e.animate({ style: { "line-opacity": 0.3 } }, { duration: duration.cut, easing: bezier(easing.cut) });
        },
        duration.cut,
      );
      // Simulation switching: the hostile layer cross-fades; the business thread (SVG overlay) never restarts.
      if (modeRef.current && modeRef.current !== model.mode) {
        settleInto(
          cy,
          cy.edges(".hostile"),
          "opacity",
          (e) => {
            const end = e.numericStyle("opacity");
            e.style("opacity", 0);
            e.animate({ style: { opacity: end } }, { duration: duration.switch, easing: bezier(easing.standard) });
          },
          duration.switch,
        );
      }
    }
    for (const id of current) animatedCuts.add(id);
    modeRef.current = model.mode;
    setEnteringRings(reduced ? new Set() : fresh);
  }, [model]);

  return (
    <div className="halt-graph-frame" style={{ position: "relative", height }}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} role="img" aria-label={model.summary} data-testid="threadgraph"
        data-node-ids={model.elements.filter((e) => e.group === "nodes").map((e) => e.data.id).sort().join(" ")}
      />
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden data-testid="graph-overlay">
        {overlay.thread.map((t) => (
          <g key={t.id} data-thread-edge={t.id}>
            <line x1={t.from.x} y1={t.from.y} x2={t.to.x} y2={t.to.y} stroke="var(--business)" strokeWidth={8} strokeOpacity={0.6} strokeLinecap="round" />
            <line className="halt-edge-pulse" x1={t.from.x} y1={t.from.y} x2={t.to.x} y2={t.to.y} stroke="var(--business)" strokeWidth={8} strokeDasharray="24 96" />
          </g>
        ))}
        {overlay.rings.map((r) => (
          <g key={r.id} data-proof-ring={r.id} className={enteringRings.has(r.id) ? "proof-ring proof-ring-enter" : "proof-ring"}>
            {/* The gap opens, the Bone ring draws clockwise from 12 o'clock, the Verdigris core lands last. */}
            <circle className="ring-gap" cx={r.at.x} cy={r.at.y} r={11.5} fill="var(--bg)" />
            <circle className="ring-stroke" cx={r.at.x} cy={r.at.y} r={10} fill="none" stroke="var(--proof-ring)" strokeWidth={3} pathLength={1} />
            <circle className="ring-core" cx={r.at.x} cy={r.at.y} r={3.5} fill="var(--proof-core)" />
          </g>
        ))}
      </svg>
    </div>
  );
}
