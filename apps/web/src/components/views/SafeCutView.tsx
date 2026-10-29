"use client";

import { Button, ConstraintIndicator, StatusChip } from "@/components/halt";
import { useOps } from "@/lib/api/ops";
import type { Plan } from "@/lib/api/types";
import { useIncident } from "@/lib/state/incident-store";

import { grid, Panel, RunButton, ViewHeader } from "./common";
import { GraphPanel } from "./GraphPanel";

/** Constraint results named by the incident's own constraint labels (GET /policies). */
function Constraints({ results }: { results: Plan["constraints"] }) {
  const labels = Object.fromEntries((useOps().policySet?.constraints ?? []).map((c) => [c.id, c.label]));
  return (
    <div role="table" aria-label="Constraints">
      {results.map((c) => (
        <ConstraintIndicator
          key={c.constraint_id}
          name={labels[c.constraint_id] ? `${c.constraint_id} · ${labels[c.constraint_id]}` : c.constraint_id}
          rule={c.limit}
          value={c.value}
          state={c.state}
        />
      ))}
    </div>
  );
}

export function SafeCutView({ onOpenGate }: { onOpenGate: () => void }) {
  const ops = useOps();
  const { select } = useIncident();
  const plan = ops.plan;
  const actionById = Object.fromEntries(ops.actions.map((a) => [a.id, a]));

  return (
    <>
      <ViewHeader kicker="SafeCut" title="Not the strongest response. The smallest one that works.">
        <RunButton
          primary={!plan}
          label={plan ? "RE-SOLVE" : "DERIVE ENVELOPE"}
          onClick={ops.createPlan}
          blockedBy={ops.paths.length ? null : "Correlate the incident first: SafeCut needs the high-risk paths."}
        />
      </ViewHeader>
      <GraphPanel height={300} />
      {plan?.status === "optimal" ? (
        <>
          <Panel title="Minimum safe containment envelope" chip={<StatusChip kind="success">OPTIMAL</StatusChip>}>
            <p className="telemetry" style={{ color: "var(--text-secondary)", marginTop: 0 }}>
              {plan.id} · OR-Tools {plan.solver.version} · {plan.solver.wall_ms} ms · objective {plan.objective?.value} ={" "}
              {Object.entries(plan.objective?.terms ?? {})
                .map(([k, v]) => `${k} ${v}`)
                .join(", ")}
            </p>
            <div style={grid(plan.display_actions.length)}>
              {plan.display_actions.map((d) => {
                const members = d.candidate_ids.map((c) => actionById[c]).filter((a) => a !== undefined);
                return (
                  <article key={d.id} aria-label={`${d.id} ${d.title}`} style={{ border: "var(--border-hairline) solid var(--line)", borderRadius: "var(--radius-md)", padding: "var(--space-4)" }}>
                    <p className="label" style={{ margin: 0 }}>
                      {d.id} · {d.candidate_ids.join(" + ")}
                    </p>
                    <h3 className="section-headline">{d.title}</h3>
                    <p className="evidence-text">Cuts {d.blocks_path_ids.join(", ")}</p>
                    <div className="halt-three">
                      <div>
                        <span>Impact</span>
                        {members.map((a) => a.impact.description).join(" ")}
                      </div>
                      <div>
                        <span>Reversibility</span>
                        {members.map((a) => `${a.reversibility.rollback_id} · ${a.reversibility.method} · ${a.reversibility.seconds} s`).join("; ")}
                      </div>
                      <div>
                        <span>Authorisation</span>
                        {[...new Set(members.flatMap((a) => a.authorisation.policy_ids))].join(", ")} ·{" "}
                        {[...new Set(members.flatMap((a) => a.authorisation.required_roles))].join(" + ")}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div style={{ marginTop: "var(--space-4)" }}>
              <Button variant="secondary" onClick={onOpenGate} trailing="→">
                OPEN ACTION GATE
              </Button>
            </div>
          </Panel>
          <Panel title="Constraints">
            <Constraints results={plan.constraints} />
          </Panel>
        </>
      ) : null}
      {plan?.status === "infeasible" && plan.infeasibility ? (
        <Panel title="No feasible safe plan" chip={<StatusChip kind="caution">INFEASIBLE</StatusChip>}>
          <p className="body">
            No combination of actions satisfies every hard constraint. Relaxing any one of{" "}
            <b>{plan.infeasibility.violated_constraint_ids.join(", ")}</b> would restore a plan. HALT will not run a partial plan without an analyst
            decision.
          </p>
          <div style={grid(Math.max(1, plan.infeasibility.closest_options.length))}>
            {plan.infeasibility.closest_options.map((o) => (
              <article key={o.candidate_ids.join("+")} aria-label={`Option ${o.candidate_ids.join(" + ")}`} style={{ border: "var(--border-hairline) dashed var(--border-strong)", borderRadius: "var(--radius-md)", padding: "var(--space-4)" }}>
                <p className="label">Closest option · {o.candidate_ids.join(" + ")}</p>
                <Constraints results={o.breaks} />
              </article>
            ))}
          </div>
        </Panel>
      ) : null}
      {plan ? (
        <Panel title="Rejected candidates">
          <table className="evidence-text" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="label">
                <th scope="col" style={{ textAlign: "left" }}>Candidate</th>
                <th scope="col" style={{ textAlign: "left" }}>Why it is not in the plan</th>
              </tr>
            </thead>
            <tbody>
              {plan.rejected.map((r) => (
                <tr key={r.candidate_id} style={{ borderTop: "var(--border-hairline) solid var(--line)" }}>
                  <th scope="row" style={{ textAlign: "left", padding: "var(--space-2) var(--space-3) var(--space-2) 0", whiteSpace: "nowrap" }}>
                    <button type="button" className="halt-btn halt-btn-ghost" onClick={() => select(r.candidate_id)}>
                      {r.candidate_id} {actionById[r.candidate_id]?.title}
                    </button>
                  </th>
                  <td>{r.reasons.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}
    </>
  );
}
