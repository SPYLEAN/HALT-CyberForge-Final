"use client";

type Status = "implemented" | "ready" | "planned";

interface Box {
  name: string;
  what: string;
  status: Status;
  where?: string; // repository path for implemented work
}

const TIERS: Array<{ title: string; note: string; boxes: Box[] }> = [
  {
    title: "Telemetry and detection sources",
    note: "Where incidents come from. In this MVP, every event is a synthetic, labelled scenario record.",
    boxes: [
      { name: "Scenario telemetry (INC-2417)", what: "6 incident events and 405 benign background events, deterministic", status: "implemented", where: "services/api/halt/scenario/inc_2417" },
      { name: "SIEM / EDR feeds", what: "Splunk, Sentinel, CrowdStrike and similar as event sources", status: "planned" },
      { name: "Identity and cloud logs", what: "Entra ID, Okta, M365, AWS sign-in and consent logs", status: "planned" },
    ],
  },
  {
    title: "HALT",
    note: "The six systems, running end to end on the scenario.",
    boxes: [
      { name: "HALT-R1", what: "Rules plus a logistic-regression score; correlation; ATT&CK mapping", status: "implemented", where: "services/api/halt/r1" },
      { name: "ThreadGraph", what: "Typed graph; path enumeration to the protected asset", status: "implemented", where: "services/api/halt/threadgraph" },
      { name: "EchoLab", what: "Seeded Monte Carlo of futures A / B / C", status: "implemented", where: "services/api/halt/echolab" },
      { name: "SafeCut", what: "OR-Tools CP-SAT envelope under a policy profile", status: "implemented", where: "services/api/halt/safecut" },
      { name: "ProofSeal", what: "Independent re-check, 2^n enumeration, Ed25519 seal (demo key)", status: "implemented", where: "services/api/halt/proofseal" },
      { name: "Action Gate", what: "Per-role approval, simulated execution, exact rollback", status: "implemented", where: "services/api/halt/gate" },
      { name: "REST + WebSocket API", what: "OpenAPI contracts, deterministic replay stream", status: "implemented", where: "services/api/openapi.json" },
      { name: "Append-only audit and journal", what: "Hash chain; PostgreSQL triggers and an app role limited to read and append", status: "implemented", where: "services/api/halt/db" },
      { name: "Language-model explanations", what: "Adapter exists and is off; may only reword cited evidence, never decide", status: "ready", where: "services/api/halt/explain" },
    ],
  },
  {
    title: "Response systems",
    note: "Where an approved plan would act. Today every action runs against a simulated copy of the graph.",
    boxes: [
      { name: "Simulated environment", what: "Applies and rolls back cuts on a graph snapshot; restores the exact hash", status: "implemented", where: "services/api/halt/gate/connectors.py" },
      { name: "Connector seam", what: "The simulated environment's apply / rollback / snapshot_hash methods mark where a real connector would plug in; no connector protocol is defined yet", status: "ready", where: "services/api/halt/gate/connectors.py" },
      { name: "Identity provider actions", what: "Revoke sessions and OAuth grants, conditional access", status: "planned" },
      { name: "Network and endpoint actions", what: "Isolation, ASN blocks", status: "planned" },
    ],
  },
  {
    title: "Audit and compliance",
    note: "Where the evidence goes after a decision.",
    boxes: [
      { name: "Incident report", what: "Printable evidence package from the live API state", status: "implemented", where: "apps/web/src/components/v2/views/ReportV2.tsx" },
      { name: "Signed proof certificate", what: "sha256 + Ed25519, verifiable through the API", status: "implemented", where: "services/api/halt/proofseal/seal.py" },
      { name: "Case management / GRC export", what: "ServiceNow, Jira, GRC tools", status: "planned" },
    ],
  },
];

const LABEL: Record<Status, string> = { implemented: "Implemented", ready: "Architecture-ready", planned: "Planned" };

function Mark({ status }: { status: Status }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      {status === "implemented" ? <rect x="1" y="1" width="10" height="10" fill="var(--v2-text)" /> : status === "ready" ? <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="var(--v2-text)" strokeWidth="1.5" /> : <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="var(--v2-text-2)" strokeWidth="1.5" strokeDasharray="2 2" />}
    </svg>
  );
}

/** System Architecture: where HALT sits, and exactly which parts are real today. */
export function Architecture() {
  return (
    <>
      <p className="v2-kicker">System Architecture</p>
      <h1 className="v2-title" style={{ margin: "var(--space-2) 0" }}>Where HALT sits, and what is real today</h1>
      <p className="v2-decision" style={{ color: "var(--v2-text-2)", maxWidth: 760 }}>
        HALT sits between detection and response: it turns an incident into the smallest reversible response it can prove. Everything marked implemented runs in this repository. Nothing planned is presented as connected.
      </p>
      <ul aria-label="Legend" style={{ listStyle: "none", padding: 0, display: "flex", gap: "var(--space-5)", margin: "var(--space-5) 0" }}>
        {(Object.keys(LABEL) as Status[]).map((s) => (
          <li key={s} className="v2-meta" style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--v2-text)" }}>
            <Mark status={s} />
            {LABEL[s]}
          </li>
        ))}
      </ul>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-6)" }} aria-label="Architecture tiers">
        {TIERS.map((t, i) => (
          <li key={t.title} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 3fr)", gap: "var(--space-6)", borderTop: "var(--border-hairline) solid var(--v2-border-strong)", paddingTop: "var(--space-5)" }} className="v2-arch-tier">
            <div>
              <span className="v2-num" style={{ fontSize: 18, color: "var(--v2-text-2)" }}>{String(i + 1).padStart(2, "0")}</span>
              <h2 className="v2-section" style={{ margin: "var(--space-2) 0" }}>{t.title}</h2>
              <p className="v2-body">{t.note}</p>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
              {t.boxes.map((b) => (
                <li key={b.name} style={{ padding: "var(--space-4)", borderRadius: "var(--v2-radius-m)", background: b.status === "implemented" ? "var(--v2-elevated)" : "transparent", border: `var(--border-hairline) ${b.status === "planned" ? "dashed" : "solid"} ${b.status === "planned" ? "var(--v2-border-strong)" : "var(--v2-border)"}` }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Mark status={b.status} />
                    <span className="v2-meta">{LABEL[b.status]}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, margin: "6px 0 4px", color: b.status === "planned" ? "var(--v2-text-2)" : "var(--v2-text)" }}>{b.name}</div>
                  <div className="v2-body" style={{ fontSize: 14 }}>{b.what}</div>
                  {b.where ? <div className="v2-id" style={{ marginTop: 6, wordBreak: "break-all" }}>{b.where}</div> : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}
