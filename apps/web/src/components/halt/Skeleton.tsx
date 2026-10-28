export interface SkeletonProps {
  variant?: "line" | "block" | "graph";
  lines?: number;
  width?: number | string;
  height?: number | string;
  label?: string;
}

const GRAPH_NODES: Array<[number, number]> = [
  [30, 80],
  [120, 80],
  [170, 36],
  [260, 36],
  [170, 124],
  [330, 124],
];
const WIDTHS = ["100%", "86%", "62%", "74%"];

/** Loading state in forecast language (dashed, no shimmer): nothing here is data yet. */
export function Skeleton({ variant = "line", lines = 3, width, height, label }: SkeletonProps) {
  if (variant === "graph") {
    return (
      <svg width={width ?? 360} height={height ?? 160} viewBox="0 0 360 160" role="img" aria-label={label ?? "Computing paths"}>
        <path className="halt-skel-graph" d="M30 80H120L170 36H260M120 80L170 124H330" />
        {GRAPH_NODES.map(([cx, cy], i) => (
          <circle key={i} className="halt-skel-graph" cx={cx} cy={cy} r={9} style={{ strokeDasharray: "3 3" }} />
        ))}
      </svg>
    );
  }
  if (variant === "block") {
    return (
      <div
        className="halt-skel halt-skel-pulse"
        style={{ width: width ?? "100%", height: height ?? 72 }}
        role="status"
        aria-label={label ?? "Loading"}
      />
    );
  }
  return (
    <div role="status" aria-label={label ?? "Loading"} style={{ display: "flex", flexDirection: "column", gap: 8, width: width ?? "100%" }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="halt-skel halt-skel-pulse" style={{ height: 12, width: WIDTHS[i % 4], animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}
