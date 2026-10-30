"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { CanonicalEvent, Hypotheses, ReconstructedGraph, StoryStatement } from "@/lib/ps2/api";
import { buildModel, DEFAULT_OPTIONS, type GraphOptions } from "@/lib/ps2/graph";

import { PathText } from "./GraphText";
import { Ps2GraphCanvas, type CanvasControls } from "./Ps2GraphCanvas";
import s from "./ps2.module.css";

const TOGGLES: Array<[keyof GraphOptions, string]> = [
  ["alternates", "Alternate hypotheses"],
  ["inferred", "Inferred edges"],
  ["rejected", "Rejected hypotheses"],
  ["entities", "Entities"],
];

export function GraphPanel({
  graph,
  hypotheses,
  statements,
  events,
  selectedId,
  onSelect,
}: {
  graph: ReconstructedGraph;
  hypotheses: Hypotheses;
  statements: StoryStatement[];
  events: Record<string, CanonicalEvent>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [options, setOptions] = useState<GraphOptions>(DEFAULT_OPTIONS);
  const [focusPath, setFocusPath] = useState(false);
  const fitRef = useRef<CanvasControls | null>(null);
  const controls = useCallback((c: CanvasControls) => {
    fitRef.current = c;
  }, []);
  const model = useMemo(() => buildModel(graph, hypotheses, statements, events, options), [graph, hypotheses, statements, events, options]);
  const path = model.pathEventIds;

  // Keyboard: arrows walk the selected path, Home/End jump to its ends, Escape clears the selection.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!path.length) return;
    const i = selectedId ? path.indexOf(selectedId) : -1;
    const go = (n: number) => {
      e.preventDefault();
      onSelect(path[Math.max(0, Math.min(path.length - 1, n))]!);
    };
    if (e.key === "ArrowRight" || e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(i < 0 ? 0 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(path.length - 1);
    else if (e.key === "Escape") onSelect(null);
  };

  return (
    <section aria-labelledby="graph-head">
      <div className={s.graphFrame}>
        <div className={s.toolbar} role="toolbar" aria-label="Graph controls">
          <h2 id="graph-head" className="v2-kicker" style={{ marginRight: "auto" }}>
            ThreadGraph
          </h2>
          <button type="button" className="halt-btn" onClick={() => fitRef.current?.fit()}>
            <span>FIT TO VIEW</span>
          </button>
          <button type="button" className="halt-btn" aria-pressed={focusPath} onClick={() => setFocusPath((f) => !f)} disabled={!path.length}>
            <span>{focusPath ? "SHOW ALL" : "FOCUS SELECTED PATH"}</span>
          </button>
          {TOGGLES.map(([k, label]) => (
            <label key={k} className={s.toggle}>
              <input type="checkbox" checked={options[k]} onChange={(e) => setOptions((o) => ({ ...o, [k]: e.target.checked }))} />
              {label}
            </label>
          ))}
        </div>
        {graph.nodes.length ? (
          <div
            tabIndex={0}
            role="group"
            aria-label="ThreadGraph canvas. Arrow keys move along the selected path; Escape clears the selection."
            aria-describedby="graph-summary"
            onKeyDown={onKey}
            style={{ outline: "none" }}
          >
            <Ps2GraphCanvas model={model} selectedId={selectedId} focusPath={focusPath} onSelect={onSelect} controls={controls} />
          </div>
        ) : (
          <p className="v2-decision" style={{ padding: "var(--space-6)" }} data-testid="empty-graph">
            No event reached the suspicion threshold, so the reduced graph is empty and no attack path was selected. Nothing is drawn in its place.
          </p>
        )}
        <ul className={s.legend} aria-label="Legend">
          <li>
            <span className={s.swatch} style={{ borderTopColor: "var(--ps2-proof)" }} /> observed link
          </li>
          <li>
            <span className={s.swatch} style={{ borderTopColor: "var(--ps2-inferred)", borderTopStyle: "dashed" }} /> inferred link
          </li>
          <li>
            <span className={s.swatch} style={{ borderTopColor: "var(--ps2-threat)", borderTopWidth: 4 }} /> selected path
          </li>
          <li>
            <span className={s.swatch} style={{ borderTopColor: "var(--ps2-forecast)", borderTopStyle: "dashed" }} /> alternate path
          </li>
          <li>
            <span className={s.swatch} style={{ borderTopColor: "var(--ps2-forecast)", borderTopStyle: "dotted" }} /> forecast
          </li>
          <li>
            <span className={s.swatch} style={{ borderTopColor: "var(--ps2-continuity)" }} /> critical business service
          </li>
          <li>
            <span className={s.swatch} style={{ borderTopColor: "var(--v2-text)", borderTopStyle: "dashed", borderTopWidth: 1 }} /> missing evidence
          </li>
        </ul>
      </div>
      <p id="graph-summary" className="v2-meta" aria-live="polite" style={{ marginTop: "var(--space-2)" }}>
        {model.summary}
      </p>

      <details className="v2-details" open>
        <summary>
          <span>Selected path as text</span>
        </summary>
        <PathText graph={graph} hypotheses={hypotheses} statements={statements} onSelect={onSelect} />
      </details>
    </section>
  );
}
