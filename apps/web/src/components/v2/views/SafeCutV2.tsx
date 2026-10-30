"use client";

import { Button, StatusChip } from "@/components/halt";
import { RunButton } from "@/components/views/common";
import { PolicyComparisonPanel, PolicyControl, ResidualPanel } from "@/components/views/PolicyPanels";
import { useOps } from "@/lib/api/ops";
import type { ResponseAction } from "@/lib/api/types";
import { count } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { criticalServices, policyTitle, targetLabel } from "../derive";
import { Aperture, ContinuityPath, ProofSignal, SafeEnvelope, type ApertureState } from "../motifs";
import { Section, ViewHead } from "./parts";

/** Label of a node, or of an edge's source node: what an action acts on, in words. */
function useEntityLabel() {
  const { state } = useIncident();
  return (ref: string) => state.nodes[ref]?.label ?? (state.edges[ref] ? (state.nodes[state.edges[ref]!.source]?.label ?? ref) : ref);
}

export function Chamber({ state: aperture }: { state: ApertureState }) {
  const ops = useOps();
  const { state } = useIncident();
  const label = useEntityLabel();
  const plan = ops.plan;
  const actions = Object.fromEntries(ops.actions.map((a) => [a.id, a]));
  const rows = plan?.status === "optimal" ? plan.display_actions : [];
  const residual = plan?.status === "optimal" ? plan.residual : null;
  const services = criticalServices(state.nodes, ops);
  const target = targetLabel(state.nodes, ops.paths);
  const open = residual?.open_path_ids ?? [];
  const paths = Object.fromEntries(ops.paths.map((p) => [p.id, p]));
  const W = 1000;
  const top = 70;
  const rowH = rows.length ? Math.min(92, 300 / rows.length) : 92;
  const H = Math.max(420, top + rows.length * rowH + 80);
  const ax = 470;
  const sealed = aperture === "sealed" || aperture === "applied";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Minimum Safe Containment Envelope: ${rows.length} actions between the attacker's holdings and ${target}${open.length ? `; ${open.join(", ")} open as accepted residual risk` : ""}`} style={{ display: "block" }}>
      <text x={40} y={34} fill="var(--v2-text-2)" fontSize={12.5} letterSpacing="0.08em" fontFamily="var(--font-display)">WHAT THE ATTACKER HOLDS</text>
      <text x={ax} y={34} fill="var(--v2-text-2)" fontSize={12.5} letterSpacing="0.08em" textAnchor="middle" fontFamily="var(--font-display)">CONTAINMENT APERTURE</text>
      <text x={W - 40} y={34} fill="var(--v2-text-2)" fontSize={12.5} letterSpacing="0.08em" textAnchor="end" fontFamily="var(--font-display)">WHAT STAYS PROTECTED</text>

      {/* Protected side: the Safe Envelope around the target and the critical services. */}
      <SafeEnvelope x={700} y={top - 18} w={270} h={H - top - 20} label="Safe envelope" />
      <g>
        <circle cx={760} cy={top + 30} r={8} fill="none" stroke="var(--v2-text)" strokeWidth={2.5} />
        <text x={778} y={top + 35} fill="var(--v2-text)" fontSize={15} fontWeight={600} fontFamily="var(--font-display)">{target}</text>
        {services.map((s, i) => (
          <g key={s.id}>
            <rect x={752} y={top + 72 + i * 46} width={16} height={12} fill="none" stroke="var(--v2-text)" strokeWidth={2} />
            <rect x={752} y={top + 84 + i * 46} width={16} height={3} fill="var(--v2-continuity)" />
            <text x={778} y={top + 85 + i * 46} fill="var(--v2-text)" fontSize={14.5} fontFamily="var(--font-display)">{s.label}</text>
            <text x={778} y={top + 101 + i * 46} fill={s.down ? "var(--v2-text-2)" : "var(--v2-continuity-text)"} fontSize={12.5} fontFamily="var(--font-display)">{s.down ? "stopped by this plan" : "keeps running"}</text>
          </g>
        ))}
      </g>
      {/* The business thread runs under everything and is never broken by the plan. */}
      <ContinuityPath d={`M40 ${H - 34} H ${W - 40}`} />
      <text x={40} y={H - 48} fill="var(--v2-continuity-text)" fontSize={12.5} fontFamily="var(--font-display)">Finance operations continue</text>

      {rows.map((d, i) => {
        const y = top + 30 + i * rowH;
        const members = d.candidate_ids.map((c) => actions[c]).filter((a): a is ResponseAction => Boolean(a));
        const held = [...new Set(members.flatMap((a) => a.targets.map(label)))];
        return (
          <g key={d.id} className="v2-chamber-row" style={{ animationDelay: `${i * 120}ms` }}>
            <rect x={40} y={y - 18} width={14} height={14} fill="var(--v2-threat)" />
            <text x={64} y={y - 6} fill="var(--v2-text)" fontSize={15} fontWeight={600} fontFamily="var(--font-display)">{held.join(" · ")}</text>
            <text x={64} y={y + 12} fill="var(--v2-text-2)" fontSize={12.5} fontFamily="var(--font-mono)">{`carries ${d.blocks_path_ids.join(", ")}`}</text>
            <path d={`M64 ${y + 24} H ${ax - 60}`} stroke="var(--v2-threat)" strokeWidth={3} strokeLinecap="round" />
            {/* Past the aperture: held (Ember at 30%) once applied, dashed while only proposed. */}
            <path d={`M${ax + 60} ${y + 24} H 700`} stroke={aperture === "applied" ? "var(--threat-held)" : "var(--v2-threat)"} strokeWidth={aperture === "applied" ? 3 : 1.5} strokeDasharray={aperture === "applied" ? undefined : "2 6"} strokeLinecap="round" />
            <rect x={ax - 54} y={y + 6} width={108} height={36} rx={4} fill="var(--v2-command)" stroke="var(--v2-text)" strokeWidth={1.25} />
            <text x={ax} y={y + 29} fill="var(--v2-text)" fontSize={13} fontWeight={600} textAnchor="middle" fontFamily="var(--font-display)">{`${d.id} · ${members.length > 1 ? `${members.length} actions` : (members[0]?.type.replaceAll("_", " ") ?? "")}`.slice(0, 22)}</text>
            {sealed ? <ProofSignal cx={ax + 74} cy={y + 24} r={8} /> : null}
          </g>
        );
      })}

      {/* The aperture itself, sized to the rows it holds. */}
      <g transform={`translate(${ax - 80}, ${top + 10}) scale(1, ${Math.max(1, (rows.length * rowH + 20) / 160)})`} opacity={rows.length ? 0.35 : 1}>
        <Aperture state={aperture} size={160} label="" />
      </g>

      {/* Paths the policy leaves open bypass the aperture: shown, labelled, never hidden. */}
      {open.map((pid, i) => {
        const p = paths[pid];
        if (!p) return null;
        const y = top - 8 - i * 14;
        return (
          <g key={pid}>
            <path d={`M40 ${y + 2} C 300 ${y - 40}, 600 ${y - 40}, 752 ${top + 22}`} fill="none" stroke="var(--v2-uncertain)" strokeWidth={1.75} strokeDasharray="6 4" />
            <text x={300} y={y - 22} fill="var(--v2-text)" fontSize={13} fontFamily="var(--font-display)">
              {`${pid} open · accepted residual · ${count(p.reach)} rollouts on its own`}
            </text>
          </g>
        );
      })}
      {aperture === "none" ? (
        <text x={ax} y={top + 230} fill="var(--v2-text)" fontSize={16} textAnchor="middle" fontFamily="var(--font-display)">No combination satisfies every rule</text>
      ) : null}
    </svg>
  );
}

