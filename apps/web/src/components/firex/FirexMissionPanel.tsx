"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { firex, type DatasetHealth } from "@/lib/firex/api";
import { ps2Vars } from "@/styles/ps2-palette";

import s from "./firex.module.css";
import { StatusBadge } from "./Verdict";

/** Mission Control opens on the log-analysis verdicts. If the analysis API has none, nothing is shown in their place. */
export function FirexMissionPanel() {
  const [items, setItems] = useState<DatasetHealth[]>([]);
  useEffect(() => {
    let live = true;
    firex
      .datasets()
      .then((d) => Promise.all(d.flatMap((x) => (x.latest_run_id ? [firex.health(x.latest_run_id)] : []))))
      .then((h) => live && setItems(h))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!items.length) return null;
  return (
    <section className={s.section} style={{ ...ps2Vars, marginBottom: "var(--space-6)", fontFamily: "var(--font-display)" }} aria-label="Log analysis results">
      <h2 className={s.sectionTitle}>Log analysis</h2>
      <ul className={s.incidentList}>
        {items.map((h) => (
          <li key={h.run_id} className={s.incidentRow}>
            <div>
              <h3>{h.dataset_id}</h3>
              <p className={s.meta}>{h.headline}</p>
            </div>
            <div className={s.actions}>
              <StatusBadge status={h.state} />
              <Link className={s.btn} href={`/firex/runs/${h.run_id}`} aria-label={`Open result for ${h.dataset_id}`}>
                Open result
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
