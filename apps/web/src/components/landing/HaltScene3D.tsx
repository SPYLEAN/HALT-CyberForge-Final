"use client";

import { useEffect, useRef, useState } from "react";

// The supplied procedural scene (06-3d-motion-system), loaded unmodified: three.js r128 plus three classic
// scripts that share top-level declarations. It is supplementary; every label and figure stays in HTML.
export const SCENE_STATES = ["dormant", "intrusion", "reconstruction", "business", "futures", "contained", "verified"] as const;
export type SceneState = (typeof SCENE_STATES)[number];

const SCRIPTS = ["/vendor/three/three.min.js", "/vendor/halt-3d/halt-spec.js", "/vendor/halt-3d/halt-scene-a.js", "/vendor/halt-3d/halt-scene-b.js"];

interface SceneInstance {
  setState(name: SceneState): void;
  dispose(): void;
}
interface SceneClass {
  new (canvas: HTMLCanvasElement, labelRoot: HTMLElement, opts: Record<string, unknown>): SceneInstance;
  supported(): boolean;
}

let loading: Promise<SceneClass | null> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-halt-3d="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.halt3d = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadScene(): Promise<SceneClass | null> {
  loading ??= (async () => {
    for (const src of SCRIPTS) await loadScript(src);
    // `class HaltScene` is a global lexical binding, not a window property, so it is read from global scope
    // with a constant function body (nothing is interpolated into it).
    return new Function("return typeof HaltScene === 'undefined' ? null : HaltScene")() as SceneClass | null;
  })().catch(() => null);
  return loading;
}

export function posterFor(state: SceneState): string {
  return `/3d/svg/halt-fallback-${state}.svg`;
}

/** Live scene when WebGL is available and motion is allowed; otherwise the supplied static poster. */
export function HaltScene3D({ state }: { state: SceneState }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneInstance | null>(null);
  const [mode, setMode] = useState<"pending" | "live" | "poster">("pending");

  useEffect(() => {
    let disposed = false;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      queueMicrotask(() => setMode("poster"));
      return;
    }
    loadScene().then((Scene) => {
      if (disposed || !canvas.current || !labels.current) return;
      if (!Scene || !Scene.supported()) {
        setMode("poster");
        return;
      }
      const narrow = window.innerWidth < 900 || (navigator.hardwareConcurrency ?? 8) < 4;
      scene.current = new Scene(canvas.current, labels.current, {
        quality: narrow ? "low" : "balanced",
        layout: narrow ? "mobile" : "website",
        state: "dormant",
        transparent: true,
        onLost: () => setMode("poster"),
      });
      setMode("live");
    });
    return () => {
      disposed = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.setState(state);
  }, [state, mode]);

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0 }} data-testid="halt-3d" data-mode={mode} data-state={state}>
      {mode === "poster" ? (
        // eslint-disable-next-line @next/next/no-img-element -- supplied static SVG poster, no optimisation wanted
        <img src={posterFor(state)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} data-testid="halt-3d-poster" />
      ) : null}
      <canvas ref={canvas} style={{ width: "100%", height: "100%", display: mode === "poster" ? "none" : "block" }} />
      <div ref={labels} className="landing-scene-labels" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
    </div>
  );
}
