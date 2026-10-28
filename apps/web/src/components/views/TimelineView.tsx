"use client";

import { TimelineEvent, type TimelineEventProps } from "@/components/halt";
import { useOps } from "@/lib/api/ops";
import { utcTime } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { ViewHeader } from "./common";
import { GraphPanel } from "./GraphPanel";

interface Row extends TimelineEventProps {
  at: string;
  key: string;
}

export function TimelineView() {
  const { state } = useIncident();
  const ops = useOps();
  const rows: Row[] = [
    ...state.events.map((e) => ({
      key: e.id,
      at: e.ts,
      time: utcTime(e.ts),
      kind: "observed" as const,
      title: `${e.id} · ${e.kind.replaceAll("_", " ")}`,
      description: `${e.source.system} ${e.source.record_id}`,
      meta: e.attack ? `${e.attack.technique_id} · ${e.attack.technique_name}` : "Not yet linked by HALT-R1",
    })),
    ...ops.audit
      .filter((a) => a.actor !== "system" || a.kind !== "incident_reset")
      .map((a) => ({
        key: `audit-${a.seq}`,
        at: a.at,
        time: utcTime(a.at),
        kind: "action" as const,
        title: `${a.kind.replaceAll("_", " ")} · ${a.subject_id}`,
        meta: `${a.actor} · audit #${a.seq} · ${a.hash.slice(0, 12)}`,
      })),
  ].sort((x, y) => x.at.localeCompare(y.at));

  return (
    <>
      <ViewHeader kicker="Timeline" title="Every event has a source; every action has an audit entry" />
      <GraphPanel height={260} />
      <div style={{ marginTop: "var(--space-5)" }} aria-label="Incident timeline">
        {rows.map((row, i) => (
          <TimelineEvent key={row.key} time={row.time} kind={row.kind} title={row.title} description={row.description} meta={row.meta} last={i === rows.length - 1} />
        ))}
      </div>
    </>
  );
}
