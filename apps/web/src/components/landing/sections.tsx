"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { MetricBlock, Skeleton, StatusChip } from "@/components/halt";
import { useOps } from "@/lib/api/ops";
import type { SecurityEvent } from "@/lib/api/types";
import { count, replayTime, utcTime } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import type { SceneState } from "./HaltScene3D";

// Copy follows 04-marketing-site; every figure comes from the API with its derivation.

export function Section({ id, scene, t, title, kicker, children }: { id: string; scene: SceneState; t: number; title: string; kicker: string; children?: ReactNode }) {
  return (
    <section id={id} className="landing-section" data-scene={scene} aria-labelledby={`${id}-h`}>
      <div className="landing-copy" data-replay-t={t}>
        <p className="label" style={{ margin: 0 }}>
          {kicker}
        </p>
        <h2 id={`${id}-h`} className="display-headline" style={{ margin: "var(--space-2) 0 var(--space-4)" }}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

const Pending = ({ what }: { what: string }) => <Skeleton lines={2} label={`Waiting for ${what} from the HALT API`} />;

export function Hero() {
  const ops = useOps();
  return (
    <section id="hero" className="landing-section landing-hero" data-scene="dormant" aria-labelledby="hero-h">
      <div className="landing-copy" data-replay-t={0}>
        <p className="label" style={{ margin: 0 }}>
          Proof-carrying cyber response
        </p>
        <h1 id="hero-h" className="display-headline" style={{ fontSize: 56, lineHeight: "60px", margin: "var(--space-3) 0 var(--space-4)" }}>
          Stop the attack. Not the business.
        </h1>
        <p className="body" style={{ fontSize: 17, lineHeight: "26px", color: "var(--text-secondary)" }}>
          HALT simulates, optimises and proves the smallest reversible response that blocks high-risk attack paths while preserving critical operations.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginTop: "var(--space-5)" }}>
          <a className="halt-btn halt-btn-primary" href="#incident">
            <span>RUN THE INCIDENT</span>
            <span aria-hidden>→</span>
          </a>
          <Link className="halt-btn" href="/incidents/INC-2417?view=overview">
            <span>EXPLORE THE COMMAND CENTER</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
        <p className="telemetry" style={{ marginTop: "var(--space-5)", color: "var(--text-secondary)" }}>
          {ops.incident ? `${ops.incident.id} · ${ops.incident.title} · ${utcTime(ops.incident.t0)}` : "INC-2417"} · Simulated demonstration data
        </p>
      </div>
    </section>
  );
}

export function Paradox() {
  const ops = useOps();
  const { state } = useIncident();
  const enumeration = state.events.find((e) => e.attributes.request_count !== undefined);
  const high = ops.paths.filter((p) => p.high_risk);
  const forecast = high.filter((p) => p.provenance === "forecast").length;
  const aggressive = ops.simulation?.futures.find((f) => f.label === "A");
  const critical = Object.values(state.nodes)
    .filter((n) => n.kind === "process" && n.criticality === "critical")
    .map((n) => n.id);
  const down = aggressive ? critical.filter((p) => (aggressive.downtime_min[p] ?? 0) > 0) : [];
  const downtime = aggressive ? Math.max(0, ...Object.values(aggressive.downtime_min)) : 0;

  return (
    <Section id="paradox" scene="intrusion" t={84} kicker="The containment paradox" title="A response can stop the attacker—and the organisation.">
      <p className="body">
        The obvious answer is to isolate everything the attacker could reach. Here that means the finance estate. The attacker loses access. So do the people who close the books,
        run payroll and reconcile the ledger.
      </p>
      <div className="landing-two">
        <div>
          <p className="label">Attacker damage · observed</p>
          {enumeration ? (
            <MetricBlock label="Finance-Close library enumerated" value={String(enumeration.attributes.request_count)} unit="requests" derivation={`${enumeration.id} · ${enumeration.source.record_id}`} tone="threat" />
          ) : (
            <p className="evidence-text">The enumeration has not happened yet at this point in the replay.</p>
          )}
          {high.length ? (
            <MetricBlock label="Paths to the finance database" value={high.length} unit={`(${forecast} forecast)`} derivation="ThreadGraph, ranked by EchoLab" simulated tone="threat" />
          ) : (
            <Pending what="the forecast" />
          )}
        </div>
        <div>
          <p className="label">Self-inflicted disruption · aggressive isolation</p>
          {aggressive ? (
            <>
              <MetricBlock label="Critical processes taken offline" value={`${down.length} of ${critical.length}`} derivation={`Dependency closure broken by ${aggressive.action_ids.join(" + ")}`} simulated />
              <MetricBlock label="Users locked out" value={aggressive.users_affected.numerator ?? 0} derivation={aggressive.users_affected.method} simulated />
              <MetricBlock label="Finance close delayed" value={`${Math.floor(downtime / 60)} h ${String(downtime % 60).padStart(2, "0")} min`} derivation="Containment window the isolation stays in force" simulated />
            </>
          ) : (
            <Pending what="the EchoLab futures" />
          )}
        </div>
      </div>
      <p className="evidence-text" style={{ color: "var(--text-secondary)" }}>
        Two kinds of damage appear on the same incident. HALT keeps them apart, because only one of them is the attacker’s doing.
      </p>
    </Section>
  );
}

