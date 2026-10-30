"use client";

import { useOps } from "@/lib/api/ops";
import { replayTime, utcTime } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { EVENT_LABELS, stages } from "../derive";
import { useAllEvents } from "../hooks";
import { Basis, Section, ViewHead } from "./parts";

/** Timeline: the incident's ten stages, then every observed event and every audited action, in order. */
export function TimelineV2() {
  const ops = useOps();
  const { state, seek } = useIncident();
  const all = useAllEvents(state.incidentId);
  const list = stages(state, ops, all);
  const t0 = all[0] ? new Date(all[0].ts).getTime() : 0;
  const rows = [
    ...state.events.map((e) => ({ key: e.id, at: e.ts, kind: "observed" as const, title: EVENT_LABELS[e.kind] ?? e.kind, meta: `${e.id} · ${e.source.system} ${e.source.record_id}${e.attack ? ` · ${e.attack.technique_id} ${e.attack.technique_name}` : ""}` })),
    ...ops.audit
      .filter((a) => a.actor !== "system" || a.kind !== "incident_reset")
      .map((a) => ({ key: `audit-${a.seq}`, at: a.at, kind: "approved" as const, title: `${a.kind.replaceAll("_", " ")} · ${a.subject_id}`, meta: `${a.actor} · audit #${a.seq} · ${a.hash.slice(0, 12)}` })),
  ].sort((x, y) => x.at.localeCompare(y.at));

  return (
    <>
      <ViewHead kicker="Timeline" title="Every event has a source; every action has an audit entry" statement="The replay is deterministic: select a stage to move the whole incident to that moment." />
      <ol aria-label="Incident stages" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 0, borderTop: "var(--border-hairline) solid var(--v2-border)" }}>
        {list.map((s) => (
          <li key={s.n} style={{ borderBottom: "var(--border-hairline) solid var(--v2-border)", borderRight: "var(--border-hairline) solid var(--v2-border)" }}>
            <button
              type="button"
              disabled={s.t === undefined}
              onClick={() => s.t !== undefined && seek(s.t)}
              style={{ all: "unset", cursor: s.t === undefined ? "default" : "pointer", display: "block", padding: "var(--space-4)", width: "100%", boxSizing: "border-box" }}
            >
              <div className="v2-num" style={{ fontSize: 22, color: s.status === "pending" ? "var(--v2-text-2)" : "var(--v2-text)" }}>{s.n}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: s.status === "pending" ? "var(--v2-text-2)" : "var(--v2-text)" }}>{s.label}</div>
              <div className="v2-meta">{s.status === "done" ? (s.t !== undefined ? replayTime(s.t) : (s.detail ?? "done")) : s.status === "active" ? "next" : "not yet"}</div>
            </button>
          </li>
        ))}
      </ol>
      <Section title="Events and audit entries" kicker={`${rows.length} entries · T0 ${t0 ? utcTime(new Date(t0).toISOString()) : "—"}`}>
        <ol aria-label="Incident timeline" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map((r) => (
            <li key={r.key} style={{ display: "grid", gridTemplateColumns: "84px 110px 1fr", gap: "var(--space-4)", padding: "var(--space-3) 0", borderTop: "var(--border-hairline) solid var(--v2-border)", alignItems: "baseline" }}>
              <span className="v2-id" style={{ color: "var(--v2-text)" }}>{utcTime(r.at)}</span>
              <Basis kind={r.kind} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{r.title}</div>
                <div className="v2-id">{r.meta}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
