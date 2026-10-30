// Pure presentation of API state (docs/DESIGN_IMPLEMENTATION_MAP.md). Nothing here computes a security result:
// every number is read from an API field, and every sentence names the field it rests on.
import type { OpsApi } from "@/lib/api/ops";
import type { AttackPath, GraphNode } from "@/lib/api/types";
import type { IncidentState } from "@/lib/state/incident-store";

import type { ApertureState } from "./motifs";

export interface Service {
  id: string;
  label: string;
  down: boolean; // broken by the current plan's cuts (Plan.constraints[C-DOWNTIME].derivation.source_ids)
}

/** Critical business processes from the graph, and whether the current plan stops any of them. */
export function criticalServices(nodes: Record<string, GraphNode>, ops: OpsApi): Service[] {
  const downtime = ops.plan?.constraints.find((c) => c.constraint_id === "C-DOWNTIME");
  const down = new Set(downtime?.derivation.source_ids ?? []);
  return Object.values(nodes)
    .filter((n) => n.kind === "process" && n.criticality === "critical")
    .map((n) => ({ id: n.id, label: n.label, down: down.has(n.id) }));
}

/** The aperture's state, from the plan, the proof and the simulated execution; never chosen by a view. */
export function apertureOf(ops: OpsApi): ApertureState {
  const plan = ops.plan;
  if (!plan) return "idle";
  if (plan.status === "infeasible") return "none";
  if (ops.execution?.state === "applied") return "applied";
  return ops.proof ? "sealed" : "proposed";
}

export function policyTitle(ops: OpsApi): string | null {
  const id = ops.plan?.profile_id;
  return id ? (ops.policySet?.profiles.find((p) => p.id === id)?.title ?? id) : null;
}

export function targetLabel(nodes: Record<string, GraphNode>, paths: AttackPath[]): string {
  const id = paths[0]?.target_id;
  return id ? (nodes[id]?.label ?? id) : "the protected asset";
}

export type StageStatus = "done" | "active" | "pending";
export interface Stage {
  n: number;
  label: string;
  status: StageStatus;
  detail: string | null;
  short?: string; // compact label for the stage track
  t?: number; // replay seconds, for replay stages
}

/**
 * The ten stages of the incident (DESIGN_IMPLEMENTATION_MAP "Stage track"): six replayed events, then the four
 * analysis milestones, each read from the API.
 */
export function stages(replay: IncidentState, ops: OpsApi, allEvents: { id: string; ts: string; kind: string }[]): Stage[] {
  const arrived = new Set(replay.events.map((e) => e.id));
  const t0 = allEvents[0] ? new Date(allEvents[0].ts).getTime() : 0;
  const events: Stage[] = allEvents.map((e, i) => ({
    n: i + 1,
    label: EVENT_LABELS[e.kind] ?? e.kind.replaceAll("_", " "),
    status: arrived.has(e.id) ? "done" : "pending",
    detail: e.id,
    t: (new Date(e.ts).getTime() - t0) / 1000,
  }));
  const verified = ops.proof ? ops.proof.claims.filter((c) => c.status === "verified").length : 0;
  const analysis: Stage[] = [
    { n: events.length + 1, label: "EchoLab simulation", short: "EchoLab", status: ops.simulation ? "done" : "pending", detail: ops.simulation?.id ?? null },
    {
      n: events.length + 2,
      label: ops.plan?.status === "infeasible" ? "SafeCut: no safe plan" : "SafeCut ready",
      short: "SafeCut",
      status: ops.plan ? "done" : "pending",
      detail: ops.plan?.id ?? null,
    },
    {
      n: events.length + 3,
      label: "ProofSeal verified",
      short: "ProofSeal",
      status: ops.proof && verified === ops.proof.claims.length ? "done" : "pending",
      detail: ops.proof ? `${verified} of ${ops.proof.claims.length} claims` : null,
    },
    {
      n: events.length + 4,
      label: ops.execution?.state === "applied" ? "Response applied (simulated)" : "Response approved",
      short: ops.execution?.state === "applied" ? "Applied" : "Approved",
      status: ops.proof && ops.outstandingRoles !== null && ops.outstandingRoles.length === 0 ? "done" : "pending",
      detail: ops.outstandingRoles?.length ? `waiting on ${ops.outstandingRoles.join(", ").replaceAll("_", " ")}` : null,
    },
  ];
  const all = [...events, ...analysis];
  const firstPending = all.findIndex((s) => s.status === "pending");
  if (firstPending >= 0) all[firstPending] = { ...all[firstPending]!, status: "active" };
  return all;
}

/** Human names for the scenario's event kinds (the kinds are a contract enum; the words are presentation). */
export const EVENT_LABELS: Record<string, string> = {
  mail_delivered: "Phishing delivered",
  sign_in: "Suspicious authentication",
  mfa_method_added: "MFA modified",
  oauth_consent: "OAuth consent granted",
  token_replay: "Token replay",
  resource_access: "Finance discovery",
};

