# PS2 landing asset audit

> **Status: PROVISIONAL.** Read-only inventory made with existing tools (Pillow, a GLB JSON-chunk parser, SVG
> `viewBox` reads). Properties these tools cannot read are marked UNKNOWN. Nothing was moved or modified.

## 1. Where assets are

| Location requested | Exists? |
|---|---|
| `design-source/brand/`, `design-source/3d/`, `design-source/motion/`, `design-source/references/` | **No.** `design-source/` does not exist in the repository |
| `public/` (repo root) | **No** |
| `apps/web/public/` | Yes: `brand/` (55), `3d/glb` (2), `3d/png` (7), `3d/svg` (7), `vendor/` (scripts, not assets) |
| Elsewhere | `assets/halt-package/` (supplied package: 80 image/3D files + HTML prototypes + design-canvas sources); repo-root `SentinelRoute shield emblem.png` (legacy); `halt-full-package/` (identical duplicate, git-excluded) |

Total visual files found: **232** (incl. 80 in the excluded duplicate). No video, HDRI, KTX2, Lottie, Blender or
FBX files exist.

## 2. Licensing and source

| Source | Licence status | Decision |
|---|---|---|
| `assets/halt-package/` (brand package, procedural 3D scene, exports) | first-party HALT package; **no licence file**; authorship to be confirmed by the team | usable internally; confirm authorship before external publication |
| `apps/web/public/brand`, `apps/web/public/3d` | byte-identical copies of the package (checksum-tested) | same as package |
| `SentinelRoute shield emblem.png` | first-party legacy; contains **shield imagery** (excluded by the brief) | **reject** for landing; must stay in repo (`verify_repo.py` checksum) |
| `assets/halt-package/02-design-system/components/lib/react*.js` | React (MIT), vendored in the prototype | not an asset |
| Circuit Club | external site; **quality and composition reference only** | nothing copied: no phoenix, colours, layouts or assets |

## 3. Family evaluation

| Family | Files | Format / dims | Quality | PS2 relevance | Desktop | Mobile | Fallback | Decision | Risk |
|---|---|---|---|---|---|---|---|---|---|
| HALT logo SVGs (icon, horizontal, stacked, wordmark, favicon; bone/ink) | 13 SVG (+ copies) | vector | high, on-brand | identity everywhere | nav, footer, deck | same | same | **keep** | none |
| Logo PNG exports (16–1024 px) | 42 PNG (+ copies) | RGBA, sizes 16–1024 | high | favicons, OG | meta | meta | — | **keep** | none |
| `paths.json` mark geometry | 1 JSON | named parts: spine, bar, top, bot, node | exact | **source geometry for the Thread Core** | extrusion source | — | SVG poster | **keep (key input)** | none |
| `halt-core.glb` | 1 (×3 copies) | 73,308 B; 7 meshes; 6 materials; 0 textures; 0 animations; 1,868 tris; `KHR_materials_unlit` | low for hero: unlit, flat colour, no bevels | depicts the HALT core, incident-era semantics | **reject as hero** | reject | — | **reject** (remake procedurally) | unlit materials cannot be lit premium without rebuild |
| `halt-node-kit.glb` | 1 (×3) | 220,792 B; 13 meshes; 13 materials; 0 textures; 0 animations; 3,248 tris; unlit | low; generic primitives | user/device/token/app/database/evidence markers: **relevant entity semantics** | reference for marker shapes only | — | — | **remake** (procedural, instanced) | unlit; one material per mesh |
| `halt-core-<state>.png` (7 states) | 7 (×3) | 1600×1000 RGBA, 52–129 KB | clean diagrams; flat, unlit | states map loosely to PS2 scenes | **reject as hero render** | possible as diagram | static poster candidate only until replaced | **reject for hero; keep as interim poster** | looks like a diagram, not a product render |
| `halt-fallback-<state>.svg` (7) | 7 (×3) | viewBox 884×510, 2–10 KB, no animation | clean | fallback posters for the r128 scene | — | mobile 2.5D base | **yes** | **keep as fallback**, re-author copy for PS2 | content shows incident-era states |
| Procedural r128 scene (`halt-spec.js`, `halt-scene-a/b.js`) | scripts | three r128 | functional, flat | current landing hero | — | — | — | **retire for PS2 landing** (keep for incident landing) | r128 vs r182 coexistence |
| Product boards (`03-product-boards-source/*.dc.html`), marketing and Command Center prototypes (`04`, `05`) | HTML | — | design references | reference for spacing/type | reference only | — | — | **keep as reference** | none |
| `SentinelRoute shield emblem.png` | 1 | 1254×1254 RGBA, 685,346 B | — | shield imagery is excluded | — | — | — | **reject** | brand conflict |

