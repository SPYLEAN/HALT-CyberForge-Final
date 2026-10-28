"use client";

import type { ReactNode } from "react";

import { Button, StatusChip } from "@/components/halt";
import { useOps } from "@/lib/api/ops";

export function ViewHeader({ title, kicker, children }: { title: string; kicker: string; children?: ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-4)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="label" style={{ margin: 0 }}>
          {kicker}
        </p>
        <h1 className="product-title" style={{ margin: "var(--space-1) 0 0" }}>
          {title}
        </h1>
      </div>
      {children}
    </header>
  );
}

export function Panel({ title, children, chip }: { title: string; children: ReactNode; chip?: ReactNode }) {
  return (
    <section style={{ marginTop: "var(--space-6)" }} aria-label={title}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <h2 className="section-headline" style={{ margin: 0 }}>
          {title}
        </h2>
        {chip}
      </div>
      {children}
    </section>
  );
}

export const Simulated = () => <StatusChip kind="simulated">SIMULATED</StatusChip>;

/** A run button that is honest about why it cannot run yet. */
export function RunButton({
  label,
  onClick,
  blockedBy,
  primary,
}: {
  label: string;
  onClick: () => void;
  blockedBy?: string | null;
  primary?: boolean;
}) {
  const { busy } = useOps();
  const reason = blockedBy ?? (busy ? `Waiting for ${busy} to finish.` : null);
  return reason ? (
    <Button variant={primary ? "primary" : "secondary"} disabled reason={reason} trailing="→">
      {label}
    </Button>
  ) : (
    <Button variant={primary ? "primary" : "secondary"} onClick={onClick} trailing="→">
      {label}
    </Button>
  );
}

export function grid(columns: number): React.CSSProperties {
  return { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: "var(--space-5)" };
}
