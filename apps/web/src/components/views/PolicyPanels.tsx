"use client";

import { useState } from "react";

import { StatusChip } from "@/components/halt";
import { useOps, type ProfileId } from "@/lib/api/ops";
import type { components } from "@/lib/api/schema";
import { count } from "@/lib/format";

import { Panel, RunButton } from "./common";

type Profile = components["schemas"]["PolicyProfile"];
type Outcome = components["schemas"]["ProfileOutcome"];

/** "≤ 600 of 6,000 rollouts" or "none": the profile's own C-RESIDUAL limit, never a UI threshold. */
export function allowance(p: Profile, rollouts: number | undefined): string {
  return p.residual_reach_limit === 0
    ? "None: every enumerated path to the asset must be cut"
    : `≤ ${p.residual_reach_limit.toLocaleString("en-GB")} of ${rollouts?.toLocaleString("en-GB") ?? "—"} simulated rollouts through paths left open`;
}

/** Choose the containment policy; SafeCut solves again under the new limits. */
export function PolicyControl() {
  const ops = useOps();
  const profiles = ops.policySet?.profiles ?? [];
  const current = ops.plan?.profile_id ?? null;
  const [picked, setPicked] = useState<ProfileId | null>(null);
  const selected = picked ?? current ?? profiles[0]?.id ?? null;
  const rollouts = ops.incident?.params.rollouts;
  if (!profiles.length) return null;
  return (
    <Panel title="Containment policy" chip={current ? <StatusChip kind="neutral">{`PLAN SOLVED UNDER ${profiles.find((p) => p.id === current)?.title.toUpperCase()}`}</StatusChip> : undefined}>
      <div role="radiogroup" aria-label="Containment policy" style={{ display: "grid", gridTemplateColumns: `repeat(${profiles.length}, minmax(0, 1fr))`, gap: "var(--space-4)" }}>
        {profiles.map((p) => (
          <label
            key={p.id}
            style={{
              display: "block",
              cursor: "pointer",
              border: `var(--border-hairline) ${selected === p.id ? "solid var(--text)" : "solid var(--line)"}`,
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
            }}
          >
            <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <input type="radio" name="policy" value={p.id} checked={selected === p.id} onChange={() => setPicked(p.id)} style={{ accentColor: "var(--text)" }} />
              <span className="section-headline">{p.title}</span>
            </span>
            <span className="evidence-text" style={{ display: "block", marginTop: "var(--space-2)", color: "var(--text-secondary)" }}>
              {p.summary}
            </span>
            <span className="telemetry" style={{ display: "block", marginTop: "var(--space-2)" }}>
              Must cut: every enumerated path with simulated risk ≥ {p.cover_min_risk} · Residual allowed: {allowance(p, rollouts)}
            </span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: "var(--space-4)" }}>
        <RunButton
          primary={selected !== current}
          label={selected === current ? "RE-SOLVE" : `SOLVE UNDER ${profiles.find((p) => p.id === selected)?.title.toUpperCase()}`}
          onClick={() => {
            if (selected) void ops.createPlan(selected).then(() => setPicked(null));
          }}
          blockedBy={ops.paths.length ? null : "Correlate the incident first: the policy is applied to the enumerated paths."}
        />
      </div>
    </Panel>
  );
}

/** What the current plan leaves open, under its own policy: never described as zero risk. */
export function ResidualPanel() {
  const ops = useOps();
  const plan = ops.plan;
  const residual = plan?.status === "optimal" ? plan.residual : null;
  if (!plan || !residual) return null;
  const profile = ops.policySet?.profiles.find((p) => p.id === plan.profile_id);
  const routes = Object.fromEntries(ops.paths.map((p) => [p.id, p]));
  const open = residual.open_path_ids;
  return (
    <Panel
      title="Residual risk under this policy"
      chip={<StatusChip kind={open.length ? "caution" : "success"}>{open.length ? `${open.length} PATH${open.length > 1 ? "S" : ""} LEFT OPEN` : "NO ENUMERATED PATH LEFT OPEN"}</StatusChip>}
    >
      <p className="body" style={{ marginTop: 0 }}>
        {profile?.title ?? plan.profile_id}: {residual.required_path_ids.length} of {residual.enumerated_path_ids.length} enumerated paths to {residual.protected_asset_id} must be cut.{" "}
        {open.length
          ? `${open.join(", ")} ${open.length > 1 ? "stay" : "stays"} open as accepted residual risk: ${count(residual.reach_bound)} rollouts at most, against an allowance of ${residual.limit.toLocaleString("en-GB")}. This plan is not zero-risk.`
          : "Every enumerated path has a hard cut. That is proven for the modelled graph only; it is not a promise of absolute security."}
      </p>
      {open.length ? (
        <ul className="evidence-text" aria-label="Paths left open" style={{ paddingLeft: "var(--space-5)" }}>
          {open.map((id) => (
            <li key={id}>
              <b>{id}</b> {routes[id]?.node_ids.join(" → ")} · {routes[id] ? count(routes[id].reach) : "—"} rollouts on its own · risk {routes[id]?.risk.toFixed(4)}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="label">Uncertainty</p>
      <ul className="evidence-text" style={{ paddingLeft: "var(--space-5)", color: "var(--text-secondary)" }}>
        {residual.uncertainty.map((u) => (
          <li key={u}>{u}</li>
        ))}
      </ul>
    </Panel>
  );
}

function cell(o: Outcome, row: string): string {
  const r = o.residual;
  switch (row) {
    case "status":
      return o.status === "optimal" ? "Feasible plan" : `No feasible plan (relaxing ${o.infeasibility?.violated_constraint_ids.join(", ")} would restore one)`;
    case "actions":
      return o.status === "optimal" ? o.selected_candidate_ids.join(", ") : `Closest option: ${o.infeasibility?.closest_options[0]?.candidate_ids.join(", ") ?? "—"} (not runnable)`;
    case "open":
      return r ? (r.open_path_ids.length ? r.open_path_ids.join(", ") : "None") : "—";
    case "bound":
      return r ? `${count(r.reach_bound)} (allowed ${r.limit.toLocaleString("en-GB")})` : "—";
    case "simulated":
      return o.simulated_reach ? count(o.simulated_reach) : "—";
    case "users":
      return o.users_affected === null ? "—" : `${o.users_affected}`;
    case "downtime":
      return o.critical_downtime_min === null ? "—" : `${o.critical_downtime_min} min`;
    case "roles":
      return o.approval_roles.length ? o.approval_roles.join(", ").replaceAll("_", " ") : "—";
  }
  return "—";
}

function signed(n: number | null, unit = ""): string {
  if (n === null) return "—";
  return `${n > 0 ? "+" : ""}${n.toLocaleString("en-GB")}${unit}`;
}

const ROWS: Array<[string, string]> = [
  ["status", "Result"],
  ["actions", "Actions"],
  ["open", "Paths left open"],
  ["bound", "Residual reach bound (sum of own counts)"],
  ["simulated", "EchoLab: rollouts still reaching the ledger"],
  ["users", "Users affected"],
  ["downtime", "Critical-process downtime"],
  ["roles", "Approval roles"],
];

/** Every profile's plan side by side, and exactly what moving between them costs and buys. */
export function PolicyComparisonPanel() {
  const ops = useOps();
  const c = ops.comparison;
  if (!c) return null;
  const t = c.tradeoff;
  const delta: Record<string, string> = {
    actions: t.added_candidate_ids.length || t.removed_candidate_ids.length ? [t.added_candidate_ids.length ? `adds ${t.added_candidate_ids.join(", ")}` : "", t.removed_candidate_ids.length ? `drops ${t.removed_candidate_ids.join(", ")}` : ""].filter(Boolean).join("; ") : t.delta_actions === 0 ? "same actions" : "—",
    open: t.newly_cut_path_ids.length ? `closes ${t.newly_cut_path_ids.join(", ")}` : t.reopened_path_ids.length ? `re-opens ${t.reopened_path_ids.join(", ")}` : "—",
    bound: signed(t.delta_reach_bound),
    simulated: signed(t.delta_simulated_reach),
    users: signed(t.delta_users),
    downtime: signed(t.delta_critical_downtime_min, " min"),
    roles: t.added_roles.length ? `adds ${t.added_roles.join(", ").replaceAll("_", " ")}` : "—",
  };
  return (
    <Panel title="Policy comparison" chip={<StatusChip kind="simulated" />}>
      <p className="evidence-text" style={{ marginTop: 0, color: "var(--text-secondary)" }}>
        SafeCut solved under each policy; EchoLab simulated each plan ({c.outcomes[0]?.simulated_reach?.denominator?.toLocaleString("en-GB") ?? "—"} rollouts, seed {c.meta.seed}). The trade-off column is the difference between them. Nothing here is executed.
      </p>
      <table className="evidence-text" style={{ width: "100%", borderCollapse: "collapse" }} aria-label="Policy comparison">
        <thead>
          <tr className="label">
            <th scope="col" style={{ textAlign: "left" }} />
            {c.outcomes.map((o) => (
              <th key={o.profile.id} scope="col" style={{ textAlign: "left" }}>
                {o.profile.title}
              </th>
            ))}
            <th scope="col" style={{ textAlign: "left" }}>Trade-off</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([key, label]) => (
            <tr key={key} style={{ borderTop: "var(--border-hairline) solid var(--line)" }}>
              <th scope="row" style={{ textAlign: "left", padding: "var(--space-2) var(--space-3) var(--space-2) 0" }}>
                {label}
              </th>
              {c.outcomes.map((o) => (
                <td key={o.profile.id} style={{ paddingRight: "var(--space-3)" }}>
                  {cell(o, key)}
                </td>
              ))}
              <td>{key === "status" ? "" : delta[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="label" style={{ marginTop: "var(--space-4)" }}>Why the plans differ</p>
      <ul className="body" aria-label="Why the plans differ" style={{ paddingLeft: "var(--space-5)" }}>
        {t.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </Panel>
  );
}
