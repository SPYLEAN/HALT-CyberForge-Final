"use client";

import { MetricBlock, Skeleton } from "@/components/halt";
import { useOps } from "@/lib/api/ops";
import { useIncident } from "@/lib/state/incident-store";

import { grid, Panel, ViewHeader } from "./common";
import { GraphPanel } from "./GraphPanel";
import { NextStep } from "./NextStep";

export function OverviewView({ onOpenGate }: { onOpenGate: () => void }) {
  const ops = useOps();
  const { state } = useIncident();
  const incident = ops.incident;
  const findings = ops.findings.length ? ops.findings : Object.values(state.findings);
  const high = ops.paths.filter((p) => p.high_risk);
  const users = ops.plan?.constraints.find((c) => c.constraint_id === "C-USERS");
  const coverage = ops.proof?.claims.find((c) => c.id === "CHK-01");

  return (
    <>
      <ViewHeader kicker={`Incident ${state.incidentId}`} title="Incident Overview">
        <NextStep onOpenGate={onOpenGate} />
      </ViewHeader>
      {incident ? (
        <p className="body" style={{ maxWidth: "var(--max-prose)", color: "var(--text-secondary)", marginTop: 0 }}>
          {incident.summary}
        </p>
      ) : (
        <Skeleton lines={2} label="Loading incident" />
      )}
      <GraphPanel height={320} />
      <div style={{ ...grid(4), marginTop: "var(--space-5)" }}>
        {incident?.confidence ? (
          <MetricBlock label="Incident confidence" value={`${incident.confidence.numerator} of ${incident.confidence.denominator}`} derivation={incident.confidence.method} />
        ) : (
          <MetricBlock label="Incident confidence" value="—" derivation="Not correlated yet: run HALT-R1." />
        )}
        {high.length ? (
          <MetricBlock
            label="High-risk paths"
            value={high.length}
            derivation={`Risk ≥ ${incident?.params.high_risk_threshold ?? "the incident threshold"} over ${high[0]!.reach.denominator?.toLocaleString("en-GB") ?? "—"} rollouts`}
            simulated
            tone="threat"
          />
        ) : (
          <MetricBlock label="High-risk paths" value="—" derivation="Forecast appears after correlation." />
        )}
        {users ? (
          <MetricBlock label="Users affected by the plan" value={users.value} derivation={`${users.limit} · ${users.derivation.method}`} tone="business" />
        ) : (
          <MetricBlock label="Users affected by the plan" value="—" derivation="No SafeCut plan yet." />
        )}
        {coverage ? (
          <MetricBlock label="Paths reachable after plan" value={`${coverage.result.numerator} of ${coverage.result.denominator}`} derivation={coverage.method} />
        ) : (
          <MetricBlock label="Paths reachable after plan" value="—" derivation="Not sealed by ProofSeal yet." />
        )}
      </div>
      <Panel title="HALT-R1 findings">
        {findings.length ? (
          <ol style={{ margin: 0, paddingLeft: "var(--space-5)" }} className="body">
            {findings.map((f) => (
              <li key={f.id} style={{ marginBottom: "var(--space-2)" }}>
                <b>{f.id}</b> {f.title}
                <div className="telemetry" style={{ color: "var(--text-secondary)" }}>
                  {f.evidence_ids.join(", ")} · {f.attack.map((t) => t.technique_id).join(", ")} · {f.score.derivation.numerator} of {f.score.derivation.denominator} rule
                  conditions
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="evidence-text" style={{ color: "var(--text-secondary)" }}>
            No findings yet. They arrive as the replay correlates events.
          </p>
        )}
      </Panel>
    </>
  );
}
