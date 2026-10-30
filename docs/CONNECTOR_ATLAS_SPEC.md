# Connector Atlas specification (prototype)

Route `/atlas` (theatre: `/atlas/theatre`). Data: fixtures + the client engine (`PS3_DATA_CONTRACTS.md`).

## Layout

| Width | Layout |
|---|---|
| ≥ 1280 | Top bar · object list (left) · 3D Atlas (centre) · detail drawer (right) · 2D minimap (over the canvas, bottom-left) · flight timeline (bottom) |
| 960–1279 | Same, drawer collapsible, fewer in-scene labels (zone names only) |
| < 960 (tablet portrait, phone) | **Guided tour**: one stage per screen, large evidence panel, prev/next, "View complete 2D flow". The 3D scene is not shrunk onto a phone |
| No WebGL / render error | 2D flow replaces the canvas; every panel and action still works |

## Spatial grammar (original, restrained)

- **Zones** are five tall translucent planes ("validation planes") standing across the rails, with narrow
  emissive edges, labelled in DOM: Source systems · Acquisition · Transformation · Validation · Destinations.
- **Rails**: one horizontal rail per connector (lanes), matte carbon with a hairline edge.
- **Stage nodes**: machined blocks seated on the rail inside their zone; instanced.
- **Sources**: floating monoliths at the left end of each rail. **Destinations**: shared monoliths at the right;
  delivery threads fan in from each rail's last validation stage.
- **Payload**: a single gold block on the rail, its position a pure function of the timeline step.
- **Proof markers**: bone ring + teal core (the HALT proof signal) above each stage a record passed.
- **Failure**: the node turns ember, the packet stops at it, and the thread beyond it is dashed.
- **Drift**: affected nodes and threads turn violet; broken destinations ember; everything unaffected recedes
  (lower opacity), never disappears.

No buildings, no particles, no globe, no bloom by default. Light: one hemisphere + one key light, no shadow maps.

## Colour semantics (PS3 extension palette, `styles/ps3.css`)

| Token | Meaning | Always paired with |
|---|---|---|
| `--ps3-verified` (cyan-teal) | stage passed / verified path | "passed" text, proof marker |
| `--ps3-active` (gold) | data in motion, current step | "active" text, packet |
| `--ps3-failure` (ember) | stage failed, destination broken | "failed"/"broken" text, dashed thread |
| `--ps3-drift` (violet) | affected by schema drift / uncertainty | "drift-affected" text |
| `--ps3-structure` (bone) | geometry, typography | — |

## Panels (DOM, right drawer)

| Panel | Content (all from the engine) |
|---|---|
| Source Lens | auth type, secret *reference*, endpoint, cursor (final), page size, rate limit, retries observed, health (from recorded statuses); redacted sample payload beside its mapped output |
| Mapping Chamber | input fields ← rules → output fields; per rule: op, status (renamed / converted / defaulted / dropped / invalid / unmapped-required), config, test evidence (record values) |
| Payload Flight | step list for the selected record; before/after diff at the current step; evidence; status |
| Drift Shockwave | scenario picker; affected rules, failed validations, broken and unaffected destinations; repair draft (or the reason there is none); "Apply draft to a new version" creates a *draft config* and re-runs, never auto-applied |
| Proof Corridor | source event id, config version + hash, mapping version + hash, validation results, per-stage hashes, simulated destination acks, retry history, timestamps |
| Activation Gate | receipt, blocking reasons, named approver from fixture, explicit approve; result "Approved for activation · SIMULATED" |

## Camera

Controls: Home (whole atlas), Focus (selected object), Payload follow (track the packet), Reset (home +
clear selection). Orbit, pan, zoom with limits (`minDistance`, `maxDistance`, polar clamp). Reduced motion:
every transition is immediate (`setLookAt(..., false)`), no follow animation, packet jumps between stages.

## Rendering budget

`frameloop="demand"`; `invalidate()` on state change; continuous only while a flight plays or the camera
transitions. DPR capped at 1.75 (1.25 in adaptive low). `PerformanceMonitor` lowers DPR, then disables edge
glow. Rendering stops while the tab is hidden. Instanced meshes for stage blocks, proof markers.
