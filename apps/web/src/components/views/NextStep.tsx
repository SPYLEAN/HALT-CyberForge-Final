"use client";

import { useOps } from "@/lib/api/ops";
import { useIncident } from "@/lib/state/incident-store";

import { RunButton } from "./common";

/** The one next action for the incident's current state. Each step calls the API; nothing is staged locally. */
export function NextStep({ onOpenGate }: { onOpenGate: () => void }) {
  const ops = useOps();
  const { state, setView } = useIncident();
  const stage = ops.incident?.state;
  const replayDone = ops.incident ? state.cursor >= ops.incident.replay_end_s : false;

  if (!ops.incident) return null;
  if (!ops.paths.length) {
    return (
      <RunButton
        primary
        label="CORRELATE WITH HALT-R1"
        onClick={ops.correlate}
        blockedBy={replayDone ? null : "Available once the replay has delivered every observed event."}
      />
    );
  }
  if (!ops.plan) return <RunButton primary label="DERIVE ENVELOPE WITH SAFECUT" onClick={() => ops.createPlan()} />;
  if (ops.plan.status === "infeasible") return <RunButton primary label="SEE CLOSEST OPTIONS" onClick={() => setView("safecut")} />;
  if (!ops.simulation) return <RunButton primary label="COMPARE FUTURES IN ECHOLAB" onClick={ops.simulate} />;
  if (!ops.proof) return <RunButton primary label="SEAL WITH PROOFSEAL" onClick={ops.seal} />;
  if (stage === "approval_pending" || stage === "contained" || stage === "rolled_back") {
    return <RunButton primary label={stage === "contained" ? "REVIEW ROLLBACK" : "OPEN ACTION GATE"} onClick={onOpenGate} />;
  }
  return null;
}
