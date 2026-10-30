"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SimulatedChip } from "@/components/shell/SimulatedChip";
import { api, unwrap } from "@/lib/api/client";
import { useOps } from "@/lib/api/ops";
import type { SecurityEvent } from "@/lib/api/types";
import { replayTime } from "@/lib/format";
import { useIncident } from "@/lib/state/incident-store";

import { HaltScene3D } from "./HaltScene3D";
import { useLandingAnalysis, useScrollCursor } from "./hooks";
import { CommandHandoff, ContextSection, EchoSection, HaltMoment, Hero, IncidentSection, Paradox, ProofSection, SafeCutSection } from "./sections";

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const { state } = useIncident();
  const ops = useOps();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  useLandingAnalysis();
  const scene = useScrollCursor(root, events.length);
  const end = ops.incident?.replay_end_s ?? 0;

  // The full event list sets the incident section's scroll stops; each event's details arrive through the replay.
  useEffect(() => {
    let live = true;
    api
      .GET("/api/v1/incidents/{incident_id}/events", { params: { path: { incident_id: state.incidentId } } })
      .then(unwrap)
      .then((r) => live && setEvents(r.items))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [state.incidentId]);

  return (
    <div className="landing" ref={root} data-scene-active={scene}>
      <div className="landing-scene">
        <HaltScene3D state={scene} />
      </div>
      <header className="landing-bar" aria-label="HALT">
        <Image src="/brand/halt-horizontal-bone.svg" alt="HALT" width={112} height={32} priority unoptimized />
        <span className="telemetry" data-testid="landing-cursor" aria-live="polite">
          {state.incidentId} · {replayTime(state.cursor)}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <SimulatedChip simulated={state.simulated} />
        </span>
        <Link className="halt-btn halt-btn-quiet" href={`/incidents/${state.incidentId}?view=overview&t=${Math.round(state.cursor)}`}>
          <span>COMMAND CENTER</span>
          <span aria-hidden>→</span>
        </Link>
      </header>
      <main className="landing-content">
        <Hero />
        <Paradox allEvents={events} />
        <IncidentSection allEvents={events} />
        <ContextSection end={end} />
        <EchoSection end={end} />
        <SafeCutSection end={end} />
        <HaltMoment end={end} />
        <ProofSection end={end} />
        <CommandHandoff end={end} />
      </main>
    </div>
  );
}
