# HALT 3D export instructions

Everything is generated from the same procedural code as the live scene, so exports never drift.

1. `npm i three@0.128.0 playwright && npx playwright install chromium`
2. Put `halt-spec.js`, `halt-scene-a.js`, `halt-scene-b.js` and `export-assets.mjs` in one folder (node_modules beside them).
3. `node export-assets.mjs`  (optional: `W=2400 H=1500 node export-assets.mjs`)

Output (`out/`):
- `png/halt-core-<state>.png` transparent, 1600x1000, 7 states, no labels (labels are HTML)
- `svg/halt-fallback-<state>.svg` static fallback; use as poster and Open Graph image
- `glb/halt-core.glb` Core (OperationalSpine, HostileUpper/Lower, VerifierRing/Centre) + ContainmentBoundary
- `glb/halt-node-kit.glb` the 11 reusable assets, one node each

Rules: no textures, env maps or post-processing in exports. GLB is not instanced (r128 exporter limit); Core is MeshStandard, everything else unlit MeshBasic. Y up, 1 unit = 1 scene unit. Change the `layout:'export'` entry in the spec to reframe PNGs.

Using the scene: `new HaltScene(canvas, labelRootDiv, {quality, reducedMotion, layout, state})`, then `scene.setState('verified')`. Layouts: centered, website, commandCenter, mobile. Add HTML labels via the labelRoot; keep the 3D supplementary and the product text in HTML.
