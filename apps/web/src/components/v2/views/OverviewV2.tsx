"use client";

import { MetricBlock } from "@/components/halt";
import { NextStep } from "@/components/views/NextStep";
import { GraphPanel } from "@/components/views/GraphPanel";
import { useOps } from "@/lib/api/ops";
import { count } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { criticalServices, decision, policyTitle } from "../derive";
import { ContinuityPath } from "../motifs";
import { Section, ViewHead } from "./parts";

/** Overview: the incident landscape and the one decision it asks for. */
export function OverviewV2({ onOpenGate }: { onOpenGate: () => void }) {
  const ops = useOps();
  const { state } = useIncident();
  const d = decision(state, ops);
  const incident = ops.incident;
  const high = ops.paths.filter((p) => p.high_risk);
  const users = ops.plan?.constraints.find((c) => c.constraint_id === "C-USERS");
  const coverage = ops.proof?.claims.find((c) => c.id === "CHK-01");
  const residual = ops.plan?.status === "optimal" ? ops.plan.residual : null;
  const planned = ops.simulation?.futures.find((f) => f.label === "C");
  const policy = policyTitle(ops);
  const services = criticalServices(state.nodes, ops);
  const findings = ops.findings.length ? ops.findings : Object.values(state.findings);

  return (
    <>
      <ViewHead kicker={d.kicker} title={d.headline} statement={d.statement} tone={d.tone}>
        <NextStep onOpenGate={onOpenGate} />
      </ViewHead>
      <div className="v2-split">
        <div className="v2-stage" style={{ padding: "var(--space-2)" }}>
          <GraphPanel height={520} />
        </div>
        <aside aria-label="Incident signals" className="v2-signal-list">
          {incident?.confidence ? (
            <MetricBlock label="Incident confidence" value={`${incident.confidence.numerator} of ${incident.confidence.denominator}`} derivation={incident.confidence.method} />
          ) : (
            <MetricBlock label="Incident confidence" value="—" derivation="Not correlated yet: run HALT-R1." />
          )}
          {high.length ? (
            <MetricBlock
              label="High-risk paths"
              value={high.length}
              unit={`of ${ops.paths.length}`}
              derivation={`Risk ≥ ${incident?.params.high_risk_threshold ?? "threshold"} over ${high[0]!.reach.denominator?.toLocaleString("en-GB") ?? "—"} rollouts`}
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
            <MetricBlock label="Required paths reachable after plan" value={`${coverage.result.numerator} of ${coverage.result.denominator}`} derivation={`Paths ${policy ?? "the policy"} requires cut · ${coverage.method}`} />
          ) : (
            <MetricBlock label="Required paths reachable after plan" value="—" derivation="Not sealed by ProofSeal yet." />
          )}
          {planned ? (
            <MetricBlock
              label="Residual reach under the plan"
              value={count(planned.target_reached)}
              derivation={
                residual && residual.open_path_ids.length
                  ? `Via ${residual.open_path_ids.join(", ")}: accepted under ${policy}, which allows ${residual.limit.toLocaleString("en-GB")}. Not zero risk.`
                  : planned.target_reached.method
              }
              simulated
              tone="threat"
            />
          ) : (
            <MetricBlock label="Residual reach under the plan" value="—" derivation="Run EchoLab once SafeCut has a plan." />
          )}
        </aside>
      </div>

      {services.length ? (
        <Section title="Critical operations" kicker="Continuity">
          <ul aria-label="Critical operations" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`, gap: "var(--space-4)" }}>
            {services.map((s) => (
              <li key={s.id} style={{ display: "grid", gridTemplateColumns: "64px 1fr", alignItems: "center", gap: "var(--space-3)" }}>
                <svg viewBox="0 0 64 16" width="64" height="16" aria-hidden>
                  {s.down ? <path d="M2 8h22M40 8h22" stroke="var(--v2-continuity)" strokeWidth="6" strokeLinecap="round" opacity="0.5" /> : <ContinuityPath d="M4 8H60" />}
                </svg>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{s.label}</div>
                  <div className="v2-meta">{ops.plan ? (s.down ? "Stopped by this plan" : "Keeps running under the plan") : "Running · no plan yet"}</div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="What HALT-R1 found" kicker="Incident intelligence">
        {findings.length ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-4)" }}>
            {findings.map((f, i) => (
              <li key={f.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: "var(--space-3)" }}>
                <span className="v2-num" style={{ fontSize: 18, color: "var(--v2-text-2)" }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{f.title}</div>
                  <div className="v2-meta">
                    {f.score.derivation.numerator} of {f.score.derivation.denominator} rule conditions · {f.attack.map((t) => t.technique_name ?? t.technique_id).join(", ")} <span className="v2-id">· {f.evidence_ids.join(", ")} · {f.id}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="v2-body">No findings yet. They arrive as the replay correlates events.</p>
        )}
      </Section>
    </>
  );
}