## 4. Can existing assets make the HALT Thread Core?

**No.** The required look (dimensional H/aperture in matte carbon and machined metal, physically lit, ember threads
converging, a cyan proof point, a severed path, a continuity-gold thread, violet forecast branches) cannot be made
from unlit, untextured, low-detail GLBs or flat PNG renders. The only directly useful inputs are the **mark
geometry** (`paths.json`) and the **entity semantics** of the node kit.

## 5. Recommended construction method: hybrid procedural (R3F) with the mark extruded from its own SVG paths

| Element | Construction |
|---|---|
| H / aperture body | each mark part (`spine`, `bar`, `top`, `bot`) → `SVGLoader` path → `ExtrudeGeometry` (depth ≈ 0.35 of mark height, bevel size 0.6–0.8 % with 3 segments) for machined edges; jaws separable for the aperture |
| Ring node (proof point) | `node` path extruded + emissive cyan inner disc |
| Threads (ember attack, gold continuity, violet forecast) | `TubeGeometry` along deterministic Catmull-Rom curves from the scene model; forecast as dashed (`LineDashedMaterial` or segmented tubes) |
| Raw-event fragments | one `InstancedMesh` of thin bevelled plates (≤ 600 instances desktop, 150 mobile) |
| Entity markers | instanced procedural shapes derived from the node kit's semantics (user, device, session, token, app, service) |
| Severed path | two tube halves with a gap and a cut-face cap; the gap sits inside the aperture |

**Why:** exact brand geometry with no modelling round-trip; every element can be driven by real pipeline state;
no licence questions; small download (no GLB needed).

| Budget | Desktop | Mobile |
|---|---|---|
| Triangles | 40–60k | ≤ 15k (bevel segments 1, fewer fragments) |
| Draw calls | ≤ 40 (instancing) | ≤ 20 |
| Materials | 7 (carbon, metal, bone, cyan emission, gold emission, ember, violet) | same, simplified |
| Textures | none required; optional 256² tiling roughness noise (generated, first-party) | none |
| Environment | `RoomEnvironment` → PMREM (procedural, no HDRI licence) | same, lower resolution |
| Loading | dynamic import after first paint; poster shown until first frame | poster + 2.5D SVG, no WebGL by default |
| Reduced motion | final composed state, static | same |
| Poster | rendered from the same scene at 2400×1500 (PNG/AVIF) for SSR first paint and OG image | 1200×1500 crop |

**Performance risks:** bevelled extrusions inflate triangle counts (cap bevel segments); transparent forecast tubes
need sorted rendering (use dashed opaque instead); bloom on emissive cyan/gold can wash out text (limit to
emissive layer, threshold ≥ 1.0, see material spec); PMREM generation costs ~30–80 ms once (do it after first paint).

Alternative (only if the team has a 3D artist): a Blender model of the H with hand-tuned bevels exported as
Draco/Meshopt GLB (≤ 300 KB), threads still procedural. Not required.

## Appendix: complete per-file inventory

Generated from the scan. Polygon, material, texture and animation counts are given for GLB files; for raster and
vector files they are not applicable. Duplicates in `halt-full-package/` (git-excluded) are listed once in the
summary above and omitted here.

