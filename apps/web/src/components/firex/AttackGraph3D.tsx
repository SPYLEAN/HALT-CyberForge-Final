"use client";

import { useEffect, useRef, useState } from "react";

import type { GraphEdge, GraphNode, IncidentGraph } from "@/lib/firex/api";
import {
  LAYERS,
  LAYER_LABEL,
  SPACING,
  STAGE_ROWS,
  edgeState,
  frameOf,
  nodeState,
  pathSteps,
  replayedNode,
  stageLabel,
  visibleEdge,
  visibleNode,
  type Frame,
  type Position,
  type Toggles,
  type VisualState,
} from "@/lib/firex/scene";
import { ps2Palette } from "@/styles/ps2-palette";

import s from "./firex.module.css";

const COLORS: Record<VisualState, string> = {
  selected_path: ps2Palette.threat,
  observed: ps2Palette.proof,
  inferred: ps2Palette.forecast,
  reachable: ps2Palette.continuity,
  context: ps2Palette.neutral,
  missing: ps2Palette.threat,
};

interface Props {
  graph: IncidentGraph;
  positions: Map<string, Position>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  toggles: Toggles;
  replayStep: number | null;
  focusIds: string[] | null;
  focusKey: number;
  reducedMotion: boolean;
  onUnavailable: () => void;
}

/** Plain three.js: R3F and Drei are not installed. Only one incident's capped subgraph ever reaches WebGL. */
export default function AttackGraph3D(props: Props) {
  const { graph, positions, selected, onSelect, toggles, replayStep, focusIds, focusKey, reducedMotion, onUnavailable } = props;
  const frame = useRef<HTMLDivElement>(null);
  const tags = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneHandle | null>(null);
  const [ready, setReady] = useState(false);
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    let handle: SceneHandle | null = null;
    import("three")
      .then((THREE) => {
        if (cancelled || !frame.current || !tags.current) return;
        handle = createScene(THREE, frame.current, tags.current, graph, positions, (id) => selectRef.current(id));
        if (!handle) {
          onUnavailable();
          return;
        }
        scene.current = handle;
        setReady(true);
      })
      .catch(() => onUnavailable());
    return () => {
      cancelled = true;
      handle?.dispose();
      scene.current = null;
    };
    // The scene is rebuilt only for a new graph; everything else below updates it in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, positions]);

  useEffect(() => {
    if (ready) scene.current?.update({ selected, toggles, replayStep, reducedMotion });
  }, [ready, selected, toggles, replayStep, reducedMotion]);

  useEffect(() => {
    if (ready) scene.current?.focus(frameOf(focusIds ?? graph.nodes.map((n) => n.node_id), positions));
  }, [ready, focusIds, focusKey, graph, positions]);

  return (
    <div
      ref={frame}
      className={s.canvasFrame}
      data-testid="firex-3d"
      role="img"
      aria-label={`3D attack path: ${graph.nodes.length} nodes and ${graph.edges.length} links. The list beside it has the same content.`}
    >
      <div ref={tags} aria-hidden />
      <p className={s.axisNote}>Left to right: source order. Height: kill-chain stage. Depth: organisation layer.</p>
    </div>
  );
}

interface SceneUpdate {
  selected: string | null;
  toggles: Toggles;
  replayStep: number | null;
  reducedMotion: boolean;
}

