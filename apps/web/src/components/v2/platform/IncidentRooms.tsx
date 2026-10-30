"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, StatusChip } from "@/components/halt";
import { STAGE_LABEL } from "@/components/shell/stages";
import { useOps } from "@/lib/api/ops";
import { useIncident } from "@/lib/state/incident-store";

import { policyTitle } from "../derive";

/** Incident Rooms: the open incident, and the controlled scenario variants it can be replayed under. */
export function IncidentRooms() {
  const ops = useOps();
  const { state, seek } = useIncident();
  const router = useRouter();
  const [confirm, setConfirm] = useState<string | null>(null);
  const incident = ops.incident;
  const stage = incident ? STAGE_LABEL[incident.state] : null;
  const variants = ops.variants;
  const status = ops.execution?.state === "applied" ? "Contained (simulated)" : ops.proof ? "Sealed, awaiting approval" : ops.plan ? (ops.plan.status === "optimal" ? "Plan ready" : "No safe plan") : ops.paths.length ? "Forecast ready" : "Open";

  return (
    <>
      <p className="v2-kicker">Incident Rooms</p>
      <h1 className="v2-title" style={{ margin: "var(--space-2) 0 var(--space-6)" }}>One incident, replayable under controlled variants</h1>

      <section aria-label="Open incident" className="v2-stage" style={{ padding: "var(--space-6)", display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: "var(--space-6)" }}>
        <div>
          <div className="v2-btn-row">
            {stage ? <StatusChip kind={stage[1]}>{stage[0]}</StatusChip> : null}
            {incident ? <span className="v2-tag">severity {incident.severity}</span> : null}
            <span className="v2-id">{state.incidentId}</span>
          </div>
          <h2 className="v2-section" style={{ fontSize: 28, margin: "var(--space-3) 0" }}>{incident?.title ?? "Connecting to the HALT API"}</h2>
          <p className="v2-decision" style={{ color: "var(--v2-text-2)" }}>{incident?.summary}</p>
        </div>
        <dl style={{ margin: 0, display: "grid", gap: "var(--space-3)", alignContent: "start" }}>
          {[
            ["Response status", status],
            ["Policy", policyTitle(ops) ?? "No plan yet"],
            ["Scenario variant", variants?.items.find((v) => v.key === variants.active)?.title ?? "—"],
            ["Enumerated paths", ops.paths.length ? `${ops.paths.length} (${ops.paths.filter((p) => p.high_risk).length} high-risk)` : "Not correlated"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="v2-meta">{k}</dt>
              <dd style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{v}</dd>
            </div>
          ))}
          <div className="v2-btn-row">
            <Link className="halt-btn halt-btn-primary" href={`/incidents/${state.incidentId}?view=overview`}>
              <span>ENTER THE ROOM</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </dl>
      </section>

      <section aria-label="Controlled scenario variants" className="v2-panel">
        <p className="v2-kicker">Controlled scenario variants · synthetic</p>
        <h2 className="v2-section" style={{ margin: "var(--space-2) 0 var(--space-4)" }}>Change one input; watch the plan follow</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {variants?.items.map((v) => (
            <li key={v.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr) auto", gap: "var(--space-5)", alignItems: "center", padding: "var(--space-4) 0", borderTop: "var(--border-hairline) solid var(--v2-border)" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{v.title}</div>
                <div className="v2-id">{v.key}</div>
              </div>
              <p className="v2-body">{v.description}</p>
              {v.key === variants.active ? (
                <StatusChip kind="neutral">RUNNING</StatusChip>
              ) : confirm === v.key ? (
                <div className="v2-btn-row">
                  <Button variant="ghost" onClick={() => setConfirm(null)}>
                    CANCEL
                  </Button>
                  <Button
                    variant="primary"
                    onClick={async () => {
                      await ops.reset(v.key);
                      seek(0);
                      router.push(`/incidents/${state.incidentId}?view=overview`);
                    }}
                  >
                    RESET AND LOAD
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setConfirm(v.key)}>
                  LOAD VARIANT
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="v2-meta" style={{ marginTop: "var(--space-3)" }}>Loading a variant resets the incident to its seed under that variant. The audit log keeps the history.</p>
      </section>
    </>
  );
}
