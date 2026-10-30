"use client";

import { StatusChip } from "@/components/halt";
import { VariantSwitcher } from "@/components/views/PoliciesView";
import { PolicyControl } from "@/components/views/PolicyPanels";
import { useOps } from "@/lib/api/ops";

import { Section, ViewHead } from "./parts";

/** Policy Lab: every constraint SafeCut and ProofSeal enforce, with its limit under each profile and its value under the plan. */
export function PolicyLabV2() {
  const ops = useOps();
  const set = ops.policySet;
  const results = Object.fromEntries((ops.plan?.constraints ?? []).map((c) => [c.constraint_id, c]));
  const profiles = set?.profiles ?? [];
  const actionTypes = [...new Set(ops.actions.map((a) => a.type))];
  return (
    <>
      <ViewHead
        kicker="Policy Lab"
        title="The rules every response must satisfy"
        statement="These are the solver's hard constraints, not guidance: change the containment policy and SafeCut solves again under the new limits."
      />
      <PolicyControl />

      <Section title="Constraints" kicker="Enforced by SafeCut, re-checked by ProofSeal">
        <ul aria-label="Constraints" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {set?.constraints.map((c) => {
            const r = results[c.id];
            const byProfile = c.id === "C-COVER" || c.id === "C-RESIDUAL";
            return (
              <li key={c.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1fr)", gap: "var(--space-5)", padding: "var(--space-4) 0", borderTop: "var(--border-hairline) solid var(--v2-border)", alignItems: "baseline" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{c.label}</div>
                  <div className="v2-id">{c.id} · {c.kind}</div>
                </div>
                <div className="v2-body" style={{ color: "var(--v2-text)" }}>
                  {byProfile
                    ? profiles.map((p) => (
                        <div key={p.id}>
                          {p.title}: {c.id === "C-COVER" ? `cut every path with risk ≥ ${p.cover_min_risk}` : p.residual_reach_limit === 0 ? "nothing may stay open" : `≤ ${p.residual_reach_limit.toLocaleString("en-GB")} rollouts`}
                        </div>
                      ))
                    : typeof c.limit === "number"
                      ? `≤ ${c.limit} ${c.unit ?? ""}`
                      : c.limit === true
                        ? "Required"
                        : "—"}
                </div>
                <div>
                  {r ? (
                    <>
                      <StatusChip kind={r.state === "violated" ? "caution" : r.state === "binding" ? "pending" : "success"}>{r.state.toUpperCase()}</StatusChip>
                      <div className="v2-meta" style={{ marginTop: 4 }}>{r.value}</div>
                    </>
                  ) : (
                    <span className="v2-meta">No plan yet</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Who may authorise what" kicker={`${set?.approvers.length ?? 0} approvers · ${set?.policies.length ?? 0} response policies`}>
        <ul aria-label="Approvers" style={{ listStyle: "none", margin: "0 0 var(--space-5)", padding: 0, display: "flex", gap: "var(--space-5)", flexWrap: "wrap" }}>
          {set?.approvers.map((a) => (
            <li key={a.id} style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{a.name}</div>
                <div className="v2-meta">{a.roles.join(", ").replaceAll("_", " ")}</div>
              </div>
              <StatusChip kind={a.available ? "success" : "blocked"}>{a.available ? "AVAILABLE" : "UNAVAILABLE"}</StatusChip>
            </li>
          ))}
        </ul>
        <ul aria-label="Response policies" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {set?.policies.map((p) => (
            <li key={p.id} style={{ padding: "var(--space-3) 0", borderTop: "var(--border-hairline) solid var(--v2-border)" }}>
              <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{p.title}</span>
                <span className="v2-id">{p.id}</span>
              </div>
              <div className="v2-meta">
                {actionTypes.length && actionTypes.every((t) => p.applies_to_action_types.includes(t)) ? "Every action" : p.applies_to_action_types.join(", ").replaceAll("_", " ") || "—"}
                {p.required_roles.length ? ` · approval: ${p.required_roles.join(" + ").replaceAll("_", " ")}` : ""}
                {p.window ? ` · freeze ${p.window.start.slice(0, 5)}–${p.window.end.slice(0, 5)}Z needs ${p.window.exception_role.replaceAll("_", " ")}` : ""}
              </div>
              <div className="v2-body">{p.rationale}</div>
            </li>
          ))}
        </ul>
      </Section>

      <div className="v2-panel">
        <VariantSwitcher />
      </div>
    </>
  );
}
