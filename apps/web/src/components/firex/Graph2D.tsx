"use client";

import type { IncidentGraph } from "@/lib/firex/api";
import { edgeState, replayedNode, nodeState, pathSteps, visibleEdge, visibleNode, type Position, type Toggles, type VisualState } from "@/lib/firex/scene";

import s from "./firex.module.css";

const VAR: Record<VisualState, string> = {
  selected_path: "var(--ps2-threat)",
  observed: "var(--ps2-proof)",
  inferred: "var(--ps2-forecast)",
  reachable: "var(--ps2-continuity)",
  context: "var(--ps2-neutral)",
  missing: "var(--ps2-threat)",
};
const SCALE = { x: 26, y: 32 };

/** The same IncidentGraph and selection as the 3D view, flattened to source order against kill-chain stage. */
export function Graph2D({
  graph,
  positions,
  selected,
  onSelect,
  toggles,
  replayStep,
}: {
  graph: IncidentGraph;
  positions: Map<string, Position>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  toggles: Toggles;
  replayStep: number | null;
}) {
  const steps = pathSteps(graph);
  const all = [...positions.values()];
  const maxX = Math.max(1, ...all.map((p) => p.x + p.z * 0.4));
  const maxY = Math.max(1, ...all.map((p) => p.y));
  const width = maxX * SCALE.x + 60;
  const height = maxY * SCALE.y + 60;
  const point = (id: string) => {
    const p = positions.get(id) ?? { x: 0, y: 0, z: 0 };
    // Depth offsets a little, so layers at one stage and order stay apart.
    return { x: 30 + (p.x + p.z * 0.4) * SCALE.x, y: height - 30 - p.y * SCALE.y };
  };
  const shown = new Set(graph.nodes.filter((n) => visibleNode(n, toggles) && replayedNode(n, replayStep, steps)).map((n) => n.node_id));
  return (
    <svg className={s.graph2d} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="2D attack path" data-testid="firex-2d">
      {graph.edges
        .filter((e) => visibleEdge(e, toggles) && shown.has(e.source) && shown.has(e.target))
        .map((e) => {
          const a = point(e.source);
          const b = point(e.target);
          const state = edgeState(e);
          return (
            <line
              key={e.edge_id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={selected === `edge:${e.edge_id}` ? "var(--ps2-proof)" : VAR[state]}
              strokeWidth={e.on_selected_path ? 2.5 : 1}
              strokeOpacity={e.classification === "observed" && !e.on_selected_path ? 0.45 : 1}
              strokeDasharray={state === "inferred" || state === "reachable" ? "6 4" : state === "missing" ? "2 8" : undefined}
              onClick={() => onSelect(`edge:${e.edge_id}`)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      {graph.nodes
        .filter((n) => shown.has(n.node_id))
        .map((n) => {
          const p = point(n.node_id);
          const state = nodeState(n);
          const step = steps.indexOf(n);
          return (
            <g key={n.node_id} onClick={() => onSelect(n.node_id)} style={{ cursor: "pointer" }} data-node={n.node_id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={n.on_selected_path ? 8 : 5}
                fill={VAR[state]}
                fillOpacity={state === "reachable" || state === "context" ? 0.55 : 1}
                stroke={selected === n.node_id ? "var(--ps2-proof)" : "none"}
                strokeWidth={3}
              />
              {step >= 0 ? (
                <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize={11} fill="var(--v2-text)">
                  {step + 1}
                </text>
              ) : null}
            </g>
          );
        })}
    </svg>
  );
}
