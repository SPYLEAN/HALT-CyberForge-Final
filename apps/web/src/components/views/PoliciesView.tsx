"use client";

import { useState } from "react";

import { Button, StatusChip } from "@/components/halt";
import { useOps } from "@/lib/api/ops";
import { useIncident } from "@/lib/state/incident-store";

import { Panel, ViewHeader } from "./common";
import { GraphPanel } from "./GraphPanel";

function VariantSwitcher() {
  const ops = useOps();
  const { state, seek } = useIncident();
  // The variant list and the active variant both come from the API, so a reload shows what is really running.
  const active = ops.variants?.active ?? null;
  const [picked, setPicked] = useState<string | null>(null); // the operator's pending choice, if any
  const variant = picked ?? active;
  const chosen = ops.variants?.items.find((v) => v.key === variant);
  return (
    <Panel title="Demo variant" chip={<StatusChip kind="simulated">DEMO ONLY</StatusChip>}>
      <p className="evidence-text" style={{ marginTop: 0 }}>
        Changes one scenario input and restarts the incident, to show that the plan is derived, not scripted.
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        <label className="label" htmlFor="variant">
          Variant
        </label>
        <select
          id="variant"
          value={variant ?? ""}
          disabled={!ops.variants}
          onChange={(e) => setPicked(e.target.value)}
          className="body"
          style={{ minHeight: "var(--hit-target)", background: "var(--surface)", color: "var(--text)", border: "var(--border-hairline) solid var(--border-strong)", borderRadius: "var(--radius-md)", padding: "0 var(--space-3)" }}
        >
          {ops.variants?.items.map((v) => (
            <option key={v.key} value={v.key}>
              {v.title}
              {v.key === active ? " (running)" : ""}
            </option>
          ))}
        </select>
        {variant ? (
          <Button
            variant="secondary"
            onClick={async () => {
              await ops.reset(variant);
              setPicked(null); // the API now reports this variant as active
              seek(state.cursor); // a variant can change the graph: rebuild the replayed state
            }}
            trailing="↺"
          >
            RESET INCIDENT
          </Button>
        ) : (
          <Button variant="secondary" disabled reason="Waiting for the variant list from the API." trailing="↺">
            RESET INCIDENT
          </Button>
        )}
      </div>
      {chosen ? (
        <p className="evidence-text" style={{ color: "var(--text-secondary)" }}>
          {chosen.description}
        </p>
      ) : null}
    </Panel>
  );
}

export function PoliciesView() {
  const ops = useOps();
  const set = ops.policySet;
  const actionTypes = [...new Set(ops.actions.map((a) => a.type))];
  /** "Every action" only when the policy names every action type in the catalogue. */
  const appliesTo = (types: string[]) =>
    actionTypes.length && actionTypes.every((t) => types.includes(t)) ? "Every action" : types.join(", ").replaceAll("_", " ") || "—";
  return (
    <>
      <ViewHeader kicker="Policies" title="Who may authorise what, and the limits every plan must meet" />
      <GraphPanel height={240} />
      <Panel title="Response policies">
        <table className="evidence-text" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr className="label">
              <th scope="col" style={{ textAlign: "left" }}>Policy</th>
              <th scope="col" style={{ textAlign: "left" }}>Applies to</th>
              <th scope="col" style={{ textAlign: "left" }}>Approval</th>
              <th scope="col" style={{ textAlign: "left" }}>Why</th>
            </tr>
          </thead>
          <tbody>
            {set?.policies.map((p) => (
              <tr key={p.id} style={{ borderTop: "var(--border-hairline) solid var(--line)" }}>
                <th scope="row" style={{ textAlign: "left", padding: "var(--space-2) var(--space-3) var(--space-2) 0" }}>
                  <span className="telemetry">{p.id}</span>
                  <div>{p.title}</div>
                </th>
                <td>{appliesTo(p.applies_to_action_types)}</td>
                <td>
                  {p.required_roles.join(" + ") || "—"}
                  {p.window ? ` · freeze ${p.window.start.slice(0, 5)}–${p.window.end.slice(0, 5)}Z: ${p.window.exception_role}` : ""}
                </td>
                <td>{p.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Approvers">
        <ul style={{ listStyle: "none", padding: 0, display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
          {set?.approvers.map((a) => (
            <li key={a.id} className="body" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <b>{a.name}</b> {a.roles.join(", ")}
              <StatusChip kind={a.available ? "success" : "blocked"}>{a.available ? "AVAILABLE" : "UNAVAILABLE"}</StatusChip>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Hard constraints">
        <ul className="body" style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
          {set?.constraints.map((c) => (
            <li key={c.id}>
              <span className="telemetry">{c.id}</span> {c.label}
              {typeof c.limit === "number" ? ` · ≤ ${c.limit} ${c.unit ?? ""}` : ""}
            </li>
          ))}
        </ul>
      </Panel>
      <VariantSwitcher />
    </>
  );
}
