"use client";

import Link from "next/link";
import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "@/components/halt/cx";
import type { Ps2Failure } from "@/lib/ps2/api";

import s from "./ps2.module.css";

export type ChipTone = "observed" | "inferred" | "missing" | "forecast" | "selected" | "alternate" | "neutral";

const TONE: Record<ChipTone, [string, string, ReactNode]> = {
  observed: ["OBSERVED", s.chipObserved!, <rect key="g" x={2} y={2} width={8} height={8} fill="currentColor" />],
  inferred: ["INFERRED", s.chipInferred!, <path key="g" d="M0 6h12" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 3" />],
  missing: ["MISSING EVIDENCE", s.chipMissing!, <circle key="g" cx={6} cy={6} r={4} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="2 2" />],
  forecast: ["FORECAST", s.chipForecast!, <circle key="g" cx={6} cy={6} r={4} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="1 2" />],
  selected: ["SELECTED PATH", s.chipSelected!, <path key="g" d="M0 6h12" stroke="currentColor" strokeWidth={4} />],
  alternate: ["ALTERNATE", s.chipAlternate!, <path key="g" d="M0 6h12" stroke="currentColor" strokeWidth={2} strokeDasharray="6 3" />],
  neutral: ["", "", <circle key="g" cx={6} cy={6} r={3} fill="none" stroke="currentColor" strokeWidth={1.5} />],
};

/** A wide table's scroll container: a labelled, focusable region so keyboard users can scroll it too. */
export function TableScroll({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={s.tableWrap} role="region" aria-label={label} tabIndex={0} style={style}>
      {children}
    </div>
  );
}

/** Glyph + word, never colour alone. */
export function Ps2Chip({ tone, children }: { tone: ChipTone; children?: ReactNode }) {
  const [word, cls, glyph] = TONE[tone];
  return (
    <span className={cx("halt-chip", cls)}>
      <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
        {glyph}
      </svg>
      <span>{children ?? word}</span>
    </span>
  );
}

export function statusTone(status: string): ChipTone {
  if (status === "observed") return "observed";
  if (status === "inferred") return "inferred";
  if (status === "missing" || status === "missing_evidence") return "missing";
  if (status === "forecast") return "forecast";
  return "neutral";
}

/** An evidence reference: selecting it focuses that element in the graph and the inspector. */
export function Ref({ id, onSelect, label }: { id: string; onSelect: (id: string) => void; label?: string }) {
  return (
    <button type="button" className={s.ref} onClick={() => onSelect(id)} aria-label={`Inspect ${label ?? id}`}>
      {label ?? id}
    </button>
  );
}

export const pct = (v: number) => `${(v * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
export const num = (v: number, digits = 3) => v.toLocaleString("en-GB", { maximumFractionDigits: digits });

export type StageState = "pending" | "active" | "done" | "failed";
export interface PipelineStage {
  label: string;
  state: StageState;
  detail?: string;
}

const STATE_WORD: Record<StageState, string> = { pending: "Waiting", active: "In progress", done: "Done", failed: "Failed" };

/** The eight reconstruction stages. Each changes only when its own API request has answered. */
export function PipelineStages({ stages }: { stages: PipelineStage[] }) {
  const current = stages.find((x) => x.state === "active" || x.state === "failed") ?? [...stages].reverse().find((x) => x.state === "done");
  return (
    <section aria-label="Reconstruction stages">
      <ol className={s.stages}>
        {stages.map((st, i) => (
          <li key={st.label} className={s.stage} data-state={st.state} aria-current={st === current ? "step" : undefined}>
            <span className={s.word}>{`${i + 1} · ${STATE_WORD[st.state]}`}</span>
            <strong>{st.label}</strong>
            {st.detail ? <span>{st.detail}</span> : null}
          </li>
        ))}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        {current ? `${current.label}: ${STATE_WORD[current.state]}${current.detail ? `, ${current.detail}` : ""}` : ""}
      </p>
    </section>
  );
}

/** Bundled runs are regenerated identically after an API restart; uploaded runs live only in its memory. */
export function SessionNote({ bundled }: { bundled: boolean }) {
  return (
    <span className={s.session} data-testid="session-note">
      <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
        <circle cx={6} cy={6} r={4.5} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="2 2" />
      </svg>
      {bundled
        ? "Bundled synthetic demo run — regenerated identically from the bundled files after an API restart."
        : "Demo-session reconstruction — restart clears this run."}
    </span>
  );
}

/** The service could not be reached: say so, show no figures, and offer retry. */
export function ServiceUnavailable({ onRetry, detail }: { onRetry: () => void; detail?: string }) {
  return (
    <section className="v2-unavailable" aria-label="Reconstruction service unavailable" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <p className="v2-kicker" style={{ color: "var(--v2-threat-text)" }}>
          Reconstruction service unavailable
        </p>
        <h1 className="v2-title">No reconstruction data, so nothing is shown.</h1>
        <p className="v2-decision" style={{ color: "var(--v2-text-2)" }}>
          {detail ??
            "The HALT reconstruction service did not answer. Every figure on this page comes from it, so no graph, story or receipt is shown in its place, and no earlier or authored data is substituted."}
        </p>
        <div className="v2-btn-row">
          <button type="button" className="halt-btn halt-btn-primary" onClick={onRetry}>
            <span>TRY AGAIN</span>
            <span aria-hidden>↻</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export function RunExpired({ runId }: { runId: string }) {
  return (
    <section className="v2-unavailable" aria-label="Reconstruction run not found" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <p className="v2-kicker">Run {runId} is not in memory</p>
        <h1 className="v2-title">This demo-session reconstruction has expired.</h1>
        <p className="v2-decision" style={{ color: "var(--v2-text-2)" }}>
          Uploaded runs are kept only in the reconstruction service&apos;s memory: a restart, or more than 32 newer runs, clears
          them, and they are never regenerated. Nothing is shown for it. Bundled datasets are regenerated automatically, so this
          id is not one of theirs; start a new reconstruction.
        </p>
        <div className="v2-btn-row">
          <Link className="halt-btn halt-btn-primary" href="/reconstruct">
            <span>START A RECONSTRUCTION</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/** Tabs with real tab panels (ids and aria-controls), on the existing halt-tab styles. */
export function Ps2Tabs({ tabs, label, value, onChange }: { tabs: TabDef[]; label: string; value: string; onChange: (id: string) => void }) {
  const base = useId();
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = tabs[(i + step + tabs.length) % tabs.length]!;
    onChange(next.id);
    document.getElementById(`${base}-tab-${next.id}`)?.focus();
  };
  const current = tabs.find((t) => t.id === value) ?? tabs[0]!;
  return (
    <div>
      <div className="halt-tabs" role="tablist" aria-label={label} style={{ flexWrap: "wrap", rowGap: 0 }}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={`${base}-tab-${t.id}`}
            role="tab"
            type="button"
            className="halt-tab"
            aria-selected={t.id === current.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={t.id === current.id ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel-${current.id}`} aria-labelledby={`${base}-tab-${current.id}`} className={s.panelBody} tabIndex={0}>
        {current.content}
      </div>
    </div>
  );
}

export function FailureNote({ failure, onRetry }: { failure: Ps2Failure; onRetry?: () => void }) {
  return (
    <div className={`${s.notice} ${s.noticeThreat}`} role="alert">
      <strong>{failure.kind === "unavailable" ? "The reconstruction service did not answer" : `The service rejected the request${failure.status ? ` (${failure.status})` : ""}`}</strong>
      {failure.kind === "unavailable" ? "Your selection is kept in this page; nothing was uploaded twice. Try again when the service is back." : `${failure.code ? `${failure.code}: ` : ""}${failure.message}`}
      {onRetry && failure.kind === "unavailable" ? (
        <div className="v2-btn-row" style={{ marginTop: "var(--space-3)" }}>
          <button type="button" className="halt-btn" onClick={onRetry}>
            <span>TRY AGAIN</span>
            <span aria-hidden>↻</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
