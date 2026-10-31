# Semantic 3D Attack World

A spatial reconstruction driven only by one incident's `IncidentGraph`. Plain three.js r128, dynamically imported on the Attack
World and Theatre routes only.

## Axes

| Axis | Meaning | Honesty rule |
|---|---|---|
| X | Source progression | Evidence order, not a linear clock. Labelled "Source order". |
| Y | Kill-chain stage | Only steps carry a stage. Entities have none, so they stand on the floor, not at an invented height. |
| Z | Organisation layer | Lanes: External, Network edge, Endpoint, Identity, Service, Critical asset. |

Each step floats at its stage height with a drop line to its lane. Stage rails stand on the back wall and lanes are drawn on the
floor, so both axes can be read directly.

## Node family

One industrial family: machined dark metal, matte carbon base plate, restrained emissive accent.

| Entity | Form |
|---|---|
| External IP | Directional beacon (cone on a mast) |
| Identity | Illuminated ring on a plinth |
| Host or endpoint | Machined terminal block with a lit face |
| Service or application | Framed portal |
| Critical asset | Protected tower with a core and guard ring |
| Behavioural burst | Clustered field, density from the log of its count |
| Event | Proof marker |
| Unknown | Incomplete wireframe |

## Edges

| Meaning | Form |
|---|---|
| Observed | Solid, restrained cyan |
| Selected path | Weighted ember tube with direction chevrons |
| Inferred | Violet segments. On the selected path: ember segments, so the path still reads as a route and the gaps show inference |
| Reachable next | Translucent gold |
| Context | Muted steel |
| Missing evidence | Broken, dissolving route |

## Finish

ACES tone mapping, sRGB output, `RoomEnvironment` reflections at low intensity, a key light with soft shadows, low fill, a rim
light, controlled fog, contact-style floor shadows, and limited bloom on capable devices only.

## Camera

A directed state machine with eased moves: Establish, Approach, Follow, Inspect, Reveal, Withdraw, Present. It never orbits by
itself. Dragging orbits, shift-drag or right-drag pans, wheel zooms. Reduced motion cuts instead of easing.

## Scale

Incident subgraphs only. Context nodes are a single `InstancedMesh`. Labels show only for the path and selection, and only
inside the frustum. Rendering is on demand and stops when the page is hidden. Pixel ratio is capped at 2, or 1.25 on low-power
devices, which also lose bloom and shadows. Everything is disposed on unmount.

## Fallbacks

Phones get the guided step list. Without WebGL, the 2D view appears automatically. Reduced motion keeps the scene and removes the
animation.

## Input

Mouse, touch, keyboard: arrow keys step, Enter inspects, Escape clears, Home re-establishes. Empty-canvas click clears the selection.
A text summary of the graph is exposed to screen readers, and a list holds every element.
