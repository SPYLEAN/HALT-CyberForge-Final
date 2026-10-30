"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ActionGateDrawer, OPERATOR_ID } from "@/components/gate/ActionGateDrawer";
import { Skeleton, Toast } from "@/components/halt";
import { CommandShell, type Mode } from "@/components/v2/shell/CommandShell";
import { EchoLabV2 } from "@/components/v2/views/EchoLabV2";
import { GraphV2 } from "@/components/v2/views/GraphV2";
import { OverviewV2 } from "@/components/v2/views/OverviewV2";
import { PolicyLabV2 } from "@/components/v2/views/PolicyLabV2";
import { ProofSealV2 } from "@/components/v2/views/ProofSealV2";
import { ReportV2 } from "@/components/v2/views/ReportV2";
import { SafeCutV2 } from "@/components/v2/views/SafeCutV2";
import { TimelineV2 } from "@/components/v2/views/TimelineV2";
import { Unavailable } from "@/components/v2/views/parts";
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
  // Command (default) or Forensic: kept in the URL so a reload or a shared link keeps it.
  const mode: Mode = params.get("mode") === "forensic" ? "forensic" : "command";

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

  const setMode = (m: Mode) => {
    const next = new URLSearchParams(params);
    if (m === "forensic") next.set("mode", "forensic");
    else next.delete("mode");
    next.set("view", state.view);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const openGate = () => setGateOpen(true);
  const operator = ops.policySet?.approvers.find((a) => a.id === OPERATOR_ID);
  // Command mode: the v2 screens. Forensic mode: the dense technical views (tables, raw solver output).
  const command: Record<ViewId, React.ReactNode> = {
    overview: <OverviewV2 onOpenGate={openGate} />,
    graph: <GraphV2 />,
    echolab: <EchoLabV2 />,
    safecut: <SafeCutV2 onOpenGate={openGate} />,
    proofseal: <ProofSealV2 />,
    timeline: <TimelineV2 />,
    policies: <PolicyLabV2 />,
    report: <ReportV2 />,
  };
  const forensic: Record<ViewId, React.ReactNode> = {
    overview: <OverviewView onOpenGate={openGate} />,
    graph: <ThreadGraphView />,
    echolab: <EchoLabView />,
    safecut: <SafeCutView onOpenGate={openGate} />,
    proofseal: <ProofSealView />,
    timeline: <TimelineView />,
    policies: <PoliciesView />,
    report: <ReportV2 />,
  };

  const evidence = evidenceFor(state.selection, state, ops);
  if (state.selection) {
    evidence.push({ id: "explain", title: "Explanation", content: <ExplainButton key={state.selection} subject={state.selection} ops={ops} /> });
  }

  return (
    <CommandShell
      view={state.view}
      onView={setView}
      mode={mode}
      onMode={setMode}
      actor={operator ? `${operator.name} (${operator.roles.join(", ").replaceAll("_", " ")})` : undefined}
      evidence={evidence}
      subject={state.selection}
    >
      {ops.error && !ops.incident ? (
        <Unavailable status={ops.error.status || undefined} message={ops.error.body?.message} />
      ) : ops.error ? (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <Toast kind="caution" title={`Request failed${ops.error.status ? ` (${ops.error.status})` : ""}`} onDismiss={ops.clearError}>
            {ops.error.body?.message ?? "The HALT API could not be reached. Nothing shown here was invented to fill the gap."}
          </Toast>
        </div>
      ) : null}
      {ops.incident ? (mode === "forensic" ? forensic : command)[state.view] : ops.error ? null : <Skeleton variant="graph" label="Connecting to the HALT API" />}
      <ActionGateDrawer open={gateOpen} onClose={() => setGateOpen(false)} />
    </CommandShell>
  );
}

/** The Command Center for the incident held by the root layout providers. */
export function CommandCenter() {
  return <Workspace />;
}
