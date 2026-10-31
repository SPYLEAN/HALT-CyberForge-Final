"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { firex, type IncidentGraph, type RecordedFact } from "@/lib/firex/api";
import { pathSteps } from "@/lib/firex/scene";
import { presentTitle } from "@/lib/firex/wording";
import { buildWorld } from "@/lib/firex/world";
import { ps2Vars } from "@/styles/ps2-palette";

import s from "./ProductLanding.module.css";
import { createLandingScene, type LandingHandle, type LandingPath } from "./productLandingScene";

const SCENES = ["Dark arrival", "Log deluge", "Noise collapse", "Suspicion emerges", "Attack path", "Uncertainty", "Proof", "Log Analysis"];
const NO_FIGURES = "Recorded figures are not available from this server right now.";

const nameOf = (f: RecordedFact) => f.dataset_id.replace(/^firex-(.+)$/, (_, size: string) => `FireX ${size.toUpperCase()}`);
const gb = (f: RecordedFact) => `${(f.source_bytes / 1e9).toFixed(2)} GB`;
const n = (value: number) => value.toLocaleString("en-US");

/** The world model's own placement, scaled to the landing's stage. Source order runs left to right, stage runs upward. */
function toPath(graph: IncidentGraph): LandingPath {
  const world = buildWorld(graph);
  const order = world.stepIds;
  const span = Math.max(1, world.bounds.maxX - world.bounds.minX);
  // Source order runs left to right and recedes, so the route has depth even when one stage holds every step.
  const fit = (p: { x: number; y: number; z: number }) => {
    const u = (p.x - world.bounds.minX) / span;
    return { x: (u - 0.5) * 5.4, y: p.y * 0.55 - 1.4, z: 2.2 - u * 4.4 };
  };
  const steps = order.map((id) => world.nodes.find((w) => w.id === id)!.position);
  const gaps = order.slice(0, -1).map((id, i) => graph.edges.some((e) => e.source === id && e.target === order[i + 1] && e.missing_evidence));
  return { steps: steps.map(fit), gaps, reachable: world.nodes.filter((w) => w.state === "reachable").slice(0, 14).map((w) => fit(w.position)) };
}

