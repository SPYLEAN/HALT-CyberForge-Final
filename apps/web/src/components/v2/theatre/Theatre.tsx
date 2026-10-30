"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ActionGateDrawer } from "@/components/gate/ActionGateDrawer";
import { GraphPanel } from "@/components/views/GraphPanel";
import { useOps } from "@/lib/api/ops";
import { count, replayTime, utcTime } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { CLAIM_BASIS, CLAIM_ORDER, criticalServices, EVENT_LABELS, policyTitle, targetLabel } from "../derive";
import { ContinuityPath, ProofGlyph } from "../motifs";
import { Chamber } from "../views/SafeCutV2";
import { Horizon } from "../views/EchoLabV2";

interface Step {
  title: string;
  /** The real state this step needs, and the read-only call that produces it if absent. */
  ensure?: (ops: ReturnType<typeof useOps>) => Promise<void> | void;
}

const STEPS: Step[] = [
  { title: "Incident begins" },
  { title: "Attack reconstructed" },
  { title: "Business exposure revealed", ensure: (ops) => (ops.paths.length ? undefined : ops.correlate()) },
  { title: "Futures simulated", ensure: async (ops) => (ops.simulation ? undefined : ops.simulate()) },
  { title: "SafeCut calculates", ensure: (ops) => (ops.plan ? undefined : ops.createPlan()) },
  { title: "Hostile paths break" },
  { title: "Business continues" },
  { title: "ProofSeal verifies", ensure: (ops) => (ops.proof || ops.plan?.status !== "optimal" ? undefined : ops.seal()) },
  { title: "Action Gate approves" },
];

