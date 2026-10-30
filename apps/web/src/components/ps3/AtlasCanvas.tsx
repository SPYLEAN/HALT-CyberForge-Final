"use client";

// The Connector Atlas in 3D. It renders the scene model and nothing else: no object, colour or motion here is
// independent of Atlas state. Renders on demand; continuous only while the payload or the camera moves.
import { CameraControls, Line, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import * as THREE from "three";

import { fits, frameBox, nodesBounds, overlayPadding, sceneBounds, type Box, type View, type Viewport } from "@/lib/ps3/camera";
import { cameraTransition, ZONE_TITLES, type NodeStatus, type SceneModel, type SceneNode } from "@/lib/ps3/scene";

export type CameraCommand = { kind: "home" | "focus" | "reset" | "lens"; seq: number };

interface Palette {
  structure: THREE.Color;
  carbon: THREE.Color;
  bg: THREE.Color;
  status: Record<NodeStatus, THREE.Color>;
  gold: THREE.Color;
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const c = (v: string) => new THREE.Color(css.getPropertyValue(v).trim() || "white");
  const bg = c("--ps3-bg");
  const structure = c("--ps3-structure");
  return {
    structure,
    carbon: c("--ps3-carbon"),
    bg,
    gold: c("--ps3-active"),
    status: {
      idle: c("--ps3-carbon").clone().lerp(structure, 0.18),
      passed: c("--ps3-verified"),
      active: c("--ps3-active"),
      failed: c("--ps3-failure"),
      drift: c("--ps3-drift"),
      receded: c("--ps3-carbon").clone().lerp(bg, 0.4),
    },
  };
}

const sizeOf = (n: SceneNode): [number, number, number] => (n.zone === "source" || n.zone === "destination" ? [1.1, 1.9, 1.1] : [0.8, 0.5, 0.8]);

function Zones({ model, palette }: { model: SceneModel; palette: Palette }) {
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(box), [box]);
  return (
    <>
      {model.zones.map((z) => (
        <group key={z.zone} position={[z.x, 0, 0]} scale={[z.width, 7.4, 3.2]}>
          <mesh geometry={box} renderOrder={-1}>
            <meshStandardMaterial color={palette.structure} transparent opacity={0.035} depthWrite={false} roughness={0.9} />
          </mesh>
          <lineSegments geometry={edges}>
            <lineBasicMaterial color={palette.structure} transparent opacity={0.22} />
          </lineSegments>
        </group>
      ))}
    </>
  );
}

/** Zone labels are DOM text (never WebGL): each rendered frame moves them to their zone's projected top centre. */
function ZoneLabelPositioner({ model }: { model: SceneModel }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size, gl }) => {
    const host = gl.domElement.closest("[data-atlas-scene]");
    for (const z of model.zones) {
      const el = host?.querySelector<HTMLElement>(`[data-zone-label="${z.zone}"]`);
      if (!el) continue;
      v.set(z.x, 4.1, 0).project(camera);
      const visible = v.z < 1;
      el.style.visibility = visible ? "visible" : "hidden";
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
    }
  });
  return null;
}

function Rails({ model, palette }: { model: SceneModel; palette: Palette }) {
  const lanes = [...new Set(model.nodes.filter((n) => n.connector).map((n) => n.position[1]))];
  return (
    <>
      {lanes.map((y) => (
        <mesh key={y} position={[-1.6, y - 0.32, 0]}>
          <boxGeometry args={[17.6, 0.06, 0.5]} />
          <meshStandardMaterial color={palette.carbon} roughness={0.85} metalness={0.3} />
        </mesh>
      ))}
    </>
  );
}

