import Link from "next/link";

import type { DatasetHealth } from "@/lib/firex/api";

import s from "./firex.module.css";

type Tone = "proof" | "threat" | "review" | "quiet";

// A glyph and a word on every status, so nothing depends on colour alone.
const STATUS: Record<string, { glyph: string; tone: Tone }> = {
  Verified: { glyph: "✓", tone: "proof" },
  "Needs review": { glyph: "!", tone: "review" },
  "Not measured": { glyph: "–", tone: "quiet" },
  "Not applicable": { glyph: "∅", tone: "quiet" },
  Failed: { glyph: "✕", tone: "threat" },
  Degraded: { glyph: "▲", tone: "threat" },
  Unconfirmed: { glyph: "?", tone: "review" },
  "SOURCE VERIFIED": { glyph: "✓", tone: "proof" },
  "RELATIONSHIP OBSERVED": { glyph: "✓", tone: "proof" },
  "RELATIONSHIP INFERRED": { glyph: "~", tone: "review" },
  "INCIDENT UNCONFIRMED": { glyph: "?", tone: "review" },
  "ANALYST CONFIRMED": { glyph: "✓", tone: "review" },
  "PROVENANCE FAILED": { glyph: "✕", tone: "threat" },
  "SOURCE UNAVAILABLE": { glyph: "–", tone: "quiet" },
  "NOT APPLICABLE": { glyph: "∅", tone: "quiet" },
};

export function StatusBadge({ status, large }: { status: string; large?: boolean }) {
  const look = STATUS[status] ?? { glyph: "·", tone: "quiet" as Tone };
  return (
    <span className={s.badge} data-tone={look.tone} data-size={large ? "large" : undefined}>
      <span aria-hidden>{look.glyph}</span>
      {status}
    </span>
  );
}

/** The verdict for a run. Every word comes from the backend; this component decides nothing. */
export function HealthVerdict({ health, titleLevel = 2, trustLink = true }: { health: DatasetHealth; titleLevel?: 1 | 2; trustLink?: boolean }) {
  const Title = titleLevel === 1 ? "h1" : "h2";
  return (
    <section className={s.verdict} data-state={health.state} aria-label="Dataset health">
      <div className={s.actions}>
        <StatusBadge status={health.state} large />
        {health.is_sample ? <span className={s.meta}>Sample of the file, not the whole source</span> : null}
      </div>
      <Title>{health.headline}</Title>
      <p>{health.explanation}</p>
      <ul className={s.dimensions} aria-label="Trust dimensions">
        {health.dimensions.map((d) => (
          <li key={d.id}>
            <span className={s.dimName}>{d.title}</span>
            <StatusBadge status={d.status} />
          </li>
        ))}
      </ul>
      {trustLink ? (
        <p>
          <Link href={`/trust/${health.run_id}`}>Open the Trust Centre</Link>
        </p>
      ) : null}
    </section>
  );
}
