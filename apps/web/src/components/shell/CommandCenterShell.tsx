"use client";

import type { ReactNode } from "react";

import { useIncident, type Stage } from "@/lib/state/incident-store";

import { AppRail } from "./AppRail";
import { EvidenceRail, type EvidenceSection } from "./EvidenceRail";
import { ReplayTimeline } from "./ReplayTimeline";
import { TopBar } from "./TopBar";

/** Stages the replay timeline can produce. Anything later is operator-driven and comes from the API. */
const REPLAY_STAGES: ReadonlySet<Stage> = new Set(["new", "correlating", "forecast_ready"]);

/** The replay stage until operators move the incident on; then the API's state wins. */
export function displayStage(replay: Stage | null, api: Stage | null | undefined): Stage | null {
  return api && !REPLAY_STAGES.has(api) ? api : replay;
}

export interface CommandCenterShellProps {
  t0: string;
  end: number;
  title?: string;
  /** Incident state from the API, when loaded. */
  apiStage?: Stage | null;
  evidence: EvidenceSection[];
  children: ReactNode;
}

/** Rail · top bar · workspace · evidence rail · replay timeline, all driven by the shared incident store. */
export function CommandCenterShell({ t0, end, title, apiStage, evidence, children }: CommandCenterShellProps) {
  const { state, seek, play, pause, setView } = useIncident();
  return (
    <div className="cc-shell">
      <AppRail active={state.view} onSelect={setView} />
      <TopBar incidentId={state.incidentId} title={title} stage={displayStage(state.stage, apiStage)} simulated={state.simulated} />
      {/* Focusable so keyboard users can scroll the workspace (axe scrollable-region-focusable). */}
      <main className="cc-main" id="workspace" tabIndex={0} aria-label="Workspace">
        {children}
      </main>
      <EvidenceRail sections={evidence} subject={state.selection} />
      <ReplayTimeline
        t0={t0}
        end={end}
        cursor={state.cursor}
        playing={state.playing}
        speed={state.speed}
        events={state.events}
        onSeek={seek}
        onPlay={play}
        onPause={pause}
      />
    </div>
  );
}
