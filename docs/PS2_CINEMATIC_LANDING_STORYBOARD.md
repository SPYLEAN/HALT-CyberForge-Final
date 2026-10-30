# PS2 cinematic landing storyboard

> **Status: PROVISIONAL, design only.** Nothing here is implemented. Copy is draft and must match the final PS2
> statement. Every visual element is driven by real scenario-A pipeline output (no decorative data).

**Composition rule for all scenes:** one dominant focal point per viewport; copy lives in its own text zone
(columns 1–4 of 12 on desktop) and never overlaps a detailed graph region; the 3D stage occupies columns 5–12.
Geometry, camera and scene bounds: see `PS2_LANDING_CAMERA_TIMELINE.md`. Materials: `PS2_LANDING_MATERIAL_LIGHTING_SPEC.md`.

**Quality reference:** Circuit Club's single asset-led composition and controlled light. **Nothing is copied**
(no phoenix, colour identity, layout or assets). **Anti-references:** the current landing's overlapping
typography, competing focal points, oversized graphs and cards over visuals.

## Scene 1: Dark Arrival

| Field | Specification |
|---|---|
| Headline | **RECONSTRUCT THE ATTACK.** |
| Copy (≤ 2 lines) | Raw logs in. A cited attack story out. Every link traceable to the line that proves it. |
| Focal point | The HALT Thread Core alone, three-quarter view, aperture closed |
| Camera position / target | pose `S1` (establish): framed on `B_core` with 18% padding, direction `(-0.35, 0.18, 1)` |
| Transition | none (entry); fade from black 600 ms |
| Object animation | none until first frame; key light rises 0 → 1 over 1.2 s |
| Lighting | single key from upper left, rim from behind right, fog dense |
| Engine state required | none (identity only) |
| Source data | none |
| Interaction | scroll or "Start" button; secondary "Open Command Center" link |
| Reduced motion | final lit state, no fade |
| Mobile | poster render of the core (portrait crop), headline above |
| WebGL fails | same poster (SSR `<img>`), identical copy |
| Budget | ≤ 25k tris visible, 1 shadowless key + rim, no bloom |
| Next | scroll: fragments begin to enter from left edge |

## Scene 2: Raw Noise

| Field | Specification |
|---|---|
| Headline | **411 events. Five sources. No story.** (numbers from the scenario-A raw files; shown only if measured from the uploaded set) |
| Copy | Sign-ins, consents, mail traces, endpoint and cloud events arrive with no visible relationship. |
| Focal point | Fragment field streaming toward the closed aperture, left third |
| Camera | `S2` (approach): target shifts to `B_fragments ∪ B_core`, dolly back 15% |
| Transition | 1.4 s ease-in-out on scroll range 0.10–0.22 |
| Object animation | fragments (instanced plates) drift in by source lane; each lane labelled in DOM (Identity, OAuth, Endpoint, Cloud, Network) |
| Lighting | fill rises slightly to reveal fragment edges |
| Engine state | parsed counts per source from intake (or the stored scenario report) |
| Source data | scenario-A raw logs (synthetic, labelled) |
| Interaction | hover/focus a lane label → shows that source's line count and one redacted sample line (DOM) |
| Reduced motion | fragments static in lanes |
| Mobile | stacked DOM list of five sources with counts and one sample each |
| WebGL fails | SVG lanes with counts |
| Budget | ≤ 600 fragment instances desktop, 150 mobile; 1 draw call |
| Next | fragments begin to cluster by entity |

## Scene 3: Entity Convergence

| Field | Specification |
|---|---|
| Headline | **Isolated alerts become one identity trail.** |
| Copy | Users, devices, sessions and tokens resolve across sources, each match backed by a rule and its events. |
| Focal point | Entity markers forming in the centre-left, fragments snapping to them |
| Camera | `S3` (inspect): frame `B_entities`, direction rotates 8° toward front |
| Transition | 1.6 s on scroll 0.22–0.36 |
| Object animation | fragments travel to their resolved entity (from entity-resolution output); unresolved fragments fall back and fade to 30% |
| Lighting | key narrows (cone) on entity cluster |
| Engine state | entity-resolution results: entities, `method`, `confidence`, evidence UIDs |
| Source data | scenario A |
| Interaction | focus an entity chip (DOM) → highlight its marker and show "resolved by rule R-x from N events" |
| Reduced motion | final resolved layout |
| Mobile | one entity card at a time (user → session → token), swipe/next |
| WebGL fails | DOM list of resolved entities with methods |
| Budget | ≤ 40 entity instances |
| Next | links begin to draw between entities |

## Scene 4: Kill Chain Emerges

