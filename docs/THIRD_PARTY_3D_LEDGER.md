# Third-party and supplied 3D ledger

## Supplied GLB assets (audited)

| File | Source | Licence | Size | Triangles | Contents | Decision |
|---|---|---|---|---|---|---|
| `assets/halt-package/06-3d-motion-system/out/glb/halt-core.glb` | Supplied HALT package; exported by the package's own procedural scene (`export-assets.mjs`, THREE.GLTFExporter) | First-party project asset; no third-party licence. No explicit licence file in the package | 73,308 B | 1,868 | HALT Core: spine, hostile bars, verifier ring, containment boundary (`KHR_materials_unlit`) | **Not used.** It depicts incident containment, not integration; the brief says not to add models because they are available |
| `assets/halt-package/06-3d-motion-system/out/glb/halt-node-kit.glb` | Same | Same | 220,792 B | 3,248 | 11 incident-graph nodes (user, device, token, application, database, evidence/forecast/approval markers) | **Not used.** Semantics are incident entities; Atlas objects are pipeline stages |

Because neither is used, no glTF compression or LOD was needed. If a future asset is adopted it must be
recorded here first with source, licence, size and polygon count, compressed (`gltf-transform` Draco/Meshopt),
and loaded with `useGLTF` behind the same fallback.

## Geometry used instead

All Atlas geometry is procedural (boxes, planes, tubes, tori) generated in `components/ps3/scene/*`.
Repeated objects (stage blocks, proof markers) are `InstancedMesh`.

## Libraries

| Package | Version | Licence | Use |
|---|---|---|---|
| `three` | 0.186.1 | MIT | renderer, geometry |
| `@react-three/fiber` | 9.8.2 | MIT | React 19 renderer for three |
| `@react-three/drei` | 10.7.9 | MIT | `CameraControls`, `PerformanceMonitor`, `AdaptiveDpr`, `Html` (zone labels) |
| `@types/three` | 0.186.0 | MIT | types |
| `@react-three/postprocessing` | — | — | **Not added**: no effect justified its cost |

`three@0.128.0` remains installed under the alias `three-r128` only to vendor the landing page's supplied
r128 scene unchanged (checksum-tested).

## Not used

No seat-booking or other proprietary source code, models, textures or HDRIs. No fonts or textures in WebGL.
