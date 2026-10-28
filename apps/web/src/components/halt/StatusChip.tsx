import type { ReactNode } from "react";

import { cx } from "./cx";

export type ChipKind =
  | "observed"
  | "forecast"
  | "blocked"
  | "preserved"
  | "verified"
  | "success"
  | "caution"
  | "pending"
  | "simulated"
  | "neutral";

// Every chip pairs a geometric glyph with a word: meaning never rests on colour alone.
export const CHIP: Record<ChipKind, [string, () => ReactNode]> = {
  observed: ["OBSERVED", () => <rect x={2} y={2} width={8} height={8} fill="currentColor" />],
  forecast: ["FORECAST", () => <circle cx={6} cy={6} r={4} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="2 2" />],
  blocked: ["BLOCKED", () => <path d="M1 6h3.5M7.5 6H11" stroke="currentColor" strokeWidth={2} />],
  preserved: ["PRESERVED", () => <path d="M0 6h12" stroke="currentColor" strokeWidth={4} />],
  verified: [
    "VERIFIED",
    () => (
      <g>
        <circle cx={6} cy={6} r={4.5} fill="none" stroke="var(--proof-ring)" strokeWidth={2} />
        <circle cx={6} cy={6} r={1.6} fill="var(--proof-core)" />
      </g>
    ),
  ],
  success: ["APPLIED", () => <path d="M1.5 6.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth={2} />],
  caution: ["CAUTION", () => <path d="M6 1.5L11 10.5H1z" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />],
  pending: ["PENDING", () => <circle cx={6} cy={6} r={4} fill="none" stroke="currentColor" strokeWidth={1.5} />],
  simulated: ["SIMULATED", () => <path d="M1 11L11 1M1 6L6 1M6 11L11 6" stroke="currentColor" strokeWidth={1.2} />],
  neutral: ["INFERRED", () => <path d="M0 6h12" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 3" />],
};

export interface StatusChipProps {
  kind?: ChipKind;
  children?: ReactNode;
  className?: string;
}

export function StatusChip({ kind = "neutral", children, className }: StatusChipProps) {
  const [word, glyph] = CHIP[kind];
  return (
    <span className={cx("halt-chip", `halt-chip-${kind}`, className)}>
      <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
        {glyph()}
      </svg>
      <span>{children ?? word}</span>
    </span>
  );
}