| Field | Specification |
|---|---|
| Headline | **The kill chain, assembled from evidence.** |
| Copy | Phishing, sign-in, MFA change, OAuth consent, token replay, discovery. Six stages, each mapped to ATT&CK. |
| Focal point | Ember thread assembling stage by stage through the aperture |
| Camera | `S4` (follow): target follows the thread head along the curve; position stays at constant distance on the canonical direction |
| Transition | 2.4 s across scroll 0.36–0.54, stage-quantised (each stage a scroll stop) |
| Object animation | ember tube grows segment by segment (accepted edges only); stage labels in DOM at the projected positions |
| Lighting | ember emission increases per stage (bounded) |
| Engine state | accepted edges in order, ATT&CK technique + confidence per stage |
| Source data | scenario A reconstruction |
| Interaction | stage list (DOM) is keyboard-navigable; selecting a stage moves the camera stop |
| Reduced motion | full chain shown, stages listed |
| Mobile | vertical stage list with technique and one cited event each |
| WebGL fails | 2D stage diagram (SVG) |
| Budget | ≤ 6 tube segments, ≤ 8k tris |
| Next | camera approaches one edge |

## Scene 5: Evidence Chamber

| Field | Specification |
|---|---|
| Headline | **Every link has a receipt.** |
| Copy | Click any connection to see the events, the rule and the confidence behind it. |
| Focal point | One edge (consent → token) at close range with its evidence panel |
| Camera | `S5` (inspect, close): frame `B_edge(consent→token)` with 30% padding, direction `(0.25, 0.1, 1)` |
| Transition | 1.6 s on scroll 0.54–0.64; other geometry recedes (opacity 35%) |
| Object animation | the edge's cited fragments rise from the chain and align beside it |
| Lighting | key tightens on the edge; bone evidence plates lit softly |
| Engine state | edge evidence: event UIDs, source lines (redacted), method, confidence, uncertainty |
| Source data | scenario A |
| Interaction | evidence panel (DOM, right text zone) with copyable event IDs; "view raw line" opens the redacted record |
| Reduced motion | static close-up |
| Mobile | evidence card, full width |
| WebGL fails | evidence card next to a static diagram |
| Budget | evidence plates ≤ 8 |
| Next | camera withdraws; an uncertain inferred link appears dashed |

## Scene 6: Forecast Horizon

| Field | Specification |
|---|---|
| Headline | **What the attacker can reach next.** |
| Copy | Forecasts from simulated rollouts, never observed facts. Counts, not certainties. |
| Focal point | Violet dashed branches fanning from the last observed stage toward the finance ledger and peers |
| Camera | `S6` (reveal): frame `B_forecast ∪ B_lastStage`, pull back 25%, slight rise (+6°) |
| Transition | 1.8 s on scroll 0.64–0.76 |
| Object animation | violet branches extend; thickness ∝ simulated reach count; each labelled "N of 6,000 simulated rollouts" |
| Lighting | violet emission low; fog lifts to reveal depth |
| Engine state | EchoLab futures on the reconstructed graph |
| Source data | scenario A, seeded simulation |
| Interaction | focus a target → its reach count and the path it would use |
| Reduced motion | branches static |
| Mobile | ranked list of next targets with counts |
| WebGL fails | SVG horizon (existing Decision Horizon pattern) |
| Budget | ≤ 8 branches |
| Next | aperture jaws begin to close on the dangerous branch |

## Scene 7: SafeCut and ProofSeal

| Field | Specification |
|---|---|
| Headline | **Stop the attack. Not the business.** |
| Copy | The smallest reversible response: three actions, one dangerous path severed, every critical service running. (numbers from the plan) |
| Focal point | The aperture closing; one ember path severed inside it; the gold continuity thread passing through uninterrupted; the cyan proof point lighting |
| Camera | `S7` (reveal → hold): frame `B_core` with 12% padding, canonical direction |
| Transition | 2.0 s on scroll 0.76–0.90; jaws close in 900 ms (existing `--duration-cut`) |
| Object animation | jaws move to the cut positions from the SafeCut plan; severed tube halves part; proof ring draws clockwise |
| Lighting | cyan proof point emission peaks once (bounded), key returns to neutral |
| Engine state | SafeCut plan (actions, paths cut, services preserved), ProofSeal claims verified |
| Source data | scenario A |
| Interaction | "See the proof" → ProofSeal claim list (DOM) |
| Reduced motion | final sealed state |
| Mobile | poster of the sealed core + claim list |
| WebGL fails | sealed poster + claims |
| Budget | full core ≤ 60k tris; bloom only on emissive layer |
| Next | the scene settles; the stage frame becomes the Command Center frame |

## Scene 8: Command Center Handoff

| Field | Specification |
|---|---|
| Headline | **Now operate it.** |
| Copy | The same incident, the same evidence, live in the Command Center. |
| Focal point | Primary button "Enter Command Center" |
| Camera | `S8` (withdraw): pull back to `B_stage` and fade the 3D to the Command Center background colour |
| Transition | 800 ms; then a client-side route change (no reload) |
| Object animation | none beyond the withdraw |
| Lighting | fade to ambient |
| Engine state | incident id, replay cursor, selected policy, simulation, plan (already in the shared store) |
| Source data | scenario A |
| Interaction | button → `/incidents/<id>?view=overview&t=<cursor>`; the providers persist across the route (existing pattern) |
| Reduced motion | immediate |
| Mobile | full-width button |
| WebGL fails | same button |
| Budget | 3D disposed after navigation |
| Next | Command Center Overview (no page reset, same replay position) |
