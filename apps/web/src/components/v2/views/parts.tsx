"use client";

import type { ReactNode } from "react";

import { Aperture } from "../motifs";

/** A view's head: kicker, one decisive title, one statement, and the next action. */
export function ViewHead({ kicker, title, statement, children, tone }: { kicker: string; title: string; statement?: ReactNode; children?: ReactNode; tone?: "threat" | "continuity" | "neutral" }) {
  return (
    <div className="v2-head">
      <div className="v2-head-text">
        <p className="v2-kicker" style={{ color: tone === "threat" ? "var(--v2-threat-text)" : tone === "continuity" ? "var(--v2-continuity-text)" : undefined }}>
          {kicker}
        </p>
        <h1 className="v2-title">{title}</h1>
        {statement ? <p className="v2-decision" style={{ color: "var(--v2-text-2)" }}>{statement}</p> : null}
      </div>
      {children ? <div className="v2-btn-row">{children}</div> : null}
    </div>
  );
}

/** A labelled section below the focal canvas. */
export function Section({ title, kicker, children, aside }: { title: string; kicker?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="v2-panel" aria-label={title}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        <div>
          {kicker ? <p className="v2-kicker">{kicker}</p> : null}
          <h2 className="v2-section">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A big number with its plain-language label and its derivation (the number always has a source). */
export function Figure({ label, value, unit, source, tone }: { label: string; value: ReactNode; unit?: string; source?: string; tone?: "threat" | "continuity" }) {
  return (
    <div role="group" aria-label={label} className="v2-figure">
      <div className="v2-meta" style={{ color: "var(--v2-text-2)" }}>{label}</div>
      <div className="v2-num" style={{ fontSize: 30, lineHeight: 1.1, color: tone === "threat" ? "var(--v2-threat-text)" : tone === "continuity" ? "var(--v2-continuity-text)" : "var(--v2-text)" }}>
        {value}
        {unit ? <span style={{ fontSize: 15, fontWeight: 500, marginLeft: 6, color: "var(--v2-text-2)" }}>{unit}</span> : null}
      </div>
      {source ? <div className="v2-meta">{source}</div> : null}
    </div>
  );
}

/** "Simulated", "observed", "calculated", "approved": the kind of knowledge behind a statement. */
export function Basis({ kind }: { kind: "observed" | "calculated" | "simulated" | "predicted" | "approved" }) {
  const tone = kind === "observed" ? undefined : kind === "simulated" || kind === "predicted" ? "uncertain" : kind === "approved" ? "proof" : undefined;
  return (
    <span className="v2-tag" data-tone={tone}>
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
        {kind === "observed" ? <rect x="1" y="1" width="8" height="8" fill="currentColor" /> : kind === "calculated" ? <path d="M5 1 9 9H1z" fill="none" stroke="currentColor" strokeWidth="1.6" /> : kind === "approved" ? <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" /> : <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1.5 1.5" />}
      </svg>
      {kind}
    </span>
  );
}

/** The backend could not be reached: say so plainly, show nothing invented, and offer the one useful action. */
export function Unavailable({ status, message }: { status?: number; message?: string }) {
  return (
    <section className="v2-unavailable" aria-label="HALT API unavailable">
      <Aperture state="none" size={120} label="" />
      <div>
        <p className="v2-kicker" style={{ color: "var(--v2-threat-text)" }}>
          {`Request failed${status ? ` (${status})` : ""} · HALT API unavailable`}
        </p>
        <h1 className="v2-title">No incident data, so nothing is shown.</h1>
        <p className="v2-decision" style={{ color: "var(--v2-text-2)" }}>
          {message ?? "The HALT API could not be reached. The Command Center reads every number from it, so until it answers no graph, forecast, plan or proof is shown in its place."}
        </p>
        <div className="v2-btn-row">
          <button type="button" className="halt-btn halt-btn-primary" onClick={() => window.location.reload()}>
            <span>TRY AGAIN</span>
            <span aria-hidden>↻</span>
          </button>
        </div>
      </div>
    </section>
  );
}