export function IncidentSection({ allEvents }: { allEvents: SecurityEvent[] }) {
  const { state } = useIncident();
  const t0 = allEvents[0] ? new Date(allEvents[0].ts).getTime() : 0;
  const arrived = new Set(state.events.map((e) => e.id));
  return (
    <section id="incident" className="landing-section landing-incident" data-scene="reconstruction" aria-labelledby="incident-h">
      <div className="landing-copy">
        <p className="label" style={{ margin: 0 }}>
          Incident reconstruction
        </p>
        <h2 id="incident-h" className="display-headline" style={{ margin: "var(--space-2) 0 var(--space-4)" }}>
          Six events. Every one has a source.
        </h2>
        <p className="body">
          HALT rebuilds the incident from telemetry in the order it happened. A solid square is something a log recorded. A dashed link is something HALT infers, and it says on what
          basis.
        </p>
        <ol style={{ listStyle: "none", padding: 0 }} aria-label="Incident events">
          {allEvents.map((e) => {
            const t = (new Date(e.ts).getTime() - t0) / 1000;
            const live = state.events.find((x) => x.id === e.id);
            return (
              <li key={e.id} data-replay-t={t} className="landing-event" data-arrived={arrived.has(e.id)}>
                <span className="telemetry">
                  {utcTime(e.ts)} · {replayTime(t)}
                </span>
                <div className="section-headline">{e.kind.replaceAll("_", " ")}</div>
                <div className="evidence-text" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                  <StatusChip kind="observed">{e.id}</StatusChip>
                  {e.source.system} · {e.source.record_id}
                  {live?.attack ? <span className="telemetry">{live.attack.technique_id}</span> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function ContextSection({ end }: { end: number }) {
  const { state } = useIncident();
  const processes = Object.values(state.nodes).filter((n) => n.kind === "process" || n.kind === "api");
  return (
    <Section id="context" scene="business" t={end} kicker="Business context" title="The attack graph gets a second layer: what the business needs.">
      <p className="body">
        An asset cannot be safely isolated until its business consequences are understood. HALT joins the attack graph to the dependency map, so every node says what stops if it stops.
      </p>
      <ul style={{ listStyle: "none", padding: 0 }} aria-label="Business processes">
        {processes.map((n) => (
          <li key={n.id} className="evidence-text" style={{ display: "flex", justifyContent: "space-between", borderTop: "var(--border-hairline) solid var(--line)", padding: "var(--space-2) 0" }}>
            <span>{n.label}</span>
            <span className="telemetry">
              {n.business?.users ?? 0} users{n.business?.deadline ? ` · ${n.business.deadline}` : ""} · {n.criticality}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const FUTURE_TITLES = { A: "Aggressive isolation", B: "Passive monitoring", C: "HALT minimum-safe response" } as const;

export function EchoSection({ end }: { end: number }) {
  const ops = useOps();
  const sim = ops.simulation;
  return (
    <Section id="echolab" scene="futures" t={end} kicker="EchoLab" title="Three futures, run side by side before anything is touched.">
      {sim ? (
        <>
          <p className="body">
            EchoLab replays the incident {sim.request.rollouts.toLocaleString("en-GB")} times under each response and counts what happens. Same incident, same graph, three different outcomes.
          </p>
          <div className="landing-three">
            {sim.futures.map((f) => (
              <article key={f.label} aria-label={FUTURE_TITLES[f.label]}>
                <p className="label">
                  {f.label} · {FUTURE_TITLES[f.label]}
                </p>
                <MetricBlock label="Paths blocked" value={count(f.paths_blocked)} derivation="High-risk paths with a hard cut" simulated />
                <MetricBlock label="Rollouts reaching the ledger" value={count(f.target_reached)} derivation={`seed ${sim.request.seed}, horizon ${sim.request.horizon_s} s`} simulated tone="threat" />
                <MetricBlock label="Users affected" value={f.users_affected.numerator ?? 0} derivation={Object.keys(f.downtime_min).length ? `${Object.keys(f.downtime_min).length} processes down` : "No process down"} />
              </article>
            ))}
          </div>
          <p className="telemetry" style={{ color: "var(--text-secondary)" }}>Likelihoods are shares of rollouts, not measured probabilities.</p>
        </>
      ) : (
        <Pending what="the EchoLab futures" />
      )}
    </Section>
  );
}

export function SafeCutSection({ end }: { end: number }) {
  const ops = useOps();
  const plan = ops.plan;
  const actions = Object.fromEntries(ops.actions.map((a) => [a.id, a]));
  return (
    <Section id="safecut" scene="contained" t={end} kicker="SafeCut" title="Not the strongest response. The smallest one that works.">
      {plan?.status === "optimal" ? (
        <>
          <p className="body">
            SafeCut checked {ops.proof ? ops.proof.enumeration.subsets_checked.toLocaleString("en-GB") : "every"} combinations of {ops.actions.length} candidate actions against
            the hard rules: block every dangerous path, keep every critical process running. {plan.display_actions.length} actions satisfy them
            {ops.proof?.enumeration.unique ? ". No other set does as well." : "."}
          </p>
          <ol style={{ listStyle: "none", padding: 0 }} aria-label="Response actions">
            {plan.display_actions.map((d) => {
              const members = d.candidate_ids.map((c) => actions[c]).filter((a) => a !== undefined);
              return (
                <li key={d.id} style={{ borderTop: "var(--border-hairline) solid var(--line)", padding: "var(--space-3) 0" }}>
                  <div className="section-headline">
                    {d.id} {d.title}
                  </div>
                  <div className="evidence-text">
                    Cuts {d.blocks_path_ids.join(", ")} · {members.map((a) => a.impact.description).join(" ")} · {members.map((a) => `${a.reversibility.rollback_id} ${a.reversibility.seconds} s`).join(", ")} ·{" "}
                    {[...new Set(members.flatMap((a) => a.authorisation.policy_ids))].join(", ")}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <Pending what="the SafeCut plan" />
      )}
    </Section>
  );
}

export function ProofSection({ end }: { end: number }) {
  const ops = useOps();
  const proof = ops.proof;
  return (
    <Section id="proofseal" scene="verified" t={end} kicker="ProofSeal" title="A recommendation is a claim. HALT attaches the proof.">
      {proof ? (
        <>
          <p className="body">Before anyone is asked to approve, ProofSeal re-checks the response against the evidence and seals the result.</p>
          <ul style={{ listStyle: "none", padding: 0 }} aria-label="Proof claims">
            {proof.claims.map((c) => (
              <li key={c.id} className="evidence-text" style={{ display: "flex", gap: "var(--space-3)", alignItems: "baseline", borderTop: "var(--border-hairline) solid var(--line)", padding: "var(--space-2) 0" }}>
                <StatusChip kind={c.status === "verified" ? "verified" : "caution"} />
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
          <p className="telemetry" style={{ color: "var(--text-secondary)" }}>
            Seal {proof.id} · certificate {proof.certificate.slice(0, 12)}… · valid until {proof.valid_until ? utcTime(proof.valid_until) : "—"} or new telemetry · demo key
          </p>
          <p className="label">What this proof does not claim</p>
          <ul className="evidence-text">
            {proof.not_covered.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      ) : (
        <Pending what="the ProofSeal certificate" />
      )}
    </Section>
  );
}

export function CommandHandoff({ end }: { end: number }) {
  const { state } = useIncident();
  const href = `/incidents/${state.incidentId}?view=overview&t=${Math.round(state.cursor)}`;
  return (
    <Section id="command" scene="verified" t={end} kicker="Command Center" title="The incident does not restart. The interface picks it up.">
      <p className="body">
        The graph you just watched is the graph you operate. Same threads, same cut, same seal. Nothing has been executed: two named humans still have to approve.
      </p>
      <Link className="halt-btn halt-btn-primary" href={href} data-testid="enter-command-center">
        <span>ENTER LIVE COMMAND CENTER</span>
        <span aria-hidden>→</span>
      </Link>
    </Section>
  );
}
