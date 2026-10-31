// The landing's directed scene in Canvas 2D: a thread core, a deluge of records, their collapse, and the path that remains.
// It has no 3D library, so the landing stays small. It draws what it is given, decides nothing, and holds no figures.
import { ps2Palette } from "@/styles/ps2-palette";

export interface LandingPathStep {
  x: number;
  y: number;
  z: number;
}

export interface LandingPath {
  steps: LandingPathStep[];
  gaps: boolean[]; // gaps[i]: no shared entity links step i to step i + 1
  reachable: LandingPathStep[];
}

export interface LandingHandle {
  setScene(index: number): void;
  setPath(path: LandingPath): void;
  dispose(): void;
}

type V = [number, number, number];

const SCENES = 8;
const BONE = "rgb(226, 230, 228)";
const STEEL = "rgb(122, 134, 140)";
// Where the camera stands in each scene, as [x, y, distance]. It moves between these and never orbits.
const CAMERA: Array<[number, number, number]> = [
  [0, 0, 11],
  [-2.5, 1.5, 17],
  [0, -1.5, 15],
  [1.2, 0.2, 13],
  [0, 0.6, 12],
  [0.8, 0.8, 11],
  [0, 0.2, 12.5],
  [0, 0, 18],
];

/** A small deterministic generator: the scene is the same on every load. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function createLandingScene(canvas: HTMLCanvasElement, options: { reducedMotion: boolean; low: boolean }): LandingHandle | null {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  const random = seeded(2417);
  const count = options.low ? 700 : 2200;
  const hot = Math.round(count * 0.03);

  // Each particle's place in the first four scenes. Scenes 5 to 8 keep the quiet floor of scene 4.
  const core: V[] = [];
  const deluge: V[] = [];
  const floor: V[] = [];
  const raised: V[] = [];
  const clusters = Array.from({ length: 6 }, (_, i): V => [-6 + i * 2.4, -0.4 + random() * 2.6, -1.5 + random() * 3]);
  for (let i = 0; i < count; i += 1) {
    const strand = i % 3;
    const u = i / count;
    const angle = u * Math.PI * 14 + (strand * Math.PI * 2) / 3;
    const radius = 0.55 + 0.1 * Math.sin(u * 40);
    core.push([Math.cos(angle) * radius, (u - 0.5) * 9, Math.sin(angle) * radius]);
    deluge.push([(random() - 0.5) * 26, (random() - 0.5) * 16, (random() - 0.5) * 16]);
    const row = Math.floor(random() * 22);
    floor.push([(random() - 0.5) * 24, -3.2 + random() * 0.08, -8 + row * 0.72]);
    const c = clusters[i % clusters.length]!;
    raised.push([c[0] + (random() - 0.5) * 0.9, c[1] + (random() - 0.5) * 0.9, c[2] + (random() - 0.5) * 0.9]);
  }

  let width = 0;
  let height = 0;
  let scene = 0;
  let from = 0;
  let progress = 1;
  let raf = 0;
  let time = 0;
  let last = 0;
  let hidden = document.hidden;
  let path: LandingPath | null = null;
  const cam = { x: CAMERA[0]![0], y: CAMERA[0]![1], d: CAMERA[0]![2] };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, options.low ? 1.25 : 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    request();
  };

  // The subject sits to the right of the text on a wide screen, and above it on a narrow one.
  const project = (x: number, y: number, z: number): [number, number, number] => {
    const depth = cam.d - z;
    const safe = Math.max(0.5, depth);
    const focal = Math.min(width, height * 1.5) * 1.15;
    const scale = focal / safe;
    const wide = width > 860;
    return [(wide ? width * 0.7 : width * 0.5) + (x - cam.x) * scale * (wide ? 1 : 0.8), (wide ? height * 0.5 : height * 0.2) - (y - cam.y) * scale * (wide ? 1 : 0.8), scale];
  };

  const placeOf = (key: number, i: number, fall: number): V => {
    if (key === 0) return core[i]!;
    if (key === 1) {
      const d = deluge[i]!;
      const y = ((d[1] + 8 - fall * (0.6 + (i % 7) * 0.12)) % 16 + 16) % 16;
      return [d[0], y - 8, d[2]];
    }
    if (key === 2) return floor[i]!;
    if (key === 3 && i < hot) return raised[i]!;
    if (key === 7) return core[i]!;
    return floor[i]!;
  };

  const drawPath = (t: number, reveal: number) => {
    if (!path || !path.steps.length) return;
    const stepEach = path.steps.map((p) => project(p.x, p.y, p.z));
    ctx.lineCap = "round";
    // Scene 5 draws the selected route. From scene 6 its links show that rules inferred them, and gaps stay broken.
    const inferred = scene >= 5;
    for (let i = 0; i + 1 < stepEach.length; i += 1) {
      const shown = Math.min(1, Math.max(0, reveal * (stepEach.length - 1) - i));
      if (shown <= 0) break;
      const a = stepEach[i]!;
      const b = stepEach[i + 1]!;
      const ex = a[0] + (b[0] - a[0]) * shown;
      const ey = a[1] + (b[1] - a[1]) * shown;
      ctx.strokeStyle = inferred ? ps2Palette.forecast : ps2Palette.threat;
      ctx.lineWidth = inferred ? 2 : 3;
      ctx.setLineDash(inferred ? [9, 7] : []);
      ctx.globalAlpha = 0.95;
      if (path.gaps[i]) {
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(a[0] + (b[0] - a[0]) * Math.min(shown, 0.38), a[1] + (b[1] - a[1]) * Math.min(shown, 0.38));
        if (shown > 0.62) {
          ctx.moveTo(a[0] + (b[0] - a[0]) * 0.62, a[1] + (b[1] - a[1]) * 0.62);
          ctx.lineTo(ex, ey);
        }
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    stepEach.forEach((p, i) => {
      if (reveal * (stepEach.length - 1) < i - 0.05) return;
      const size = Math.max(4, p[2] * 0.012);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ps2Palette.threat;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1] - size * 1.5);
      ctx.lineTo(p[0] + size, p[1]);
      ctx.lineTo(p[0], p[1] + size * 1.5);
      ctx.lineTo(p[0] - size, p[1]);
      ctx.closePath();
      ctx.fill();
    });
    // Reachable systems emerge in gold, translucent: hypothetical, not activity.
    if (scene === 5) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = ps2Palette.continuity;
      ctx.lineWidth = 1.5;
      for (const r of path.reachable) {
        const p = project(r.x, r.y, r.z);
        ctx.strokeRect(p[0] - 5, p[1] - 5, 10, 10);
      }
    }
    // Proof anchors lock each step to the floor, and the seal closes around them.
    if (scene === 6) {
      ctx.strokeStyle = ps2Palette.proof;
      ctx.fillStyle = ps2Palette.proof;
      ctx.lineWidth = 1;
      stepEach.forEach((p, i) => {
        const s = path!.steps[i]!;
        const base = project(s.x, -2.4, s.z);
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(base[0], base[1]);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(base[0], base[1], 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      const xs = stepEach.map((p) => p[0]);
      const ys = stepEach.map((p) => p[1]);
      const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 48;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, rx, Math.max(rx * 0.34, (Math.max(...ys) - Math.min(...ys)) / 2 + 28), 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, t));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  const draw = () => {
    const eased = ease(progress);
    const goal = CAMERA[scene]!;
    const start = CAMERA[from]!;
    cam.x = start[0] + (goal[0] - start[0]) * eased;
    cam.y = start[1] + (goal[1] - start[1]) * eased;
    cam.d = start[2] + (goal[2] - start[2]) * eased;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgb(9, 12, 14)";
    ctx.fillRect(0, 0, width, height);

    const fall = options.reducedMotion ? 0 : time * 2.4;
    const quiet = scene >= 3 && scene < 7;
    for (let i = 0; i < count; i += 1) {
      const a = placeOf(from, i, fall);
      const b = placeOf(scene, i, fall);
      const x = a[0] + (b[0] - a[0]) * eased;
      const y = a[1] + (b[1] - a[1]) * eased;
      const z = a[2] + (b[2] - a[2]) * eased;
      const p = project(x, y, z);
      if (p[0] < -8 || p[0] > width + 8 || p[1] < -8 || p[1] > height + 8) continue;
      const isHot = i < hot;
      const near = Math.min(1, p[2] / 90);
      if (scene === 0 || scene === 7) {
        ctx.globalAlpha = 0.28 + (i % 5) * 0.09;
        ctx.fillStyle = i % 3 === 0 ? BONE : STEEL;
        ctx.fillRect(p[0], p[1], 2, 2);
      } else if (scene === 1) {
        ctx.globalAlpha = 0.14 + near * 0.28;
        ctx.fillStyle = i % 9 === 0 ? BONE : STEEL;
        ctx.fillRect(p[0], p[1], 6 + (i % 13) * near * 1.6, 1); // a record, read sideways
      } else if (scene === 2) {
        ctx.globalAlpha = 0.16 + near * 0.2;
        ctx.fillStyle = STEEL;
        ctx.fillRect(p[0], p[1], 3, 1);
      } else if (quiet && isHot && scene === 3) {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = BONE;
        ctx.fillRect(p[0] - 1, p[1] - 1, 3, 3);
      } else {
        ctx.globalAlpha = 0.09 + near * 0.1;
        ctx.fillStyle = STEEL;
        ctx.fillRect(p[0], p[1], 2, 1);
      }
    }
    ctx.globalAlpha = 1;
    if (scene >= 4 && scene <= 6) drawPath(options.reducedMotion ? 1 : progress, scene === 4 ? eased : 1);
  };

  const tick = (now: number) => {
    raf = 0;
    if (hidden) return;
    const elapsed = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    time += elapsed;
    if (progress < 1) progress = Math.min(1, progress + elapsed / 1.6);
    draw();
    // Only the deluge keeps moving. Every other scene rests once its transition ends.
    if (!options.reducedMotion && (progress < 1 || scene === 1)) raf = requestAnimationFrame(tick);
    else last = 0;
  };

  function request() {
    if (hidden || !width) return;
    if (options.reducedMotion) {
      draw();
      return;
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const onVisibility = () => {
    hidden = document.hidden;
    last = 0;
    request();
  };
  document.addEventListener("visibilitychange", onVisibility);
  resize();

  return {
    setScene(index) {
      const next = Math.max(0, Math.min(SCENES - 1, index));
      if (next === scene) return;
      from = scene;
      scene = next;
      progress = options.reducedMotion ? 1 : 0;
      request();
    },
    setPath(next) {
      path = next;
      request();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