function ActionCards() {
  const ops = useOps();
  const { state, select } = useIncident();
  const label = useEntityLabel();
  const plan = ops.plan;
  if (plan?.status !== "optimal") return null;
  const actions = Object.fromEntries(ops.actions.map((a) => [a.id, a]));
  const paths = Object.fromEntries(ops.paths.map((p) => [p.id, p]));
  const status = ops.execution?.state === "applied" ? "Applied (simulated)" : ops.execution?.state === "rolled" ? "Rolled back" : ops.proof ? "Sealed · awaiting approval" : "Proposed";
  return (
    <Section title="The selected actions" kicker={`${plan.display_actions.length} reversible actions · ${status}`}>
      <ol aria-label="Selected actions" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-5)" }}>
        {plan.display_actions.map((d) => {
          const members = d.candidate_ids.map((c) => actions[c]).filter((a): a is ResponseAction => Boolean(a));
          const evidence = [...new Set(d.blocks_path_ids.flatMap((p) => paths[p]?.edge_ids ?? []).flatMap((e) => state.edges[e]?.evidence_ids ?? []))].sort();
          const roles = [...new Set(members.flatMap((a) => a.authorisation.required_roles))];
          return (
            <li key={d.id} aria-label={`${d.id} ${d.title}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 2fr)", gap: "var(--space-5)", padding: "var(--space-4) 0", borderTop: "var(--border-hairline) solid var(--v2-border)" }}>
              <div>
                <h3 className="v2-section" style={{ fontSize: 20 }}>{d.title}</h3>
                <p className="v2-meta" style={{ marginTop: 4 }}>
                  Selected because it hard-cuts {d.blocks_path_ids.join(", ")} <span className="v2-id">· {d.id} · {d.candidate_ids.join(" + ")}</span>
                </p>
                <div className="v2-btn-row" style={{ marginTop: "var(--space-3)" }}>
                  <StatusChip kind={ops.execution?.state === "applied" ? "success" : "pending"}>{status.toUpperCase()}</StatusChip>
                  <Button variant="ghost" onClick={() => select(d.candidate_ids[0]!)}>
                    Inspect evidence
                  </Button>
                </div>
              </div>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "140px minmax(0,1fr)", rowGap: "var(--space-2)", columnGap: "var(--space-3)", fontSize: 14.5 }}>
                <dt className="v2-meta">Acts on</dt>
                <dd style={{ margin: 0 }}>{[...new Set(members.flatMap((a) => a.targets.map(label)))].join(", ")}</dd>
                <dt className="v2-meta">Impact</dt>
                <dd style={{ margin: 0 }}>{members.map((a) => a.impact.description).join(" ")}</dd>
                <dt className="v2-meta">Reversibility</dt>
                <dd style={{ margin: 0 }}>
                  {members.map((a) => `${a.reversibility.method} (${a.reversibility.seconds ?? "—"} s)`).join("; ")}
                </dd>
                <dt className="v2-meta">Evidence</dt>
                <dd style={{ margin: 0 }} className="v2-id">{evidence.length ? evidence.join(", ") : "Forecast only: no event yet"}</dd>
                <dt className="v2-meta">Approval</dt>
                <dd style={{ margin: 0 }}>
                  {roles.join(" + ").replaceAll("_", " ")} <span className="v2-id">· {[...new Set(members.flatMap((a) => a.authorisation.policy_ids))].join(", ")}</span>
                </dd>
              </dl>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function Rejected() {
  const ops = useOps();
  const { select } = useIncident();
  const plan = ops.plan;
  if (!plan) return null;
  const actions = Object.fromEntries(ops.actions.map((a) => [a.id, a]));
  return (
    <Section title="Why HALT rejected more disruptive responses" kicker={`${plan.rejected.length} candidates not in the plan`}>
      {plan.rejected.map((r) => (
        <details key={r.candidate_id} className="v2-details">
          <summary>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{actions[r.candidate_id]?.title ?? r.candidate_id}</span>
            <span className="v2-meta" style={{ flex: 1 }}>{r.reasons[0]?.split(":")[0]}</span>
            <span className="v2-id">{r.candidate_id}</span>
          </summary>
          <div style={{ padding: "0 0 var(--space-4) 24px" }}>
            <ul className="v2-body" style={{ margin: "0 0 var(--space-3)", paddingLeft: 18 }}>
              {r.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <Button variant="ghost" onClick={() => select(r.candidate_id)} aria-label={`Inspect evidence: ${actions[r.candidate_id]?.title ?? r.candidate_id}`}>
              Inspect evidence
            </Button>
          </div>
        </details>
      ))}
    </Section>
  );
}

/** SafeCut: the Minimum Safe Containment Envelope as a containment chamber. */
export function SafeCutV2({ onOpenGate }: { onOpenGate: () => void }) {
  const ops = useOps();
  const { state } = useIncident();
  const plan = ops.plan;
  const policy = policyTitle(ops);
  const services = criticalServices(state.nodes, ops);
  const aperture: ApertureState = !plan ? "idle" : plan.status === "infeasible" ? "none" : ops.execution?.state === "applied" ? "applied" : ops.proof ? "sealed" : "proposed";
  const names = services.map((s) => s.label).join(", ");

  return (
    <>
      <ViewHead
        kicker={plan ? `SafeCut · ${policy}` : "SafeCut"}
        title={plan?.status === "optimal" ? "HALT has calculated a safer response." : plan?.status === "infeasible" ? `No response satisfies every rule of ${policy}.` : "Not the strongest response. The smallest one that works."}
        statement={
          plan?.status === "optimal"
            ? `The selected reversible actions interrupt the attack paths ${policy} finds unacceptable while preserving ${names || "critical operations"}.`
            : plan?.status === "infeasible"
              ? "HALT will not run a partial plan without an analyst decision. Compare the policies below, or review the closest options."
              : "SafeCut searches every combination of the authorised actions for the one that cuts the required paths with the least disruption."
        }
        tone={plan?.status === "infeasible" ? "threat" : plan ? "continuity" : "neutral"}
      >
        <RunButton
          primary={!plan}
          label={plan ? "RE-SOLVE" : "DERIVE ENVELOPE"}
          onClick={() => ops.createPlan(plan?.profile_id)}
          blockedBy={ops.paths.length ? null : "Correlate the incident first: SafeCut needs the enumerated paths."}
        />
        {plan?.status === "optimal" ? (
          <Button variant="primary" onClick={onOpenGate} trailing="→">
            OPEN ACTION GATE
          </Button>
        ) : null}
      </ViewHead>

      <div className="v2-stage" style={{ padding: "var(--space-4)" }}>
        <Chamber state={aperture} />
      </div>

      {plan?.status === "infeasible" && plan.infeasibility ? (
        <Section title="No feasible safe plan" kicker="Closest options (not runnable)">
          <p className="v2-decision" style={{ marginBottom: "var(--space-4)" }}>
            Relaxing <b>{plan.infeasibility.violated_constraint_ids.join(", ")}</b> would restore a plan. Each closest option breaks at least one rule:
          </p>
          <div className="v2-cols-3">
            {plan.infeasibility.closest_options.map((o) => (
              <article key={o.candidate_ids.join("+")} aria-label={`Option ${o.candidate_ids.join(" + ")}`} style={{ borderTop: "2px dashed var(--v2-border-strong)", paddingTop: "var(--space-3)" }}>
                <p className="v2-id" style={{ color: "var(--v2-text)" }}>{o.candidate_ids.join(" + ")}</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-2)" }}>
                  {o.breaks.map((b) => (
                    <li key={b.constraint_id} className="v2-body" style={{ color: "var(--v2-text)" }}>
                      <span className="v2-id">{b.constraint_id}</span> {b.value} <span className="v2-meta">(limit {b.limit})</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      <ActionCards />
      <PolicyControl />
      <ResidualPanel />
      <PolicyComparisonPanel />
      <Rejected />
    </>
  );
}
