"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";

import { reachableSteps, type Panel } from "@/lib/ps3/atlas";
import { ZONES } from "@/lib/ps3/engine";
import { pipelineOrder, STATUS_TEXT, toScene, ZONE_TITLES, type SceneModel } from "@/lib/ps3/scene";
import { stepNode } from "@/lib/ps3/store";

import type { CameraCommand } from "./AtlasCanvas";
import { Flow2D } from "./Flow2D";
import { useCompact, useReducedMotion, useWebGL, type AtlasStore } from "./hooks";
import { PanelBody, Panels, Tag } from "./panels";

const AtlasCanvas = dynamic(() => import("./AtlasCanvas"), { ssr: false, loading: () => null });

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

export function AtlasView({ store, caption }: { store: AtlasStore; caption?: ReactNode }) {
  const { q, atlas, set, fx, focus } = store;
  const model = useMemo(() => toScene(atlas, q), [atlas, q]);
  const compact = useCompact();
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const [approvals, setApprovals] = useState<Record<string, string>>({});
  const approval = approvals[atlas.receipt.id] ?? null;
  const onApprove = (id: string) => setApprovals((a) => ({ ...a, [atlas.receipt.id]: id }));

  // Selecting opens the stage's panel and moves the payload there (lib/ps3/store.ts) and asks the camera to frame it.
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

  if (compact) return <GuidedTour store={store} model={model} approval={approval} onApprove={onApprove} />;

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
      <p className="sr-only" aria-live="polite">
        {q.node ? `Selected ${model.nodes.find((n) => n.id === q.node)?.label ?? q.node}` : ""}
      </p>
      <span hidden data-testid="atlas-state" data-connector={q.connector} data-node={q.node ?? ""} data-t={q.t} data-drift={q.drift ?? ""} data-digest={atlas.trace.digest} data-fixtures={fx.connectors.length} />
    </div>
  );
}

function AtlasBar({ store }: { store: AtlasStore }) {
  const { fx, q, set, atlas } = store;
  return (
    <header className="ps3-bar" aria-label="Connector">
      <Image src="/brand/halt-horizontal-bone.svg" alt="HALT" width={92} height={26} unoptimized priority />
      <div style={{ minWidth: 0 }}>
        <p className="ps3-kicker">Connector Atlas</p>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>See the complete data journey before you activate it</p>
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
      <Link className="ps3-btn" href="/atlas/theatre">
        Theatre
      </Link>
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
                    <span>{n.label}</span>
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
  const full2d = (
    <div className="ps3-flow-full">
      <Flow2D model={model} selected={q.node} onSelect={onSelect} variant="full" />
    </div>
  );
  const driftKey = atlas.analysis && !atlas.repaired ? `${q.connector}:${q.drift}` : null;
  if (webgl === false) {
    return (
      <>
        <p className="ps3-notice" role="status" style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 2, background: "var(--ps3-bg)" }}>
          3D is unavailable on this device (no WebGL). The complete 2D flow below has every object and action.
        </p>
        {full2d}
      </>
    );
  }
  return (
    <>
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
      {webgl === null ? (
        full2d
      ) : (
        <SceneBoundary fallback={full2d}>
          <div style={{ position: "absolute", inset: 0 }} data-atlas-scene>
            <AtlasCanvas model={model} selected={q.node} onSelect={onSelect} focus={focus} command={command} follow={follow} reduced={reduced} labels t={q.t} driftKey={driftKey} />
          </div>
        </SceneBoundary>
      )}
      {webgl ? (
        <div className="ps3-minimap">
          <Flow2D model={model} selected={q.node} onSelect={onSelect} variant="mini" />
        </div>
      ) : null}
    </>
  );
}

