"use client";

import { GraphPanel } from "@/components/views/GraphPanel";
import { useOps } from "@/lib/api/ops";
import { useIncident } from "@/lib/state/incident-store";

import { targetLabel } from "../derive";
import { ViewHead } from "./parts";

const LEGEND: Array<{ label: string; stroke: string; width: number; dash?: string; note: string }> = [
  { label: "Observed hostile", stroke: "var(--v2-threat)", width: 3, note: "an event recorded it" },
  { label: "Predicted (forecast)", stroke: "var(--v2-threat)", width: 2, dash: "2 6", note: "simulated, no event yet" },
  { label: "Inferred", stroke: "var(--v2-uncertain)", width: 1.5, dash: "6 4", note: "HALT infers it, with stated confidence" },
  { label: "Blocked downstream", stroke: "var(--threat-held)", width: 3, note: "past a cut; kept visible" },
  { label: "Business dependency", stroke: "var(--v2-continuity)", width: 2, note: "what a process needs" },
  { label: "Preserved continuity", stroke: "var(--v2-continuity)", width: 8, note: "the business thread; never broken" },
];

/** ThreadGraph: the living lattice of the incident, with its text equivalent below. */
export function GraphV2() {
  const ops = useOps();
  const { state } = useIncident();
  const target = targetLabel(state.nodes, ops.paths);
  const high = ops.paths.filter((p) => p.high_risk).length;
  return (
    <>
      <ViewHead
        kicker="ThreadGraph"
        title={ops.paths.length ? `Who can reach ${target}, and what the business needs` : "The incident, rebuilt from its evidence"}
        statement={
          ops.paths.length
            ? `${ops.paths.length} enumerated paths reach ${target}; ${high} are high-risk. Select any entity or edge to see the events behind it.`
            : `${Object.keys(state.nodes).length} entities so far, each placed by an event. Correlate the incident to forecast the paths.`
        }
      />
      <div className="v2-stage" style={{ padding: "var(--space-3)" }}>
        <GraphPanel height={600} showModes showTable />
      </div>
      <ul aria-label="Graph legend" style={{ listStyle: "none", padding: 0, margin: "var(--space-5) 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "var(--space-3) var(--space-5)" }}>
        {LEGEND.map((l) => (
          <li key={l.label} style={{ display: "grid", gridTemplateColumns: "44px 1fr", alignItems: "center", gap: "var(--space-3)" }}>
            <svg viewBox="0 0 44 12" width="44" height="12" aria-hidden>
              <path d="M2 6h40" stroke={l.stroke} strokeWidth={l.width} strokeDasharray={l.dash} strokeLinecap="round" />
            </svg>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{l.label}</div>
              <div className="v2-meta">{l.note}</div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
