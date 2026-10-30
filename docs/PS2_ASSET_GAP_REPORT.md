# PS2 asset gap report

> **Status: PROVISIONAL.** Only assets the storyboard needs are listed. All new assets are first-party (built by
> the team or generated procedurally in code); no stock or third-party model is requested.

Classes: **MUST GENERATE** (render/export from our own scene) · **MUST MODEL** (needs a 3D modelling pass) ·
**CAN BUILD PROCEDURALLY** (code only) · **OPTIONAL POLISH** · **UNNECESSARY**.

| Asset | Class | Purpose | Format | Budget | Materials / textures | Animation | Transparency | Variants | Licence | Tool | Brief | Fallback |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| HALT Thread Core | CAN BUILD PROCEDURALLY | hero; scenes 1, 4, 7 | R3F geometry from `paths.json` (`SVGLoader` → `ExtrudeGeometry`) | 40–60k tris desktop, ≤ 15k mobile | carbon, metal, proof (3); no textures | jaws open/close from plan state | no | desktop live; mobile poster | first-party | three r182 | extrude each mark part; bevel 0.6–0.8 %; jaws separable; ring node emissive cyan | poster render |
| Evidence fragments | CAN BUILD PROCEDURALLY | scenes 2–3, 5 | `InstancedMesh` of bevelled plates | ≤ 600 desktop / 150 mobile instances | bone, carbon | travel to entities (from resolution output) | no | — | first-party | R3F | thin plates with a source-coloured edge stripe | DOM list |
| Payload / event particles | UNNECESSARY | — | — | — | — | — | — | — | — | — | fragments cover this; no decorative particles | — |
| Entity markers | CAN BUILD PROCEDURALLY | scene 3 | instanced shapes per entity type (user, device, session, token, app, service) | ≤ 40 instances, ≤ 300 tris each | metal + bone | appear on resolution | no | — | first-party | R3F | semantic shapes from the node kit, rebuilt lit | DOM chips |
| ProofSeal geometry | CAN BUILD PROCEDURALLY | scene 7 | torus ring + emissive core around the node | ≤ 2k tris | bone ring, proof cyan | draws clockwise once | no | — | first-party | R3F | matches the brand proof signal | SVG proof glyph (exists) |
| Threat and continuity paths | CAN BUILD PROCEDURALLY | scenes 4, 7 | `TubeGeometry` on curves from the reconstructed graph | ≤ 8k tris | ember, gold | grow by stage; severed caps | no | — | first-party | R3F | gold path passes through the aperture unbroken | SVG |
| Forecast branches | CAN BUILD PROCEDURALLY | scene 6 | dashed segmented tubes | ≤ 8 branches | violet | extend once | no (opaque dashes) | — | first-party | R3F | thickness ∝ reach count | SVG horizon |
| Static hero poster | MUST GENERATE | SSR first paint, OG image, WebGL fallback | AVIF + PNG | 2400×1500 (desktop), 1200×1500 (portrait) | — | — | no | per scene final pose (8) | first-party | render from the R3F scene via the existing Playwright screenshot pattern | final poses S1–S8 | the SVG fallbacks (existing, re-authored) |
| Mobile 2.5D fallback | MUST GENERATE | phones, reduced data | SVG per scene | ≤ 15 KB each | tokens only | none | yes | 8 | first-party | hand-authored SVG (existing fallback pattern) | one focal element per scene | — |
| Presentation-deck renders | MUST GENERATE | slides | PNG 3840×2160 | — | — | — | no | 4 (hero, chain, evidence, sealed) | first-party | same render path at higher DPR | — | posters |
| Blender H model | OPTIONAL POLISH | finer bevels | Draco GLB ≤ 300 KB | ≤ 30k tris | 3 materials, no textures | none | no | — | first-party | Blender | only if a 3D artist is available | procedural core |
| Generated roughness noise | OPTIONAL POLISH | carbon micro-variation | PNG 256² | — | — | — | no | — | first-party (generated) | code | — | flat roughness |
| Contact-shadow texture | OPTIONAL POLISH | grounding | PNG 512² | — | — | — | yes | — | first-party (baked) | code | — | none |
| HDRI environment | UNNECESSARY | — | — | — | — | — | — | — | — | — | `RoomEnvironment` (procedural) instead | — |
| Shield, brain, globe, city, hooded figure, code rain | UNNECESSARY (prohibited) | — | — | — | — | — | — | — | — | — | — | — |

The only items needing someone outside code are the optional Blender model and a final art review of posters.
