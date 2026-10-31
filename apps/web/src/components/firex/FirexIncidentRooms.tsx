"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { firex, type IncidentSummary } from "@/lib/firex/api";
import { presentTitle } from "@/lib/firex/wording";
import { classify } from "@/lib/ps2/api";
import { ps2Vars } from "@/styles/ps2-palette";

import s from "./firex.module.css";
import { StatusBadge } from "./Verdict";

interface Room {
  run_id: string;
  dataset_id: string;
  headline: string;
  state: string;
  incidents: IncidentSummary[];
}

/** Every incident reconstructed from analysed logs, grouped by the run it came from. */
export function FirexIncidentRooms() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const runs = (await firex.runs()).filter((r) => r.status === "completed" && !r.byte_range?.[1]);
      const found = await Promise.all(
        runs.map(async (r) => {
          const [health, list] = await Promise.all([firex.health(r.run_id), firex.incidents(r.run_id)]);
          return { run_id: r.run_id, dataset_id: r.dataset_id, headline: health.headline, state: health.state, incidents: list.items };
        }),
      );
      if (live) setRooms(found);
    })().catch((e: unknown) => live && setFailure(classify(e).message));
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className={s.root} style={ps2Vars} data-testid="firex-rooms">
      <header>
        <h1 className={s.title}>Incident Rooms</h1>
        <p className={s.lede}>Incidents reconstructed from analysed logs. Every one is a hypothesis until an analyst confirms it.</p>
      </header>
      {failure ? (
        <p className={s.alert} role="alert">
          The analysis service could not be reached: {failure}
        </p>
      ) : !rooms ? (
        <p role="status">Loading incidents…</p>
      ) : !rooms.length ? (
        <p className={s.notice}>
          No log has been analysed yet. <Link href="/firex">Add data in Log Analysis</Link>.
        </p>
      ) : (
        rooms.map((room) => (
          <section key={room.run_id} className={s.section} aria-label={room.dataset_id}>
            <div className={s.actions} style={{ justifyContent: "space-between" }}>
              <h2 className={s.sectionTitle}>{room.dataset_id}</h2>
              <StatusBadge status={room.state} />
            </div>
            <p className={s.meta}>{room.headline}</p>
            {room.incidents.length ? (
              <ul className={s.incidentList}>
                {room.incidents.map((i) => (
                  <li key={i.incident_id} className={s.incidentRow}>
                    <h3 style={{ margin: 0 }}>{presentTitle(i.title)}</h3>
                    <div className={s.actions}>
                      <StatusBadge status="Unconfirmed" />
                      <Link className={s.btn} href={`/firex/incidents/${i.incident_id}?run=${room.run_id}`} aria-label={`Open ${presentTitle(i.title)} in ${room.dataset_id}`}>
                        Open
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Link href={`/firex/runs/${room.run_id}`}>Open this result</Link>
            )}
          </section>
        ))
      )}
      <p className={s.meta}>
        The <Link href="/incidents">Synthetic Response Lab</Link> is a separate demonstration, not derived from these logs.
      </p>
    </div>
  );
}