/** Eight scenes in ordinary scrolling. Every figure comes from a stored run through the API, and every line stays readable without the canvas. */
export function ProductLanding() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<LandingHandle | null>(null);
  const [active, setActive] = useState(0);
  const [facts, setFacts] = useState<RecordedFact[] | null>(null);
  const [note, setNote] = useState("");
  const [graph, setGraph] = useState<IncidentGraph | null>(null);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    handle.current = createLandingScene(canvas.current, { reducedMotion: reduced, low: window.innerWidth < 900 || (navigator.hardwareConcurrency ?? 8) <= 4 });
    return () => {
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    let live = true;
    firex
      .facts()
      .then(async (recorded) => {
        if (!live) return;
        setFacts(recorded.items);
        setNote(recorded.note);
        const reconstructed = recorded.items.find((f) => f.reconstruction === "ran" && f.incidents > 0);
        if (!reconstructed) return;
        // The recorded figures stand on their own: without a stored path the scene simply draws none.
        try {
          const candidates = await firex.candidates(reconstructed.run_id);
          const best = candidates.items.find((c) => c.recommended);
          if (!best) return;
          const stored = await firex.graph(best.incident_id, reconstructed.run_id);
          if (!live) return;
          setGraph(stored);
          setTitle(presentTitle(best.title));
          handle.current?.setPath(toPath(stored));
        } catch {
          /* no path to show */
        }
      })
      .catch(() => live && setFacts([]));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("[data-scene]");
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.scene);
          setActive(index);
          handle.current?.setScene(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const unavailable = facts !== null && !facts.length;
  const steps = graph ? pathSteps(graph).slice(0, 5) : [];
  return (
    <div className={s.page} style={ps2Vars} data-testid="product-landing">
      <canvas ref={canvas} className={s.canvas} aria-hidden="true" />
      <div className={s.veil} aria-hidden="true" />
      <header className={s.bar}>
        <span className={s.brand}>HALT</span>
        <Link className={s.barLink} href="/firex">
          Open Log Analysis
        </Link>
      </header>
      <nav className={s.rail} aria-label="Scenes">
        {SCENES.map((name, i) => (
          <a key={name} href={`#scene-${i + 1}`} aria-label={`Scene ${i + 1}: ${name}`} aria-current={active === i ? "step" : undefined} />
        ))}
      </nav>

      <main className={s.scenes}>
        <section id="scene-1" data-scene={0} className={s.scene}>
          <div className={s.copy}>
            <p className={s.kicker}>HALT. Proof-Carrying Kill Chain Intelligence.</p>
            <h1 className={s.hero}>
              Security teams do not lack alerts.
              <br />
              They lack a defensible explanation of how those alerts connect.
            </h1>
            <p className={s.body}>HALT turns large, noisy security logs into defensible attack stories, and refuses to invent a story when the evidence cannot support one.</p>
          </div>
        </section>

        <section id="scene-2" data-scene={1} className={s.scene}>
          <div className={s.copy}>
            <p className={s.kicker}>The log deluge</p>
            <h2 className={s.title}>It starts with more records than anyone can read.</h2>
            {unavailable ? <p className={s.body}>{NO_FIGURES}</p> : null}
            <ul className={s.figures} aria-label="Sources read">
              {facts?.map((f) => (
                <li key={f.run_id}>
                  <strong>{gb(f)}</strong>
                  <span>
                    {nameOf(f)}, read in {n(f.duration_s)} s
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="scene-3" data-scene={2} className={s.scene}>
          <div className={s.copy}>
            <p className={s.kicker}>The noise collapses</p>
            <h2 className={s.title}>Exact duplicates fold into one, and every byte stays accounted for.</h2>
            <ul className={s.figures} aria-label="Exact duplicates removed">
              {facts?.map((f) => (
                <li key={f.run_id}>
                  <strong>{n(f.exact_duplicates)}</strong>
                  <span>duplicates from {nameOf(f)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="scene-4" data-scene={3} className={s.scene}>
          <div className={s.copy}>
            <p className={s.kicker}>Suspicion emerges</p>
            <h2 className={s.title}>A few patterns stand out. They are candidates, not conclusions.</h2>
            <ul className={s.figures} aria-label="Incidents reconstructed">
              {facts?.map((f) => (
                <li key={f.run_id}>
                  <strong>{f.incidents ? `${f.incidents} unconfirmed` : "None"}</strong>
                  <span>{f.reconstruction === "partial" ? `incidents from a partial reconstruction of ${nameOf(f)}` : f.incidents ? `incidents from ${nameOf(f)}` : `presented from ${nameOf(f)}, which is not a clean result`}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="scene-5" data-scene={4} className={s.scene}>
          <div className={s.copy}>
            <p className={s.kicker}>The attack path</p>
            <h2 className={s.title}>{title ?? "Candidates connect into a path, step by step."}</h2>
            {steps.length ? (
              <>
                <ol className={s.steps} aria-label="Steps on this stored path">
                  {steps.map((step) => (
                    <li key={step.node_id}>{step.label}</li>
                  ))}
                </ol>
                <p className={s.body}>This is one stored incident. It is unconfirmed: the path is what the evidence supports, not proof of an attack.</p>
              </>
            ) : (
              <p className={s.body}>Each step cites the source records behind it. Open an incident to walk its path.</p>
            )}
          </div>
        </section>

        <section id="scene-6" data-scene={5} className={s.scene}>
          <div className={s.copy}>
            <p className={s.kicker}>Uncertainty</p>
            <h2 className={s.title}>HALT says what the evidence cannot support.</h2>
            <p className={s.body}>Links a rule inferred stay marked as inferred. Missing evidence stays a visible gap. Three sources gave three different answers:</p>
            <ul className={s.figures} aria-label="What each source supported">
              {facts?.map((f) => (
                <li key={f.run_id}>
                  <strong>{nameOf(f)}</strong>
                  <span>
                    {f.narrative}
                    {f.collapsed_records ? `. ${n(f.collapsed_records)} of ${n(f.canonical_records)} records have collapsed time.` : "."}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="scene-7" data-scene={6} className={s.scene}>
          <div className={s.copy}>
            <p className={s.kicker}>Proof</p>
            <h2 className={s.title}>Every result carries a receipt you can check.</h2>
            <p className={s.body}>A seal shows that a receipt has not changed. It does not show that a conclusion is true, and no ground truth was provided, so accuracy has not been measured.</p>
            <ul className={s.figures} aria-label="Recorded receipts and memory">
              {facts?.map((f) => (
                <li key={f.run_id}>
                  <strong>{nameOf(f)}</strong>
                  <span>
                    Benchmark seal {f.benchmark_seal_valid ? "valid" : "not valid"}
                    {f.incidents ? `, ${f.proofs_valid} of ${f.incidents} proof receipts valid` : ""}
                    {f.peak_memory_mb !== null && f.peak_memory_mb !== undefined ? `. Peak memory upper bound ${(f.peak_memory_mb / 1000).toFixed(2)} GB.` : "."}
                  </span>
                </li>
              ))}
            </ul>
            {note ? <p className={s.note}>{note}</p> : null}
          </div>
        </section>

        <section id="scene-8" data-scene={7} className={s.scene}>
          <div className={s.copy}>
            <p className={s.kicker}>Contain the threat. Continue the business.</p>
            <h2 className={s.title}>From raw logs to evidence-backed attack paths.</h2>
            <div className={s.actions}>
              <Link className={s.primary} href="/firex">
                Open Log Analysis
              </Link>
              <Link className={s.secondary} href="/trust">
                Open the Trust Centre
              </Link>
            </div>
            <p className={s.note}>
              The earlier response demonstration is at <Link href="/response-demo">the response demo</Link>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
