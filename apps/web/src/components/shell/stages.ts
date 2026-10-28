import type { ChipKind } from "@/components/halt";
import type { Stage } from "@/lib/state/incident-store";

export const STAGE_LABEL: Record<Stage, [string, ChipKind]> = {
  new: ["NEW INCIDENT", "pending"],
  correlating: ["CORRELATING", "observed"],
  forecast_ready: ["FORECAST READY", "forecast"],
  simulating: ["SIMULATING", "forecast"],
  plan_available: ["PLAN AVAILABLE", "pending"],
  approval_pending: ["APPROVAL PENDING", "pending"],
  executing: ["EXECUTING", "pending"],
  contained: ["CONTAINED", "success"],
  rollback_available: ["ROLLBACK AVAILABLE", "success"],
  rolled_back: ["ROLLED BACK", "neutral"],
  blocked_by_policy: ["BLOCKED BY POLICY", "caution"],
  no_safe_plan: ["NO SAFE PLAN", "caution"],
};
