import type { ReactNode } from "react";

import { cx } from "./cx";

export interface MetricBlockProps {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Required: no bare scores. Say how the number was produced. */
  derivation: string;
  simulated?: boolean;
  tone?: "threat" | "business";
}

export function MetricBlock({ label, value, unit, derivation, simulated, tone }: MetricBlockProps) {
  return (
    <div className={cx("halt-metric", tone && `halt-metric-${tone}`)} role="group" aria-label={label}>
      <p className="label">{label}</p>
      <p className="data-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </p>
      <p className="deriv">
        {derivation}
        {simulated ? " · SIMULATED" : ""}
      </p>
    </div>
  );
}
