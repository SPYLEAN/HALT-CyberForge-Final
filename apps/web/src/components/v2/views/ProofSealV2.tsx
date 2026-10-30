"use client";

import { Button } from "@/components/halt";
import { RunButton } from "@/components/views/common";
import { useOps } from "@/lib/api/ops";
import { utcTime } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { CLAIM_BASIS, CLAIM_ORDER } from "../derive";
import { ProofGlyph } from "../motifs";
import { Basis, Figure, Section, ViewHead } from "./parts";

/** ProofSeal: the chain of claims a plan carries, each re-derived independently of the optimiser. */
export function ProofSealV2() {
  const ops = useOps();
  const { select } = useIncident();
  const proof = ops.proof;
  const blocked = !ops.plan ? "Derive a SafeCut plan first." : ops.plan.status !== "optimal" ? "Only an optimal plan can be sealed; this plan is infeasible." : null;
  const claims = proof ? [...proof.claims].sort((a, b) => CLAIM_ORDER.indexOf(a.id) - CLAIM_ORDER.indexOf(b.id)) : [];
  const verified = claims.filter((c) => c.status === "verified").length;

  return (
    <>
      <ViewHead
        kicker="ProofSeal"
        title={proof ? `${verified} of ${claims.length} claims verified` : "A recommendation is a claim. HALT attaches the proof."}
        statement={
          proof
            ? "Each claim was re-derived from the graph, the evidence and the policy by code that never imports SafeCut. Inspect any link in the chain."
            : "Before anyone approves, ProofSeal recomputes reachability, rechecks every constraint, enumerates every combination, and seals the result."
        }
        tone={proof ? (verified === claims.length ? "continuity" : "threat") : "neutral"}
      >
        {!proof ? <RunButton primary label="SEAL PLAN" onClick={ops.seal} blockedBy={blocked} /> : null}
      </ViewHead>
      {proof ? (
        <div className="v2-split">
          <ol aria-label="Proof chain" style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
            <span aria-hidden style={{ position: "absolute", left: 15, top: 12, bottom: 12, width: 2, background: "var(--v2-border)" }} />
            {claims.map((c) => {
              const meta = CLAIM_BASIS[c.id];
              return (
                <li key={c.id} style={{ position: "relative", display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: "var(--space-4)", paddingBottom: "var(--space-5)" }}>
                  <span style={{ position: "relative", background: "var(--v2-page)", display: "grid", placeItems: "center", height: 32 }}>
                    <ProofGlyph verified={c.status === "verified"} size={28} title={c.status === "verified" ? "verified" : c.status} />
                  </span>
                  <div>
                    <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
                      <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{meta?.label ?? c.id}</h3>
                      {meta ? <Basis kind={meta.basis} /> : null}
                      <span className="v2-id">{c.id}</span>
                      {c.status !== "verified" ? <span className="v2-tag" data-tone="threat">{c.status}</span> : null}
                    </div>
                    <p className="v2-body" style={{ color: "var(--v2-text)", marginTop: 4 }}>{c.text}</p>
                    <details className="v2-details" style={{ borderTop: "none" }}>
                      <summary className="v2-meta">How it was checked</summary>
                      <p className="v2-meta" style={{ margin: "0 0 var(--space-2) 24px" }}>
                        {c.method} · {c.result.method}
                      </p>
                      {c.evidence_ids.length ? (
                        <p className="v2-id" style={{ margin: "0 0 0 24px" }}>
                          Evidence:{" "}
                          {c.evidence_ids.map((e) => (
                            <button key={e} type="button" className="halt-btn halt-btn-ghost" onClick={() => select(e)} style={{ minHeight: 28, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
                              {e}
                            </button>
                          ))}
                        </p>
                      ) : null}
                    </details>
                  </div>
                </li>
              );
            })}
          </ol>
          <aside aria-label="Seal" className="v2-signal-list">
            <Figure label="Combinations checked" value={proof.enumeration.subsets_checked.toLocaleString("en-GB")} source={`${proof.enumeration.feasible} feasible · ${proof.enumeration.optimal_count} optimal${proof.enumeration.unique ? ", unique" : ""}`} />
            <Figure label="Sealed at" value={utcTime(proof.sealed_at)} source={`Valid until ${proof.valid_until ? utcTime(proof.valid_until) : "—"} or new telemetry`} />
            <div>
              <div className="v2-meta">Certificate</div>
              <div className="v2-id" style={{ wordBreak: "break-all", color: "var(--v2-text)" }}>sha256 {proof.certificate}</div>
              <div className="v2-meta">Ed25519 · {proof.signature.key_id} (demo key) · {proof.id}</div>
              <div style={{ marginTop: "var(--space-3)" }}>
                <Button variant="secondary" onClick={ops.verify} trailing="→">
                  RECOMPUTE AND VERIFY
                </Button>
              </div>
              {ops.verification ? (
                <p className="v2-body" role="status" style={{ marginTop: "var(--space-2)", color: "var(--v2-text)" }}>
                  Certificate {ops.verification.certificate_match ? "matches the proof body" : "DOES NOT match the proof body"} · signature {ops.verification.signature_valid ? "valid for this deployment" : "invalid"}
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : (
        <div className="v2-stage" style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center" }}>
          <p className="v2-decision">Nothing sealed yet.</p>
        </div>
      )}
      {proof ? (
        <Section title="What this proof does not cover" kicker="Stated, not hidden">
          <ul className="v2-body" style={{ margin: 0, paddingLeft: 18, color: "var(--v2-text)" }}>
            {proof.not_covered.map((n) => (
              <li key={n} style={{ marginBottom: "var(--space-2)" }}>
                {n}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