/** Theatre: the incident as a nine-step presentation. Real data; the presenter drives; nothing is approved for them. */
export function Theatre() {
  const ops = useOps();
  const { state, seek } = useIncident();
  const [step, setStep] = useState(0);
  const [gate, setGate] = useState(false);
  const router = useRouter();
  const ensured = useRef(new Set<number>());
  const end = ops.incident?.replay_end_s ?? 0;
  const first = state.events[0];
  const target = targetLabel(state.nodes, ops.paths);
  const services = criticalServices(state.nodes, ops);

  // Step entry: move the replay, and run the read-only analysis the step needs (once).
  useEffect(() => {
    if (!ops.incident) return;
    if (step === 0) seek(0);
    if (step === 1 && state.cursor < end) seek(end);
    const s = STEPS[step];
    if (s?.ensure && !ensured.current.has(step) && !ops.busy) {
      ensured.current.add(step);
      void s.ensure(ops);
    }
  }, [step, ops, seek, end, state.cursor]);

  const go = useCallback((d: number) => setStep((s) => Math.min(STEPS.length - 1, Math.max(0, s + d))), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gate) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      else if (e.key === "Escape") router.push(`/incidents/${state.incidentId}?view=overview`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, gate, state.incidentId, router]);

  const residual = ops.plan?.status === "optimal" ? ops.plan.residual : null;
  const high = ops.paths.filter((p) => p.high_risk);
  const proof = ops.proof;
  const verified = proof?.claims.filter((c) => c.status === "verified").length ?? 0;
  const roles = ops.comparison?.outcomes.find((o) => o.plan_id === ops.plan?.id)?.approval_roles ?? [];

  const copy: Array<{ kicker: string; line: string; sub: string }> = [
    {
      kicker: first ? `${state.incidentId} · ${utcTime(first.ts)}` : state.incidentId,
      line: first ? `${EVENT_LABELS[first.kind] ?? first.kind.replaceAll("_", " ")}.` : "Waiting for telemetry.",
      sub: first ? `${first.id} · ${first.source.system} ${first.source.record_id}` : "The replay delivers each event as it happened.",
    },
    { kicker: `T+${replayTime(state.cursor).replace("T+", "")}`, line: `${state.events.length} events. One attacker.`, sub: "Every entity on the graph was placed by an event with a source record." },
    { kicker: "Business exposure", line: high.length ? `${high.length} high-risk paths reach ${target}.` : "Correlating with HALT-R1…", sub: services.length ? `${services.map((s) => s.label).join(", ")} depend on it.` : "" },
    { kicker: "EchoLab", line: "Three futures, before anything is touched.", sub: ops.simulation ? `${ops.simulation.request.rollouts.toLocaleString("en-GB")} rollouts each, the same random draws.` : "Simulating…" },
    { kicker: "SafeCut", line: ops.plan?.status === "optimal" ? "The smallest response that works." : ops.plan ? `No safe plan under ${policyTitle(ops)}.` : "Solving…", sub: ops.plan?.status === "optimal" ? `${ops.plan.display_actions.length} reversible actions, chosen from every combination of ${ops.actions.length}.` : "" },
    { kicker: "Containment · simulated", line: "The hostile paths break at the aperture.", sub: residual ? `${residual.required_path_ids.length} required paths cut${residual.open_path_ids.length ? `; ${residual.open_path_ids.join(", ")} stays open as accepted residual risk` : ""}.` : "" },
    { kicker: "Continuity", line: services.length ? `${services.filter((s) => !s.down).map((s) => s.label).join(", ")} keep running.` : "The business thread keeps running.", sub: services.length ? `${services.filter((s) => !s.down).length} of ${services.length} critical services keep their dependencies under the plan.` : "" },
    { kicker: "ProofSeal", line: proof ? `${verified} of ${proof.claims.length} claims verified.` : "Sealing…", sub: "Re-derived by code that never imports the optimiser." },
    { kicker: "Action Gate", line: roles.length ? `${roles.length} named ${roles.length === 1 ? "approver decides" : "approvers decide"}.` : "Named approvers decide.", sub: ops.outstandingRoles?.length ? `Waiting on ${ops.outstandingRoles.join(" and ").replaceAll("_", " ")}.` : ops.proof ? "Approvals recorded." : "" },
  ];
  const c = copy[step]!;

  return (
    <div className="v2-theatre" aria-roledescription="presentation">
      <header className="v2-theatre-bar">
        <Image src="/brand/halt-horizontal-bone.svg" alt="HALT" width={96} height={28} unoptimized />
        <ol aria-label="Presentation steps" className="v2-theatre-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button type="button" aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)} title={s.title}>
                <span className="sr-only">{`${i + 1}. ${s.title}`}</span>
              </button>
            </li>
          ))}
        </ol>
        <span className="v2-meta v2-theatre-status">
          {`SIMULATED · ${step + 1} / ${STEPS.length}`}
          <span className="v2-theatre-keys"> · ← → to move · Esc to exit</span>
        </span>
        <Link className="halt-btn halt-btn-ghost" href={`/incidents/${state.incidentId}?view=overview`}>
          EXIT TO COMMAND
        </Link>
      </header>
      <div className="v2-theatre-stage">
        <div className="v2-theatre-copy" aria-live="polite">
          <p className="v2-kicker">{c.kicker}</p>
          <h1 className="v2-display" style={{ fontSize: "clamp(36px, 4.6vw, 72px)" }}>{c.line}</h1>
          {c.sub ? <p className="v2-decision" style={{ color: "var(--v2-text-2)", maxWidth: 560 }}>{c.sub}</p> : null}
          {step === 8 && ops.plan?.status === "optimal" ? (
            <button type="button" className="halt-btn halt-btn-primary" onClick={() => setGate(true)} style={{ marginTop: "var(--space-5)" }}>
              <span>OPEN ACTION GATE</span>
              <span aria-hidden>→</span>
            </button>
          ) : null}
        </div>
        <div className="v2-theatre-visual">
          {step <= 2 ? (
            <div className="v2-stage" style={{ padding: "var(--space-2)" }}>
              <GraphPanel height={560} />
            </div>
          ) : step === 3 && ops.simulation ? (
            <div className="v2-stage" style={{ padding: "var(--space-5)" }}>
              <Horizon futures={ops.simulation.futures} target={target} />
            </div>
          ) : step >= 4 && step <= 5 ? (
            <div className="v2-stage" style={{ padding: "var(--space-4)" }}>
              <Chamber state={!ops.plan ? "idle" : ops.plan.status === "infeasible" ? "none" : step === 5 ? (ops.execution?.state === "applied" ? "applied" : "sealed") : "proposed"} />
            </div>
          ) : step === 6 ? (
            <div className="v2-stage" style={{ padding: "var(--space-6)" }}>
              <svg viewBox="0 0 800 300" width="100%" role="img" aria-label="Critical services keep running">
                <ContinuityPath d="M40 150 H 760" />
                {services.map((s, i) => (
                  <g key={s.id}>
                    <rect x={120 + i * 230} y={110} width={24} height={18} fill="none" stroke="var(--v2-text)" strokeWidth={2.5} />
                    <rect x={120 + i * 230} y={128} width={24} height={4} fill="var(--v2-continuity)" />
                    <text x={132 + i * 230} y={200} fill="var(--v2-text)" fontSize={18} textAnchor="middle" fontFamily="var(--font-display)">{s.label}</text>
                    <text x={132 + i * 230} y={224} fill={s.down ? "var(--v2-text-2)" : "var(--v2-continuity-text)"} fontSize={14} textAnchor="middle" fontFamily="var(--font-display)">{s.down ? "stopped" : "running"}</text>
                  </g>
                ))}
              </svg>
            </div>
          ) : step === 7 && proof ? (
            <ol className="v2-stage" style={{ listStyle: "none", margin: 0, padding: "var(--space-6)", display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "var(--space-4)" }}>
              {[...proof.claims]
                .sort((a, b) => CLAIM_ORDER.indexOf(a.id) - CLAIM_ORDER.indexOf(b.id))
                .map((cl, i) => (
                  <li key={cl.id} className="v2-proof-item" style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", animationDelay: `${i * 120}ms` }}>
                    <ProofGlyph verified={cl.status === "verified"} size={28} title={cl.status} />
                    <span style={{ fontSize: 17 }}>{CLAIM_BASIS[cl.id]?.label ?? cl.id}</span>
                  </li>
                ))}
            </ol>
          ) : step === 8 ? (
            <div className="v2-stage" style={{ padding: "var(--space-6)" }}>
              <p className="v2-decision">{ops.plan?.status === "optimal" ? ops.plan.display_actions.map((d) => d.title).join(" · ") : "No plan to approve."}</p>
              {residual?.open_path_ids.length ? <p className="v2-body" style={{ marginTop: "var(--space-3)" }}>{`${residual.open_path_ids.join(", ")} stays open: ${count(residual.reach_bound)} simulated rollouts, accepted under ${policyTitle(ops)}.`}</p> : null}
            </div>
          ) : (
            <div className="v2-stage" style={{ padding: "var(--space-8)", textAlign: "center" }}>
              <p className="v2-decision">{ops.busy ? `Working: ${ops.busy}` : "Waiting for the API"}</p>
            </div>
          )}
        </div>
      </div>
      <footer className="v2-theatre-foot">
        <button type="button" className="halt-btn halt-btn-ghost" onClick={() => go(-1)} disabled={step === 0}>
          ← PREVIOUS
        </button>
        <span className="v2-meta">{STEPS[step]!.title}</span>
        <button type="button" className="halt-btn" onClick={() => go(1)} disabled={step === STEPS.length - 1}>
          NEXT →
        </button>
      </footer>
      <ActionGateDrawer open={gate} onClose={() => setGate(false)} />
    </div>
  );
}
