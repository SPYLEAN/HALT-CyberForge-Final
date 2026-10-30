"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useIncident } from "@/lib/state/incident-store";

import { api, ApiFailure, unwrap } from "./client";
import type {
  Approval,
  AttackPath,
  AuditEntry,
  Execution,
  Finding,
  Incident,
  Plan,
  Proof,
  ResponseAction,
  SimulationRun,
} from "./types";
import type { components } from "./schema";

type PolicySet = components["schemas"]["PolicySet"];
type VariantList = components["schemas"]["VariantList"];
export type PolicyComparison = components["schemas"]["PolicyComparison"];
export type ProfileId = components["schemas"]["PolicyProfile"]["id"];
type ProofVerify = components["schemas"]["ProofVerify"];
type ExplainResult = components["schemas"]["ExplainResult"];

/**
 * Operator data for the Command Center. Every value is an API response; nothing is computed or
 * defaulted client-side, and a failed call leaves the previous state and surfaces the error.
 */
export interface OpsState {
  incident: Incident | null;
  policySet: PolicySet | null;
  variants: VariantList | null;
  actions: ResponseAction[];
  findings: Finding[];
  paths: AttackPath[];
  /** SafeCut under every policy profile, each simulated by EchoLab, and the trade-off (read-only). */
  comparison: PolicyComparison | null;
  plan: Plan | null;
  simulation: SimulationRun | null;
  proof: Proof | null;
  verification: ProofVerify | null;
  approvals: Approval[];
  outstandingRoles: string[] | null;
  execution: Execution | null;
  audit: AuditEntry[];
  busy: string | null;
  error: ApiFailure | null;
}

export interface OpsApi extends OpsState {
  refresh: () => Promise<void>;
  correlate: () => Promise<void>;
  createPlan: (profileId?: ProfileId) => Promise<void>;
  simulate: () => Promise<void>;
  seal: () => Promise<void>;
  verify: () => Promise<void>;
  approve: (approverId: string, policyId: string, decision?: "approved" | "declined") => Promise<void>;
  execute: (actor: string) => Promise<void>;
  rollback: (actor: string) => Promise<void>;
  reset: (variant: string) => Promise<void>;
  explain: (subjectId: string) => Promise<ExplainResult | null>;
  clearError: () => void;
}

const EMPTY: OpsState = {
  incident: null,
  policySet: null,
  variants: null,
  actions: [],
  findings: [],
  paths: [],
  comparison: null,
  plan: null,
  simulation: null,
  proof: null,
  verification: null,
  approvals: [],
  outstandingRoles: null,
  execution: null,
  audit: [],
  busy: null,
  error: null,
};

const OpsContext = createContext<OpsApi | null>(null);

