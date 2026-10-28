import type { ReactNode } from "react";

import { cx } from "./cx";

export interface ToastProps {
  kind?: "neutral" | "success" | "caution" | "threat";
  title: string;
  onDismiss?: () => void;
  children?: ReactNode;
}

function Glyph({ kind }: { kind: NonNullable<ToastProps["kind"]> }) {
  if (kind === "success") return <path d="M3 10l4 4 8-9" fill="none" stroke="var(--business-text)" strokeWidth={2} />;
  if (kind === "threat") return <rect x={4} y={4} width={10} height={10} fill="var(--threat-observed)" />;
  if (kind === "caution") return <path d="M9 2L17 16H1z" fill="none" stroke="var(--text)" strokeWidth={1.8} strokeLinejoin="round" />;
  return <circle cx={9} cy={9} r={6} fill="none" stroke="var(--text)" strokeWidth={2} />;
}

export function Toast({ kind = "neutral", title, onDismiss, children }: ToastProps) {
  return (
    <div className={cx("halt-toast", `halt-toast-${kind}`)} role={kind === "threat" ? "alert" : "status"}>
      <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden style={{ marginTop: 1 }}>
        <Glyph kind={kind} />
      </svg>
      <div>
        <div className="title">{title}</div>
        {children ? <div className="desc">{children}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="halt-x" aria-label="Dismiss" onClick={onDismiss} style={{ margin: "-10px -14px 0 0" }}>
          ×
        </button>
      ) : null}
    </div>
  );
}
