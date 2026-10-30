"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { Button } from "@/components/halt";
import { useOps } from "@/lib/api/ops";
import { count, utcTime } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { CLAIM_BASIS, CLAIM_ORDER, criticalServices, EVENT_LABELS, policyTitle } from "../derive";

function Part({ n, title, children, empty }: { n: number; title: string; children?: ReactNode; empty?: string | false }) {
  return (
    <section aria-label={title} style={{ breakInside: "avoid", borderTop: "var(--border-hairline) solid var(--v2-border)", padding: "var(--space-5) 0", display: "grid", gridTemplateColumns: "48px minmax(0,1fr)", gap: "var(--space-4)" }}>
      <span className="v2-num" style={{ fontSize: 20, color: "var(--v2-text-2)" }}>{String(n).padStart(2, "0")}</span>
      <div>
        <h2 className="v2-section" style={{ marginBottom: "var(--space-3)" }}>{title}</h2>
        {empty ? <p className="v2-body">{empty}</p> : children}
      </div>
    </section>
  );
}

/** Reports: the incident's evidence package, read-only, printable. Missing stages say so. */
export function ReportV2() {
  const ops = useOps();
  const { state } = useIncident();
  const incident = ops.incident;
  const plan = ops.plan;
  const residual = plan?.status === "optimal" ? plan.residual : null;
  const proof = ops.proof;
  const services = criticalServices(state.nodes, ops);
  const actions = Object.fromEntries(ops.actions.map((a) => [a.id, a]));
  const findings = ops.findings.length ? ops.findings : Object.values(state.findings);
  return (
    <article aria-label="Incident report" style={{ maxWidth: 920 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-5)", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "var(--space-5)" }}>
        <div>
          <Image src="/brand/halt-horizontal-bone.svg" alt="HALT" width={112} height={32} unoptimized />
          <p className="v2-kicker" style={{ marginTop: "var(--space-4)" }}>Incident report · simulated demonstration data</p>
          <h1 className="v2-title">{incident ? `${incident.id} · ${incident.title}` : "Loading the incident"}</h1>
          <p className="v2-decision" style={{ color: "var(--v2-text-2)", marginTop: "var(--space-2)" }}>{incident?.summary}</p>
        </div>
        <div className="v2-no-print">
          <Button variant="secondary" onClick={() => window.print()} trailing="→">
            PRINT OR SAVE AS PDF
          </Button>
        </div>
      </header>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: "var(--space-4)", margin: "0 0 var(--space-5)" }}>
        {[
          ["Severity (scenario)", incident?.severity ?? "—"],
          ["State", incident?.state.replaceAll("_", " ") ?? "—"],
          ["Policy", policyTitle(ops) ?? "No plan"],
          ["Incident start", incident ? utcTime(incident.t0) : "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="v2-meta">{k}</dt>
            <dd style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{v}</dd>
          </div>
        ))}
      </dl>

      <Part n={1} title="Timeline" empty={!state.events.length && "The replay has not delivered an event."}>
        <ol style={{ margin: 0, paddingLeft: 18 }} className="v2-body">
          {state.events.map((e) => (
            <li key={e.id} style={{ color: "var(--v2-text)" }}>
              {utcTime(e.ts)} · {EVENT_LABELS[e.kind] ?? e.kind} <span className="v2-id">{e.id} · {e.source.system} {e.source.record_id}</span>
            </li>
          ))}
        </ol>
      </Part>
      <Part n={2} title="Observations" empty={!findings.length && "Not correlated yet."}>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="v2-body">
          {findings.map((f) => (
            <li key={f.id} style={{ color: "var(--v2-text)" }}>
              {f.title} <span className="v2-id">({f.score.derivation.numerator} of {f.score.derivation.denominator} rule conditions · {f.evidence_ids.join(", ")})</span>
            </li>
          ))}
        </ul>
      </Part>
      <Part n={3} title="Calculations: paths to the protected asset" empty={!ops.paths.length && "No forecast yet."}>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="v2-body">
          {ops.paths.map((p) => (
            <li key={p.id} style={{ color: "var(--v2-text)" }}>
              {p.id}: {p.node_ids.map((n) => state.nodes[n]?.label ?? n).join(" → ")} · {count(p.reach)} rollouts · risk {p.risk.toFixed(4)}
              {p.high_risk ? " · high-risk" : " · below threshold"}
            </li>
          ))}
        </ul>
      </Part>
      <Part n={4} title="Simulations" empty={!ops.simulation && "EchoLab has not run."}>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="v2-body">
          {ops.simulation?.futures.map((f) => (
            <li key={f.label} style={{ color: "var(--v2-text)" }}>
              Future {f.label} ({f.action_ids.join(", ") || "no action"}): {count(f.paths_blocked)} paths blocked, {count(f.target_reached)} rollouts reach the ledger, {f.users_affected.numerator ?? "—"} users
            </li>
          ))}
        </ul>
      </Part>
      <Part n={5} title="Selected plan" empty={!plan && "No SafeCut plan."}>
        {plan?.status === "optimal" ? (
          <>
            <p className="v2-body" style={{ color: "var(--v2-text)" }}>
              {plan.display_actions.map((d) => d.title).join("; ")}. Solved under {policyTitle(ops)} ({plan.id}, objective {plan.objective?.value}).
            </p>
            {residual ? (
              <p className="v2-body">
                Left open: {residual.open_path_ids.join(", ") || "none"} · reach bound {count(residual.reach_bound)} (limit {residual.limit.toLocaleString("en-GB")}).
              </p>
            ) : null}
          </>
        ) : plan ? (
          <p className="v2-body">No feasible plan under {policyTitle(ops)}: relaxing {plan.infeasibility?.violated_constraint_ids.join(", ")} would restore one.</p>
        ) : null}
      </Part>
      <Part n={6} title="Rejected alternatives" empty={!plan && "No SafeCut plan."}>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="v2-body">
          {plan?.rejected.map((r) => (
            <li key={r.candidate_id} style={{ color: "var(--v2-text)" }}>
              {actions[r.candidate_id]?.title ?? r.candidate_id}: {r.reasons.join("; ")}
            </li>
          ))}
        </ul>
      </Part>
      <Part n={7} title="Proof" empty={!proof && "Not sealed."}>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="v2-body">
          {[...(proof?.claims ?? [])]
            .sort((a, b) => CLAIM_ORDER.indexOf(a.id) - CLAIM_ORDER.indexOf(b.id))
            .map((c) => (
              <li key={c.id} style={{ color: "var(--v2-text)" }}>
                {c.status === "verified" ? "Verified" : c.status.toUpperCase()} · {CLAIM_BASIS[c.id]?.label ?? c.id} ({CLAIM_BASIS[c.id]?.basis}): {c.text}
              </li>
            ))}
        </ul>
        {proof ? <p className="v2-id" style={{ wordBreak: "break-all" }}>Certificate sha256 {proof.certificate} · {proof.id} · demo key</p> : null}
      </Part>
      <Part n={8} title="Preserved services" empty={!services.length && "No critical process in the graph yet."}>
        <p className="v2-body" style={{ color: "var(--v2-text)" }}>
          {services.map((s) => `${s.label} (${s.down ? "stopped by the plan" : "keeps running"})`).join(", ")}
        </p>
      </Part>
      <Part n={9} title="Approval and rollback" empty={!ops.approvals.length && !ops.execution && "No approval recorded."}>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="v2-body">
          {ops.approvals.map((a) => (
            <li key={a.id} style={{ color: "var(--v2-text)" }}>
              {a.decision} by {a.approver_id} under {a.policy_id} at {utcTime(a.at)}
            </li>
          ))}
          {ops.execution ? (
            <li style={{ color: "var(--v2-text)" }}>
              Execution {ops.execution.id}: {ops.execution.state} (simulated environment){ops.execution.rollback_window_until ? `; rollback open until ${utcTime(ops.execution.rollback_window_until)}` : ""}
            </li>
          ) : null}
        </ul>
      </Part>
      <Part n={10} title="Limitations" empty={!proof && !residual && "Stated once the plan is sealed."}>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="v2-body">
          {[...(proof?.not_covered ?? []), ...(residual?.uncertainty ?? [])].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Part>
    </article>
  );
}
