# PS2 landing composition specification

> **Status: PROVISIONAL, design only.** Fixes the anti-patterns of the current landing: overlapping type,
> competing focal points, oversized graphs, misalignment, cards over visuals, no negative space.

## 1. Rules for every scene

1. One dominant focal point per viewport (the 3D subject of that scene).
2. Copy lives in a **text zone**; the 3D lives in a **visual zone**; they never overlap.
3. Headline ≤ 6 words; supporting copy ≤ 2 lines; one optional action.
4. No card wall; at most one evidence panel, and only in scene 5.
5. All text is DOM (selectable, translatable, readable by screen readers). Nothing important is drawn in WebGL.
6. Minimum text size 12 px (design-system minimum); body 16–18 px; headline uses the brand display face.

## 2. Breakpoints

| Width | Grid | Text zone | Visual zone | Notes |
|---|---|---|---|---|
| 1440 | 12 col, 80 px margins, 24 px gutters | cols 1–4 (max 440 px copy width) | cols 5–12, full height | canonical layout |
| 1280 | 12 col, 64 px margins | cols 1–4 (max 400 px) | cols 5–12 | same |
| 1024 | 12 col, 48 px margins | cols 1–5 (max 380 px) | cols 6–12 | secondary in-scene labels hidden (the DOM list keeps them) |
| 768 | 8 col, 32 px margins | top band, full width (headline + 2 lines) | below, 4:3 stage | live 3D only on capable devices, otherwise poster; evidence panel becomes a full-width card |
| 390 | 4 col, 16 px margins | full width | poster per scene (portrait), one stage at a time | guided narrative; 44 px controls; no topology shrinking |
| 360 | 4 col, 16 px margins | as 390 | as 390 | test for overflow; headline wraps to ≤ 3 lines |

## 3. Vertical rhythm

Each scene is one viewport tall (`100svh`) on desktop; on phones a scene is as tall as its content. Section
spacing is 0 (scenes abut), and the camera, not whitespace, provides the transition.

## 4. Alignment

Headline baseline aligned to the visual zone's vertical centre on desktop; kickers and headlines share the
same left edge across all eight scenes; the Command Center hand-off button sits at the same position as the
"Start" action in scene 1 (the user's eye returns to a known place).

## 5. Tablet and mobile

- Tablet keeps hierarchy without compressing the desktop scene: fewer labels, the same focal point.
- Mobile: one visual stage at a time, poster or 2.5D SVG; evidence remains reachable as cards; no horizontal
  overflow (tested at 390 and 360); controls ≥ 44×44 px.

## 6. Acceptance checks (automated when implemented)

No element overlaps another's bounding box within a scene (except the 3D canvas behind the visual zone); no text
under 12 px; no horizontal overflow at 360/390/768/1024/1280/1440; axe clean; one `h1` on the page.
