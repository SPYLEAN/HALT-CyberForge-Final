"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";

import { PANEL_TITLES, reachableSteps, type Panel } from "@/lib/ps3/atlas";
import { ZONES } from "@/lib/ps3/engine";
import { pipelineOrder, STATUS_TEXT, toScene, ZONE_TITLES, type NodeStatus, type SceneModel } from "@/lib/ps3/scene";
import { stepNode } from "@/lib/ps3/store";

import type { CameraCommand } from "./AtlasCanvas";
import { Flow2D } from "./Flow2D";
import { FlowGrid } from "./FlowGrid";
import { useCompact, useReducedMotion, useWebGL, type AtlasStore } from "./hooks";
import { diffFields, PanelBody, Panels, Tag } from "./panels";

const AtlasCanvas = dynamic(() => import("./AtlasCanvas"), { ssr: false, loading: () => null });

/** Time per replay step; the packet travels for FLIGHT_MS (600 ms) of it and the scene is idle for the rest. */
export const STEP_MS = 900;

/** A render failure inside WebGL never takes the page down: the 2D flow takes over. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Connector Atlas 3D scene failed; showing the 2D flow.", error.message, info.componentStack?.slice(0, 200));
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const TONE: Record<NodeStatus, string | undefined> = { passed: "ok", failed: "fail", drift: "drift", active: "active", idle: undefined, receded: undefined };

export function AtlasView({ store, caption }: { store: AtlasStore; caption?: ReactNode }) {
  const { q, atlas, set, fx, focus } = store;
  const model = useMemo(() => toScene(atlas, q), [atlas, q]);
  const compact = useCompact();
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const [approvals, setApprovals] = useState<Record<string, string>>({});
  const approval = approvals[atlas.receipt.id] ?? null;
  const onApprove = (id: string) => setApprovals((a) => ({ ...a, [atlas.receipt.id]: id }));
  const select = (id: string) => set({ node: id }, "push", { focus: true });

  // `[` and `]` step the selection along the pipeline (from the latest state, however fast they are pressed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" && e.key !== "]") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      e.preventDefault();
      const dir = e.key === "]" ? 1 : -1;
      set((cur, a) => ({ node: stepNode(cur, a, dir) }), "push", { focus: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [set]);

  const selectedLabel = q.node ? model.nodes.find((n) => n.id === q.node)?.label ?? q.node : "";
  const probe = (
    <span hidden data-testid="atlas-state" data-connector={q.connector} data-node={q.node ?? ""} data-t={q.t} data-panel={q.panel} data-drift={q.drift ?? ""} data-digest={atlas.trace.digest} data-fixtures={fx.connectors.length} />
  );

  if (compact)
    return (
      <>
        <GuidedPipeline store={store} model={model} approval={approval} onApprove={onApprove} />
        {probe}
      </>
    );

  return (
    <div className="ps3 ps3-shell">
      <AtlasBar store={store} />
      <nav className="ps3-list" aria-label="Spatial objects">
        <ObjectList model={model} selected={q.node} onSelect={select} />
      </nav>
      <main className="ps3-stage" aria-label="Connector Atlas">
        <h1 className="sr-only">{`Connector Atlas: ${atlas.config.title}`}</h1>
        <StageView model={model} store={store} webgl={webgl} reduced={reduced} onSelect={select} focus={focus} />
        {caption}
      </main>
      <aside className="ps3-drawer" aria-label="Details">
        <Panels store={store} approval={approval} onApprove={onApprove} />
      </aside>
      <Timeline store={store} />
      <p className="sr-only" aria-live="polite" data-testid="atlas-live">
        {selectedLabel ? `Selected ${selectedLabel}` : ""}
      </p>
      {probe}
    </div>
  );
}

function AtlasBar({ store }: { store: AtlasStore }) {
  const { fx, q, set, atlas } = store;
  return (
    <header className="ps3-bar" aria-label="Connector">
      <Image src="/brand/halt-horizontal-bone.svg" alt="HALT" width={92} height={26} unoptimized />
      <div style={{ minWidth: 0 }}>
        <p className="ps3-kicker">Connector Atlas</p>
        <p className="ps3-tagline">See the complete data journey before you activate it</p>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        <span className="ps3-meta">Connector</span>
        <select value={q.connector} onChange={(e) => set({ connector: e.target.value })}>
          {fx.connectors.map((c) => (
            <option key={c.id} value={c.id}>{`${c.title} · ${c.version}`}</option>
          ))}
        </select>
      </label>
      {atlas.plan.errors.length ? <Tag tone="fail">{`${atlas.plan.errors.length} COMPILE ERRORS`}</Tag> : <Tag tone="ok">COMPILED</Tag>}
      <span className="ps3-sim">SIMULATED</span>
    </header>
  );
}

export function ObjectList({ model, selected, onSelect }: { model: SceneModel; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      {ZONES.map((z) => (
        <section key={z} aria-label={ZONE_TITLES[z]}>
          <h2>{ZONE_TITLES[z]}</h2>
          <ul>
            {model.nodes
              .filter((n) => n.zone === z)
              .map((n) => (
                <li key={n.id}>
                  <button type="button" className="ps3-obj" aria-pressed={n.id === selected} data-status={n.status} data-node={n.id} onClick={() => onSelect(n.id)}>
                    <span className="ps3-dot" aria-hidden />
                    <span>{n.label}</span>{" "}
                    <span className="ps3-meta">{`${n.connector ? `${n.connector.split("-")[0]} · ` : "shared · "}${STATUS_TEXT[n.status]}${n.proof ? " · proof" : ""}`}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function StageView({
  model,
  store,
  webgl,
  reduced,
  onSelect,
  focus,
}: {
  model: SceneModel;
  store: AtlasStore;
  webgl: boolean | null;
  reduced: boolean;
  onSelect: (id: string) => void;
  focus: AtlasStore["focus"];
}) {
  const { q, atlas } = store;
  const [command, setCommand] = useState<CameraCommand>({ kind: "focus", seq: 0 });
  const [follow, setFollow] = useState(false);
  const cmd = (kind: CameraCommand["kind"]) => setCommand((c) => ({ kind, seq: c.seq + 1 }));
  const grid = (
    <div className="ps3-flow-full">
      <FlowGrid model={model} selected={q.node} onSelect={onSelect} />
    </div>
  );
  if (webgl === false) {
    return (
      <div className="ps3-fallback">
        <p className="ps3-notice" role="status">
          3D is unavailable on this device (no WebGL). The complete 2D flow below has every object and action.
        </p>
        {grid}
      </div>
    );
  }
  const driftKey = atlas.analysis && !atlas.repaired ? `${q.connector}:${q.drift}` : null;
  return (
    <>
      {webgl ? (
      <div className="ps3-cam" role="group" aria-label="Camera">
        <button type="button" className="ps3-btn" onClick={() => cmd("home")}>
          Home
        </button>
        <button type="button" className="ps3-btn" onClick={() => cmd("focus")} disabled={!q.node}>
          Focus
        </button>
        <button type="button" className="ps3-btn" aria-pressed={follow} onClick={() => setFollow((f) => !f)}>
          Payload follow
        </button>
        <button
          type="button"
          className="ps3-btn"
          onClick={() => {
            setFollow(false);
            cmd("reset");
          }}
        >
          Reset camera
        </button>
      </div>
      ) : null}
      {webgl === null ? (
        grid
      ) : (
        <SceneBoundary fallback={grid}>
          <div style={{ position: "absolute", inset: 0 }} data-atlas-scene>
            <AtlasCanvas model={model} selected={q.node} onSelect={onSelect} focus={focus} command={command} follow={follow} reduced={reduced} labels t={q.t} driftKey={driftKey} />
          </div>
        </SceneBoundary>
      )}
      {webgl ? (
        <div className="ps3-minimap">
          <Flow2D model={model} selected={q.node} onSelect={onSelect} />
        </div>
      ) : null}
    </>
  );
}

function Timeline({ store }: { store: AtlasStore }) {
  const { q, atlas, set } = store;
  const rec = atlas.trace.records[q.record];
  const n = reachableSteps(rec);
  const [playing, setPlaying] = useState(false);
  const atEnd = q.t >= n - 1;
  useEffect(() => {
    if (!playing || atEnd) return;
    const id = setTimeout(() => set((cur) => ({ t: cur.t + 1 }), "replace"), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, atEnd, q.t, set]);
  const isPlaying = playing && !atEnd;
  const step = rec?.steps[q.t];
  const stage = atlas.plan.stages.find((s) => s.id === step?.stage_id);
  return (
    <footer className="ps3-track" aria-label="Payload Flight timeline">
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="ps3-btn" onClick={() => set((cur) => ({ t: Math.max(0, cur.t - 1) }), "replace")} disabled={q.t === 0} aria-label="Previous step">
          ←
        </button>
        <button
          type="button"
          className="ps3-btn"
          data-testid="flight-play"
          onClick={() => {
            if (isPlaying) return setPlaying(false);
            set({ ...(atEnd ? { t: 0 } : {}), panel: "flight" }, "replace");
            setPlaying(true);
          }}
          disabled={!n}
        >
          {isPlaying ? "Pause" : "Dry run"}
        </button>
        <button type="button" className="ps3-btn" onClick={() => set((cur) => ({ t: Math.min(n - 1, cur.t + 1) }), "replace")} disabled={atEnd} aria-label="Next step">
          →
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, n - 1)}
        value={q.t}
        onChange={(e) => set({ t: Number(e.target.value) }, "replace")}
        aria-label="Payload position"
        aria-valuetext={stage ? `Step ${q.t + 1} of ${n}: ${stage.title}` : "No steps"}
      />
      <p className="ps3-meta" style={{ margin: 0, minWidth: 220 }} data-testid="flight-step">
        {rec && stage ? `${rec.source_id} · step ${q.t + 1} of ${n} · ${stage.title} · ${step!.status === "ok" ? "passed" : step!.status}` : "No records"}
      </p>
    </footer>
  );
}

/** Phone: one stage at a time, its neighbours named, input → transformation → output in readable text. */
function GuidedPipeline({ store, model, approval, onApprove }: { store: AtlasStore; model: SceneModel; approval: string | null; onApprove: (id: string) => void }) {
  const { q, atlas, set } = store;
  const [complete, setComplete] = useState(false);
  const order = pipelineOrder(atlas);
  const i = Math.max(0, q.node ? order.indexOf(q.node) : 0);
  const at = (j: number) => model.nodes.find((n) => n.id === order[j]);
  const node = at(i)!;
  const prev = i > 0 ? at(i - 1) : undefined;
  const next = i < order.length - 1 ? at(i + 1) : undefined;
  const rec = atlas.trace.records[q.record];
  const reach = reachableSteps(rec);
  const si = rec ? rec.steps.findIndex((s) => s.stage_id === node.stage.id) : -1;
  // Evidence is shown only for a stage the payload has actually reached in this dry run (so status agrees with it);
  // otherwise say where the record stopped, or where the payload is now.
  const reached = si !== -1 && si < reach;
  const step = reached && si <= q.t ? rec!.steps[si] : undefined;
  const stoppedAt = rec && reach < rec.steps.length ? atlas.plan.stages.find((s) => s.id === rec.steps[reach - 1]?.stage_id)?.title : undefined;
  const payloadAt = atlas.plan.stages.find((s) => s.id === rec?.steps[q.t]?.stage_id)?.title;
  const go = (id: string) => set({ node: id });
  const changes = step ? diffFields(step.before, step.after) : [];
  const inputs = changes.filter((c) => c.before !== undefined);
  const outputs = changes.filter((c) => c.after !== undefined);
  const neighbour = (n: typeof prev, label: string) =>
    n ? (
      <button type="button" className="ps3-tour-peer" data-status={n.status} onClick={() => go(n.id)}>
        <span className="ps3-meta">{label}</span> <span>{n.label}</span> <span className="ps3-meta">{STATUS_TEXT[n.status]}</span>
      </button>
    ) : (
      <span className="ps3-tour-peer ps3-tour-peer-empty">{label === "Previous stage" ? "Start of the pipeline" : "End of the pipeline"}</span>
    );

  return (
    <div className="ps3 ps3-tour">
      <header className="ps3-tour-bar" aria-label="Connector">
        <Image src="/brand/halt-horizontal-bone.svg" alt="HALT" width={78} height={22} unoptimized />
        <span className="ps3-sim">SIMULATED</span>
        <label className="ps3-tour-connector">
          <span className="ps3-meta">Connector</span>
          <select value={q.connector} onChange={(e) => set({ connector: e.target.value })}>
            {store.fx.connectors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main className="ps3-tour-main" aria-label="Guided pipeline">
        <h1 className="ps3-title">Connector Atlas</h1>
        <button type="button" className="ps3-btn" aria-pressed={complete} onClick={() => setComplete((c) => !c)}>
          {complete ? "Back to the guided pipeline" : "Complete flow"}
        </button>
        {complete ? (
          <FlowGrid model={model} selected={q.node} onSelect={(id) => (go(id), setComplete(false))} />
        ) : (
          <>
            <div className="ps3-tour-peers">{neighbour(prev, "Previous stage")}</div>
            <section aria-label={`Stage ${i + 1} of ${order.length}: ${node.stage.title}`} className="ps3-tour-stage" data-status={node.status} data-testid="tour-stage">
              <p className="ps3-kicker">{`${ZONE_TITLES[node.zone]} · stage ${i + 1} of ${order.length}`}</p>
              <h2 className="ps3-title" style={{ fontSize: 26 }}>
                {node.label}
              </h2>
              <p style={{ margin: 0 }}>
                <Tag tone={TONE[node.status]}>{STATUS_TEXT[node.status]}</Tag>
              </p>
              {step ? (
                <>
                  <div className="ps3-tour-io">
                    <h3>Transformation</h3>
                    <ul>
                      {step.evidence.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                  {changes.length ? (
                    <>
                      <div className="ps3-tour-io">
                        <h3>Input</h3>
                        <ul className="ps3-mono">
                          {inputs.slice(0, 10).map((c) => (
                            <li key={c.path}>{`${c.path}: ${JSON.stringify(c.before)}`}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="ps3-tour-io">
                        <h3>Output</h3>
                        <ul className="ps3-mono">
                          {outputs.slice(0, 10).map((c) => (
                            <li key={c.path}>{`${c.path}: ${JSON.stringify(c.after)}`}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : (
                    <div className="ps3-tour-io">
                      <h3>Input → output</h3>
                      <p>No field changes: this stage checks or routes the record.</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="ps3-body">
                  {reached ? `Not reached yet: the payload is at ${payloadAt ?? "an earlier stage"}.` : `The record never reached this stage${stoppedAt ? `: it stopped at ${stoppedAt}` : ""}.`}
                </p>
              )}
            </section>
            <div className="ps3-tour-peers">{neighbour(next, "Next stage")}</div>
            <div role="tablist" aria-label="Atlas panels" className="ps3-tabs ps3-tour-tabs">
              {(Object.keys(PANEL_TITLES) as Panel[]).map((p) => (
                <button key={p} type="button" role="tab" aria-selected={q.panel === p} aria-controls="ps3-tour-panel" onClick={() => set({ panel: p })}>
                  {PANEL_TITLES[p]}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="ps3-tour-panel" className="ps3-tour-panel" aria-label={PANEL_TITLES[q.panel]}>
              <PanelBody store={store} approval={approval} onApprove={onApprove} />
            </div>
          </>
        )}
      </main>
      <nav className="ps3-tour-nav" aria-label="Pipeline">
        <button type="button" className="ps3-btn" onClick={() => prev && go(prev.id)} disabled={!prev}>
          ← Previous
        </button>
        <span className="ps3-meta" style={{ alignSelf: "center" }}>{`${i + 1} / ${order.length}`}</span>
        <button type="button" className="ps3-btn ps3-btn-primary" onClick={() => next && go(next.id)} disabled={!next}>
          Next →
        </button>
      </nav>
    </div>
  );
}
