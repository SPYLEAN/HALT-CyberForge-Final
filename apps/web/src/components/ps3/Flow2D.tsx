"use client";

import type { NodeStatus, SceneModel } from "@/lib/ps3/scene";

const STROKE: Record<NodeStatus, string> = {
  idle: "var(--ps3-line-strong)",
  passed: "var(--ps3-verified)",
  active: "var(--ps3-active)",
  failed: "var(--ps3-failure)",
  drift: "var(--ps3-drift)",
  receded: "var(--ps3-line)",
};

/**
 * The minimap over the canvas: the scene model drawn flat, clickable. Decorative for assistive technology (the
 * object list is its DOM equivalent); the readable 2D view is FlowGrid.
 */
export function Flow2D({ model, selected, onSelect }: { model: SceneModel; selected: string | null; onSelect: (id: string) => void }) {
  const sx = (x: number) => (x + 12) * 42;
  const sy = (y: number) => (4.4 - y) * 42;
  const W = 24 * 42;
  const H = 8.8 * 42;
  const pos = new Map(model.nodes.map((n) => [n.id, n.position]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ps3-flow" aria-hidden data-testid="minimap">
      {model.zones.map((z) => (
        <rect key={z.zone} x={sx(z.x - z.width / 2)} y={6} width={z.width * 42} height={H - 12} rx={6} fill="none" stroke="var(--ps3-line)" strokeDasharray="3 3" />
      ))}
      {model.edges.map((e) => {
        const a = pos.get(e.from)!;
        const b = pos.get(e.to)!;
        return (
          <line
            key={e.id}
            x1={sx(a[0])}
            y1={sy(a[1])}
            x2={sx(b[0])}
            y2={sy(b[1])}
            stroke={STROKE[e.status]}
            strokeWidth={e.status === "passed" ? 3 : 1.5}
            strokeDasharray={e.status === "failed" || e.status === "drift" ? "6 4" : e.status === "idle" || e.status === "receded" ? "2 4" : undefined}
          />
        );
      })}
      {model.nodes.map((n) => {
        const [x, y] = [sx(n.position[0]), sy(n.position[1])];
        const big = n.zone === "source" || n.zone === "destination";
        const w = big ? 34 : 24;
        const h = big ? 44 : 18;
        const isSel = n.id === selected;
        return (
          <g key={n.id} data-node={n.id} data-status={n.status} onClick={() => onSelect(n.id)} style={{ cursor: "pointer", opacity: n.status === "receded" ? 0.45 : 1 }}>
            <rect
              x={x - w / 2}
              y={y - h / 2}
              width={w}
              height={h}
              rx={3}
              fill={n.status === "passed" || n.status === "active" || n.status === "failed" ? STROKE[n.status] : "var(--ps3-surface)"}
              stroke={isSel ? "var(--ps3-structure)" : STROKE[n.status]}
              strokeWidth={isSel ? 3 : 1.5}
              strokeDasharray={n.status === "drift" ? "4 3" : undefined}
            />
            {n.proof ? <circle cx={x} cy={y - h / 2 - 9} r={5} fill="var(--ps3-verified)" stroke="var(--ps3-structure)" strokeWidth={2} /> : null}
          </g>
        );
      })}
      {model.packet
        ? (() => {
            const p = pos.get(model.packet.node);
            return p ? <rect x={sx(p[0]) - 7} y={sy(p[1]) - 30} width={14} height={14} fill={model.packet.status === "failed" ? "var(--ps3-failure)" : "var(--ps3-active)"} /> : null;
          })()
        : null}
    </svg>
  );
}