interface SceneHandle {
  update(next: SceneUpdate): void;
  focus(target: Frame): void;
  dispose(): void;
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- three r128 has no type declarations here
function createScene(THREE: any, host: HTMLElement, tagHost: HTMLElement, graph: IncidentGraph, positions: Map<string, Position>, select: (id: string | null) => void): SceneHandle | null {
  if (!webglAvailable()) return null;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.prepend(renderer.domElement);
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  world.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(4, 10, 6);
  world.add(key);

  const toVector = (p: Position) => new THREE.Vector3(p.x, p.y, p.z);
  const meshes = new Map<string, { mesh: { [k: string]: never } & Record<string, unknown>; node: GraphNode }>();
  const pickable: unknown[] = [];
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const octa = new THREE.OctahedronGeometry(1, 0);
  for (const node of graph.nodes) {
    const position = positions.get(node.node_id);
    if (!position) continue;
    const isStep = node.kind === "event" || node.kind === "burst";
    const size = isStep ? 0.34 + Math.min(0.36, Math.log10(Math.max(1, node.count)) * 0.1) : 0.2;
    const state = nodeState(node);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(COLORS[state]),
      transparent: state === "reachable" || state === "context",
      opacity: state === "reachable" ? 0.5 : state === "context" ? 0.55 : 1,
      roughness: 0.6,
    });
    const mesh = new THREE.Mesh(isStep ? sphere : octa, material);
    mesh.position.copy(toVector(position));
    mesh.scale.setScalar(size);
    mesh.userData = { id: node.node_id, baseScale: size };
    world.add(mesh);
    meshes.set(node.node_id, { mesh, node });
    pickable.push(mesh);
  }

  // Semantic guides for the stage and layer rows in use, so position reads as meaning.
  const allPoints = [...positions.values()];
  const minX = Math.min(...allPoints.map((p) => p.x)) - 1;
  const maxX = Math.max(...allPoints.map((p) => p.x)) + 1;
  const stagedRows = [...new Set(graph.nodes.map((n) => n.stage))]
    .map((name) => STAGE_ROWS.indexOf(name as (typeof STAGE_ROWS)[number]))
    .filter((row) => row >= 0);
  const usedLayers = [...new Set(graph.nodes.map((n) => LAYERS.indexOf(n.layer as (typeof LAYERS)[number])))].filter((l) => l >= 0);
  const guideMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(ps2Palette.neutral), transparent: true, opacity: 0.7 });
  const guides: Array<{ dispose(): void }> = [];
  const addGuide = (a: Position, b: Position) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([toVector(a), toVector(b)]);
    world.add(new THREE.Line(geometry, guideMaterial));
    guides.push(geometry);
  };
  const labels: Array<{ span: HTMLSpanElement; at: Position }> = [];
  const addLabel = (text: string, at: Position) => {
    const span = document.createElement("span");
    span.className = s.axisLabel!;
    span.textContent = text;
    tagHost.append(span);
    labels.push({ span, at });
  };
  for (const row of stagedRows) {
    addGuide({ x: minX, y: row * SPACING.y, z: 0 }, { x: maxX, y: row * SPACING.y, z: 0 });
    addLabel(stageLabel(STAGE_ROWS[row]), { x: minX, y: row * SPACING.y, z: 0 });
  }
  for (const layer of usedLayers) {
    addGuide({ x: minX, y: -0.8, z: layer * SPACING.z }, { x: maxX, y: -0.8, z: layer * SPACING.z });
    addLabel(LAYER_LABEL[LAYERS[layer]!], { x: minX, y: -0.8, z: layer * SPACING.z });
  }

  const lines: Array<{ objects: Array<Record<string, unknown>>; edge: GraphEdge }> = [];
  for (const edge of graph.edges) {
    const from = positions.get(edge.source);
    const to = positions.get(edge.target);
    if (!from || !to) continue;
    const state = edgeState(edge);
    const dashed = state === "inferred" || state === "reachable";
    const make = (a: Position, b: Position) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([toVector(a), toVector(b)]);
      const material = dashed
        ? new THREE.LineDashedMaterial({ color: new THREE.Color(COLORS[state]), dashSize: 0.28, gapSize: 0.18, transparent: true, opacity: state === "reachable" ? 0.55 : 0.95 })
        : new THREE.LineBasicMaterial({ color: new THREE.Color(COLORS[state]), transparent: true, opacity: edge.classification === "observed" && !edge.on_selected_path ? 0.45 : 1 });
      const line = new THREE.Line(geometry, material);
      if (dashed) line.computeLineDistances();
      line.userData = { edge: edge.edge_id };
      world.add(line);
      return line;
    };
    const along = (t: number): Position => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t });
    // WebGL lines are one pixel wide, so the selected path is a tube, in dashes where a rule inferred the link.
    const tube = (a: Position, b: Position) => {
      const start = toVector(a);
      const end = toVector(b);
      const geometry = new THREE.CylinderGeometry(0.055, 0.055, start.distanceTo(end), 8);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[state]) }));
      mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
      mesh.userData = { edge: edge.edge_id };
      world.add(mesh);
      return mesh;
    };
    let segments;
    if (edge.missing_evidence) {
      // A gap in the evidence draws as a broken segment.
      segments = edge.on_selected_path ? [tube(from, along(0.4)), tube(along(0.6), to)] : [make(from, along(0.4)), make(along(0.6), to)];
    } else if (edge.on_selected_path) {
      const dashes = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / 0.6));
      segments = Array.from({ length: dashes }, (_, i) => tube(along(i / dashes), along((i + 0.62) / dashes)));
    } else {
      segments = [make(from, to)];
    }
    lines.push({ objects: segments, edge });
    pickable.push(...segments);
  }

  const steps = pathSteps(graph);
  const tagFor = new Map<string, HTMLSpanElement>();
  steps.forEach((node, i) => {
    const span = document.createElement("span");
    span.className = s.tag!;
    span.textContent = String(i + 1);
    tagHost.append(span);
    tagFor.set(node.node_id, span);
  });

  // Camera orbit: rotate, pan and zoom around a target. It never moves by itself.
  const target = new THREE.Vector3();
  let theta = -0.55;
  let phi = 1.2;
  let distance = 18;
  const placeCamera = () => {
    camera.position.set(
      target.x + distance * Math.sin(phi) * Math.sin(theta),
      target.y + distance * Math.cos(phi),
      target.z + distance * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(target);
  };

  let current: SceneUpdate = { selected: null, toggles: { observed: true, inferred: true, reachable: true }, replayStep: null, reducedMotion: true };
  const projected = new THREE.Vector3();
  const draw = () => {
    placeCamera();
    renderer.render(world, camera);
    const { clientWidth: w, clientHeight: h } = host;
    tagFor.forEach((span, id) => {
      const entry = meshes.get(id);
      if (!entry || !(entry.mesh as unknown as { visible: boolean }).visible) {
        span.style.display = "none";
        return;
      }
      projected.copy((entry.mesh as unknown as { position: unknown }).position).project(camera);
      span.style.display = projected.z < 1 ? "block" : "none";
      span.style.left = `${((projected.x + 1) / 2) * w}px`;
      span.style.top = `${((1 - projected.y) / 2) * h}px`;
    });
    for (const label of labels) {
      projected.copy(toVector(label.at)).project(camera);
      const x = ((projected.x + 1) / 2) * w;
      label.span.style.display = projected.z < 1 && x > 90 ? "block" : "none";
      label.span.style.left = `${x - 6}px`;
      label.span.style.top = `${((1 - projected.y) / 2) * h}px`;
    }
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  let pulse = 0;
  let raf = 0;
  const animate = () => {
    raf = 0;
    const entry = current.selected ? meshes.get(current.selected) : undefined;
    if (!entry || current.reducedMotion) {
      draw();
      return;
    }
    pulse += 0.06;
    const mesh = entry.mesh as unknown as { userData: { baseScale: number }; scale: { setScalar(v: number): void } };
    mesh.scale.setScalar(mesh.userData.baseScale * (1.35 + 0.2 * Math.sin(pulse)));
    draw();
    raf = requestAnimationFrame(animate);
  };

  const canvas: HTMLCanvasElement = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.12 };
  let drag: { x: number; y: number; moved: boolean; pan: boolean } | null = null;
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.shiftKey || e.button === 2 };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.pan) {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      const scale = distance * 0.0016;
      target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    } else {
      theta -= dx * 0.006;
      phi = Math.min(Math.PI - 0.05, Math.max(0.05, phi - dy * 0.006));
    }
    draw();
  };
  const onUp = (e: PointerEvent) => {
    const state = drag;
    drag = null;
    if (!state || state.moved) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickable).filter((h: { object: { visible: boolean } }) => h.object.visible);
    const mesh = hits.find((h: { object: { userData: { id?: string } } }) => h.object.userData.id);
    const hit = mesh ?? hits[0];
    select(hit ? (hit.object.userData.id ?? `edge:${hit.object.userData.edge}`) : null);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    distance = Math.min(400, Math.max(2, distance * (1 + Math.sign(e.deltaY) * 0.09)));
    draw();
  };
  const onContext = (e: Event) => e.preventDefault();
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContext);

  return {
    update(next) {
      current = next;
      for (const { mesh, node } of meshes.values()) {
        const m = mesh as unknown as {
          visible: boolean;
          userData: { baseScale: number };
          scale: { setScalar(v: number): void };
          material: { emissive: { set(c: string): void }; emissiveIntensity: number };
        };
        m.visible = visibleNode(node, next.toggles) && replayedNode(node, next.replayStep, steps);
        const chosen = next.selected === node.node_id;
        m.scale.setScalar(m.userData.baseScale * (chosen ? 1.5 : 1));
        m.material.emissive.set(chosen ? ps2Palette.proof : "rgb(0, 0, 0)");
        m.material.emissiveIntensity = chosen ? 0.9 : 0;
      }
      const byId = new Map(graph.nodes.map((n) => [n.node_id, n]));
      for (const { objects, edge } of lines) {
        const source = byId.get(edge.source);
        const dest = byId.get(edge.target);
        const shown =
          visibleEdge(edge, next.toggles) &&
          Boolean(source && dest) &&
          visibleNode(source!, next.toggles) &&
          visibleNode(dest!, next.toggles) &&
          replayedNode(source!, next.replayStep, steps) &&
          replayedNode(dest!, next.replayStep, steps);
        for (const line of objects) {
          (line as { visible?: boolean }).visible = shown;
          const color = next.selected === `edge:${edge.edge_id}` ? ps2Palette.proof : COLORS[edgeState(edge)];
          (line as unknown as { material: { color: { set(c: string): void } } }).material.color.set(color);
        }
      }
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(animate);
    },
    focus(goal) {
      target.set(goal.center.x, goal.center.y, goal.center.z);
      distance = Math.max(8, goal.radius * 2.6);
      draw();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContext);
      guides.forEach((g) => g.dispose());
      guideMaterial.dispose();
      labels.forEach((l) => l.span.remove());
      sphere.dispose();
      octa.dispose();
      for (const { mesh } of meshes.values()) (mesh as unknown as { material: { dispose(): void } }).material.dispose();
      for (const { objects } of lines)
        for (const line of objects) {
          const l = line as unknown as { geometry: { dispose(): void }; material: { dispose(): void } };
          l.geometry.dispose();
          l.material.dispose();
        }
      renderer.dispose();
      canvas.remove();
      tagFor.forEach((span) => span.remove());
    },
  };
}
