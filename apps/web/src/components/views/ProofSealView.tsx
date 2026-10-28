"use client";

import { Button, MetricBlock, StatusChip } from "@/components/halt";
import { useOps } from "@/lib/api/ops";
import { utcTime } from "@/lib/format";

import { grid, Panel, RunButton, ViewHeader } from "./common";
import { GraphPanel } from "./GraphPanel";

export function ProofSealView() {
  const ops = useOps();
  const proof = ops.proof;
  const blocked = !ops.plan
    ? "Derive a SafeCut plan first."
    : ops.plan.status !== "optimal"
      ? "Only an optimal plan can be sealed; this plan is infeasible."
      : null;

  return (
    <>
      <ViewHeader kicker="ProofSeal" title="A recommendation is a claim. HALT attaches the proof.">
        {!proof ? <RunButton primary label="SEAL PLAN" onClick={ops.seal} blockedBy={blocked} /> : null}
      </ViewHeader>
      <GraphPanel height={300} />
      {proof ? (
        <>
          <Panel title={`Proof ${proof.id}`} chip={<StatusChip kind={proof.claims.every((c) => c.status === "verified") ? "verified" : "caution"} />}>
            <div style={grid(3)}>
              <MetricBlock
                label="Subsets checked"
                value={proof.enumeration.subsets_checked.toLocaleString("en-GB")}
                derivation={`${proof.enumeration.feasible} feasible · ${proof.enumeration.optimal_count} optimal${proof.enumeration.unique ? ", unique" : ""}`}
              />
              <MetricBlock label="Sealed at" value={utcTime(proof.sealed_at)} derivation={`Valid until ${proof.valid_until ? utcTime(proof.valid_until) : "—"} or new telemetry`} />
              <MetricBlock label="Claims verified" value={`${proof.claims.filter((c) => c.status === "verified").length} of ${proof.claims.length}`} derivation="Each recomputed independently of SafeCut" />
            </div>
            <ol style={{ listStyle: "none", padding: 0, marginTop: "var(--space-5)" }} aria-label="Claims">
              {proof.claims.map((c) => (
                <li key={c.id} style={{ display: "grid", gridTemplateColumns: "88px 120px 1fr", gap: "var(--space-3)", padding: "var(--space-3) 0", borderTop: "var(--border-hairline) solid var(--line)" }}>
                  <span className="telemetry">{c.id}</span>
                  <StatusChip kind={c.status === "verified" ? "verified" : "caution"}>{c.status.toUpperCase()}</StatusChip>
                  <div>
                    <div className="body">{c.text}</div>
                    <div className="telemetry" style={{ color: "var(--text-secondary)" }}>
                      {c.method} · {c.result.method}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Certificate">
            <p className="telemetry" style={{ wordBreak: "break-all" }}>
              sha256 {proof.certificate}
              <br />
              Ed25519 · {proof.signature.key_id} (demo key)
            </p>
            <Button variant="secondary" onClick={ops.verify} trailing="→">
              RECOMPUTE AND VERIFY
            </Button>
            {ops.verification ? (
              <p className="evidence-text" role="status" style={{ marginTop: "var(--space-3)" }}>
                Certificate {ops.verification.certificate_match ? "matches the proof body" : "DOES NOT match the proof body"} · signature{" "}
                {ops.verification.signature_valid ? "valid for this deployment" : "invalid"}
              </p>
            ) : null}
          </Panel>
          <Panel title="What this proof does not cover">
            <ul className="body" style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
              {proof.not_covered.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
    </>
  );
}
