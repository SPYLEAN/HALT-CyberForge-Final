"use client";

import { RunButton } from "@/components/views/common";
import { useOps } from "@/lib/api/ops";
import type { SimulationRun } from "@/lib/api/types";
import { count } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { criticalServices, policyTitle, targetLabel } from "../derive";
import { ContinuityPath } from "../motifs";
import { Basis, ViewHead } from "./parts";

type Future = SimulationRun["futures"][number];

/** Presentation names for the three futures (labels are the contract's; A and B are the scenario's presets). */
const NAMES: Record<Future["label"], { title: string; kind: string }> = {
  B: { title: "Passive monitoring", kind: "Weak response" },
  A: { title: "Aggressive isolation", kind: "Maximum disruption" },
  C: { title: "Precision response", kind: "SafeCut plan" },
};
const ORDER: Future["label"][] = ["B", "A", "C"];

export function Horizon({ futures, target }: { futures: Future[]; target: string }) {
  const W = 1000;
  const H = 400;
  const ox = 70;
  const oy = H / 2;
  const lanes = ORDER.map((l) => futures.find((f) => f.label === l)).filter((f): f is Future => Boolean(f));
  const ys = lanes.length === 3 ? [70, 200, 330] : lanes.map((_, i) => 80 + i * 140);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Decision Horizon: ${lanes.map((f) => `${NAMES[f.label].title}, ${count(f.target_reached)} rollouts reach ${target}`).join("; ")}`} style={{ display: "block", maxHeight: 440 }}>
      <circle cx={ox} cy={oy} r={9} fill="var(--v2-text)" />
      <text x={ox} y={oy + 34} fill="var(--v2-text-2)" fontSize={13} textAnchor="middle" fontFamily="var(--font-display)">Now</text>
      {lanes.map((f, i) => {
        const y = ys[i]!;
        const n = f.target_reached.denominator ?? 1;
        const reach = (f.target_reached.numerator ?? 0) / n;
        const down = Object.values(f.downtime_min).some((m) => m > 0);
        const blocked = f.paths_blocked.numerator ?? 0;
        const total = f.paths_blocked.denominator ?? 0;
        const branch = `M${ox} ${oy} C ${ox + 140} ${oy}, ${ox + 120} ${y}, 320 ${y}`;
        const threatWidth = 1.5 + reach * 9;
        const cutX = blocked === total && total > 0 ? 560 : null;
        return (
          <g key={f.label} className="v2-lane">
            <path d={branch} fill="none" stroke="var(--v2-border-strong)" strokeWidth={1.5} />
            {/* Hostile stream: thickness = share of rollouts reaching the target; ends at a cut if every path is blocked. */}
            <path d={`M320 ${y - 10} H ${cutX ?? 860}`} fill="none" stroke="var(--v2-threat)" strokeWidth={threatWidth} strokeLinecap="round" strokeDasharray={reach > 0 ? undefined : "2 6"} opacity={reach > 0 ? 1 : 0.6} />
            {cutX ? (
              <g aria-hidden>
                <rect x={cutX + 6} y={y - 24} width={5} height={28} fill="var(--v2-text)" />
                <rect x={cutX + 18} y={y - 24} width={5} height={28} fill="var(--v2-text)" />
              </g>
            ) : (
              <circle cx={868} cy={y - 10} r={6} fill="var(--v2-threat)" />
            )}
            {/* Continuity: a live pulse when no critical process goes down; a broken line when the future stops them. */}
            {down ? (
              <path d={`M320 ${y + 14} H 470 M 560 ${y + 14} H 860`} fill="none" stroke="var(--v2-continuity)" strokeWidth={8} strokeOpacity={0.35} strokeLinecap="round" />
            ) : (
              <ContinuityPath d={`M320 ${y + 14} H 860`} />
            )}
            <text x={330} y={y - 30} fill="var(--v2-text)" fontSize={16} fontWeight={700} fontFamily="var(--font-display)">
              {NAMES[f.label].title}
            </text>
            <text x={330 + 8 * NAMES[f.label].title.length + 14} y={y - 30} fill="var(--v2-text-2)" fontSize={12.5} fontFamily="var(--font-display)">
              {NAMES[f.label].kind.toUpperCase()}
            </text>
            <text x={882} y={y - 5} fill={reach > 0 ? "var(--v2-threat-text)" : "var(--v2-text-2)"} fontSize={14} fontFamily="var(--font-mono)">
              {count(f.target_reached)}
            </text>
            <text x={882} y={y + 19} fill={down ? "var(--v2-text-2)" : "var(--v2-continuity-text)"} fontSize={12.5} fontFamily="var(--font-display)">
              {down ? "ops stopped" : "ops running"}
            </text>
          </g>
        );
      })}
      <text x={882} y={24} fill="var(--v2-text-2)" fontSize={12.5} fontFamily="var(--font-display)">
        {`→ ${target}`}
      </text>
    </svg>
  );
}

function FutureColumn({ f, allPathIds }: { f: Future; allPathIds: string[] }) {
  const ops = useOps();
  const { state } = useIncident();
  const services = criticalServices(state.nodes, ops);
  const isPlan = f.label === "C";
  const residual = isPlan && ops.plan?.status === "optimal" ? ops.plan.residual : null;
  const outcome = isPlan ? ops.comparison?.outcomes.find((o) => o.plan_id === ops.plan?.id) : undefined;
  const remaining = allPathIds.filter((p) => !f.paths_blocked.source_ids.includes(p));
  const downMin = Math.max(0, ...Object.values(f.downtime_min));
  const preserved = f.availability.filter((a) => a.down_from_s === null).map((a) => state.nodes[a.process_id]?.label ?? a.process_id);
  const rows: Array<[string, React.ReactNode]> = [
    ["Paths interrupted", `${f.paths_blocked.numerator} of ${f.paths_blocked.denominator}`],
    ["Paths remaining", remaining.length ? remaining.join(", ") : "None"],
    ["Rollouts reaching the ledger", count(f.target_reached)],
    ["Longest process downtime", downMin ? `${downMin} min` : "None"],
    ["Users affected", f.users_affected.numerator ?? "—"],
    ["Services preserved", preserved.length ? `${preserved.length} of ${f.availability.length}` : `0 of ${f.availability.length}`],
    ["Reversible within the limit", f.reversible ? "Yes" : "No"],
    [
      "Policy status",
      isPlan
        ? residual
          ? `Satisfies ${policyTitle(ops)}${residual.open_path_ids.length ? ` with ${residual.open_path_ids.join(", ")} accepted` : ""}`
          : "—"
        : "Comparison only: not a SafeCut candidate",
    ],
    ["Approvals", isPlan ? (outcome?.approval_roles.join(", ").replaceAll("_", " ") ?? "—") : "—"],
  ];
  return (
    <article aria-label={`${f.label} · ${NAMES[f.label].title}`} style={{ borderTop: `2px solid ${isPlan ? "var(--v2-text)" : "var(--v2-border)"}`, paddingTop: "var(--space-4)" }}>
      <p className="v2-kicker">{NAMES[f.label].kind}</p>
      <h3 className="v2-section" style={{ marginBottom: "var(--space-3)" }}>{NAMES[f.label].title}</h3>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", rowGap: "var(--space-2)", columnGap: "var(--space-3)" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt className="v2-meta">{k}</dt>
            <dd style={{ margin: 0, fontSize: 14.5 }}>{v}</dd>
          </div>
        ))}
      </dl>
      <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Basis kind="simulated" />
        {!f.evidence_preserved ? <span className="v2-tag">evidence at risk</span> : null}
        {services.length && f.availability.some((a) => a.down_from_s !== null) ? <span className="v2-tag">critical operations stopped</span> : null}
      </div>
      {residual ? (
        <ul className="v2-meta" style={{ paddingLeft: 18, marginTop: "var(--space-3)" }}>
          {residual.uncertainty.slice(0, 2).map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/** EchoLab: the Decision Horizon. Three futures from the same random draws, before anything is touched. */
export function EchoLabV2() {
  const ops = useOps();
  const { state } = useIncident();
  const sim = ops.simulation;
  const target = targetLabel(state.nodes, ops.paths);
  return (
    <>
      <ViewHead
        kicker="EchoLab · Decision Horizon"
        title="Three futures, run before anything is touched"
        statement={
          sim
            ? `${sim.request.rollouts.toLocaleString("en-GB")} rollouts per future, seed ${sim.request.seed}, ${sim.request.horizon_s} s horizon, the same random draws in every future. Counts, not probabilities.`
            : "EchoLab replays the incident thousands of times under each response and counts what reaches the ledger and what stops the business."
        }
      >
        <RunButton
          primary={!sim}
          label={sim ? "RE-RUN FUTURES" : "RUN ECHOLAB"}
          onClick={ops.simulate}
          blockedBy={ops.paths.length ? null : "Correlate the incident first: EchoLab needs the ranked paths."}
        />
      </ViewHead>
      {sim ? (
        <>
          <div className="v2-stage" style={{ padding: "var(--space-5) var(--space-4)" }}>
            <Horizon futures={sim.futures} target={target} />
          </div>
          {!sim.futures.some((f) => f.label === "C") ? <p className="v2-body" style={{ marginTop: "var(--space-4)" }}>The precision future appears once SafeCut has an optimal plan.</p> : null}
          <div className="v2-cols-3" style={{ marginTop: "var(--space-6)" }}>
            {ORDER.map((l) => sim.futures.find((f) => f.label === l))
              .filter((f): f is Future => Boolean(f))
              .map((f) => (
                <FutureColumn key={f.label} f={f} allPathIds={ops.paths.map((p) => p.id)} />
              ))}
          </div>
        </>
      ) : (
        <div className="v2-stage" style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center" }}>
          <p className="v2-decision">No simulation yet.</p>
          <p className="v2-body">Run EchoLab to see the three futures side by side.</p>
        </div>
      )}
    </>
  );
}
