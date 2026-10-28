"use client";

import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useEffect, useRef, useState } from "react";

import { stylesheet } from "./cy-style";
import type { GraphModel } from "./model";

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
  const [overlay, setOverlay] = useState<OverlayGeometry>(EMPTY);

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
  }, [model]);

  return (
    <div style={{ position: "relative", height, background: "var(--bg)", border: "var(--border-hairline) solid var(--line)", borderRadius: "var(--radius-md)" }}>
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
          <g key={r.id} data-proof-ring={r.id} className="proof-ring">
            <circle cx={r.at.x} cy={r.at.y} r={10} fill="var(--bg)" stroke="var(--proof-ring)" strokeWidth={3} />
            <circle cx={r.at.x} cy={r.at.y} r={3.5} fill="var(--proof-core)" />
          </g>
        ))}
      </svg>
    </div>
  );
}
