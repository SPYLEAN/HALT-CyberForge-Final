"use client";

import Link from "next/link";

import { ApprovalControl, Button, Drawer, StatusChip } from "@/components/halt";
import { useOps } from "@/lib/api/ops";
import type { Approver, Policy, ResponseAction } from "@/lib/api/types";
import { utcTime } from "@/lib/format";

/** The operator executing the plan in the demo (a tier-2 analyst persona). Not authentication. */
export const OPERATOR_ID = "a_rahman";

interface RoleRequirement {
  role: string;
  policy: Policy;
  approver: Approver | undefined;
  actions: ResponseAction[];
}

/** Each role the plan's actions demand, the policy that demands it, and who can give it (all API data). */
export function roleRequirements(actions: ResponseAction[], policies: Policy[], approvers: Approver[]): RoleRequirement[] {
  const byRole = new Map<string, RoleRequirement>();
  for (const a of actions) {
    for (const role of a.authorisation.required_roles) {
      const policy = policies.find(
        (p) => a.authorisation.policy_ids.includes(p.id) && (p.required_roles.includes(role) || p.window?.exception_role === role),
      );
      if (!policy) continue;
      const entry = byRole.get(role) ?? { role, policy, approver: approvers.find((ap) => ap.roles.includes(role)), actions: [] };
      entry.actions.push(a);
      byRole.set(role, entry);
    }
  }
  return [...byRole.values()];
}

export function ActionGateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ops = useOps();
  const plan = ops.plan;
  if (!open) return null;

  const selected = plan ? ops.actions.filter((a) => plan.selected_candidate_ids.includes(a.id)) : [];
  const reqs = roleRequirements(selected, ops.policySet?.policies ?? [], ops.policySet?.approvers ?? []);
  const decision = (approverId: string | undefined) =>
    [...ops.approvals].reverse().find((a) => a.approver_id === approverId);
  const outstanding = ops.outstandingRoles ?? reqs.map((r) => r.role);
  const proofOk = ops.proof?.claims.every((c) => c.status === "verified") ?? false;
  const applied = ops.execution?.state === "applied";
  const sealRule = ops.policySet?.constraints.find((c) => c.id === "C-EVIDENCE");
  const alternates = (ops.policySet?.profiles ?? []).filter((p) => p.id !== plan?.profile_id);
  const alternateReason = applied ? "The plan is applied to the simulated environment: roll back before re-solving." : ops.busy ? `Waiting for ${ops.busy} to finish.` : null;
  const alternateButton = (p: (typeof alternates)[number]) => {
    const label = `REQUEST ALTERNATE PLAN · ${p.title.toUpperCase()}`;
    return alternateReason ? (
      <Button key={p.id} variant="secondary" disabled reason={alternateReason} block>
        {label}
      </Button>
    ) : (
      <Button key={p.id} variant="secondary" onClick={() => ops.createPlan(p.id)} block>
        {label}
      </Button>
    );
  };
  const executeReason = !ops.proof
    ? `Disabled until ProofSeal has sealed the plan${sealRule ? ` (${sealRule.id} · ${sealRule.label})` : ""}.`
    : !proofOk
      ? "Disabled: a ProofSeal claim failed."
      : outstanding.length
        ? `Disabled until approvals are recorded: ${outstanding.join(", ")}.`
        : ops.busy
          ? `Waiting for ${ops.busy} to finish.`
          : null;

  return (
    <Drawer
      title="Approve, execute, and keep the way back open"
      kicker="Action Gate"
      onClose={onClose}
      footer={
        applied ? (
          <Button variant="secondary" onClick={() => ops.rollback(OPERATOR_ID)} trailing="↺" block>
            ROLL BACK ALL
          </Button>
        ) : ops.execution?.state === "rolled" ? (
          <StatusChip kind="neutral">ROLLED BACK · SNAPSHOT RESTORED</StatusChip>
        ) : executeReason ? (
          <Button variant="primary" disabled reason={executeReason} block trailing="→">
            {`EXECUTE ${plan?.display_actions.length ?? 0} ACTIONS`}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => ops.execute(OPERATOR_ID)} block trailing="→">
            {`EXECUTE ${plan?.display_actions.length ?? 0} ACTIONS`}
          </Button>
        )
      }
    >
      {!plan || plan.status !== "optimal" ? (
        <>
          <p className="body">No optimal plan to approve. {plan?.status === "infeasible" ? "This plan is blocked: see SafeCut for the closest options." : ""}</p>
          {plan ? alternates.map(alternateButton) : null}
        </>
      ) : (
        <>
          <p className="evidence-text" style={{ marginTop: 0 }}>
            {plan.display_actions.map((d) => `${d.id} ${d.title}`).join(" · ")}
          </p>
          <p className="evidence-text" style={{ color: "var(--text-secondary)" }}>
            Execution runs against HALT&apos;s simulated environment only. No real account, session or application is changed.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {reqs.map((r) => {
              const d = decision(r.approver?.id);
              const state = d?.decision === "approved" ? "approved" : d?.decision === "declined" ? "held" : "pending";
              return (
                <ApprovalControl
                  key={r.role}
                  name={r.approver?.name ?? "No approver holds this role"}
                  role={r.role.replaceAll("_", " ")}
                  short={r.role.replaceAll("_", " ")}
                  policy={r.policy.id}
                  authorises={r.actions.map((a) => a.id).join(", ")}
                  impact={r.actions.map((a) => a.impact.description).join(" ")}
                  reversibility={r.actions.map((a) => `${a.reversibility.rollback_id} · ${a.reversibility.seconds} s`).join(", ")}
                  authorisation={`${r.policy.id} · ${r.policy.title}`}
                  state={state}
                  at={d ? utcTime(d.at) : undefined}
                  disabled={!r.approver?.available || applied || Boolean(ops.busy)}
                  onApprove={() => r.approver && ops.approve(r.approver.id, r.policy.id)}
                  onDecline={() => r.approver && ops.approve(r.approver.id, r.policy.id, "declined")}
                />
              );
            })}
          </div>
          {ops.execution ? (
            <ol aria-label="Execution steps" className="telemetry" style={{ marginTop: "var(--space-4)", paddingLeft: "var(--space-5)" }}>
              {ops.execution.steps.map((s) => (
                <li key={s.candidate_id}>
                  {s.display_action_id} · {s.candidate_id} · {s.status.replaceAll("_", " ")} · snapshot {s.post_snapshot_hash?.slice(0, 12)}
                </li>
              ))}
            </ol>
          ) : null}
          <div role="group" aria-label="Other decisions" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
            {ops.incident ? (
              <Link className="halt-btn halt-btn-ghost" href={`/incidents/${ops.incident.id}?view=proofseal`} onClick={onClose}>
                <span>INSPECT THE EVIDENCE</span>
                <span aria-hidden>→</span>
              </Link>
            ) : null}
            {alternates.map(alternateButton)}
            {alternates.length ? (
              <p className="evidence-text" style={{ color: "var(--text-secondary)", margin: 0 }}>
                SafeCut re-solves the same incident under the other policy. A new plan needs its own ProofSeal and approvals.
              </p>
            ) : null}
          </div>
          {ops.execution?.rollback_window_until && applied ? (
            <p className="evidence-text">Rollback window open until {utcTime(ops.execution.rollback_window_until)} or new telemetry.</p>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
