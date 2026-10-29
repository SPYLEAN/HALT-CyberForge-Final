"use client";

import { MetricBlock, StatusChip } from "@/components/halt";
import { useOps } from "@/lib/api/ops";
import type { SimulationRun } from "@/lib/api/types";
import { count } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { grid, Panel, RunButton, Simulated, ViewHeader } from "./common";
import { GraphPanel } from "./GraphPanel";

type Future = SimulationRun["futures"][number];

const TITLES: Record<Future["label"], string> = { A: "A · Aggressive isolation", B: "B · Passive monitoring", C: "C · SafeCut plan" };

function AvailabilityStrip({ future, labels, window }: { future: Future; labels: Record<string, string>; window: number }) {
  return (
    <svg viewBox="0 0 300 112" role="img" aria-label={`Business availability, future ${future.label}`} style={{ width: "100%", height: "auto" }}>
      {future.availability.map((a, i) => {
        const y = 4 + i * 26;
        const down = a.down_from_s !== null;
        return (
          <g key={a.process_id}>
            <text x={0} y={y + 12} className="label" fill="var(--text-secondary)" style={{ fontSize: 10 }}>
              {(labels[a.process_id] ?? a.process_id).slice(0, 14)}
            </text>
            {down ? (
              <rect x={110} y={y} width={186} height={14} fill="none" stroke="var(--neutral-evidence)" strokeDasharray="3 3" />
            ) : (
              <rect x={110} y={y} width={186} height={14} fill="var(--business)" />
            )}
            {down ? (
              <text x={200} y={y + 11} textAnchor="middle" fill="var(--text)" style={{ fontSize: 9, fontFamily: "var(--font-mono)" }}>
                DOWN {window} MIN
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function EchoLabView() {
  const ops = useOps();
  const { state } = useIncident();
  const sim = ops.simulation;
  const labels = Object.fromEntries(Object.values(state.nodes).map((n) => [n.id, n.label]));
  const window = ops.incident?.params.containment_window_min ?? 0;
  const reversibleLimit = ops.policySet?.constraints.find((c) => c.id === "C-REVERSIBLE");
  const within = typeof reversibleLimit?.limit === "number" ? `${reversibleLimit.limit} ${reversibleLimit.unit?.toUpperCase() ?? ""}`.trim() : "THE LIMIT";

  return (
    <>
      <ViewHeader kicker="EchoLab" title="Three futures, run before anything is touched">
        <RunButton
          primary={!sim}
          label={sim ? "RE-RUN FUTURES" : "RUN ECHOLAB"}
          onClick={ops.simulate}
          blockedBy={ops.paths.length ? null : "Correlate the incident first: EchoLab needs the ranked paths."}
        />
      </ViewHeader>
      <GraphPanel height={300} />
      {sim ? (
        <Panel title={`Simulation ${sim.id}`} chip={<Simulated />}>
          <p className="telemetry" style={{ color: "var(--text-secondary)", marginTop: 0 }}>
            {sim.request.rollouts.toLocaleString("en-GB")} rollouts per future · seed {sim.request.seed} · horizon {sim.request.horizon_s} s · same random draws for
            every future
          </p>
          {!sim.futures.some((f) => f.label === "C") ? (
            <p className="evidence-text">Future C appears once SafeCut has an optimal plan.</p>
          ) : null}
          <div style={grid(sim.futures.length)}>
            {sim.futures.map((f) => (
              <article key={f.label} aria-label={TITLES[f.label]} style={{ border: "var(--border-hairline) solid var(--line)", borderRadius: "var(--radius-md)", padding: "var(--space-4)" }}>
                <h3 className="section-headline" style={{ marginTop: 0 }}>
                  {TITLES[f.label]}
                </h3>
                <p className="telemetry" style={{ color: "var(--text-secondary)" }}>
                  {f.action_ids.length ? f.action_ids.join(", ") : "No action"}
                </p>
                <MetricBlock label="High-risk paths blocked" value={count(f.paths_blocked)} derivation={f.paths_blocked.method} simulated />
                <MetricBlock label="Rollouts reaching the ledger" value={count(f.target_reached)} derivation={f.target_reached.method} simulated tone="threat" />
                <MetricBlock label="Users affected" value={f.users_affected.numerator ?? "—"} derivation={f.users_affected.method} />
                <AvailabilityStrip future={f} labels={labels} window={window} />
                <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
                  <StatusChip kind={f.reversible ? "success" : "caution"}>{f.reversible ? `REVERSIBLE ≤ ${within}` : `NOT REVERSIBLE IN ${within}`}</StatusChip>
                  <StatusChip kind={f.evidence_preserved ? "success" : "caution"}>{f.evidence_preserved ? "EVIDENCE PRESERVED" : "EVIDENCE AT RISK"}</StatusChip>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  );
}
