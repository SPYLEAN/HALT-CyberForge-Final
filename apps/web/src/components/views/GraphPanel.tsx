"use client";

import { useCallback, useMemo, useState } from "react";

import { GraphA11y } from "@/components/graph/GraphA11y";
import { buildModel, cutLayout, hardCutRefs, type GraphMode } from "@/components/graph/model";
import { ThreadGraphCanvas } from "@/components/graph/ThreadGraphCanvas";
import { Skeleton, Tabs } from "@/components/halt";
import { useOps } from "@/lib/api/ops";
import { useIncident } from "@/lib/state/incident-store";

const MODES: Array<{ id: GraphMode; label: string }> = [
  { id: "observed", label: "OBSERVED" },
  { id: "forecast", label: "FORECAST" },
  { id: "response", label: "RESPONSE" },
  { id: "cut", label: "CUT" },
];

function defaultMode(applied: boolean, hasPlan: boolean, hasPaths: boolean): GraphMode {
  if (applied) return "cut";
  if (hasPlan) return "response";
  return hasPaths ? "forecast" : "observed";
}

/** The ThreadGraph canvas shown on every system view (2-layout.md: the graph dominates). */
export function GraphPanel({ height = 360, showTable = false, showModes = false }: { height?: number; showTable?: boolean; showModes?: boolean }) {
  const { state, select } = useIncident();
  const ops = useOps();
  const applied = ops.execution?.state === "applied";
  const [chosenMode, setMode] = useState<GraphMode | null>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [showDependencies, setShowDependencies] = useState(true);
  const mode = chosenMode ?? defaultMode(applied, ops.plan?.status === "optimal", ops.paths.length > 0);

  const nodes = useMemo(() => Object.values(state.nodes), [state.nodes]);
  const edges = useMemo(() => Object.values(state.edges), [state.edges]);
  const model = useMemo(
    () => buildModel({ nodes, edges, paths: ops.paths, plan: ops.plan, actions: ops.actions, execution: ops.execution, mode, focusPath, showDependencies }),
    [nodes, edges, ops.paths, ops.plan, ops.actions, ops.execution, mode, focusPath, showDependencies],
  );
  const blocked = useMemo(
    () => (applied ? cutLayout(ops.paths, hardCutRefs(ops.plan, ops.actions)).blocked : new Set<string>()),
    [applied, ops.paths, ops.plan, ops.actions],
  );
  const onSelect = useCallback((id: string | null) => select(id), [select]);

  return (
    <section aria-label="ThreadGraph">
      {showModes ? (
        <div style={{ marginBottom: "var(--space-3)", display: "flex", gap: "var(--space-5)", alignItems: "center", flexWrap: "wrap" }}>
          <Tabs items={MODES} value={mode} onChange={(id) => setMode(id as GraphMode)} label="Graph mode" />
          {/* The business thread (process → ledger) is always drawn; this only hides the wider dependency map. */}
          <label className="label" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", minHeight: "var(--hit-target)", cursor: "pointer" }}>
            <input type="checkbox" checked={showDependencies} onChange={(e) => setShowDependencies(e.target.checked)} style={{ accentColor: "var(--business)", width: 16, height: 16 }} />
            Business dependencies
          </label>
        </div>
      ) : null}
      {nodes.length ? (
        <ThreadGraphCanvas model={model} height={height} onSelect={onSelect} />
      ) : (
        <Skeleton variant="graph" label="Waiting for the replay to deliver the graph" />
      )}
      {showTable ? (
        <GraphA11y paths={ops.paths} nodes={state.nodes} blocked={blocked} summary={model.summary} onFocus={setFocusPath} focusPath={focusPath} />
      ) : (
        <p className="sr-only" aria-live="polite">
          {model.summary}
        </p>
      )}
    </section>
  );
}