| Path | Format | Dimensions | Bytes | 3D stats | Decision |
|---|---|---|---|---|---|
| `SentinelRoute shield emblem.png` | PNG | 1254x1254 | 685,346 | n/a | reject (shield; legacy, checksum-guarded) |
| `apps/web/public/3d/glb/halt-core.glb` | GLB | n/a | 73,308 | 1868 tris; 7 meshes; 6 mat; 0 tex; 0 anim; unlit | reject as hero; remake procedurally |
| `apps/web/public/3d/glb/halt-node-kit.glb` | GLB | n/a | 220,792 | 3248 tris; 13 meshes; 13 mat; 0 tex; 0 anim; unlit | remake (semantics only) |
| `apps/web/public/3d/png/halt-core-business.png` | PNG | 1600x1000 | 111,856 | n/a | interim poster only; replace |
| `apps/web/public/3d/png/halt-core-contained.png` | PNG | 1600x1000 | 118,171 | n/a | interim poster only; replace |
| `apps/web/public/3d/png/halt-core-dormant.png` | PNG | 1600x1000 | 57,418 | n/a | interim poster only; replace |
| `apps/web/public/3d/png/halt-core-futures.png` | PNG | 1600x1000 | 51,748 | n/a | interim poster only; replace |
| `apps/web/public/3d/png/halt-core-intrusion.png` | PNG | 1600x1000 | 60,953 | n/a | interim poster only; replace |
| `apps/web/public/3d/png/halt-core-reconstruction.png` | PNG | 1600x1000 | 87,913 | n/a | interim poster only; replace |
| `apps/web/public/3d/png/halt-core-verified.png` | PNG | 1600x1000 | 128,762 | n/a | interim poster only; replace |
| `apps/web/public/3d/svg/halt-fallback-business.svg` | SVG | viewBox 0 0 884 510 | 7,679 | n/a | keep as fallback; re-author for PS2 |
| `apps/web/public/3d/svg/halt-fallback-contained.svg` | SVG | viewBox 0 0 884 510 | 8,704 | n/a | keep as fallback; re-author for PS2 |
| `apps/web/public/3d/svg/halt-fallback-dormant.svg` | SVG | viewBox 0 0 884 510 | 2,033 | n/a | keep as fallback; re-author for PS2 |
| `apps/web/public/3d/svg/halt-fallback-futures.svg` | SVG | viewBox 0 0 884 510 | 1,874 | n/a | keep as fallback; re-author for PS2 |
| `apps/web/public/3d/svg/halt-fallback-intrusion.svg` | SVG | viewBox 0 0 884 510 | 2,380 | n/a | keep as fallback; re-author for PS2 |
| `apps/web/public/3d/svg/halt-fallback-reconstruction.svg` | SVG | viewBox 0 0 884 510 | 4,865 | n/a | keep as fallback; re-author for PS2 |
| `apps/web/public/3d/svg/halt-fallback-verified.svg` | SVG | viewBox 0 0 884 510 | 9,709 | n/a | keep as fallback; re-author for PS2 |
| `apps/web/public/brand/apple-touch-icon.png` | PNG | 180x180 | 1,928 | n/a | keep (brand) |
| `apps/web/public/brand/favicon.ico` | ICO | 48x48 | 1,776 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-bone-16.png` | PNG | 16x16 | 353 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-bone-180.png` | PNG | 180x180 | 2,233 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-bone-32.png` | PNG | 32x32 | 504 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-bone-48.png` | PNG | 48x48 | 507 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-bone-512.png` | PNG | 512x512 | 9,574 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-bone.svg` | SVG | viewBox 0 0 96 96 | 257 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-ink-16.png` | PNG | 16x16 | 358 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-ink-180.png` | PNG | 180x180 | 2,232 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-ink-32.png` | PNG | 32x32 | 499 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-ink-48.png` | PNG | 48x48 | 511 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-ink-512.png` | PNG | 512x512 | 9,508 | n/a | keep (brand) |
| `apps/web/public/brand/halt-favicon-ink.svg` | SVG | viewBox 0 0 96 96 | 257 | n/a | keep (brand) |
| `apps/web/public/brand/halt-horizontal-bone-192.png` | PNG | 672x192 | 8,718 | n/a | keep (brand) |
| `apps/web/public/brand/halt-horizontal-bone-384.png` | PNG | 1344x384 | 21,780 | n/a | keep (brand) |
| `apps/web/public/brand/halt-horizontal-bone-48.png` | PNG | 168x48 | 2,059 | n/a | keep (brand) |
| `apps/web/public/brand/halt-horizontal-bone-96.png` | PNG | 336x96 | 4,025 | n/a | keep (brand) |
| `apps/web/public/brand/halt-horizontal-bone.svg` | SVG | viewBox 0 0 294 84 | 828 | n/a | keep (brand) |
| `apps/web/public/brand/halt-horizontal-ink-192.png` | PNG | 672x192 | 8,707 | n/a | keep (brand) |
| `apps/web/public/brand/halt-horizontal-ink-384.png` | PNG | 1344x384 | 21,819 | n/a | keep (brand) |
| `apps/web/public/brand/halt-horizontal-ink-48.png` | PNG | 168x48 | 2,071 | n/a | keep (brand) |
| `apps/web/public/brand/halt-horizontal-ink-96.png` | PNG | 336x96 | 3,991 | n/a | keep (brand) |
| `apps/web/public/brand/halt-horizontal-ink.svg` | SVG | viewBox 0 0 294 84 | 828 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-bone-1024.png` | PNG | 780x1024 | 25,921 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-bone-128.png` | PNG | 98x128 | 1,769 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-bone-16.png` | PNG | 12x16 | 265 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-bone-24.png` | PNG | 18x24 | 385 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-bone-256.png` | PNG | 195x256 | 3,759 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-bone-32.png` | PNG | 24x32 | 422 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-bone-48.png` | PNG | 37x48 | 698 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-bone-512.png` | PNG | 390x512 | 9,337 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-bone-64.png` | PNG | 49x64 | 855 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-bone.svg` | SVG | viewBox 16 6 64 84 | 307 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-ink-1024.png` | PNG | 780x1024 | 25,877 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-ink-128.png` | PNG | 98x128 | 1,722 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-ink-16.png` | PNG | 12x16 | 263 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-ink-24.png` | PNG | 18x24 | 387 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-ink-256.png` | PNG | 195x256 | 3,759 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-ink-32.png` | PNG | 24x32 | 424 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-ink-48.png` | PNG | 37x48 | 705 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-ink-512.png` | PNG | 390x512 | 9,321 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-ink-64.png` | PNG | 49x64 | 864 | n/a | keep (brand) |
| `apps/web/public/brand/halt-icon-ink.svg` | SVG | viewBox 16 6 64 84 | 307 | n/a | keep (brand) |
| `apps/web/public/brand/halt-stacked-bone-128.png` | PNG | 152x128 | 2,897 | n/a | keep (brand) |
| `apps/web/public/brand/halt-stacked-bone-256.png` | PNG | 304x256 | 6,289 | n/a | keep (brand) |
| `apps/web/public/brand/halt-stacked-bone-512.png` | PNG | 607x512 | 15,341 | n/a | keep (brand) |
| `apps/web/public/brand/halt-stacked-bone.svg` | SVG | viewBox 0 0 198 167 | 761 | n/a | keep (brand) |
| `apps/web/public/brand/halt-stacked-ink-128.png` | PNG | 152x128 | 2,863 | n/a | keep (brand) |
| `apps/web/public/brand/halt-stacked-ink-256.png` | PNG | 304x256 | 6,275 | n/a | keep (brand) |
| `apps/web/public/brand/halt-stacked-ink-512.png` | PNG | 607x512 | 15,219 | n/a | keep (brand) |
| `apps/web/public/brand/halt-stacked-ink.svg` | SVG | viewBox 0 0 198 167 | 761 | n/a | keep (brand) |
| `apps/web/public/brand/halt-wordmark-bone.svg` | SVG | viewBox 0 0 360 100 | 476 | n/a | keep (brand) |
| `apps/web/public/brand/halt-wordmark-ink.svg` | SVG | viewBox 0 0 360 100 | 476 | n/a | keep (brand) |
| `apps/web/public/brand/icon-512-maskable.png` | PNG | 512x512 | 7,308 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/apple-touch-icon.png` | PNG | 180x180 | 1,928 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/favicon.ico` | ICO | 48x48 | 1,776 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-bone-16.png` | PNG | 16x16 | 353 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-bone-180.png` | PNG | 180x180 | 2,233 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-bone-32.png` | PNG | 32x32 | 504 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-bone-48.png` | PNG | 48x48 | 507 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-bone-512.png` | PNG | 512x512 | 9,574 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-bone.svg` | SVG | viewBox 0 0 96 96 | 257 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-ink-16.png` | PNG | 16x16 | 358 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-ink-180.png` | PNG | 180x180 | 2,232 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-ink-32.png` | PNG | 32x32 | 499 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-ink-48.png` | PNG | 48x48 | 511 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-ink-512.png` | PNG | 512x512 | 9,508 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-favicon-ink.svg` | SVG | viewBox 0 0 96 96 | 257 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-horizontal-bone-192.png` | PNG | 672x192 | 8,718 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-horizontal-bone-384.png` | PNG | 1344x384 | 21,780 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-horizontal-bone-48.png` | PNG | 168x48 | 2,059 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-horizontal-bone-96.png` | PNG | 336x96 | 4,025 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-horizontal-bone.svg` | SVG | viewBox 0 0 294 84 | 828 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-horizontal-ink-192.png` | PNG | 672x192 | 8,707 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-horizontal-ink-384.png` | PNG | 1344x384 | 21,819 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-horizontal-ink-48.png` | PNG | 168x48 | 2,071 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-horizontal-ink-96.png` | PNG | 336x96 | 3,991 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-horizontal-ink.svg` | SVG | viewBox 0 0 294 84 | 828 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-bone-1024.png` | PNG | 780x1024 | 25,921 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-bone-128.png` | PNG | 98x128 | 1,769 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-bone-16.png` | PNG | 12x16 | 265 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-bone-24.png` | PNG | 18x24 | 385 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-bone-256.png` | PNG | 195x256 | 3,759 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-bone-32.png` | PNG | 24x32 | 422 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-bone-48.png` | PNG | 37x48 | 698 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-bone-512.png` | PNG | 390x512 | 9,337 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-bone-64.png` | PNG | 49x64 | 855 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-bone.svg` | SVG | viewBox 16 6 64 84 | 307 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-ink-1024.png` | PNG | 780x1024 | 25,877 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-ink-128.png` | PNG | 98x128 | 1,722 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-ink-16.png` | PNG | 12x16 | 263 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-ink-24.png` | PNG | 18x24 | 387 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-ink-256.png` | PNG | 195x256 | 3,759 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-ink-32.png` | PNG | 24x32 | 424 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-ink-48.png` | PNG | 37x48 | 705 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-ink-512.png` | PNG | 390x512 | 9,321 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-ink-64.png` | PNG | 49x64 | 864 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-icon-ink.svg` | SVG | viewBox 16 6 64 84 | 307 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-stacked-bone-128.png` | PNG | 152x128 | 2,897 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-stacked-bone-256.png` | PNG | 304x256 | 6,289 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-stacked-bone-512.png` | PNG | 607x512 | 15,341 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-stacked-bone.svg` | SVG | viewBox 0 0 198 167 | 761 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-stacked-ink-128.png` | PNG | 152x128 | 2,863 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-stacked-ink-256.png` | PNG | 304x256 | 6,275 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-stacked-ink-512.png` | PNG | 607x512 | 15,219 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-stacked-ink.svg` | SVG | viewBox 0 0 198 167 | 761 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-wordmark-bone.svg` | SVG | viewBox 0 0 360 100 | 476 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/halt-wordmark-ink.svg` | SVG | viewBox 0 0 360 100 | 476 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/icon-512-maskable.png` | PNG | 512x512 | 7,308 | n/a | keep (brand) |
| `assets/halt-package/01-brand-assets/paths.json` | JSON | n/a | 966 | n/a | keep: Thread Core source geometry |
| `assets/halt-package/02-design-system/assets/Logo/halt-favicon-bone.svg` | SVG | viewBox 0 0 96 96 | 257 | n/a | keep (brand) |
| `assets/halt-package/02-design-system/assets/Logo/halt-favicon-ink.svg` | SVG | viewBox 0 0 96 96 | 257 | n/a | keep (brand) |
| `assets/halt-package/02-design-system/assets/Logo/halt-horizontal-bone.svg` | SVG | viewBox 0 0 294 84 | 828 | n/a | keep (brand) |
| `assets/halt-package/02-design-system/assets/Logo/halt-horizontal-ink.svg` | SVG | viewBox 0 0 294 84 | 828 | n/a | keep (brand) |
| `assets/halt-package/02-design-system/assets/Logo/halt-icon-bone.svg` | SVG | viewBox 16 6 64 84 | 307 | n/a | keep (brand) |
| `assets/halt-package/02-design-system/assets/Logo/halt-icon-ink.svg` | SVG | viewBox 16 6 64 84 | 307 | n/a | keep (brand) |
| `assets/halt-package/02-design-system/assets/Logo/halt-stacked-bone.svg` | SVG | viewBox 0 0 198 167 | 761 | n/a | keep (brand) |
| `assets/halt-package/02-design-system/assets/Logo/halt-stacked-ink.svg` | SVG | viewBox 0 0 198 167 | 761 | n/a | keep (brand) |
| `assets/halt-package/06-3d-motion-system/out/glb/halt-core.glb` | GLB | n/a | 73,308 | 1868 tris; 7 meshes; 6 mat; 0 tex; 0 anim; unlit | reject as hero; remake procedurally |
| `assets/halt-package/06-3d-motion-system/out/glb/halt-node-kit.glb` | GLB | n/a | 220,792 | 3248 tris; 13 meshes; 13 mat; 0 tex; 0 anim; unlit | remake (semantics only) |
| `assets/halt-package/06-3d-motion-system/out/png/halt-core-business.png` | PNG | 1600x1000 | 111,856 | n/a | interim poster only; replace |
| `assets/halt-package/06-3d-motion-system/out/png/halt-core-contained.png` | PNG | 1600x1000 | 118,171 | n/a | interim poster only; replace |
| `assets/halt-package/06-3d-motion-system/out/png/halt-core-dormant.png` | PNG | 1600x1000 | 57,418 | n/a | interim poster only; replace |
| `assets/halt-package/06-3d-motion-system/out/png/halt-core-futures.png` | PNG | 1600x1000 | 51,748 | n/a | interim poster only; replace |
| `assets/halt-package/06-3d-motion-system/out/png/halt-core-intrusion.png` | PNG | 1600x1000 | 60,953 | n/a | interim poster only; replace |
| `assets/halt-package/06-3d-motion-system/out/png/halt-core-reconstruction.png` | PNG | 1600x1000 | 87,913 | n/a | interim poster only; replace |
| `assets/halt-package/06-3d-motion-system/out/png/halt-core-verified.png` | PNG | 1600x1000 | 128,762 | n/a | interim poster only; replace |
| `assets/halt-package/06-3d-motion-system/out/svg/halt-fallback-business.svg` | SVG | viewBox 0 0 884 510 | 7,679 | n/a | keep as fallback; re-author for PS2 |
| `assets/halt-package/06-3d-motion-system/out/svg/halt-fallback-contained.svg` | SVG | viewBox 0 0 884 510 | 8,704 | n/a | keep as fallback; re-author for PS2 |
| `assets/halt-package/06-3d-motion-system/out/svg/halt-fallback-dormant.svg` | SVG | viewBox 0 0 884 510 | 2,033 | n/a | keep as fallback; re-author for PS2 |
| `assets/halt-package/06-3d-motion-system/out/svg/halt-fallback-futures.svg` | SVG | viewBox 0 0 884 510 | 1,874 | n/a | keep as fallback; re-author for PS2 |
| `assets/halt-package/06-3d-motion-system/out/svg/halt-fallback-intrusion.svg` | SVG | viewBox 0 0 884 510 | 2,380 | n/a | keep as fallback; re-author for PS2 |
| `assets/halt-package/06-3d-motion-system/out/svg/halt-fallback-reconstruction.svg` | SVG | viewBox 0 0 884 510 | 4,865 | n/a | keep as fallback; re-author for PS2 |
| `assets/halt-package/06-3d-motion-system/out/svg/halt-fallback-verified.svg` | SVG | viewBox 0 0 884 510 | 9,709 | n/a | keep as fallback; re-author for PS2 |

152 files listed (plus 80 duplicates in `halt-full-package/`).
