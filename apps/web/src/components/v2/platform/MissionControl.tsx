"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FirexMissionPanel } from "@/components/firex/FirexMissionPanel";
import { StatusChip } from "@/components/halt";
import { STAGE_LABEL } from "@/components/shell/stages";
import { api, unwrap } from "@/lib/api/client";
import { useOps } from "@/lib/api/ops";
import type { components } from "@/lib/api/schema";
import type { GraphNode } from "@/lib/api/types";
import { count, utcTime } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { apertureOf, policyTitle } from "../derive";
import { Aperture, ContinuityPath, Lattice } from "../motifs";

type Health = components["schemas"]["Health"];
type AuditVerify = components["schemas"]["AuditVerify"];

/** Reads used only here: platform health, the audit chain, and the graph at the end of the replay. */
function usePlatform(incidentId: string) {
  const [health, setHealth] = useState<Health | null>(null);
  const [audit, setAudit] = useState<AuditVerify | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const ops = useOps();
  const stamp = `${ops.incident?.state}-${ops.plan?.id}-${ops.proof?.id}-${ops.execution?.state}`;
  useEffect(() => {
    let live = true;
    const path = { params: { path: { incident_id: incidentId } } };
    api.GET("/api/v1/health").then((r) => live && r.data && setHealth(r.data)).catch(() => undefined);
    api.GET("/api/v1/incidents/{incident_id}/audit/verify", path).then(unwrap).then((r) => live && setAudit(r)).catch(() => undefined);
    api.GET("/api/v1/incidents/{incident_id}/graph", path).then(unwrap).then((g) => live && setNodes(g.nodes)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [incidentId, stamp]);
  return { health, audit, nodes };
}

function ResilienceMap({ nodes }: { nodes: GraphNode[] }) {
  const ops = useOps();
  const plan = ops.plan;
  const high = ops.paths.filter((p) => p.high_risk);
  const residual = plan?.status === "optimal" ? plan.residual : null;
  const down = new Set(plan?.constraints.find((c) => c.constraint_id === "C-DOWNTIME")?.derivation.source_ids ?? []);
  const services = nodes.filter((n) => n.kind === "process" && n.criticality === "critical");
  const target = nodes.find((n) => n.id === ops.paths[0]?.target_id);
  const aperture = apertureOf(ops);
  const W = 900;
  const H = 360;
  return (
    <div className="v2-stage" style={{ padding: 0 }}>
      <Lattice id="mission-lattice" />
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Resilience map: ${high.length} high-risk paths toward ${target?.label ?? "the protected asset"}, containment ${aperture}, ${services.length - [...down].length} of ${services.length} critical services running`} style={{ position: "relative", display: "block" }}>
        <text x={40} y={40} fill="var(--v2-text-2)" fontSize={12.5} letterSpacing="0.08em" fontFamily="var(--font-display)">THREAT PATHWAYS</text>
        {ops.paths.length ? (
          ops.paths.map((p, i) => {
            const y = 70 + i * (220 / Math.max(1, ops.paths.length));
            const open = residual?.open_path_ids.includes(p.id);
            return (
              <g key={p.id}>
                <path
                  d={`M40 ${y} C 200 ${y}, 260 180, 380 180`}
                  fill="none"
                  stroke={p.high_risk ? "var(--v2-threat)" : "var(--v2-uncertain)"}
                  strokeWidth={p.high_risk ? 1.5 + p.risk * 3 : 1.5}
                  strokeDasharray={p.provenance === "forecast" || !p.high_risk ? "2 6" : undefined}
                  opacity={open ? 1 : 0.9}
                />
                <text x={40} y={y - 6} fill="var(--v2-text-2)" fontSize={12} fontFamily="var(--font-mono)">{`${p.id} · ${count(p.reach)}`}</text>
              </g>
            );
          })
        ) : (
          <text x={40} y={90} fill="var(--v2-text-2)" fontSize={14} fontFamily="var(--font-display)">Not correlated yet</text>
        )}
        <g transform="translate(370 100)">
          <Aperture state={aperture} size={160} label={`Containment ${aperture}`} />
        </g>
        <text x={450} y={300} fill="var(--v2-text-2)" fontSize={12.5} textAnchor="middle" fontFamily="var(--font-display)">
          {aperture === "applied" ? "CONTAINED · SIMULATED" : aperture === "sealed" ? "SEALED · AWAITING APPROVAL" : aperture === "proposed" ? "PLAN PROPOSED" : aperture === "none" ? "NO SAFE PLAN" : "NO PLAN YET"}
        </text>
        <text x={W - 40} y={40} fill="var(--v2-text-2)" fontSize={12.5} letterSpacing="0.08em" textAnchor="end" fontFamily="var(--font-display)">CRITICAL OPERATIONS</text>
        {target ? (
          <text x={W - 40} y={78} fill="var(--v2-text)" fontSize={15} fontWeight={600} textAnchor="end" fontFamily="var(--font-display)">{target.label}</text>
        ) : null}
        {services.map((s, i) => {
          const y = 120 + i * 56;
          return (
            <g key={s.id}>
              {down.has(s.id) ? <path d={`M560 ${y} H 700`} stroke="var(--v2-continuity)" strokeWidth={8} strokeOpacity={0.3} strokeLinecap="round" /> : <ContinuityPath d={`M560 ${y} H 700`} />}
              <text x={W - 40} y={y + 5} fill="var(--v2-text)" fontSize={15} textAnchor="end" fontFamily="var(--font-display)">{s.label}</text>
              <text x={W - 40} y={y + 22} fill={down.has(s.id) ? "var(--v2-text-2)" : "var(--v2-continuity-text)"} fontSize={12.5} textAnchor="end" fontFamily="var(--font-display)">{down.has(s.id) ? "stopped by plan" : "running"}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Block({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={kicker} style={{ borderTop: "var(--border-hairline) solid var(--v2-border-strong)", paddingTop: "var(--space-4)" }}>
      <p className="v2-kicker">{kicker}</p>
      <h2 className="v2-section" style={{ margin: "var(--space-2) 0" }}>{title}</h2>
      <div className="v2-body">{children}</div>
    </section>
  );
}

/** Mission Control: the operational landscape above every incident. */
export function MissionControl() {
  const ops = useOps();
  const { state } = useIncident();
  const { health, audit, nodes } = usePlatform(state.incidentId);
  const incident = ops.incident;
  const stage = incident ? STAGE_LABEL[incident.state] : null;
  const proof = ops.proof;
  const verified = proof?.claims.filter((c) => c.status === "verified").length ?? 0;
  const services = nodes.filter((n) => n.kind === "process" && n.criticality === "critical");
  return (
    <>
      <FirexMissionPanel />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)", gap: "var(--space-7)", alignItems: "center" }} className="v2-mission-hero">
        <div>
          <p className="v2-kicker">Mission Control · 1 active incident</p>
          <h1 className="v2-title" style={{ fontSize: "clamp(32px, 3.4vw, 46px)", margin: "var(--space-3) 0" }}>{incident?.title ?? "Connecting to the HALT API"}</h1>
          <div className="v2-btn-row" style={{ marginBottom: "var(--space-4)" }}>
            {stage ? <StatusChip kind={stage[1]}>{stage[0]}</StatusChip> : null}
            {incident ? <span className="v2-tag">severity {incident.severity}</span> : null}
            <span className="v2-id">{state.incidentId}</span>
          </div>
          <p className="v2-decision" style={{ color: "var(--v2-text-2)" }}>{incident?.summary}</p>
          <div className="v2-btn-row" style={{ marginTop: "var(--space-5)" }}>
            <Link className="halt-btn halt-btn-primary" href="/">
              <span>WATCH THE INCIDENT</span>
              <span aria-hidden>→</span>
            </Link>
            <Link className="halt-btn" href={`/incidents/${state.incidentId}?view=overview`}>
              <span>OPEN COMMAND CENTER</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
        <ResilienceMap nodes={nodes} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-6)", marginTop: "var(--space-8)" }}>
        <Block kicker="Containment readiness" title={ops.plan ? (ops.plan.status === "optimal" ? `${ops.plan.display_actions.length} reversible actions ready` : "No safe plan under this policy") : "No plan yet"}>
          {ops.plan ? `Policy: ${policyTitle(ops)}. ` : "Correlate the incident, then SafeCut derives the envelope. "}
          {ops.plan?.status === "optimal" && ops.plan.residual?.open_path_ids.length ? `${ops.plan.residual.open_path_ids.join(", ")} stays open as accepted residual risk.` : null}
        </Block>
        <Block kicker="Recent verified response" title={proof ? `${verified} of ${proof.claims.length} claims verified` : "Nothing sealed yet"}>
          {proof ? (
            <>
              Sealed {utcTime(proof.sealed_at)}. <span className="v2-id">{proof.id}</span>
            </>
          ) : (
            "ProofSeal seals a plan before anyone is asked to approve it."
          )}
        </Block>
        <Block kicker="Operational continuity" title={services.length ? `${services.length} critical services` : "Services appear with the graph"}>
          {services.map((s) => s.label).join(", ")}
        </Block>
        <Block kicker="Evidence status" title={audit ? (audit.valid ? `Audit chain intact · ${audit.length} entries` : `Audit chain broken at #${audit.first_bad_seq}`) : "Audit chain not read"}>
          {audit ? `Append-only enforced by ${audit.enforcement === "db" ? "the database" : "the application"}.` : null}{" "}
          {health ? `API ${health.status}, database ${health.db}.` : null}
        </Block>
      </div>
    </>
  );
}
