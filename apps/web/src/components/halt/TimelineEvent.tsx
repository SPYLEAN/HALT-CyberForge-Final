import { cx } from "./cx";

export interface TimelineEventProps {
  time: string;
  kind?: "observed" | "forecast" | "action";
  title: string;
  description?: string;
  meta?: string;
  last?: boolean;
}

const nodeStyle = { marginTop: 3, position: "relative" as const };

function Node({ kind }: { kind: NonNullable<TimelineEventProps["kind"]> }) {
  if (kind === "forecast") {
    return (
      <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden style={nodeStyle}>
        <circle cx={8} cy={8} r={6} fill="var(--bg)" stroke="var(--threat-observed)" strokeWidth={2} strokeDasharray="3 3" />
      </svg>
    );
  }
  if (kind === "action") {
    return (
      <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden style={nodeStyle}>
        <circle cx={8} cy={8} r={6.5} fill="var(--bg)" stroke="var(--proof-ring)" strokeWidth={2.4} />
        <circle cx={8} cy={8} r={2.4} fill="var(--proof-core)" />
      </svg>
    );
  }
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden style={nodeStyle}>
      <rect x={3} y={3} width={10} height={10} fill="var(--text)" />
    </svg>
  );
}

export function TimelineEvent({ time, kind = "observed", title, description, meta, last }: TimelineEventProps) {
  return (
    <div className={cx("halt-tl", `halt-tl-${kind}`, last && "halt-tl-last")}>
      <div className="time">{time}</div>
      <div className="rail">
        <Node kind={kind} />
      </div>
      <div>
        <div className="title">{title}</div>
        {description ? <div className="desc">{description}</div> : null}
        <div className="meta">{kind === "forecast" ? `FORECAST · ${meta ?? ""} · SIMULATED` : (meta ?? "")}</div>
      </div>
    </div>
  );
}
