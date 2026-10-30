# PS2 landing camera timeline

> **Status: PROVISIONAL, design only.** Poses are defined relative to scene bounds, never pixels. Framing uses the
> bounds-fitting method already implemented and tested on PS3 (`frameBox(box, viewport, dir)` in
> `lib/ps3/camera.ts`, to be ported as `lib/spatial/camera.ts`): the closest camera on a direction at which the box
> fits the canvas minus overlay padding, centred in the padded area.

## 1. Scene bounds (world units; the HALT mark is 1.0 unit tall)

| Box | Contents |
|---|---|
| `B_core` | the extruded H/aperture including jaws and ring |
| `B_fragments` | the fragment lanes left of the core (x ∈ [−3.2, −0.8]) |
| `B_entities` | resolved entity markers (left-centre) |
| `B_chain` | the accepted kill-chain thread |
| `B_edge(e)` | one edge plus its evidence plates |
| `B_forecast` | violet branches and their targets (right) |
| `B_stage` | union of all of the above |

Padding: text zone excluded from the canvas on desktop (copy is in columns 1–4, canvas in 5–12), so padding is
symmetric 6% plus 64 px top for any overlay control.

## 2. Poses

| Pose | Purpose | Box | Direction (target → camera) | Padding | Entry from | Duration | Easing | Scroll range |
|---|---|---|---|---|---|---|---|---|
| S1 | establish | `B_core` | (−0.35, 0.18, 1) | 18% | black | 1.2 s (light only) | — | 0.00–0.10 |
| S2 | approach | `B_fragments ∪ B_core` | (−0.25, 0.16, 1) | 10% | S1 | 1.4 s | cubic in-out | 0.10–0.22 |
| S3 | inspect | `B_entities` | (−0.15, 0.14, 1) | 14% | S2 | 1.6 s | cubic in-out | 0.22–0.36 |
| S4 | follow | moving: `B_stage(k)` (thread head) | (0, 0.14, 1) | 12% | S3 | 2.4 s, 6 stops | cubic out per stop | 0.36–0.54 |
| S5 | inspect (close) | `B_edge(consent→token)` | (0.25, 0.10, 1) | 30% | S4 | 1.6 s | cubic in-out | 0.54–0.64 |
| S6 | reveal | `B_forecast ∪ B_lastStage` | (0.1, 0.24, 1) | 10% | S5 | 1.8 s | cubic out | 0.64–0.76 |
| S7 | reveal → hold | `B_core` | (0, 0.12, 1) | 12% | S6 | 2.0 s | cubic in-out | 0.76–0.90 |
| S8 | withdraw → hand off | `B_stage` | (0, 0.2, 1) | 4% | S7 | 0.8 s | cubic in | 0.90–1.00 |

## 3. Behaviour rules

- **Scroll maps to pose progress, but the page scrolls normally** (no scroll-jacking): each scene is a tall
  section; a section's visibility (IntersectionObserver, existing pattern) sets the target pose; the camera
  interpolates to it over the stated duration. Scroll never blocks.
- **Interrupt:** a new target pose mid-transition starts from the current pose (no snap back).
- **Touch:** same as scroll; no pinch/orbit on the landing.
- **Keyboard:** the scene list (DOM nav) jumps to sections; focus never enters the canvas (`tabIndex=-1`).
- **No** continuous orbit, idle drift, parallax, shake or rapid zoom. Motion happens only when the scene changes.
- **Reduced motion:** each section shows its final pose immediately (`setLookAt(..., false)`); no in-between frames.
- **Narrow screens (< 768 px):** no live camera; each scene shows a pre-rendered poster of its final pose
  (portrait crop) with the DOM content beside/below it.
- **Rendering:** `frameloop="demand"`; frames only during transitions (the PS3-measured pattern: 0 idle frames).

## 4. Command Center handoff state (exact)

| Field | Value carried | Mechanism |
|---|---|---|
| incident id | `INC-2417` (scenario A) | shared provider in the `(halt)` route group (existing) |
| replay cursor | the cursor of the last scene (end of replay) | URL `t=` and the shared incident store (existing AT-9.1 behaviour) |
| graph | reconstructed ThreadGraph snapshot at `t` | API, already fetched |
| policy | selected profile | ops store |
| simulation, plan, proof | the ones the landing showed | ops store |
| route | `/incidents/INC-2417?view=overview&t=<cursor>` | client-side `Link` (no reload) |