export interface Decision {
  kicker: string;
  headline: string;
  statement: string;
  tone: "neutral" | "threat" | "continuity";
}

/** The one sentence a commander needs, from the incident's API state. */
export function decision(replay: IncidentState, ops: OpsApi): Decision {
  const nodes = replay.nodes;
  const high = ops.paths.filter((p) => p.high_risk);
  const target = targetLabel(nodes, ops.paths);
  const services = criticalServices(nodes, ops);
  const policy = policyTitle(ops);
  const plan = ops.plan;
  const residual = plan?.status === "optimal" ? plan.residual : null;
  const open = residual?.open_path_ids ?? [];
  const names = services.map((s) => s.label).join(", ");

  if (ops.execution?.state === "applied") {
    return {
      kicker: "Contained · simulated execution",
      headline: `HALT interrupted every required route while preserving ${names || "critical operations"}.`,
      statement: `${plan?.display_actions.length ?? 0} reversible actions are applied to the simulated environment. ${services.filter((s) => !s.down).length} of ${services.length} critical services keep running${open.length ? `; ${open.join(", ")} stays open as accepted residual risk under ${policy}` : ""}. Rollback stays available.`,
      tone: "continuity",
    };
  }
  if (ops.execution?.state === "rolled") {
    return { kicker: "Rolled back", headline: "The simulated environment is back to its pre-response snapshot.", statement: "Every action was reversed and the snapshot hash matches the original.", tone: "neutral" };
  }
  if (plan?.status === "infeasible") {
    return {
      kicker: `No safe plan · ${policy}`,
      headline: `No response satisfies every rule of ${policy}.`,
      statement: `Relaxing ${plan.infeasibility?.violated_constraint_ids.join(", ")} would restore a plan. HALT will not run a partial plan without an analyst decision: compare the policies, or review the closest options.`,
      tone: "threat",
    };
  }
  if (plan?.status === "optimal") {
    return {
      kicker: ops.proof ? "Sealed · awaiting approval" : "Plan ready · not yet sealed",
      headline: "HALT has calculated a safer response.",
      statement: `${plan.display_actions.length} reversible actions interrupt the ${residual?.required_path_ids.length ?? high.length} paths ${policy} requires cut while ${names || "critical services"} keep running.${
        open.length ? ` ${open.join(", ")} stays open: ${residual?.reach_bound.numerator?.toLocaleString("en-GB")} of ${residual?.reach_bound.denominator?.toLocaleString("en-GB")} simulated rollouts, within the policy's allowance. Not zero risk.` : ""
      }`,
      tone: "continuity",
    };
  }
  if (high.length) {
    return {
      kicker: "Forecast ready",
      headline: `${high.length} high-risk paths reach ${target}.`,
      statement: `${ops.paths.length} enumerated paths in all, ranked by EchoLab over the incident's simulated rollouts. HALT can now calculate the smallest response that cuts them without stopping ${names || "the business"}.`,
      tone: "threat",
    };
  }
  const seen = replay.events.length;
  return {
    kicker: replay.stage === "correlating" ? "Correlating" : "Incident open",
    headline: seen ? `${seen} observed events, one attacker.` : "Waiting for telemetry.",
    statement: seen
      ? "Every event has a source record. Correlate them with HALT-R1 to see who can reach the ledger."
      : "The replay delivers each event as it happened; nothing is shown before its evidence arrives.",
    tone: "neutral",
  };
}

/** What kind of knowledge a ProofSeal claim rests on (claim ids are contract-defined; see proofseal/checks.py). */
export const CLAIM_BASIS: Record<string, { label: string; basis: "observed" | "calculated" | "simulated" | "approved" }> = {
  "CHK-06": { label: "Evidence provenance", basis: "observed" },
  "CHK-01": { label: "Required paths interrupted", basis: "calculated" },
  "CHK-10": { label: "Residual risk within policy", basis: "simulated" },
  "CHK-02": { label: "Business dependencies intact", basis: "calculated" },
  "CHK-03": { label: "Critical downtime", basis: "calculated" },
  "CHK-04": { label: "Users affected", basis: "calculated" },
  "CHK-05": { label: "Authorisation", basis: "approved" },
  "CHK-07": { label: "Reversibility and rollback", basis: "simulated" },
  "CHK-08": { label: "Minimum disruption (optimality)", basis: "calculated" },
  "CHK-09": { label: "No redundant action", basis: "calculated" },
};

/** The proof chain's reading order: provenance first, then what was cut, what survived, who approves, how to undo. */
export const CLAIM_ORDER = ["CHK-06", "CHK-01", "CHK-10", "CHK-02", "CHK-03", "CHK-04", "CHK-05", "CHK-07", "CHK-08", "CHK-09"];
