# Immersive rebirth audit

Base: `64bafba` on `ps2/immersive-product-rebirth`. Read-only inspection of stored runs, the current app and the PS3
branch. No raw dataset was read.

## Stored evidence

| | FireX 10G | FireX 30G |
|---|---|---|
| Run | `frun-69553b2c1dfeb3fe` | `frun-65a98ab95c55af35` |
| Source bytes | 6,543,120,032 | 19,621,285,387 |
| Valid / quarantined bytes | 4,815,675,121 / 1,727,415,800 | 4,294,904,301 / 15,326,381,086 |
| Canonical records | 9,125,382 | 8,138,878 |
| Exact duplicates | 812,235 | 1,310,857 |
| Records in a collapsed timestamp | 5,277,135 | 8,138,878 (all) |
| Detections / incidents | 11 / 11 | 0 / 0 |
| Duration, peak memory | 497.45 s, 3,621.9 MB | 543.53 s, 2,558.6 MB |

Two findings the product must state accurately:

- **10G is not uniformly timed.** 57.8% of its valid records share one timestamp. Its 11 incidents all come from the
  normally timed part. The Trust Centre discloses this; it must not read as a clean bill of health.
- **30G's engine did run.** Time-window rules had no usable records, and entity rules found no candidates. "Reconstruction
  withheld" means HALT will not offer a temporal attack story, not that no rule executed. The Quality Case says both.

## Real graph shapes (10G)

| Incident | Nodes / edges | Path steps | Notes |
|---|---|---|---|
| Account created, used, removed | 7 / 8 | 3 | identity and critical asset |
| Logging disabled around changes | 7 / 9 | 3 | spans 5 layers |
| Multi-technique web attack | 13 / 16 | 5 | 5 external sources, one target |
| SMB/RDP fan-out (two) | 43–54 / 43–53 | 1–2 | up to 41 context bursts, 12 reachable |
| Repeated malware (two) | 42 / 41 | 1 | 39 context events |
| Sustained DNS | 43 / 42 | 1 | 39 context events |
| Denied flood (two) | 2 / 1 | 1 | almost no structure |
| VPN alternation | 10 / 14 | 4 | identity with two addresses |

The world must read well at 2 nodes and at 54. Context dominates by count, so it needs instancing and low emphasis.

## Current 3D (`AttackGraph3D.tsx`)

Plain three.js r128. Spheres and octahedra, `MeshStandardMaterial` with no environment, one-pixel lines except the path
tube, no shadows or tone mapping. Canvas labels are tiny. Controls and legend sit above the scene and take about 40% of
the viewport. Entities are distinguishable only by colour and two shapes.

## 2D fallback (`Graph2D.tsx`)

SVG of the same graph. Keep it: it is the WebGL-unavailable, phone-adjacent and story fallback.

## Previous spatial work (PS3, `git show` only)

`ps3/spatial-integration-platform` has `AtlasCanvas.tsx` using `@react-three/fiber` and Drei `CameraControls`. Those packages
are **not installed on this branch**, and adding them would pull in a React-reconciler layer for a single scene. Decision:
stay on plain three r128, which ships `RoomEnvironment`, `RoundedBoxGeometry`, `EffectComposer` and `UnrealBloomPass`.
The useful idea taken from PS3 is that the canvas renders a pure scene model with no independent state. No PS3 code is
copied and `/atlas` is untouched.

## Assets and licensing

`public/3d/glb/halt-core.glb` and `halt-node-kit.glb` are the in-house vendored package (checksummed). They were designed for the
response demo, and their shield-adjacent forms do not match this brief. Decision: a coherent procedural node family, with
no downloaded models and no new licences.

## Landing

`/` renders the INC-2417 response story with a 595 KB three chunk and the vendored scene. Its tests pin
"Stop the attack. Not the business." Decision: preserve it unchanged at `/response-demo`, with its existing tests pointed there,
and build the eight-scene PS2 landing at `/` on Canvas 2D, so the home page loads no three.js.

## FireX APIs

Runs, incidents, graph, story, hypotheses, reachability, proof, narrative, quarantine and benchmark exist. Missing: a
dataset-health verdict, a trust summary, a quality case, case manifests, and landing facts. These are added as **read-only
derivations** over stored files, in new modules. Parser, engine, rules, weights, versions and schema do not change.
Case manifests are written to a new `results/firex-cases/` folder, never into a run.

## Routes that must not regress

`/mission`, `/incidents`, `/incidents/INC-2417*`, `/reconstruct`, `/reconstructions/*`, `/architecture`, `/firex*`.

## Baseline bundle

`three` chunk 594,537 bytes; `.next/static/chunks` total 2.5 MB.

## Mobile, motion, accessibility

- The platform bar at 390 px is a horizontally scrolled icon row: replace it with an intentional menu.
- Reduced motion is honoured in the 3D view; the camera still jumps with no framing logic.
- The evidence drawer is not a dialog and does not return focus.
- E2E axe checks pass today on FireX routes. They must keep passing.
