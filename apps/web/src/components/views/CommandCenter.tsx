"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ActionGateDrawer, OPERATOR_ID } from "@/components/gate/ActionGateDrawer";
import { Skeleton, Toast } from "@/components/halt";
import { CommandCenterShell } from "@/components/shell/CommandCenterShell";
import { useOps } from "@/lib/api/ops";
import { useIncident, VIEWS, type ViewId } from "@/lib/state/incident-store";

import { EchoLabView } from "./EchoLabView";
import { evidenceFor, ExplainButton } from "./evidence";
import { OverviewView } from "./OverviewView";
import { PoliciesView } from "./PoliciesView";
import { ProofSealView } from "./ProofSealView";
import { SafeCutView } from "./SafeCutView";
import { ThreadGraphView } from "./ThreadGraphView";
import { TimelineView } from "./TimelineView";

function Workspace() {
  const ops = useOps();
  const incident = useIncident();
  const { state, setView, seek } = incident;
  const params = useSearchParams();
  const router = useRouter();
  const [gateOpen, setGateOpen] = useState(false);
  const started = useRef(false);

  // URL -> store once: ?view= and ?t=, else the incident's persisted replay position, else the end of the replay.
  useEffect(() => {
    if (started.current || !ops.incident) return;
    started.current = true;
    const view = params.get("view");
    if (view && (VIEWS as readonly string[]).includes(view)) setView(view as ViewId);
    const t = Number(params.get("t"));
    const persisted = ops.incident.replay_cursor_s;
    seek(Number.isFinite(t) && params.has("t") ? Math.min(t, ops.incident.replay_end_s) : (persisted ?? ops.incident.replay_end_s));
  }, [ops.incident, params, seek, setView]);

  // store -> URL
  useEffect(() => {
    if (!started.current) return;
    const next = new URLSearchParams(params);
    next.set("view", state.view);
    if (next.toString() !== params.toString()) router.replace(`?${next.toString()}`, { scroll: false });
  }, [state.view, params, router]);

  const openGate = () => setGateOpen(true);
  const operator = ops.policySet?.approvers.find((a) => a.id === OPERATOR_ID);
  const views: Record<ViewId, React.ReactNode> = {
    overview: <OverviewView onOpenGate={openGate} />,
    graph: <ThreadGraphView />,
    echolab: <EchoLabView />,
    safecut: <SafeCutView onOpenGate={openGate} />,
    proofseal: <ProofSealView />,
    timeline: <TimelineView />,
    policies: <PoliciesView />,
  };

  const evidence = evidenceFor(state.selection, state, ops);
  if (state.selection) {
    evidence.push({ id: "explain", title: "Explanation", content: <ExplainButton key={state.selection} subject={state.selection} ops={ops} /> });
  }

  return (
    <CommandCenterShell
      t0={ops.incident?.t0 ?? new Date(0).toISOString()}
      end={ops.incident?.replay_end_s ?? 0}
      title={ops.incident?.title}
      apiStage={ops.incident?.state}
      actor={operator ? `${operator.name} (${operator.roles.join(", ").replaceAll("_", " ")})` : undefined}
      evidence={evidence}
    >
      {ops.error ? (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <Toast kind="caution" title={`Request failed${ops.error.status ? ` (${ops.error.status})` : ""}`} onDismiss={ops.clearError}>
            {ops.error.body?.message ?? "The HALT API could not be reached. Nothing shown here was invented to fill the gap."}
          </Toast>
        </div>
      ) : null}
      {ops.incident || ops.error ? views[state.view] : <Skeleton variant="graph" label="Connecting to the HALT API" />}
      <ActionGateDrawer open={gateOpen} onClose={() => setGateOpen(false)} />
    </CommandCenterShell>
  );
}

/** The Command Center for the incident held by the root layout providers. */
export function CommandCenter() {
  return <Workspace />;
}
