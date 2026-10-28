"use client";

import { Button } from "@/components/halt";
import type { SecurityEvent } from "@/lib/api/types";
import { replayTime } from "@/lib/format";
import type { Speed } from "@/lib/state/incident-store";

export interface ReplayTimelineProps {
  t0: string;
  end: number;
  cursor: number;
  playing: boolean;
  speed: Speed;
  events: SecurityEvent[];
  onSeek: (t: number) => void;
  onPlay: (speed: Speed) => void;
  onPause: () => void;
}

const SPEEDS: Speed[] = [1, 4, 16];

/** Bottom bar: deterministic replay scrubber with a tick per observed event. */
export function ReplayTimeline({ t0, end, cursor, playing, speed, events, onSeek, onPlay, onPause }: ReplayTimelineProps) {
  const start = new Date(t0).getTime();
  const offsets = events.map((e) => ({ id: e.id, t: (new Date(e.ts).getTime() - start) / 1000 }));
  return (
    <footer className="cc-timeline" aria-label="Incident replay">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <Button variant="secondary" onClick={() => (playing ? onPause() : onPlay(speed))} trailing={playing ? "❚❚" : "→"}>
          {playing ? "PAUSE" : "PLAY"}
        </Button>
        <div role="group" aria-label="Replay speed" style={{ display: "flex", gap: "var(--space-1)" }}>
          {SPEEDS.map((s) => (
            <Button key={s} variant={s === speed ? "primary" : "ghost"} aria-pressed={s === speed} onClick={() => onPlay(s)}>
              {`${s}×`}
            </Button>
          ))}
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="range"
            min={0}
            max={end}
            step={1}
            value={Math.min(cursor, end)}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Replay position"
            aria-valuetext={replayTime(cursor)}
            style={{ width: "100%", minHeight: "var(--hit-target)", accentColor: "var(--text)" }}
          />
          <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 4, height: 8, pointerEvents: "none" }}>
            {offsets.map((o) => (
              <span
                key={o.id}
                title={o.id}
                style={{ position: "absolute", left: `${(o.t / end) * 100}%`, width: 6, height: 6, marginLeft: -3, background: "var(--text)" }}
              />
            ))}
          </div>
        </div>
        <span className="telemetry" style={{ minWidth: 72, textAlign: "right" }}>
          {replayTime(cursor)}
        </span>
      </div>
    </footer>
  );
}
