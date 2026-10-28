import type { ReactNode } from "react";

import { cx } from "./cx";

type State = "met" | "binding" | "violated";

const CON: Record<State, [string, () => ReactNode]> = {
  met: [
    "MET",
    () => (
      <g>
        <circle cx={8} cy={8} r={6.5} fill="none" stroke="var(--business)" strokeWidth={2} />
        <path d="M5 8.2l2.2 2.2L11 5.6" fill="none" stroke="var(--business-text)" strokeWidth={1.8} />
      </g>
    ),
  ],
  binding: [
    "AT LIMIT",
    () => (
      <g>
        <circle cx={8} cy={8} r={6.5} fill="none" stroke="var(--text)" strokeWidth={2} />
        <rect x={5} y={7} width={6} height={2} fill="var(--text)" />
      </g>
    ),
  ],
  violated: [
    "VIOLATED",
    () => (
      <g>
        <path d="M8 1.5L15 14H1z" fill="none" stroke="var(--threat-observed)" strokeWidth={2} strokeLinejoin="round" />
        <path d="M8 6v4M8 11.4v.8" stroke="var(--threat-text)" strokeWidth={1.8} />
      </g>
    ),
  ],
};

export interface ConstraintIndicatorProps {
  name: string;
  rule: string;
  value: string;
  state?: State;
  fill?: number;
  limit?: number;
}

export function ConstraintIndicator({ name, rule, value, state = "met", fill, limit }: ConstraintIndicatorProps) {
  const [word, glyph] = CON[state];
  return (
    <div className={cx("halt-cons", `halt-cons-${state}`)} role="row">
      <svg width={18} height={18} viewBox="0 0 16 16" aria-hidden style={{ marginTop: 1 }}>
        {glyph()}
      </svg>
      <div role="cell">
        <div className="name">{name}</div>
        <div className="rule">{rule}</div>
        {fill != null ? (
          <div className="halt-cons-bar" role="presentation">
            <i style={{ width: `${Math.min(100, fill * 100)}%` }} />
            {limit != null ? <b style={{ left: `${limit * 100}%` }} /> : null}
          </div>
        ) : null}
      </div>
      <div role="cell">
        <div className="val">{value}</div>
        <div className="state">{word}</div>
      </div>
    </div>
  );
}
