"use client";

// The Connector Atlas in 3D. It renders the scene model and nothing else: no object, colour or motion here is
// independent of Atlas state. Renders on demand; continuous only while the payload or the camera moves.
import { CameraControls, Html, Line, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import * as THREE from "three";

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

const HOME = { pos: [0, 7.5, 25] as const, target: [0, -0.5, 0] as const };
const sizeOf = (n: SceneNode): [number, number, number] => (n.zone === "source" || n.zone === "destination" ? [1.1, 1.9, 1.1] : [0.8, 0.5, 0.8]);

function Zones({ model, palette, labels }: { model: SceneModel; palette: Palette; labels: boolean }) {
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
          {labels ? (
            <Html position={[0, 0.56, 0]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
              <span aria-hidden className="ps3-kicker" style={{ whiteSpace: "nowrap", color: "var(--ps3-text-2)" }}>
                {ZONE_TITLES[z.zone]}
              </span>
            </Html>
          ) : null}
        </group>
      ))}
    </>
  );
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

function Packet({ model, palette, reduced }: { model: SceneModel; palette: Palette; reduced: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const node = model.packet ? model.nodes.find((n) => n.id === model.packet!.node) : undefined;
  const target = useMemo(() => (node ? new THREE.Vector3(node.position[0], node.position[1] + sizeOf(node)[1] + 0.05, 0.62) : null), [node]);
  useEffect(() => {
    if (!target || !ref.current) return;
    if (reduced || ref.current.position.lengthSq() === 0) ref.current.position.copy(target);
    invalidate();
  }, [target, reduced, invalidate]);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m || !target) return;
    if (m.position.distanceTo(target) > 0.01) {
      m.position.lerp(target, Math.min(1, dt * 7));
      invalidate();
    }
  });
  if (!target || !model.packet) return null;
  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.32, 0.32, 0.32]} />
      <meshStandardMaterial color={model.packet.status === "failed" ? palette.status.failed : palette.gold} emissive={model.packet.status === "failed" ? palette.status.failed : palette.gold} emissiveIntensity={0.55} />
    </mesh>
  );
}

function Camera({ model, selected, command, follow, reduced }: { model: SceneModel; selected: string | null; command: CameraCommand; follow: boolean; reduced: boolean }) {
  const ref = useRef<ComponentRef<typeof CameraControls>>(null);
  const smooth = cameraTransition(reduced);
  const sel = model.nodes.find((n) => n.id === selected);
  const packetNode = model.packet ? model.nodes.find((n) => n.id === model.packet!.node) : undefined;

  const frame = (c: ComponentRef<typeof CameraControls>, n: SceneNode | undefined) => {
    if (!n) return void c.setLookAt(...HOME.pos, ...HOME.target, smooth);
    const [x, y] = n.position;
    // Source Lens: stand at the source and look down its rail; otherwise frame the object from the front.
    if (n.zone === "source") void c.setLookAt(x - 3.2, y + 1.6, 3.4, x + 7, y, 0, smooth);
    else void c.setLookAt(x + 2.4, y + 2.4, 7.5, x, y, 0, smooth);
  };

  // A new selection is always framed.
  useEffect(() => {
    if (ref.current && sel) frame(ref.current, sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reframe on selection change only
  }, [sel?.id]);

  // Each button press applies once.
  useEffect(() => {
    if (!ref.current || command.seq === 0) return;
    frame(ref.current, command.kind === "focus" ? sel : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the press, not to selection changes
  }, [command.seq]);

  useEffect(() => {
    if (!follow || !packetNode || !ref.current) return;
    const [x, y] = packetNode.position;
    void ref.current.setLookAt(x - 1.5, y + 2.2, 6.5, x + 1.5, y, 0, smooth);
  }, [follow, packetNode, smooth]);

  return <CameraControls ref={ref} makeDefault minDistance={3} maxDistance={42} maxPolarAngle={Math.PI * 0.62} smoothTime={reduced ? 0 : 0.45} />;
}

function Stats() {
  // Frame timing for the performance evidence (docs/PS3_ACCEPTANCE_TESTS.md); read by the E2E perf probe.
  useFrame((_, dt) => {
    const w = window as unknown as { __ps3Frames?: number[] };
    (w.__ps3Frames ??= []).push(dt * 1000);
    if (w.__ps3Frames.length > 600) w.__ps3Frames.shift();
  });
  return null;
}

export default function AtlasCanvas({
  model,
  selected,
  onSelect,
  command,
  follow,
  reduced,
  labels,
}: {
  model: SceneModel;
  selected: string | null;
  onSelect: (id: string) => void;
  command: CameraCommand;
  follow: boolean;
  reduced: boolean;
  labels: boolean;
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
    <Canvas
      frameloop={hidden ? "never" : "demand"}
      dpr={[1, dpr]}
      camera={{ position: [...HOME.pos], fov: 38, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      tabIndex={-1}
      aria-hidden
      data-testid="atlas-canvas"
      onPointerMissed={() => undefined}
    >
      <PerformanceMonitor onDecline={() => setDpr(1.25)} onIncline={() => setDpr(1.75)} flipflops={3} onFallback={() => setDpr(1)} />
      <hemisphereLight args={[palette.structure, palette.bg, 0.9]} />
      <directionalLight position={[6, 12, 10]} intensity={1.4} color={palette.structure} />
      <Zones model={model} palette={palette} labels={labels} />
      <Rails model={model} palette={palette} />
      <Edges model={model} palette={palette} />
      <Nodes model={model} palette={palette} selected={selected} onSelect={onSelect} />
      <ProofMarkers model={model} palette={palette} />
      <Packet model={model} palette={palette} reduced={reduced} />
      <Camera model={model} selected={selected} command={command} follow={follow} reduced={reduced} />
      <Stats />
    </Canvas>
  );
}