/** Time per replay step; the packet travels for FLIGHT_MS (600 ms) of it and the scene is idle for the rest. */
export const STEP_MS = 900;

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
      <input type="range" min={0} max={Math.max(0, n - 1)} value={q.t} onChange={(e) => set({ t: Number(e.target.value) }, "replace")} aria-label="Payload position" aria-valuetext={stage ? `Step ${q.t + 1} of ${n}: ${stage.title}` : "No steps"} />
      <p className="ps3-meta" style={{ margin: 0, minWidth: 220 }} data-testid="flight-step">
        {rec && stage ? `${rec.source_id} · step ${q.t + 1} of ${n} · ${stage.title} · ${step!.status === "ok" ? "passed" : step!.status}` : "No records"}
      </p>
    </footer>
  );
}

function GuidedTour({ store, model, approval, onApprove }: { store: AtlasStore; model: SceneModel; approval: string | null; onApprove: (id: string) => void }) {
  const { q, atlas, set } = store;
  const [flow, setFlow] = useState(false);
  const order = pipelineOrder(atlas);
  const i = Math.max(0, q.node ? order.indexOf(q.node) : 0);
  const node = model.nodes.find((n) => n.id === order[i])!;
  const rec = atlas.trace.records[q.record];
  const step = rec?.steps.find((s) => s.stage_id === node.stage.id);
  const go = (j: number) => set({ node: order[j]! });
  return (
    <div className="ps3 ps3-tour">
      <header className="ps3-tour-bar" aria-label="Connector">
        <Image src="/brand/halt-horizontal-bone.svg" alt="HALT" width={78} height={22} unoptimized priority />
        <span className="ps3-sim">SIMULATED</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
          <span className="ps3-meta">Connector</span>
          <select value={q.connector} onChange={(e) => set({ connector: e.target.value })} className="ps3-btn" style={{ flex: 1, textTransform: "none", fontFamily: "var(--font-display)" }}>
            {store.fx.connectors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main className="ps3-tour-main" aria-label="Guided tour">
        <h1 className="ps3-title">Connector Atlas</h1>
        <button type="button" className="ps3-btn" aria-pressed={flow} onClick={() => setFlow((f) => !f)}>
          {flow ? "Back to the guided tour" : "View complete 2D flow"}
        </button>
        {flow ? (
          <Flow2D model={model} selected={q.node} onSelect={(id) => set({ node: id })} variant="full" />
        ) : (
          <>
            <section aria-label={`Stage ${i + 1} of ${order.length}`} className="ps3-notice" data-status={node.status} style={{ display: "grid", gap: 8 }}>
              <p className="ps3-kicker">{`${ZONE_TITLES[node.zone]} · stage ${i + 1} of ${order.length}`}</p>
              <h2 className="ps3-title" style={{ fontSize: 26 }}>
                {node.label}
              </h2>
              <p style={{ margin: 0 }}>
                <Tag tone={node.status === "passed" ? "ok" : node.status === "failed" ? "fail" : node.status === "drift" ? "drift" : node.status === "active" ? "active" : undefined}>{STATUS_TEXT[node.status]}</Tag>
              </p>
              {step ? (
                <ul className="ps3-body" style={{ margin: 0, paddingLeft: 18 }}>
                  {step.evidence.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
            </section>
            <div role="tablist" aria-label="Atlas panels" className="ps3-tabs" style={{ padding: 0 }}>
              {(["lens", "mapping", "flight", "drift", "proof", "gate"] as Panel[]).map((p) => (
                <button key={p} type="button" role="tab" aria-selected={q.panel === p} onClick={() => set({ panel: p })}>
                  {p === "lens" ? "Source" : p === "gate" ? "Activation" : p[0]!.toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <div role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <PanelBody store={store} approval={approval} onApprove={onApprove} />
            </div>
          </>
        )}
      </main>
      <nav className="ps3-tour-nav" aria-label="Tour">
        <button type="button" className="ps3-btn" onClick={() => go(Math.max(0, i - 1))} disabled={i === 0}>
          ← Previous
        </button>
        <span className="ps3-meta" style={{ alignSelf: "center" }}>{`${i + 1} / ${order.length}`}</span>
        <button type="button" className="ps3-btn ps3-btn-primary" onClick={() => go(Math.min(order.length - 1, i + 1))} disabled={i === order.length - 1}>
          Next →
        </button>
      </nav>
    </div>
  );
}
