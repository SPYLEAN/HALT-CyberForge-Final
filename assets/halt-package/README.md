# HALT full package

01-brand-assets          logo SVG/PNG/favicon exports
02-design-system         tokens.json, components (README + preview each), bundle.js
03-product-boards-source Design-canvas source (.dc.html) for logo, graph, ThreadGraph, EchoLab, SafeCut, ProofSeal, Action Gate, motion, rules
04-marketing-site        index.html - self-contained scroll site (three.js r128 from cdnjs)
05-command-center        index.html - self-contained HLT-2047 Command Center prototype; source-parts/ = editable pieces
                         (build: p1_head + p9_css + <script> + parts in order, setState('approval') last)
06-3d-motion-system      halt-spec.js (editable spec), halt-scene-a/b.js (procedural Three.js scene), preview.js (React preview),
                         halt-3d.html (standalone preview), export-assets.mjs + out/ (PNG, SVG, GLB). See EXPORT.md

Notes: all demo data is simulated. Fonts (Archivo, IBM Plex Mono) are provisional. Open the index.html files directly in a browser (needs internet for CDN scripts and fonts).
Palette: Ink #0E1214, Bone #F1F0EA, Ember #D4572F (hostile only), Verdigris #3E9C86 (business only). No shield.
