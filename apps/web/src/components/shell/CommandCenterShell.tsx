"use client";

import type { ReactNode } from "react";

import { useIncident } from "@/lib/state/incident-store";

import { AppRail } from "./AppRail";
import { EvidenceRail, type EvidenceSection } from "./EvidenceRail";
import { ReplayTimeline } from "./ReplayTimeline";
import { TopBar } from "./TopBar";

export interface CommandCenterShellProps {
  t0: string;
  end: number;
  title?: string;
  evidence: EvidenceSection[];
  children: ReactNode;
}

/** Rail · top bar · workspace · evidence rail · replay timeline, all driven by the shared incident store. */
export function CommandCenterShell({ t0, end, title, evidence, children }: CommandCenterShellProps) {
  const { state, seek, play, pause, setView } = useIncident();
  return (
    <div className="cc-shell">
      <AppRail active={state.view} onSelect={setView} />
      <TopBar incidentId={state.incidentId} title={title} stage={state.stage} simulated={state.simulated} />
      <main className="cc-main" id="workspace">
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
