"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { firex, type CaseChapter, type CaseManifest, type IncidentGraph, type QualityCase, type TimeQuality } from "@/lib/firex/api";
import { ALL_ON, layoutGraph } from "@/lib/firex/scene";
import { buildWorld, type Shot } from "@/lib/firex/world";
import { presentTitle } from "@/lib/firex/wording";
import { classify } from "@/lib/ps2/api";
import { ps2Vars } from "@/styles/ps2-palette";

import { useMedia } from "./AttackWorldView";
import s from "./firex.module.css";
import { Graph2D } from "./Graph2D";
import { ByteMap, TimeRegionMap } from "./QualityCaseView";
import { StatusBadge } from "./Verdict";

const AttackWorld = dynamic(() => import("./AttackWorld"), { ssr: false, loading: () => <p role="status">Loading the scene…</p> });
const AUTOPLAY_MS = 11000;

interface Loaded {
  manifest: CaseManifest;
  graph: IncidentGraph | null;
  quality: QualityCase | null;
  time: TimeQuality | null;
}

/** Full-screen presentation from a case manifest: the live model and scene, with no authored figures and no video. */
export function TheatreView({ caseId }: { caseId: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const manifest = await firex.getCase(caseId);
      const [graph, quality, health] = await Promise.all([
        manifest.incident_id ? firex.graph(manifest.incident_id, manifest.run_id) : null,
        manifest.subject === "quality" ? firex.qualityCase(manifest.run_id) : null,
        manifest.subject === "partial" ? firex.health(manifest.run_id) : null,
      ]);
      if (live) setData({ manifest, graph, quality, time: health?.time_quality ?? null });
    })().catch((e: unknown) => live && setFailure(classify(e).message));
    return () => {
      live = false;
    };
  }, [caseId]);
  if (failure) {
    return (
      <div className={s.theatre} style={ps2Vars}>
        <div className={s.theatreText}>
          <p className={s.alert} role="alert">
            This presentation could not be loaded: {failure}
          </p>
          <Link className={s.btn} href="/firex">
            Log analysis
          </Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={s.theatre} style={ps2Vars}>
        <p role="status" className={s.theatreText}>
          Preparing the presentation…
        </p>
      </div>
    );
  }
  return <Stage data={data} />;
}

