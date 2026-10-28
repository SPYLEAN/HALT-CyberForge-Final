export type EdgeKind = "observed" | "inferred" | "forecast" | "dependency" | "blocked" | "preserved";

export const EDGE_NAMES: Record<EdgeKind, string> = {
  observed: "Observed relationship",
  inferred: "Inferred relationship",
  forecast: "Forecast path",
  dependency: "Business dependency",
  blocked: "Blocked path",
  preserved: "Preserved path",
};

export interface EdgeStrokeProps {
  kind: EdgeKind;
  width?: number;
  animate?: boolean;
}

// Six stroke treatments (3-graph.md). Hostile never thicker than 3px; business never broken.
export function EdgeStroke({ kind, width = 220, animate = true }: EdgeStrokeProps) {
  const w = width;
  const mid = w / 2;
  const y = 14;
  let body;
  if (kind === "observed") {
    body = (
      <g>
        <path d={`M6 ${y}H${w - 6}`} stroke="var(--threat-observed)" strokeWidth={3} fill="none" />
        <rect x={mid - 4} y={y - 4} width={8} height={8} fill="var(--text)" />
      </g>
    );
  } else if (kind === "inferred") {
    body = <path d={`M6 ${y}H${w - 6}`} stroke="var(--neutral-evidence)" strokeWidth={1.5} strokeDasharray="6 4" fill="none" />;
  } else if (kind === "forecast") {
    body = (
      <g>
        <path className={animate ? "halt-edge-march" : ""} d={`M6 ${y}H${w - 26}`} stroke="var(--threat-observed)" strokeWidth={2} strokeDasharray="2 6" strokeLinecap="butt" fill="none" />
        <circle cx={w - 14} cy={y} r={8} fill="var(--bg)" stroke="var(--threat-observed)" strokeWidth={2.5} strokeDasharray="3 3" />
      </g>
    );
  } else if (kind === "dependency") {
    body = (
      <g>
        <path d={`M12 ${y}H${w - 12}`} stroke="var(--business)" strokeWidth={2} fill="none" />
        <circle cx={8} cy={y} r={4} fill="var(--bg)" stroke="var(--business)" strokeWidth={2} />
        <circle cx={w - 8} cy={y} r={4} fill="var(--bg)" stroke="var(--business)" strokeWidth={2} />
      </g>
    );
  } else if (kind === "blocked") {
    body = (
      <g>
        <path d={`M6 ${y}H${mid - 22}`} stroke="var(--threat-observed)" strokeWidth={3} fill="none" />
        <path d={`M${mid + 22} ${y}H${w - 6}`} stroke="var(--threat-held)" strokeWidth={3} fill="none" />
        <circle cx={mid} cy={y} r={10} fill="var(--bg)" stroke="var(--proof-ring)" strokeWidth={3} />
        <circle cx={mid} cy={y} r={3.5} fill="var(--proof-core)" />
      </g>
    );
  } else {
    body = (
      <g>
        <path d={`M6 ${y}H${w - 6}`} stroke="var(--business)" strokeWidth={8} strokeOpacity={0.6} fill="none" />
        <path className={animate ? "halt-edge-pulse" : ""} d={`M6 ${y}H${w - 6}`} stroke="var(--business)" strokeWidth={8} strokeDasharray="24 96" fill="none" />
      </g>
    );
  }
  return (
    <svg width={w} height={28} viewBox={`0 0 ${w} 28`} role="img" aria-label={EDGE_NAMES[kind]} style={{ display: "block", maxWidth: "100%" }}>
      {body}
    </svg>
  );
}
