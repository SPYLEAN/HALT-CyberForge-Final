"use client";

import { useEffect, useRef, useState } from "react";

import { useOps } from "@/lib/api/ops";
import { useIncident } from "@/lib/state/incident-store";

import type { SceneState } from "./HaltScene3D";

/**
 * Run the read-only analysis the story needs (correlate → SafeCut → EchoLab → ProofSeal) through the API,
 * one missing step at a time. Nothing is approved or executed here; that stays with two humans in the
 * Action Gate. Stops at the first error instead of retrying.
 */
export function useLandingAnalysis(): void {
  const ops = useOps();
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!ops.incident || ops.busy || ops.error) return;
    const next: Array<[string, boolean, () => Promise<void>]> = [
      ["correlate", ops.paths.length === 0, ops.correlate],
      ["plan", !ops.plan, ops.createPlan],
      ["simulate", Boolean(ops.plan) && !ops.simulation, ops.simulate],
      ["seal", ops.plan?.status === "optimal" && !ops.proof, ops.seal],
    ];
    const step = next.find(([name, needed]) => needed && !tried.current.has(name));
    if (!step) return;
    tried.current.add(step[0]);
    void step[2]();
  }, [ops]);
}

/**
 * Scroll drives the shared replay: the section (or incident row) nearest the middle of the viewport sets the
 * replay time (data-replay-t) and the 3D state (data-scene). The cursor lives in the shared incident store,
 * so the Command Center picks it up unchanged. contentKey changes when stops are added (e.g. incident rows
 * arriving), so the observers are re-registered.
 */
export function useScrollCursor(root: React.RefObject<HTMLElement | null>, contentKey: string | number): SceneState {
  const { state, seek } = useIncident();
  const [scene, setScene] = useState<SceneState>("dormant");
  const cursor = useRef(state.cursor);
  useEffect(() => {
    cursor.current = state.cursor;
  }, [state.cursor]);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>("[data-replay-t]"));
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
        const active = visible[visible.length - 1];
        if (!active) return;
        const t = Number(active.dataset.replayT);
        if (Number.isFinite(t) && t !== cursor.current) seek(t);
        const s = active.closest<HTMLElement>("[data-scene]")?.dataset.scene as SceneState | undefined;
        if (s) setScene(s);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [root, seek, contentKey]);

  return scene;
}
