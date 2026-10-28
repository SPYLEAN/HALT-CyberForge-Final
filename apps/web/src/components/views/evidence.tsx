"use client";

import { useState } from "react";

import { Button, EvidenceRow, StatusChip } from "@/components/halt";
import type { EvidenceSection } from "@/components/shell/EvidenceRail";
import type { OpsApi } from "@/lib/api/ops";
import { count, utcTime } from "@/lib/format";
import type { IncidentState } from "@/lib/state/incident-store";

/** Evidence rail content for the current selection: node, edge, path, finding or candidate action. */
export function evidenceFor(selection: string | null, state: IncidentState, ops: OpsApi): EvidenceSection[] {
  const node = selection ? state.nodes[selection] : undefined;
  const edge = selection ? state.edges[selection] : undefined;
  const path = ops.paths.find((p) => p.id === selection);
  const finding = ops.findings.find((f) => f.id === selection) ?? (selection ? state.findings[selection] : undefined);
  const action = ops.actions.find((a) => a.id === selection);

  let evidenceIds: string[] = [];
  if (node) evidenceIds = node.evidence_ids ?? [];
  else if (edge) evidenceIds = edge.evidence_ids ?? [];
  else if (path) evidenceIds = [...new Set(path.edge_ids.flatMap((id) => state.edges[id]?.evidence_ids ?? []))];
  else if (finding) evidenceIds = finding.evidence_ids;

  const events = state.events.filter((e) => evidenceIds.includes(e.id));
  const findings = [...ops.findings, ...Object.values(state.findings).filter((f) => !ops.findings.some((o) => o.id === f.id))].filter(
    (f) => f.evidence_ids.some((id) => evidenceIds.includes(id)),
  );
  const cutters = path && ops.plan ? ops.plan.display_actions.filter((d) => d.blocks_path_ids.includes(path.id)) : [];
  const policyIds = action
    ? action.authorisation.policy_ids
    : [...new Set(cutters.flatMap((d) => d.candidate_ids.flatMap((c) => ops.actions.find((a) => a.id === c)?.authorisation.policy_ids ?? [])))];
  const policies = ops.policySet?.policies.filter((p) => policyIds.includes(p.id)) ?? [];

  const confidence = path ? (
    <>
      <span className="telemetry">{count(path.reach)}</span> simulated rollouts reach the target along {path.id}. <StatusChip kind="simulated" />
      <div style={{ color: "var(--text-secondary)", marginTop: "var(--space-1)" }}>{path.reach.method}</div>
    </>
  ) : finding ? (
    <>
      Rule score {finding.score.value} · {finding.score.derivation.numerator} of {finding.score.derivation.denominator} conditions met
      {finding.model_score ? <> · model {finding.model_score.value} ({finding.model_score.method})</> : null}
    </>
  ) : findings.length ? (
    <>{findings.map((f) => `${f.id}: ${f.score.derivation.numerator} of ${f.score.derivation.denominator} rule conditions`).join("; ")}</>
  ) : edge?.inference ? (
    <>
      Inferred, confidence {edge.inference.confidence}: {edge.inference.rationale}
    </>
  ) : null;

  return [
    {
      id: "evidence",
      title: "Observed evidence",
      content: events.length ? (
        <div role="table" aria-label="Observed evidence">
          {events.map((e) => (
            <EvidenceRow key={e.id} id={e.id} source={e.source.system} text={String(e.attributes.resource ?? e.kind).replaceAll("_", " ")} time={utcTime(e.ts)} supports={e.attack?.technique_id ?? ""} />
          ))}
        </div>
      ) : selection && (node?.provenance === "forecast" || path?.provenance === "forecast") ? (
        <span style={{ color: "var(--text-secondary)" }}>Forecast: no event exists yet, so there is no evidence ID.</span>
      ) : null,
    },
    {
      id: "findings",
      title: "Model findings",
      content: findings.length ? (
        <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
          {findings.map((f) => (
            <li key={f.id}>
              <b>{f.id}</b> {f.title} · {f.attack.map((t) => t.technique_id).join(", ")}
            </li>
          ))}
        </ul>
      ) : null,
    },
    { id: "confidence", title: "Confidence", content: confidence },
    {
      id: "sources",
      title: "Source event IDs",
      content: events.length ? (
        <span className="telemetry">{events.map((e) => `${e.id} · ${e.source.record_id}`).join("  ")}</span>
      ) : null,
    },
    {
      id: "policy",
      title: "Policy requirements",
      content: policies.length ? (
        <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
          {policies.map((p) => (
            <li key={p.id}>
              <b>{p.id}</b> {p.title}
              {p.required_roles.length ? ` · ${p.required_roles.join(" + ")}` : ""}
              {p.window ? ` · freeze ${p.window.start.slice(0, 5)}–${p.window.end.slice(0, 5)}Z needs ${p.window.exception_role}` : ""}
            </li>
          ))}
        </ul>
      ) : null,
    },
  ];
}

export function ExplainButton({ subject, ops }: { subject: string; ops: OpsApi }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <Button variant="quiet" onClick={async () => setText((await ops.explain(subject))?.text ?? "No explanation available for this selection.")}>
        EXPLAIN {subject}
      </Button>
      {text ? (
        <p className="evidence-text" style={{ marginTop: "var(--space-2)" }}>
          {text}
        </p>
      ) : null}
    </div>
  );
}
