"use client";

import { useEffect, useRef, useState } from "react";

import type { Toggles } from "@/lib/firex/scene";
import type { Shot, WorldModel } from "@/lib/firex/world";

import s from "./firex.module.css";
import { createWorldScene, type WorldHandle } from "./worldScene";

interface Props {
  world: WorldModel;
  selected: string | null;
  onSelect: (id: string | null) => void;
  toggles: Toggles;
  hideContext: boolean;
  replayStep: number | null;
  shot: { shot: Shot; ids: string[] | null; key: number };
  reducedMotion: boolean;
  onUnavailable: () => void;
  onStep?: (delta: number) => void;
  fullBleed?: boolean;
}

/** The scene renders the world model and nothing else. Loaded only where an Attack World opens. */
export default function AttackWorld({ world, selected, onSelect, toggles, hideContext, replayStep, shot, reducedMotion, onUnavailable, onStep, fullBleed }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const handle = useRef<WorldHandle | null>(null);
  const [ready, setReady] = useState(false);
  const selectRef = useRef(onSelect);
  const stepRef = useRef(onStep);
  useEffect(() => {
    selectRef.current = onSelect;
    stepRef.current = onStep;
  }, [onSelect, onStep]);

  useEffect(() => {
    let cancelled = false;
    let created: WorldHandle | null = null;
    Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js"), import("three/examples/jsm/geometries/RoundedBoxGeometry.js"), import("three/examples/jsm/postprocessing/EffectComposer.js"), import("three/examples/jsm/postprocessing/RenderPass.js"), import("three/examples/jsm/postprocessing/UnrealBloomPass.js"), import("three/examples/jsm/postprocessing/ShaderPass.js"), import("three/examples/jsm/shaders/GammaCorrectionShader.js")])
      .then(([THREE, env, rounded, composer, render, bloom, shaderPass, gamma]) => {
        if (cancelled || !frame.current) return;
        created = createWorldScene({ THREE, RoomEnvironment: env.RoomEnvironment, RoundedBoxGeometry: rounded.RoundedBoxGeometry, EffectComposer: composer.EffectComposer, RenderPass: render.RenderPass, UnrealBloomPass: bloom.UnrealBloomPass, ShaderPass: shaderPass.ShaderPass, GammaCorrectionShader: gamma.GammaCorrectionShader }, frame.current, world, {
          select: (id) => selectRef.current(id),
          step: (delta) => stepRef.current?.(delta),
        });
        if (!created) {
          onUnavailable();
          return;
        }
        handle.current = created;
        setReady(true);
      })
      .catch(() => onUnavailable());
    return () => {
      cancelled = true;
      created?.dispose();
      handle.current = null;
    };
    // Built once per incident; everything below updates it in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  useEffect(() => {
    if (ready) handle.current?.update({ selected, toggles, hideContext, replayStep, reducedMotion });
  }, [ready, selected, toggles, hideContext, replayStep, reducedMotion]);

  useEffect(() => {
    if (ready) handle.current?.direct(shot.shot, shot.ids, reducedMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, shot.key]);

  return (
    <div
      ref={frame}
      className={s.canvasFrame}
      style={fullBleed ? { height: "100%", border: 0, borderRadius: 0 } : undefined}
      data-testid="firex-3d"
      role="application"
      tabIndex={0}
      aria-label="Attack World. Left and right arrow keys step through the attack, Home shows everything, Escape clears the selection."
      aria-describedby="world-summary"
    >
      <p className={s.axisNote}>Left to right: source order, not a clock. Height: kill-chain stage. Depth: organisation layer.</p>
    </div>
  );
}
