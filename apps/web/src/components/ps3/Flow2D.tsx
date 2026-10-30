"use client";

import { STATUS_TEXT, ZONE_TITLES, type NodeStatus, type SceneModel } from "@/lib/ps3/scene";

const STROKE: Record<NodeStatus, string> = {
  idle: "var(--ps3-line-strong)",
  passed: "var(--ps3-verified)",
  active: "var(--ps3-active)",
  failed: "var(--ps3-failure)",
  drift: "var(--ps3-drift)",
  receded: "var(--ps3-line)",
};

/**
 * The complete topology in 2D: the minimap over the canvas (`variant="mini"`, decorative duplicate of the object
 * list), the poster while the 3D scene loads, and the full fallback when WebGL is unavailable (`variant="full"`,
 * every node keyboard-selectable).
 */
export function Flow2D({ model, selected, onSelect, variant }: { model: SceneModel; selected: string | null; onSelect: (id: string) => void; variant: "mini" | "full" }) {
  const full = variant === "full";
  const sx = (x: number) => (x + 12) * 42;
  const sy = (y: number) => (4.4 - y) * 42;
  const W = 24 * 42;
  const H = 8.8 * 42;
  const pos = new Map(model.nodes.map((n) => [n.id, n.position]));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="ps3-flow"
      {...(full ? { role: "group", "aria-label": "Complete 2D flow" } : { "aria-hidden": true })}
      data-testid={full ? "flow-2d" : "minimap"}
    >
      {model.zones.map((z) => (
        <g key={z.zone}>
          <rect x={sx(z.x - z.width / 2)} y={6} width={z.width * 42} height={H - 12} rx={6} fill="none" stroke="var(--ps3-line)" strokeDasharray={full ? undefined : "3 3"} />
          {full ? (
            <text x={sx(z.x)} y={26} textAnchor="middle" fill="var(--ps3-text-2)" fontSize={13} letterSpacing="0.08em" fontFamily="var(--font-display)">
              {ZONE_TITLES[z.zone].toUpperCase()}
            </text>
          ) : null}
        </g>
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
        const label = `${n.label}: ${STATUS_TEXT[n.status]}`;
        return (
          <g
            key={n.id}
            data-node={n.id}
            data-status={n.status}
            onClick={() => onSelect(n.id)}
            {...(full
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": label,
                  "aria-pressed": isSel,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(n.id);
                    }
                  },
                }
              : {})}
            style={{ cursor: "pointer", opacity: n.status === "receded" ? 0.45 : 1 }}
          >
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
            {full ? (
              <text x={x} y={y + h / 2 + 16} textAnchor="middle" fill="var(--ps3-text)" fontSize={12} fontFamily="var(--font-display)">
                {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
              </text>
            ) : null}
            <title>{label}</title>
          </g>
        );
      })}
      {model.packet ? (() => {
        const p = pos.get(model.packet.node);
        if (!p) return null;
        return <rect x={sx(p[0]) - 7} y={sy(p[1]) - 30} width={14} height={14} fill={model.packet.status === "failed" ? "var(--ps3-failure)" : "var(--ps3-active)"} aria-hidden />;
      })() : null}
    </svg>
  );
}
