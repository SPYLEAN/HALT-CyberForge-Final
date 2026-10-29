// Copy the supplied brand and 3D export assets into public/ byte-for-byte (verified by tests/unit/brand.test.ts).
// Usage: node scripts/copy-brand.mjs
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = resolve(web, "../../assets/halt-package");

export const COPIES = [
  { from: "01-brand-assets", to: "public/brand", skip: ["paths.json"] },
  { from: "06-3d-motion-system/out/svg", to: "public/3d/svg", skip: [] },
  { from: "06-3d-motion-system/out/png", to: "public/3d/png", skip: [] },
  { from: "06-3d-motion-system/out/glb", to: "public/3d/glb", skip: [] },
];
// Single files: Next.js app-router icons, the mark geometry HaltMark imports (kept inside the app so the
// Docker build, whose context is apps/web, has it), and the 3D scene, loaded unmodified as classic scripts.
export const ICONS = [
  { from: "01-brand-assets/favicon.ico", to: "src/app/favicon.ico" },
  { from: "01-brand-assets/apple-touch-icon.png", to: "src/app/apple-icon.png" },
  { from: "01-brand-assets/paths.json", to: "src/components/halt/mark-paths.json" },
  { from: "06-3d-motion-system/halt-spec.js", to: "public/vendor/halt-3d/halt-spec.js" },
  { from: "06-3d-motion-system/halt-scene-a.js", to: "public/vendor/halt-3d/halt-scene-a.js" },
  { from: "06-3d-motion-system/halt-scene-b.js", to: "public/vendor/halt-3d/halt-scene-b.js" },
];
// three.js r128, the version the supplied scene targets (npm three@0.128.0).
export const THREE_SOURCE = "node_modules/three/build/three.min.js";
export const THREE_TARGET = "public/vendor/three/three.min.js";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const { from, to, skip } of COPIES) {
    mkdirSync(resolve(web, to), { recursive: true });
    for (const name of readdirSync(resolve(pkg, from))) {
      if (!skip.includes(name)) copyFileSync(resolve(pkg, from, name), resolve(web, to, name));
    }
  }
  for (const { from, to } of ICONS) {
    mkdirSync(dirname(resolve(web, to)), { recursive: true });
    copyFileSync(resolve(pkg, from), resolve(web, to));
  }
  mkdirSync(dirname(resolve(web, THREE_TARGET)), { recursive: true });
  copyFileSync(resolve(web, "../..", THREE_SOURCE), resolve(web, THREE_TARGET));
  console.log("brand and 3D assets copied");
}
