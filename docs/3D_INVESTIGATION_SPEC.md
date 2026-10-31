# 3D investigation specification

A semantic view of one `IncidentGraph`. Position carries meaning; there is no force layout.

| Axis | Meaning |
|---|---|
| X | source order within the incident |
| Y | kill-chain stage |
| Z | organisation layer: external, network edge, endpoint, identity, application, critical asset |

| State | Style |
|---|---|
| Observed evidence | cyan, solid |
| Selected attacker path | ember red |
| Inferred edge | violet, dashed |
| Reachable next | translucent gold |
| Context | muted grey |
| Missing evidence | broken segment |
| Selected evidence | cyan pulse |

## Controls

Rotate, zoom, pan, node and edge selection with an evidence drawer, reset camera, focus path, toggles for observed,
inferred and reachable, hypothesis comparison, chronological replay with play, pause, speed, previous and next, and
camera presets (Full Incident, Entry Point, Persistence, Lateral Movement, Critical Asset, Reachable Next,
Alternate Hypothesis).

## Constraints

- 2D and 3D use the same `IncidentGraph` and share selection state.
- Only incident subgraphs reach WebGL, with node caps and collapsed bursts. The full dataset never does.
- The canvas is loaded with a dynamic import and no server rendering.
- Three.js is used directly: React Three Fiber and Drei are not installed in this repository.
- Reduced motion disables animation. Without WebGL the 2D view is shown. Mobile gets a guided step list. A
  keyboard-accessible list exposes every node and edge.
