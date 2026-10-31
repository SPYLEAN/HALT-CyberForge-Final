// The Attack World in plain three.js r128. It draws the world model and holds no security logic. One industrial family of forms:
// machined dark metal on matte carbon, with restrained emissive accents, so entity type reads from shape as well as colour.
import type { Toggles } from "@/lib/firex/scene";
import { replayedNode, visibleEdge, visibleNode } from "@/lib/firex/scene";
import type { EntityForm, Shot, WorldEdge, WorldModel, WorldNode } from "@/lib/firex/world";
import { ps2Palette } from "@/styles/ps2-palette";

import s from "./firex.module.css";

/* eslint-disable @typescript-eslint/no-explicit-any -- three r128 ships no type declarations here */
export interface ThreeKit {
  THREE: any;
  RoomEnvironment: any;
  RoundedBoxGeometry: any;
  EffectComposer: any;
  RenderPass: any;
  UnrealBloomPass: any;
  ShaderPass: any;
  GammaCorrectionShader: any;
}

export interface WorldUpdate {
  selected: string | null;
  toggles: Toggles;
  hideContext: boolean;
  replayStep: number | null;
  reducedMotion: boolean;
}

export interface WorldHandle {
  update(next: WorldUpdate): void;
  direct(shot: Shot, ids: string[] | null, reducedMotion: boolean): void;
  dispose(): void;
}

const COLORS = {
  proof: ps2Palette.proof,
  ember: ps2Palette.threat,
  violet: ps2Palette.forecast,
  gold: ps2Palette.continuity,
  steel: "rgb(138, 150, 156)",
  carbon: "rgb(34, 40, 45)",
  metal: "rgb(84, 94, 101)",
  floor: "rgb(19, 23, 26)",
  plate: "rgb(27, 32, 36)",
  lane: "rgb(66, 76, 83)",
  fog: "rgb(9, 12, 14)",
};

function lowPower(): boolean {
  const cores = navigator.hardwareConcurrency ?? 8;
  return cores <= 4 || window.innerWidth < 900;
}

function webgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function createWorldScene(kit: ThreeKit, host: HTMLElement, world: WorldModel, on: { select: (id: string | null) => void; step: (delta: number) => void }): WorldHandle | null {
  if (!webgl()) return null;
  const { THREE, RoomEnvironment, RoundedBoxGeometry, EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, GammaCorrectionShader } = kit;
  // r128 reads colour strings as linear values. The tokens are sRGB, so convert them before they are lit.
  const tone = (color: string) => new THREE.Color(color).convertSRGBToLinear();
  const quality = lowPower() ? "low" : "high";
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "low" ? 1.25 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(tone(COLORS.fog), 1);
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = tone(COLORS.fog);
  scene.fog = new THREE.Fog(tone(COLORS.fog), 20, 64);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);

  // Reflections only: a low-intensity room gives metal something to catch, without flattening the lighting.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;

  // Lighting: an architectural key from above, low fill, and a rim from behind that separates forms from the dark.
  scene.add(new THREE.HemisphereLight(0xcfd8dc, 0x0a0d0f, 0.16));
  const centre = { x: (world.bounds.minX + world.bounds.maxX) / 2, z: (world.bounds.minZ + world.bounds.maxZ) / 2 };
  const span = Math.max(world.bounds.maxX - world.bounds.minX, world.bounds.maxZ - world.bounds.minZ, 10);
  const key = new THREE.DirectionalLight(0xfff4e6, 1.5);
  key.position.set(centre.x - span * 0.3, span * 0.9, centre.z + span * 0.5);
  key.target.position.set(centre.x, 0, centre.z);
  key.castShadow = quality === "high";
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -span;
  key.shadow.camera.right = span;
  key.shadow.camera.top = span;
  key.shadow.camera.bottom = -span;
  key.shadow.camera.far = span * 3;
  key.shadow.radius = 5;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x8fb7c9, 0.9);
  rim.position.set(centre.x + span * 0.4, span * 0.35, centre.z - span * 0.9);
  scene.add(rim);

  const disposables: Array<{ dispose(): void }> = [environment, pmrem];
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };
  const material = (color: string, options: Record<string, unknown> = {}) =>
    track(new THREE.MeshStandardMaterial({ color: tone(color), metalness: 0.55, roughness: 0.55, envMapIntensity: 0.14, ...options }));
  const carbon = material(COLORS.carbon, { metalness: 0.2, roughness: 0.88, envMapIntensity: 0.06 });
  const metal = material(COLORS.metal, { metalness: 0.7, roughness: 0.55, envMapIntensity: 0.4 });
  const accent = (color: string, intensity = 0.9) => {
    const made = material(color, { emissive: tone(color), emissiveIntensity: intensity * 0.5, metalness: 0.1, roughness: 0.8, envMapIntensity: 0.03 });
    made.color.multiplyScalar(0.25); // a dark base, so the emissive keeps its hue under tone mapping
    return made;
  };
  const colorOf = (n: WorldNode) => (n.state === "reachable" ? COLORS.gold : n.state === "selected_path" ? COLORS.ember : n.state === "context" ? COLORS.steel : COLORS.proof);

  // Floor: matte carbon receiving soft shadows. One raised plate for each organisation layer makes the lanes read as rooms.
  const bounds = world.bounds;
  const floorW = bounds.maxX - bounds.minX + 40;
  const floorD = bounds.maxZ - bounds.minZ + 40;
  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(floorW, floorD)), material(COLORS.floor, { metalness: 0.1, roughness: 0.95, envMapIntensity: 0.03 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centre.x, -0.03, centre.z);
  floor.receiveShadow = true;
  scene.add(floor);
  const laneMaterial = track(new THREE.LineBasicMaterial({ color: tone(COLORS.lane) }));
  const addLine = (a: any, b: any, mat: any = laneMaterial) => {
    const line = new THREE.Line(track(new THREE.BufferGeometry().setFromPoints([a, b])), mat);
    scene.add(line);
    return line;
  };
  const labels: Array<{ span: HTMLSpanElement; at: any; always: boolean; id?: string }> = [];
  const addLabel = (text: string, at: any, className: string, always: boolean, id?: string) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    host.append(span);
    labels.push({ span, at, always, id });
    return span;
  };
  const plateMaterial = material(COLORS.plate, { metalness: 0.35, roughness: 0.8, envMapIntensity: 0.05 });
  const width = bounds.maxX - bounds.minX;
  for (const lane of world.lanes) {
    const plate = new THREE.Mesh(track(new RoundedBoxGeometry(width, 0.06, 2.5, 2, 0.02)), plateMaterial);
    plate.position.set(centre.x, -0.03, lane.z);
    plate.receiveShadow = quality === "high";
    scene.add(plate);
    addLabel(lane.label, new THREE.Vector3(bounds.minX + 0.12, 0.05, lane.z + 1.02), s.axisLabel!, true);
  }

  // Architecture stands behind the incident, never in front of it: buttresses on the back wall and bays receding into the
  // fog give scale and a background, and the near side stays open so nothing crosses the path. Frames carry no data.
  const wallZ = bounds.minZ - 1.1;
  const roof = bounds.maxY + 2.6;
  const bayStep = 3.2;
  const frameMaterial = track(new THREE.LineBasicMaterial({ color: tone(COLORS.lane), transparent: true, opacity: 0.5 }));
  const bays = Math.floor((width + 16) / bayStep) + 1;
  const ribs = new THREE.InstancedMesh(track(new RoundedBoxGeometry(0.34, roof, 0.5, 2, 0.04)), metal, bays * 2);
  const ribMatrix = new THREE.Matrix4();
  let placed = 0;
  const firstX = bounds.minX - 8;
  for (let i = 0; i < bays; i += 1) {
    const x = firstX + i * bayStep;
    for (const z of [wallZ, wallZ - 7]) {
      ribMatrix.makeTranslation(x, roof / 2 - 0.03, z);
      ribs.setMatrixAt(placed, ribMatrix);
      placed += 1;
    }
    addLine(new THREE.Vector3(x, roof, wallZ), new THREE.Vector3(x, roof, wallZ - 7), frameMaterial);
  }
  ribs.receiveShadow = quality === "high";
  scene.add(ribs);
  const wall = new THREE.Mesh(track(new THREE.PlaneGeometry(width + 40, roof)), material(COLORS.carbon, { metalness: 0.3, roughness: 0.85, envMapIntensity: 0.04 }));
  wall.position.set(centre.x, roof / 2, wallZ - 0.3);
  scene.add(wall);
  // Stage rails run along the back wall, one for each stage this incident actually reaches.
  for (const stage of world.stages) {
    addLine(new THREE.Vector3(firstX, stage.y, wallZ + 0.28), new THREE.Vector3(bounds.maxX + 8, stage.y, wallZ + 0.28));
    addLabel(stage.label[0]!.toUpperCase() + stage.label.slice(1), new THREE.Vector3(bounds.minX + 0.12, stage.y + 0.02, wallZ + 0.3), s.axisLabel!, true);
  }

  // ---- the node family
  const geometry = {
    plinth: track(new RoundedBoxGeometry(1.1, 0.14, 1.1, 3, 0.04)),
    block: track(new RoundedBoxGeometry(1, 0.8, 0.7, 4, 0.07)),
    face: track(new THREE.PlaneGeometry(0.74, 0.46)),
    cone: track(new THREE.ConeGeometry(0.24, 0.62, 16)),
    mast: track(new THREE.CylinderGeometry(0.035, 0.05, 0.8, 10)),
    ring: track(new THREE.TorusGeometry(0.42, 0.05, 12, 44)),
    bar: track(new THREE.BoxGeometry(0.09, 1.05, 0.09)),
    lintel: track(new THREE.BoxGeometry(0.86, 0.09, 0.09)),
    pane: track(new THREE.PlaneGeometry(0.72, 0.92)),
    tower: track(new THREE.CylinderGeometry(0.34, 0.42, 1.5, 6)),
    core: track(new THREE.CylinderGeometry(0.17, 0.17, 1.62, 12)),
    guard: track(new THREE.TorusGeometry(0.62, 0.028, 8, 48)),
    marker: track(new THREE.OctahedronGeometry(0.34, 0)),
    stem: track(new THREE.CylinderGeometry(0.012, 0.012, 1, 6)),
    cell: track(new THREE.BoxGeometry(0.11, 0.11, 0.11)),
    hub: track(new THREE.OctahedronGeometry(0.26, 0)),
    wire: track(new THREE.IcosahedronGeometry(0.42, 0)),
    pad: track(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 28)),
    anchor: track(new THREE.OctahedronGeometry(0.13, 0)),
  };
  const shadowed = (mesh: any) => {
    mesh.castShadow = quality === "high";
    mesh.receiveShadow = quality === "high";
    return mesh;
  };
  const pick = (mesh: any, id: string) => {
    mesh.userData.id = id;
    return mesh;
  };

  function buildForm(n: WorldNode): { group: any; lit: any[]; hit: any } {
    const group = new THREE.Group();
    const color = colorOf(n);
    const glow = accent(color, n.state === "selected_path" ? 1.25 : 0.8);
    if (n.state === "reachable") {
      glow.transparent = true;
      glow.opacity = 0.55;
    }
    const lit = [glow];
    const add = (geo: any, mat: any, x = 0, y = 0, z = 0) => {
      const mesh = shadowed(pick(new THREE.Mesh(geo, mat), n.id));
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };
    const form: EntityForm = n.form;
    if (form === "beacon") {
      add(geometry.plinth, carbon, 0, 0.07, 0);
      add(geometry.mast, metal, 0, 0.5, 0);
      const cone = add(geometry.cone, glow, 0, 1.02, 0);
      cone.rotation.z = -Math.PI / 2; // points along +x, the direction of progression
    } else if (form === "ring") {
      add(geometry.plinth, carbon, 0, 0.07, 0);
      add(geometry.mast, metal, 0, 0.42, 0);
      add(geometry.ring, glow, 0, 1.2, 0);
    } else if (form === "terminal") {
      add(geometry.plinth, carbon, 0, 0.07, 0);
      add(geometry.block, metal, 0, 0.55, 0);
      add(geometry.face, glow, 0, 0.58, 0.356);
    } else if (form === "portal") {
      add(geometry.plinth, carbon, 0, 0.07, 0);
      add(geometry.bar, metal, -0.42, 0.66, 0);
      add(geometry.bar, metal, 0.42, 0.66, 0);
      add(geometry.lintel, metal, 0, 1.2, 0);
      const pane = track(new THREE.MeshStandardMaterial({ color: tone(color), emissive: tone(color), emissiveIntensity: 0.35, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
      add(geometry.pane, pane, 0, 0.66, 0);
      lit.push(pane);
    } else if (form === "tower") {
      add(geometry.plinth, carbon, 0, 0.07, 0);
      add(geometry.tower, metal, 0, 0.88, 0);
      add(geometry.core, glow, 0, 0.92, 0);
      const guard = add(geometry.guard, metal, 0, 1.2, 0);
      guard.rotation.x = Math.PI / 2;
    } else if (form === "marker") {
      add(geometry.marker, glow);
    } else if (form === "field") {
      // A clustered field: density follows the log of the count. Deterministic, never random.
      const cells = Math.min(26, 5 + Math.round(Math.log10(Math.max(1, n.node.count)) * 6));
      const batch = new THREE.InstancedMesh(geometry.cell, glow, cells);
      const m = new THREE.Matrix4();
      for (let i = 0; i < cells; i += 1) {
        const a = i * 2.399963;
        const r = 0.075 * Math.sqrt(i) + 0.42;
        const size = 0.7 + ((i * 37) % 10) / 22;
        m.makeScale(size, size, size);
        m.setPosition(Math.cos(a) * r, ((i * 13) % 7) * 0.05 - 0.15, Math.sin(a) * r);
        batch.setMatrixAt(i, m);
      }
      batch.userData.id = n.id;
      batch.castShadow = quality === "high";
      group.add(batch);
      add(geometry.hub, glow, 0, 0, 0);
    } else {
      const wire = track(new THREE.MeshBasicMaterial({ color: tone(COLORS.steel), wireframe: true }));
      add(geometry.wire, wire, 0, 0.6, 0);
    }
    group.position.set(n.position.x, n.position.y, n.position.z);
    group.scale.setScalar(n.raised ? n.scale * 1.7 : n.scale * 1.6);
    scene.add(group);
    const hit = shadowed(pick(new THREE.Mesh(track(new THREE.SphereGeometry(0.72, 8, 6)), track(new THREE.MeshBasicMaterial({ visible: false }))), n.id));
    hit.position.y = n.raised ? 0 : 0.6;
    group.add(hit);
    return { group, lit, hit };
  }

  const objects = new Map<string, { group: any; lit: any[]; hit: any; n: WorldNode; drop?: any; pad?: any }>();
  const pickable: any[] = [];
  const stems = track(new THREE.LineDashedMaterial({ color: tone(COLORS.steel), dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.6 }));
  for (const n of world.nodes.filter((w) => !w.instanced)) {
    const built = buildForm(n);
    const entry: { group: any; lit: any[]; hit: any; n: WorldNode; drop?: any; pad?: any } = { ...built, n };
    if (n.raised) {
      // A drop line says where in the organisation this step happened.
      entry.drop = addLine(new THREE.Vector3(n.position.x, n.position.y, n.position.z), new THREE.Vector3(n.floor.x, 0.01, n.floor.z), stems);
      entry.drop.computeLineDistances();
      // A proof anchor: where this step's cited records lock it to the organisation.
      entry.pad = new THREE.Group();
      const proofGlow = accent(COLORS.proof, 0.9);
      const disc = new THREE.Mesh(geometry.pad, material(COLORS.proof, { emissive: tone(COLORS.proof), emissiveIntensity: 0.22, transparent: true, opacity: 0.4 }));
      const anchor = new THREE.Mesh(geometry.anchor, proofGlow);
      anchor.position.y = 0.22;
      entry.pad.add(disc, anchor);
      entry.pad.position.set(n.floor.x, 0.012, n.floor.z);
      scene.add(entry.pad);
    }
    objects.set(n.id, entry);
    pickable.push(built.hit);
  }

  // Context is drawn as one instanced batch: it may be numerous, and it should stay quiet.
  const contextNodes = world.nodes.filter((w) => w.instanced);
  const contextMaterial = material(COLORS.steel, { metalness: 0.6, roughness: 0.6 });
  const contextBatch = contextNodes.length ? new THREE.InstancedMesh(track(new RoundedBoxGeometry(0.34, 0.34, 0.34, 2, 0.05)), contextMaterial, contextNodes.length) : null;
  const contextMatrix = new THREE.Matrix4();
  const writeContext = (visible: boolean, selected: string | null) => {
    if (!contextBatch) return;
    contextNodes.forEach((n, i) => {
      const lift = 0.2 + Math.min(0.5, Math.log10(Math.max(1, n.node.count)) * 0.16);
      const scale = !visible ? 0.0001 : selected === n.id ? 1.5 : 1;
      contextMatrix.makeScale(scale, scale * (1 + lift), scale);
      contextMatrix.setPosition(n.position.x, 0.17 * scale * (1 + lift), n.position.z);
      contextBatch.setMatrixAt(i, contextMatrix);
    });
    contextBatch.instanceMatrix.needsUpdate = true;
  };
  if (contextBatch) {
    contextBatch.castShadow = quality === "high";
    contextBatch.receiveShadow = quality === "high";
    writeContext(true, null);
    scene.add(contextBatch);
    pickable.push(contextBatch);
  }

  // ---- edges
  const curve = (e: WorldEdge) => {
    const a = toV(e.from, THREE);
    const b = toV(e.to, THREE);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += e.arc + a.distanceTo(b) * (e.edge.on_selected_path ? 0.07 : 0.02);
    return new THREE.QuadraticBezierCurve3(a, mid, b);
  };
  const edgeObjects: Array<{ e: WorldEdge; parts: any[]; base: string }> = [];
  for (const e of world.edges) {
    const parts: any[] = [];
    const c = curve(e);
    const color = e.state === "selected_path" || e.state === "missing" ? COLORS.ember : e.state === "reachable" ? COLORS.gold : e.state === "inferred" ? COLORS.violet : e.edge.relation === "also_recorded" ? COLORS.steel : COLORS.proof;
    if (e.edge.on_selected_path) {
      // A weighted route. Segments show that a rule inferred this link; a break shows missing evidence; chevrons show direction.
      const mat = material(color, { emissive: tone(color), emissiveIntensity: 0.55, metalness: 0.1, roughness: 0.8, envMapIntensity: 0.03 });
      mat.color.multiplyScalar(0.25);
      const dashes = Math.max(4, Math.round(c.getLength() / 0.55));
      for (let i = 0; i < dashes; i += 1) {
        const t0 = i / dashes;
        const t1 = (i + 0.72) / dashes;
        if (e.edge.missing_evidence && t0 > 0.38 && t0 < 0.62) continue;
        const piece = new THREE.CatmullRomCurve3([c.getPoint(t0), c.getPoint((t0 + t1) / 2), c.getPoint(t1)]);
        const tube = new THREE.Mesh(track(new THREE.TubeGeometry(piece, 4, 0.065, 8, false)), mat);
        tube.userData.edge = e.id;
        scene.add(tube);
        parts.push(tube);
      }
      if (e.edge.missing_evidence) {
        // Missing evidence is fractured structure in the gap: visibly absent, not a dim line.
        const shard = track(new THREE.MeshBasicMaterial({ color: tone(COLORS.steel), wireframe: true }));
        [0.44, 0.5, 0.56].forEach((t, i) => {
          const piece = new THREE.Mesh(track(new THREE.TetrahedronGeometry(0.16 - i * 0.03, 0)), shard);
          piece.position.copy(c.getPoint(t));
          piece.position.y += i % 2 ? 0.14 : -0.1;
          piece.rotation.set(i * 1.1, i * 0.7, i * 0.4);
          piece.userData.edge = e.id;
          scene.add(piece);
          parts.push(piece);
        });
      }
      const head = new THREE.Mesh(track(new THREE.ConeGeometry(0.17, 0.38, 12)), mat);
      const end = c.getPoint(0.86);
      head.position.copy(end);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.getTangent(0.86).normalize());
      head.userData.edge = e.id;
      scene.add(head);
      parts.push(head);
    } else {
      const points = c.getPoints(24);
      const dashed = e.state === "inferred" || e.state === "reachable" || e.state === "missing";
      const mat = dashed
        ? track(new THREE.LineDashedMaterial({ color: tone(color), dashSize: 0.26, gapSize: 0.18, transparent: true, opacity: e.state === "reachable" ? 0.6 : 0.9 }))
        : track(new THREE.LineBasicMaterial({ color: tone(color), transparent: true, opacity: e.edge.relation === "also_recorded" ? 0.14 : 0.42 }));
      const line = new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(points)), mat);
      if (dashed) line.computeLineDistances();
      line.userData.edge = e.id;
      scene.add(line);
      parts.push(line);
    }
    edgeObjects.push({ e, parts, base: color });
    pickable.push(...parts);
  }

  // Labels: path steps and the selection only, and only while inside the frustum.
  world.nodes
    .filter((n) => n.step !== null)
    .forEach((n) => addLabel(String((n.step ?? 0) + 1), toV(n.position, THREE).add(new THREE.Vector3(0, 0.7, 0)), s.tag!, true, n.id));

  // ---- post-processing: restrained bloom on capable devices only
  const composer = quality === "high" ? new EffectComposer(renderer) : null;
  let bloomPass: any = null;
  if (composer) {
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.45, 0.72);
    composer.addPass(bloomPass);
    composer.addPass(new ShaderPass(GammaCorrectionShader)); // render targets stay linear, so encode once at the end
  }

  // ---- directed camera: eased moves between named shots. It never moves by itself.
  const target = new THREE.Vector3(centre.x, world.bounds.maxY * 0.35, centre.z);
  const pose = { theta: -0.62, phi: 1.12, distance: 22 };
  const goal = { theta: pose.theta, phi: pose.phi, distance: pose.distance, target: target.clone() };
  let moving = false;
  let directed = false;
  const SHOTS: Record<Shot, { theta: number; phi: number; pad: number }> = {
    establish: { theta: -0.42, phi: 1.2, pad: 0.82 },
    approach: { theta: -0.34, phi: 1.26, pad: 0.9 },
    follow: { theta: -0.3, phi: 1.32, pad: 1.05 },
    inspect: { theta: -0.2, phi: 1.34, pad: 1.1 },
    reveal: { theta: 0.3, phi: 1.2, pad: 0.86 },
    withdraw: { theta: -0.52, phi: 1.12, pad: 0.98 },
    present: { theta: -0.42, phi: 1.26, pad: 0.84 },
  };
  const positionsOf = (ids: string[] | null) => {
    const list = ids ?? world.nodes.map((n) => n.id);
    const found = world.nodes.filter((n) => list.includes(n.id)).map((n) => n.position);
    return found.length ? found : world.nodes.map((n) => n.position);
  };
  // Fit a bounding sphere inside both axes of the frustum, so a shot frames the same content at any aspect ratio.
  const frameDistance = (radius: number, pad: number) => {
    const half = (camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(half) * (camera.aspect || 1.6));
    return Math.max(5.5, (radius * pad) / Math.sin(Math.min(half, horizontal)));
  };
  const placeCamera = () => {
    camera.position.set(
      target.x + pose.distance * Math.sin(pose.phi) * Math.sin(pose.theta),
      target.y + pose.distance * Math.cos(pose.phi),
      target.z + pose.distance * Math.sin(pose.phi) * Math.cos(pose.theta),
    );
    camera.lookAt(target);
  };

  const v = new THREE.Vector3();
  const draw = () => {
    placeCamera();
    if (composer) composer.render();
    else renderer.render(scene, camera);
    const { clientWidth: w, clientHeight: h } = host;
    for (const label of labels) {
      const hidden = label.id ? objects.get(label.id)?.group.visible === false : false;
      v.copy(label.at).project(camera);
      const on = !hidden && v.z < 1 && Math.abs(v.x) <= 1.02 && Math.abs(v.y) <= 1.02;
      label.span.style.display = on ? "block" : "none";
      if (on) {
        label.span.style.left = `${Math.max(8, ((v.x + 1) / 2) * w)}px`;
        label.span.style.top = `${((1 - v.y) / 2) * h}px`;
      }
    }
  };

  let raf = 0;
  let hidden = document.hidden;
  let current: WorldUpdate = { selected: null, toggles: { observed: true, inferred: true, reachable: true }, hideContext: false, replayStep: null, reducedMotion: true };
  let pulse = 0;
  let lastFrame = 0;
  const tick = (now: number) => {
    raf = 0;
    if (hidden) return;
    let again = false;
    if (moving) {
      const elapsed = lastFrame ? Math.min(0.25, (now - lastFrame) / 1000) : 1 / 60;
      const k = 1 - Math.exp(-elapsed * 3.2);
      pose.theta += (goal.theta - pose.theta) * k;
      pose.phi += (goal.phi - pose.phi) * k;
      pose.distance += (goal.distance - pose.distance) * k;
      target.lerp(goal.target, k);
      const settled = Math.abs(goal.distance - pose.distance) < 0.02 && Math.abs(goal.theta - pose.theta) < 0.002 && target.distanceTo(goal.target) < 0.01;
      moving = !settled;
      again = moving;
    }
    lastFrame = moving ? now : 0;
    const chosen = current.selected ? objects.get(current.selected) : undefined;
    if (chosen && !current.reducedMotion) {
      pulse += 0.05;
      const glow = 1 + Math.sin(pulse) * 0.25;
      chosen.lit.forEach((m) => {
        m.emissiveIntensity = glow;
      });
      again = true;
    }
    draw();
    if (again) raf = requestAnimationFrame(tick);
  };
  const invalidate = () => {
    if (!raf && !hidden) raf = requestAnimationFrame(tick);
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // ---- input
  const canvas: HTMLCanvasElement = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.14 };
  let drag: { x: number; y: number; moved: boolean; pan: boolean; id: number } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.shiftKey || e.button === 2, id: e.pointerId };
    canvas.setPointerCapture?.(e.pointerId);
    moving = false;
  };
  const onMove = (e: PointerEvent) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch) pose.distance = Math.min(90, Math.max(4, pose.distance * (pinch / d)));
      pinch = d;
      if (drag) drag.moved = true;
      invalidate();
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.pan) {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      const scale = pose.distance * 0.0014;
      target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    } else {
      pose.theta -= dx * 0.005;
      pose.phi = Math.min(1.5, Math.max(0.2, pose.phi - dy * 0.005));
    }
    goal.theta = pose.theta;
    goal.phi = pose.phi;
    goal.target.copy(target);
    invalidate();
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    const state = drag;
    drag = null;
    if (!state || state.moved) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickable, false).filter((h: any) => isShown(h.object));
    if (!hits.length) {
      on.select(null); // an empty click clears the selection
      return;
    }
    const node = hits.find((h: any) => h.object.userData.id || h.object === contextBatch);
    const best = node ?? hits[0];
    if (best.object === contextBatch && best.instanceId !== undefined) on.select(contextNodes[best.instanceId]?.id ?? null);
    else if (best.object.userData.id) on.select(best.object.userData.id);
    else on.select(`edge:${best.object.userData.edge}`);
  };
  const isShown = (obj: any): boolean => {
    let o = obj;
    while (o) {
      if (o.visible === false) return false;
      o = o.parent;
    }
    return true;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    moving = false;
    pose.distance = Math.min(90, Math.max(4, pose.distance * (1 + Math.sign(e.deltaY) * 0.08)));
    goal.distance = pose.distance;
    invalidate();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") on.step(1);
    else if (e.key === "ArrowLeft") on.step(-1);
    else if (e.key === "Home") handle.direct("establish", null, current.reducedMotion);
    else if (e.key === "Escape") on.select(null);
    else return;
    e.preventDefault();
  };
  const onContext = (e: Event) => e.preventDefault();
  const onVisibility = () => {
    hidden = document.hidden;
    if (!hidden) invalidate();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContext);
  host.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);

  const steps = world.nodes.filter((n) => n.step !== null).sort((a, b) => (a.step ?? 0) - (b.step ?? 0)).map((n) => n.node);

  const handle: WorldHandle = {
    update(next) {
      current = next;
      for (const entry of objects.values()) {
        const shown = visibleNode(entry.n.node, next.toggles) && replayedNode(entry.n.node, next.replayStep, steps);
        entry.group.visible = shown;
        if (entry.drop) entry.drop.visible = shown;
        if (entry.pad) entry.pad.visible = shown;
        const chosen = next.selected === entry.n.id || (next.replayStep !== null && steps[next.replayStep]?.node_id === entry.n.id);
        const base = entry.n.raised ? entry.n.scale * 1.7 : entry.n.scale * 1.6;
        entry.group.scale.setScalar(chosen ? base * 1.25 : base);
        entry.lit.forEach((m: any) => {
          m.emissive.copy(tone(next.selected === entry.n.id ? COLORS.proof : colorOf(entry.n)));
          m.emissiveIntensity = chosen ? 1.1 : entry.n.state === "selected_path" ? 0.62 : 0.42;
        });
      }
      const contextVisible = !next.hideContext && next.toggles.observed && next.replayStep === null;
      if (contextBatch) writeContext(contextVisible, next.selected);
      const byId = new Map(world.nodes.map((n) => [n.id, n.node]));
      for (const { e, parts, base } of edgeObjects) {
        const a = byId.get(e.edge.source);
        const b = byId.get(e.edge.target);
        let shown = Boolean(a && b) && visibleEdge(e.edge, next.toggles) && replayedNode(a!, next.replayStep, steps) && replayedNode(b!, next.replayStep, steps) && visibleNode(a!, next.toggles) && visibleNode(b!, next.toggles);
        if (e.edge.relation === "also_recorded" && !contextVisible) shown = false;
        const hot = next.selected === `edge:${e.id}`;
        parts.forEach((p: any) => {
          p.visible = shown;
          const hue = tone(hot ? COLORS.proof : base);
          if (p.material.emissive) {
            p.material.emissive.copy(hue);
            p.material.color.copy(hue).multiplyScalar(0.25);
          } else p.material.color.copy(hue);
        });
      }
      invalidate();
    },
    direct(shot, ids, reducedMotion) {
      const points = positionsOf(ids);
      const box = new THREE.Box3().setFromPoints(points.map((p: { x: number; y: number; z: number }) => toV(p, THREE)));
      const middle = box.getCenter(new THREE.Vector3());
      const radius = Math.max(ids && ids.length === 1 ? 2.2 : 4.6, box.getSize(new THREE.Vector3()).length() / 2);
      const look = SHOTS[shot];
      goal.theta = look.theta;
      goal.phi = look.phi;
      goal.distance = frameDistance(radius, look.pad);
      goal.target.copy(middle);
      if (reducedMotion || !directed) {
        directed = true;
        pose.theta = goal.theta;
        pose.phi = goal.phi;
        pose.distance = goal.distance;
        target.copy(goal.target);
        moving = false;
      } else {
        moving = true;
      }
      invalidate();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContext);
      host.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      disposables.forEach((d) => d.dispose());
      contextBatch?.dispose?.();
      composer?.renderTarget1?.dispose?.();
      composer?.renderTarget2?.dispose?.();
      bloomPass?.dispose?.();
      renderer.dispose();
      canvas.remove();
      labels.forEach((l) => l.span.remove());
    },
  };
  return handle;
}

function toV(p: { x: number; y: number; z: number }, THREE: any) {
  return new THREE.Vector3(p.x, p.y, p.z);
}