function Nodes({ model, palette, selected, onSelect }: { model: SceneModel; palette: Palette; selected: string | null; onSelect: (id: string) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    model.nodes.forEach((n, i) => {
      const [sx, sy, sz] = sizeOf(n);
      const [x, y, z] = n.position;
      m.compose(new THREE.Vector3(x, y + (sy - 0.5) / 2, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, palette.status[n.status]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [model, palette, invalidate]);
  const sel = model.nodes.find((n) => n.id === selected);
  return (
    <>
      <instancedMesh
        key={model.nodes.length}
        ref={ref}
        args={[undefined, undefined, model.nodes.length]}
        onClick={(e) => {
          e.stopPropagation();
          const n = e.instanceId !== undefined ? model.nodes[e.instanceId] : undefined;
          if (n) onSelect(n.id);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.45} metalness={0.55} />
      </instancedMesh>
      {sel ? (
        <mesh position={[sel.position[0], sel.position[1] + (sizeOf(sel)[1] - 0.5) / 2, 0]} scale={sizeOf(sel).map((v) => v + 0.22) as [number, number, number]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={palette.structure} wireframe />
        </mesh>
      ) : null}
    </>
  );
}

function Edges({ model, palette }: { model: SceneModel; palette: Palette }) {
  const pos = new Map(model.nodes.map((n) => [n.id, n.position]));
  return (
    <>
      {model.edges.map((e) => {
        const a = pos.get(e.from)!;
        const b = pos.get(e.to)!;
        const dashed = e.status === "idle" || e.status === "failed" || e.status === "drift" || e.status === "receded";
        return (
          <Line
            key={`${e.id}-${e.status}`}
            points={[a, b]}
            color={e.status === "idle" ? palette.status.idle.clone().lerp(palette.structure, 0.3) : palette.status[e.status]}
            lineWidth={e.status === "passed" ? 2.6 : 1.4}
            dashed={dashed}
            dashSize={0.25}
            gapSize={0.18}
            transparent
            opacity={e.status === "receded" ? 0.35 : 1}
          />
        );
      })}
    </>
  );
}

function ProofMarkers({ model, palette }: { model: SceneModel; palette: Palette }) {
  const proofs = model.nodes.filter((n) => n.proof);
  const ring = useRef<THREE.InstancedMesh>(null);
  const core = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    proofs.forEach((n, i) => {
      const top = n.position[1] + sizeOf(n)[1] - 0.1;
      m.makeTranslation(n.position[0], top + 0.35, 0);
      ring.current?.setMatrixAt(i, m);
      core.current?.setMatrixAt(i, m);
    });
    if (ring.current) ring.current.instanceMatrix.needsUpdate = true;
    if (core.current) core.current.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [proofs, invalidate]);
  if (!proofs.length) return null;
  return (
    <group key={proofs.length}>
      <instancedMesh ref={ring} args={[undefined, undefined, proofs.length]}>
        <torusGeometry args={[0.2, 0.045, 10, 36]} />
        <meshBasicMaterial color={palette.structure} />
      </instancedMesh>
      <instancedMesh ref={core} args={[undefined, undefined, proofs.length]}>
        <sphereGeometry args={[0.08, 16, 12]} />
        <meshBasicMaterial color={palette.status.passed} />
      </instancedMesh>
    </group>
  );
}

/** Duration of one stage-to-stage packet move. Rendering is continuous only for this long, then stops. */
export const FLIGHT_MS = 600;
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

type Probe = {
  __ps3Frames?: number[];
  __ps3Packet?: { node: string | null; moving: boolean; moves: number; position: [number, number, number] | null };
  __ps3Camera?: {
    position: number[];
    target: number[];
    width: number;
    height: number;
    zones: { zone: string; inView: boolean }[];
    allZonesInView: boolean;
    offscreenCritical: string[];
    screen: Record<string, [number, number]>; // node centres in canvas pixels
  };
};
const probe = () => window as unknown as Probe;

/**
 * The payload. One step forward (a replay advancing) travels along the rail for FLIGHT_MS with a frame requested
 * on every animation frame; any other change (scrub, record switch, reduced motion, first placement) jumps there.
 * Timing is wall-clock (performance.now), so a hidden tab never animates and resumes at the final position.
 */
function Packet({ model, palette, reduced, t }: { model: SceneModel; palette: Palette; reduced: boolean; t: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; start: number } | null>(null);
  const last = useRef<{ t: number; node: string } | null>(null);
  const node = model.packet ? model.nodes.find((n) => n.id === model.packet!.node) : undefined;
  const key = node ? `${node.id}|${node.position.join(",")}` : "";

  useEffect(() => {
    const m = ref.current;
    if (!m || !node) return;
    const to = new THREE.Vector3(node.position[0], node.position[1] + sizeOf(node)[1] + 0.05, 0.62);
    const prev = last.current;
    const oneStep = prev !== null && prev.node !== node.id && t === prev.t + 1;
    if (oneStep && !reduced) {
      anim.current = { from: m.position.clone(), to, start: performance.now() };
      const w = window as unknown as { __ps3Moves?: number[] };
      (w.__ps3Moves ??= []).push(anim.current.start);
    } else {
      anim.current = null;
      m.position.copy(to);
    }
    last.current = { t, node: node.id };
    const w = window as unknown as { __ps3Path?: string[] };
    if ((w.__ps3Path ??= [])[w.__ps3Path.length - 1] !== node.id) w.__ps3Path.push(node.id);
    const p = probe();
    p.__ps3Packet = { node: node.id, moving: Boolean(anim.current), moves: (p.__ps3Packet?.moves ?? 0) + (anim.current ? 1 : 0), position: [to.x, to.y, to.z] };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the target node and step
  }, [key, t, reduced]);

  useFrame(() => {
    const a = anim.current;
    const m = ref.current;
    if (!a || !m) return;
    const k = Math.min(1, (performance.now() - a.start) / FLIGHT_MS);
    m.position.lerpVectors(a.from, a.to, ease(k));
    const w = window as unknown as { __ps3Trail?: [number, number][] };
    (w.__ps3Trail ??= []).push([a.start, k]); // one entry per rendered frame of a move: the packet's progress
    if (w.__ps3Trail.length > 4000) w.__ps3Trail.shift();
    if (k < 1) invalidate();
    else {
      anim.current = null;
      const p = probe().__ps3Packet;
      if (p) p.moving = false;
    }
  });
  if (!node || !model.packet) return null;
  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.32, 0.32, 0.32]} />
      <meshStandardMaterial
        color={model.packet.status === "failed" ? palette.status.failed : palette.gold}
        emissive={model.packet.status === "failed" ? palette.status.failed : palette.gold}
        emissiveIntensity={0.55}
      />
    </mesh>
  );
}

interface CameraProps {
  model: SceneModel;
  focus: { node: string | null; seq: number };
  command: CameraCommand;
  follow: boolean;
  reduced: boolean;
  driftKey: string | null;
  minimap: boolean;
}

const NO_PAD = { top: 0, right: 0, bottom: 0, left: 0 };
const zoneBox = (z: SceneModel["zones"][number]): Box => ({ min: [z.x - z.width / 2, -3.7, -1.6], max: [z.x + z.width / 2, 3.7, 1.6] });

function Camera({ model, focus, command, follow, reduced, driftKey, minimap }: CameraProps) {
  const ref = useRef<ComponentRef<typeof CameraControls>>(null);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const smooth = cameraTransition(reduced);
  const canonical = useRef(true); // true until the viewer moves the camera or asks for another framing
  const vp: Viewport = useMemo(
    () => ({ width: size.width, height: size.height, fov: camera.fov, pad: overlayPadding(size.width, size.height, minimap) }),
    [size.width, size.height, camera.fov, minimap],
  );
  const zonesKey = model.zones.map((z) => `${z.zone}:${z.x}:${z.width}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the zones' geometry, not the model object, decides the frame
  const home = useMemo(() => frameBox(sceneBounds(model), vp), [zonesKey, vp]);
  const apply = (view: View, transition: boolean) => void ref.current?.setLookAt(...view.position, ...view.target, transition);
  const critical = model.nodes.filter((n) => n.status === "drift" || n.status === "failed");

  // Initial view, and every resize while canonical: the canonical frame, immediately.
  useEffect(() => {
    if (canonical.current) apply(home, false);
  }, [home]);

  // Home and Reset: exactly the canonical view. Focus: the selected object.
  useEffect(() => {
    if (command.seq === 0) return;
    if (command.kind === "home" || command.kind === "reset") {
      canonical.current = true;
      apply(home, smooth);
    } else if (command.kind === "focus") {
      const n = model.nodes.find((x) => x.id === focus.node);
      if (n) {
        canonical.current = false;
        apply(frameBox(nodesBounds([n], 2.4)!, vp), smooth);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the press only
  }, [command.seq]);

  // An explicit selection frames that object; the Source Lens looks down the source's rail.
  useEffect(() => {
    if (focus.seq === 0) return;
    const n = model.nodes.find((x) => x.id === focus.node);
    if (!n) return;
    canonical.current = false;
    if (n.zone === "source") {
      const [x, y] = n.position;
      void ref.current?.setLookAt(x - 3.2, y + 1.6, 3.4, x + 7, y, 0, smooth);
    } else apply(frameBox(nodesBounds([n], 2.4)!, vp), smooth);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the request only
  }, [focus.seq]);

  // Drift Shockwave: frame every affected mapping and broken destination together.
  useEffect(() => {
    if (!driftKey) return;
    const box = nodesBounds(critical, 1.6);
    if (!box) return;
    canonical.current = false;
    apply(frameBox(box, vp), smooth);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reframe when the drift scenario or viewport changes
  }, [driftKey, vp]);

  // Payload follow: keep the packet's stage framed as it advances.
  const packetNode = model.packet ? model.nodes.find((n) => n.id === model.packet!.node) : undefined;
  useEffect(() => {
    if (!follow || !packetNode) return;
    canonical.current = false;
    apply(frameBox(nodesBounds([packetNode], 2.8)!, vp), smooth);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the packet's stage
  }, [follow, packetNode?.id]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const user = () => {
      canonical.current = false;
    };
    c.addEventListener("controlstart", user);
    return () => c.removeEventListener("controlstart", user);
  }, []);

  // Test and audit probe: where the camera is, and whether every zone (and anything failing) is on screen.
  useFrame(() => {
    const c = ref.current;
    if (!c) return;
    const target = c.getTarget(new THREE.Vector3());
    const view: View = { position: camera.position.toArray() as [number, number, number], target: target.toArray() as [number, number, number] };
    const full = { ...vp, pad: NO_PAD };
    const zones = model.zones.map((z) => ({ zone: z.zone, inView: fits(zoneBox(z), view, full, 1) }));
    const offscreenCritical = critical.filter((n) => !fits(nodesBounds([n], 0.4)!, view, full, 1)).map((n) => n.id);
    const v = new THREE.Vector3();
    const screen: Record<string, [number, number]> = {};
    for (const n of model.nodes) {
      v.set(n.position[0], n.position[1] + (sizeOf(n)[1] - 0.5) / 2, n.position[2]).project(camera);
      screen[n.id] = [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
    }
    probe().__ps3Camera = { position: view.position, target: view.target, width: size.width, height: size.height, zones, allZonesInView: zones.every((z) => z.inView), offscreenCritical, screen };
  });

  return <CameraControls ref={ref} makeDefault minDistance={3} maxDistance={80} maxPolarAngle={Math.PI * 0.62} smoothTime={reduced ? 0 : 0.45} />;
}

function Stats() {
  // Render timestamps for the performance evidence; read by the Atlas E2E suite and audits.
  useFrame(() => {
    const p = probe();
    (p.__ps3Frames ??= []).push(performance.now());
    if (p.__ps3Frames.length > 2000) p.__ps3Frames.shift();
  });
  return null;
}

export default function AtlasCanvas({
  model,
  onSelect,
  selected,
  focus,
  command,
  follow,
  reduced,
  labels,
  t,
  driftKey,
}: {
  model: SceneModel;
  selected: string | null;
  onSelect: (id: string) => void;
  focus: { node: string | null; seq: number };
  command: CameraCommand;
  follow: boolean;
  reduced: boolean;
  labels: boolean;
  t: number;
  driftKey: string | null;
}) {
  const palette = useMemo(() => readPalette(), []);
  const [dpr, setDpr] = useState(1.75);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return (
    <>
    <Canvas
      frameloop={hidden ? "never" : "demand"}
      dpr={[1, dpr]}
      camera={{ position: [0, 6, 30], fov: 38, near: 0.1, far: 300 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      tabIndex={-1}
      aria-hidden
      data-testid="atlas-canvas"
    >
      <PerformanceMonitor onDecline={() => setDpr(1.25)} onIncline={() => setDpr(1.75)} flipflops={3} onFallback={() => setDpr(1)} />
      <hemisphereLight args={[palette.structure, palette.bg, 0.9]} />
      <directionalLight position={[6, 12, 10]} intensity={1.4} color={palette.structure} />
      <Zones model={model} palette={palette} />
      <Rails model={model} palette={palette} />
      <Edges model={model} palette={palette} />
      <Nodes model={model} palette={palette} selected={selected} onSelect={onSelect} />
      <ProofMarkers model={model} palette={palette} />
      <Packet model={model} palette={palette} reduced={reduced} t={t} />
      <Camera model={model} focus={focus} command={command} follow={follow} reduced={reduced} driftKey={driftKey} minimap />
      <ZoneLabelPositioner model={model} />
      <Stats />
    </Canvas>
    {labels ? (
      <div aria-hidden className="ps3-zone-labels">
        {model.zones.map((z) => (
          <span key={z.zone} className="ps3-kicker ps3-zone-label" data-zone-label={z.zone}>
            {ZONE_TITLES[z.zone]}
          </span>
        ))}
      </div>
    ) : null}
    </>
  );
}