function Stage({ data }: { data: Loaded }) {
  const { manifest, graph, quality, time } = data;
  const router = useRouter();
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notes, setNotes] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const chapter = manifest.chapters[index]!;
  const last = manifest.chapters.length - 1;
  const world = useMemo(() => (graph ? buildWorld(graph) : null), [graph]);
  const positions = useMemo(() => (graph ? layoutGraph(graph) : null), [graph]);
  const handoff = manifest.subject === "incident" ? `/firex/incidents/${manifest.incident_id}?run=${manifest.run_id}` : manifest.subject === "partial" ? `/trust/${manifest.run_id}` : `/firex/runs/${manifest.run_id}/quality`;

  const go = useCallback((delta: number) => setIndex((i) => Math.max(0, Math.min(last, i + delta))), [last]);
  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else root.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      const stop = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(stop);
    }
    const t = setTimeout(() => go(1), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [playing, index, last, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " " && tag !== "BUTTON" && tag !== "A") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "Escape") {
        if (!document.fullscreenElement) router.push(handoff);
      } else if (e.key.toLowerCase() === "n") setNotes((n) => !n);
      else if (e.key.toLowerCase() === "f") fullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, router, handoff, fullscreen]);

  const shot = useMemo(() => ({ shot: chapter.camera.shot as Shot, ids: chapter.camera.node_ids.length ? chapter.camera.node_ids : null, key: index }), [chapter, index]);

  return (
    <div ref={root} className={s.theatre} style={ps2Vars} data-testid="theatre">
      <header className={s.theatreBar}>
        <span className={s.meta}>
          {manifest.dataset_id}: {manifest.subject === "incident" ? presentTitle(manifest.title) : manifest.title}
        </span>
        <StatusBadge status={manifest.status} />
      </header>
      <main className={s.theatreStage}>
        <div className={s.theatreText} aria-live="polite">
          <p className={s.theatreKicker}>
            {index + 1} of {manifest.chapters.length}. {chapter.title}
          </p>
          <h1 className={s.theatreHeadline}>{chapter.headline === manifest.title && manifest.subject === "incident" ? presentTitle(chapter.headline) : chapter.headline}</h1>
          <p className={s.theatreBody}>{chapter.body}</p>
          {chapter.metrics.length ? (
            <dl className={s.theatreMetrics}>
              {chapter.metrics.map((m) => (
                <div key={m.label}>
                  <dt>{m.label}</dt>
                  <dd>{m.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <div className={s.theatreVisual} data-world={Boolean(world)}>
          {world && !noWebgl ? (
            <AttackWorld
              world={world}
              selected={chapter.camera.shot === "inspect" ? (chapter.camera.node_ids[0] ?? null) : null}
              onSelect={() => undefined}
              toggles={ALL_ON}
              hideContext
              replayStep={null}
              shot={shot}
              reducedMotion={reducedMotion}
              onUnavailable={() => setNoWebgl(true)}
              fullBleed
            />
          ) : graph && positions ? (
            <Graph2D graph={graph} positions={positions} selected={null} onSelect={() => undefined} toggles={ALL_ON} replayStep={null} />
          ) : quality ? (
            <QualityVisual chapter={chapter} quality={quality} />
          ) : time ? (
            <div className={s.bigBytes}>
              <TimeRegionMap time={time} />
            </div>
          ) : null}
          {world ? (
            <p id="world-summary" className={s.axisNote} style={{ position: "absolute", clip: "rect(0 0 0 0)" }}>
              The Attack World shows this incident&apos;s path. The narration has the same content.
            </p>
          ) : null}
        </div>
      </main>
      {notes ? (
        <aside className={s.notes} aria-label="Presenter notes">
          <p>{chapter.presenter_notes}</p>
        </aside>
      ) : null}
      <footer className={s.theatreFoot}>
        <div className={s.actions}>
          <button type="button" className={s.btn} disabled={index === 0} onClick={() => go(-1)}>
            Previous
          </button>
          <button type="button" className={s.btnPrimary} disabled={index === last} onClick={() => go(1)}>
            Next
          </button>
          <button type="button" className={s.btn} disabled={reducedMotion && !playing} onClick={() => setPlaying((p) => !p)} title={reducedMotion ? "Autoplay is off with reduced motion" : undefined}>
            {playing ? "Pause" : "Autoplay"}
          </button>
        </div>
        <ol className={s.chapters} aria-label="Chapters">
          {manifest.chapters.map((c, i) => (
            <li key={c.chapter_id}>
              <button type="button" aria-label={`Chapter ${i + 1}: ${c.title}`} aria-current={i === index ? "step" : undefined} data-past={i < index} onClick={() => setIndex(i)} />
            </li>
          ))}
        </ol>
        <div className={s.actions}>
          <button type="button" className={s.btn} aria-pressed={notes} onClick={() => setNotes((n) => !n)}>
            Notes
          </button>
          <button type="button" className={s.btn} onClick={fullscreen}>
            Full screen
          </button>
          <Link className={s.btnPrimary} href={handoff}>
            {manifest.subject === "incident" ? "Open live evidence" : manifest.subject === "partial" ? "Open Trust Centre" : "Open Quality Case"}
          </Link>
        </div>
      </footer>
    </div>
  );
}

function QualityVisual({ chapter, quality }: { chapter: CaseChapter; quality: QualityCase }) {
  if (chapter.visual === "bytes") {
    return (
      <div className={s.bigBytes}>
        <ByteMap data={quality} />
      </div>
    );
  }
  if (chapter.visual === "time") {
    return (
      <div className={s.bigBytes} role="img" aria-label={`${quality.collapsed_records.toLocaleString("en-US")} records at one instant`}>
        <p className={s.keyNumber}>{quality.collapsed_records.toLocaleString("en-US")}</p>
        <p className={s.theatreBody}>
          records at one instant: <span className={s.mono}>{quality.collapsed_utc}</span>
        </p>
      </div>
    );
  }
  return <div className={s.withheld}>No attack path is drawn. This evidence cannot support one.</div>;
}
