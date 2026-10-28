"use client";

import { EdgeStroke, type EdgeKind } from "@/components/halt";

import { ViewHeader } from "./common";
import { GraphPanel } from "./GraphPanel";

const LEGEND: EdgeKind[] = ["observed", "inferred", "forecast", "dependency", "blocked", "preserved"];

export function ThreadGraphView() {
  return (
    <>
      <ViewHeader kicker="ThreadGraph" title="Who can reach the ledger, and what the business needs" />
      <GraphPanel height={520} showModes showTable />
      <ul aria-label="Graph legend" style={{ listStyle: "none", padding: 0, display: "flex", flexWrap: "wrap", gap: "var(--space-5)", marginTop: "var(--space-5)" }}>
        {LEGEND.map((kind) => (
          <li key={kind} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <EdgeStroke kind={kind} width={72} animate={false} />
            <span className="label">{kind}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
