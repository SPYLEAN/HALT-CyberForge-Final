import { cx } from "./cx";
import { StatusChip } from "./StatusChip";

export interface ApprovalControlProps {
  name: string;
  role: string;
  short?: string;
  policy?: string;
  authorises?: string;
  impact?: string;
  reversibility?: string;
  authorisation?: string;
  state?: "pending" | "approved" | "held";
  at?: string;
  disabled?: boolean;
  onApprove?: () => void;
  /** Records a "declined" decision; offered only while the decision is pending. */
  onDecline?: () => void;
}

export function ApprovalControl(p: ApprovalControlProps) {
  const state = p.state ?? "pending";
  const on = state === "approved";
  return (
    <div className={cx("halt-approval", on && "halt-approval-approved", state === "held" && "halt-approval-held")}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div className="who">{p.name}</div>
          <div className="role">{p.role + (p.policy ? ` · policy ${p.policy}` : "")}</div>
        </div>
        <StatusChip kind={on ? "success" : state === "held" ? "blocked" : "pending"}>
          {on ? "APPROVED" : state === "held" ? "DECLINED" : "AWAITING"}
        </StatusChip>
      </div>
      {p.authorises ? (
        <div className="role" style={{ color: "var(--text)" }}>
          Authorises {p.authorises}
        </div>
      ) : null}
      {p.impact || p.reversibility ? (
        <div className="halt-three">
          <div>
            <span>Impact</span>
            {p.impact}
          </div>
          <div>
            <span>Reversibility</span>
            {p.reversibility}
          </div>
          <div>
            <span>Authorisation</span>
            {p.authorisation ?? p.role}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className="halt-approve"
        aria-pressed={on}
        disabled={p.disabled || state === "held"}
        onClick={on ? undefined : p.onApprove}
      >
        <span>{on ? `APPROVED · ${p.at ?? ""}` : `APPROVE · ${(p.short ?? p.role).toUpperCase()}`}</span>
        <span aria-hidden>{on ? "✓" : "→"}</span>
      </button>
      {p.onDecline && state === "pending" ? (
        <button type="button" className="halt-btn halt-btn-ghost" disabled={p.disabled} onClick={p.onDecline} style={{ alignSelf: "flex-start" }}>
          <span>{`DECLINE · ${(p.short ?? p.role).toUpperCase()}`}</span>
        </button>
      ) : null}
    </div>
  );
}
