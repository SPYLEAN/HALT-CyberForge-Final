"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { firex, type CaseCandidates } from "@/lib/firex/api";
import { classify } from "@/lib/ps2/api";

import s from "./firex.module.css";

/** Choose what to present. A case is a new manifest: building one never changes the run or its incidents. */
export function CaseBuilder({ runId }: { runId: string }) {
  const router = useRouter();
  const [data, setData] = useState<CaseCandidates | null>(null);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    firex
      .candidates(runId)
      .then((c) => {
        if (!live) return;
        setData(c);
        setChoice(c.partial_case_available ? "partial" : c.quality_case_available ? "quality" : (c.items.find((i) => i.recommended)?.incident_id ?? ""));
      })
      .catch((e: unknown) => live && setError(classify(e).message));
    return () => {
      live = false;
    };
  }, [runId]);

  if (error && !data) return <p className={s.alert}>{error}</p>;
  if (!data || (!data.items.length && !data.quality_case_available && !data.partial_case_available)) return null;

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const manifest = await (choice === "quality" || choice === "partial" ? firex.createCase(runId, choice) : firex.createCase(runId, "incident", choice));
      router.push(`/theatre/${manifest.case_id}`);
    } catch (e) {
      setError(classify(e).message);
      setBusy(false);
    }
  }

  const selected = data.items.find((i) => i.incident_id === choice);
  return (
    <section className={s.card} aria-labelledby="case-builder">
      <h2 id="case-builder">Present this result</h2>
      <p className={s.meta}>Build a presentation from stored evidence. The original result does not change.</p>
      <label className={s.field}>
        What to present
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          {data.quality_case_available ? <option value="quality">Quality Case: reconstruction withheld</option> : null}
          {data.partial_case_available ? <option value="partial">Partial reconstruction: the whole source</option> : null}
          {data.items.map((i) => (
            <option key={i.incident_id} value={i.incident_id}>
              {i.title}
              {i.recommended ? " (recommended)" : ""}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <details>
          <summary>Why this score ({selected.score})</summary>
          <ul className={s.lensList}>
            {selected.components.map((c) => (
              <li key={c.name}>
                {c.detail}: {c.value} × {c.weight}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {data.items.length ? <p className={s.meta}>{data.note}</p> : null}
      {error ? (
        <p className={s.alert} role="alert">
          {error}
        </p>
      ) : null}
      <div className={s.actions}>
        <button type="button" className={s.btnPrimary} disabled={busy || !choice} onClick={build}>
          {busy ? "Building…" : "Present in Theatre"}
        </button>
      </div>
    </section>
  );
}