export function OpsProvider({ incidentId, children }: { incidentId: string; children: ReactNode }) {
  const [state, setState] = useState<OpsState>(EMPTY);
  const { dispatch, state: replay } = useIncident();
  const path = useMemo(() => ({ params: { path: { incident_id: incidentId } } }), [incidentId]);

  const patch = useCallback((update: Partial<OpsState>) => setState((s) => ({ ...s, ...update })), []);

  const run = useCallback(
    async (label: string, work: () => Promise<Partial<OpsState>>) => {
      patch({ busy: label, error: null });
      try {
        const update = await work();
        setState((s) => ({ ...s, ...update, busy: null }));
      } catch (error) {
        patch({ busy: null, error: error instanceof ApiFailure ? error : new ApiFailure(0, undefined) });
      }
    },
    [patch],
  );

  const loadAudit = useCallback(async () => unwrap(await api.GET("/api/v1/incidents/{incident_id}/audit", path)).items, [path]);

  const fetchBase = useCallback(async (): Promise<Partial<OpsState>> => {
    const [incident, policySet, actions, variants] = await Promise.all([
      api.GET("/api/v1/incidents/{incident_id}", path).then(unwrap),
      api.GET("/api/v1/incidents/{incident_id}/policies", path).then(unwrap),
      api.GET("/api/v1/incidents/{incident_id}/actions", path).then(unwrap),
      api.GET("/api/v1/incidents/{incident_id}/variants", path).then(unwrap),
    ]);
    dispatch({ type: "simulated", value: incident.meta.simulated });
    // Rehydrate whatever the incident already has, so a reload or a hand-off resumes the same state.
    const { latest } = incident;
    const correlated = !["new", "correlating"].includes(incident.state);
    const [findings, paths, plan, simulation, proof, execution, audit] = await Promise.all([
      api.GET("/api/v1/incidents/{incident_id}/findings", path).then(unwrap),
      correlated ? api.GET("/api/v1/incidents/{incident_id}/paths", path).then(unwrap) : null,
      latest.plan_id ? api.GET("/api/v1/plans/{plan_id}", { params: { path: { plan_id: latest.plan_id } } }).then(unwrap) : null,
      latest.simulation_id ? api.GET("/api/v1/simulations/{sim_id}", { params: { path: { sim_id: latest.simulation_id } } }).then(unwrap) : null,
      latest.proof_id ? api.GET("/api/v1/proofs/{proof_id}", { params: { path: { proof_id: latest.proof_id } } }).then(unwrap) : null,
      latest.execution_id
        ? api.GET("/api/v1/executions/{execution_id}", { params: { path: { execution_id: latest.execution_id } } }).then(unwrap)
        : null,
      loadAudit(),
    ]);
    const approvals = latest.plan_id
      ? unwrap(await api.GET("/api/v1/plans/{plan_id}/approvals", { params: { path: { plan_id: latest.plan_id } } }))
      : null;
    return {
      approvals: approvals?.items ?? [],
      outstandingRoles: approvals?.outstanding_roles ?? null,
      incident,
      policySet,
      variants,
      actions: actions.items,
      findings: findings.items,
      paths: paths?.items ?? [],
      plan,
      simulation,
      proof,
      execution: execution?.execution ?? null,
      audit,
    };
  }, [path, dispatch, loadAudit]);

  const refresh = useCallback(() => run("loading", fetchBase), [run, fetchBase]);

  // Initial load: state is only set once the responses arrive.
  useEffect(() => {
    let live = true;
    fetchBase().then(
      (update) => live && setState((s) => ({ ...s, ...update })),
      (error: unknown) => live && setState((s) => ({ ...s, error: error instanceof ApiFailure ? error : new ApiFailure(0, undefined) })),
    );
    return () => {
      live = false;
    };
  }, [fetchBase]);

  // The replay socket came back after a drop (an API restart, a database outage): the API may have restored or
  // rebuilt the incident, so reload what this page shows instead of trusting what it held before.
  useEffect(() => {
    if (replay.reconnects === 0) return;
    let live = true;
    fetchBase().then(
      (update) => live && setState((s) => ({ ...s, ...update, error: null })),
      (error: unknown) => live && setState((s) => ({ ...s, error: error instanceof ApiFailure ? error : new ApiFailure(0, undefined) })),
    );
    return () => {
      live = false;
    };
  }, [replay.reconnects, fetchBase]);

  // The policy comparison solves and simulates every profile: load it on its own once paths exist, so it never
  // holds back the incident itself. A failure leaves it absent (the SafeCut view simply omits the panel).
  const needsComparison = state.paths.length > 0 && state.comparison === null;
  useEffect(() => {
    if (!needsComparison) return;
    let live = true;
    api
      .GET("/api/v1/incidents/{incident_id}/policy-comparison", path)
      .then(unwrap)
      .then(
        (comparison) => live && setState((s) => ({ ...s, comparison })),
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [needsComparison, path]);

  const incidentNow = useCallback(async () => unwrap(await api.GET("/api/v1/incidents/{incident_id}", path)), [path]);

  const value = useMemo<OpsApi>(() => {
    const planId = state.plan?.id;
    const planPath = { params: { path: { plan_id: planId ?? "" } } };
    return {
      ...state,
      refresh,
      clearError: () => patch({ error: null }),
      correlate: () =>
        run("correlating", async () => {
          const findings = unwrap(await api.POST("/api/v1/incidents/{incident_id}/correlate", { ...path, body: {} }));
          const paths = unwrap(await api.GET("/api/v1/incidents/{incident_id}/paths", path));
          return { findings: findings.items, paths: paths.items, comparison: null, incident: await incidentNow(), audit: await loadAudit() };
        }),
      createPlan: (profileId) =>
        run("planning", async () => {
          // A different profile is a different set of constraint limits: SafeCut solves again from scratch.
          const plan = unwrap(
            await api.POST("/api/v1/incidents/{incident_id}/plans", { ...path, body: profileId ? { profile_id: profileId } : {} }),
          );
          return {
            plan, simulation: null, proof: null, verification: null, approvals: [], outstandingRoles: null, execution: null,
            incident: await incidentNow(), audit: await loadAudit(),
          };
        }),
      simulate: () =>
        run("simulating", async () => {
          const plans: components["schemas"]["PlanRef"][] = [
            { label: "A", source: "preset_aggressive", plan_id: null },
            { label: "B", source: "preset_passive", plan_id: null },
          ];
          if (state.plan?.status === "optimal") plans.push({ label: "C", source: "plan", plan_id: state.plan.id });
          const incident = state.incident ?? (await incidentNow());
          // The run uses the incident's own parameters, so the UI can never drift from the engine's defaults.
          const { rollouts, horizon_s, seed } = incident.params;
          const simulation = unwrap(
            await api.POST("/api/v1/incidents/{incident_id}/simulations", { ...path, body: { plans, rollouts, horizon_s, seed } }),
          );
          return { simulation, audit: await loadAudit() };
        }),
      seal: () =>
        run("sealing", async () => {
          const proof = unwrap(await api.POST("/api/v1/plans/{plan_id}/proof", planPath));
          return { proof, verification: null, incident: await incidentNow(), audit: await loadAudit() };
        }),
      verify: () =>
        run("verifying", async () => {
          if (!state.proof) return {};
          const verification = unwrap(await api.POST("/api/v1/proofs/{proof_id}/verify", { params: { path: { proof_id: state.proof.id } } }));
          return { verification };
        }),
      approve: (approverId, policyId, decision = "approved") =>
        run("approving", async () => {
          const result = unwrap(
            await api.POST("/api/v1/plans/{plan_id}/approvals", {
              ...planPath,
              params: { ...planPath.params, header: { "X-Halt-Actor": approverId } },
              body: { policy_id: policyId, approver_id: approverId, decision, note: null },
            }),
          );
          return { approvals: [...state.approvals, result.approval], outstandingRoles: result.outstanding_roles, audit: await loadAudit() };
        }),
      execute: (actor) =>
        run("executing", async () => {
          if (!state.proof) return {};
          const result = unwrap(
            await api.POST("/api/v1/plans/{plan_id}/execute", {
              ...planPath,
              params: { ...planPath.params, header: { "X-Halt-Actor": actor } },
              body: { proof_id: state.proof.id },
            }),
          );
          return { execution: result.execution, incident: await incidentNow(), audit: await loadAudit() };
        }),
      rollback: (actor) =>
        run("rolling back", async () => {
          if (!state.execution) return {};
          const result = unwrap(
            await api.POST("/api/v1/executions/{execution_id}/rollback", {
              params: { path: { execution_id: state.execution.id }, header: { "X-Halt-Actor": actor } },
            }),
          );
          return { execution: result.execution, incident: await incidentNow(), audit: await loadAudit() };
        }),
      reset: (variant) =>
        run("resetting", async () => {
          unwrap(await api.POST("/api/v1/incidents/{incident_id}/replay/reset", { ...path, body: { variant } }));
          // A variant can change policies, approvers, actions and constraints: reload everything, keep nothing.
          return { ...EMPTY, ...(await fetchBase()) };
        }),
      explain: async (subjectId) => {
        try {
          return unwrap(await api.POST("/api/v1/incidents/{incident_id}/explain", { ...path, body: { subject_id: subjectId } }));
        } catch {
          return null;
        }
      },
    };
  }, [state, path, refresh, run, patch, incidentNow, loadAudit, fetchBase]);

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}

export function useOps(): OpsApi {
  const ctx = useContext(OpsContext);
  if (!ctx) throw new Error("useOps must be used inside <OpsProvider>");
  return ctx;
}
