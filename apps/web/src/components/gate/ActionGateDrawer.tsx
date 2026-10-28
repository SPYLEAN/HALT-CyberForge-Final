"use client";

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
  const executeReason = !ops.proof
    ? "Disabled until ProofSeal has sealed the plan (IR-DATA-07)."
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
        <p className="body">No optimal plan to approve. {plan?.status === "infeasible" ? "This plan is blocked: see SafeCut for the closest options." : ""}</p>
      ) : (
        <>
          <p className="evidence-text" style={{ marginTop: 0 }}>
            {plan.display_actions.map((d) => `${d.id} ${d.title}`).join(" · ")}
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
          {ops.execution?.rollback_window_until && applied ? (
            <p className="evidence-text">Rollback window open until {utcTime(ops.execution.rollback_window_until)} or new telemetry.</p>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
