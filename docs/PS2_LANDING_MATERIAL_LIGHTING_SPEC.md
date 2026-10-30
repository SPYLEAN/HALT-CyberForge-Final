# PS2 landing material and lighting specification

> **Status: PROVISIONAL, design only.** Values are starting points for three r182 `MeshPhysicalMaterial` /
> `MeshStandardMaterial` with ACES Filmic tone mapping, to be tuned against reference renders.

## 1. Brand conflict to resolve first

The HALT brand (`assets/halt-package/02-design-system/README.md`) defines Ember = hostile only, Verdigris = business
continuity, proof = Bone ring + Verdigris core, and **no shadows or blur** in the 2D UI. The PS2 brief asks for
**continuity gold** and **proof cyan** plus a forecast violet. Proposal: keep Ember and Bone exactly; adopt gold for
continuity and cyan for proof **in the 3D landing only** as a PS2 extension palette (as PS3 did), with brand-owner
sign-off. The 2D Command Center keeps the brand palette until that decision.

## 2. Palette (proposed tokens; colour values live only in token files)

| Token | Use | Proposed sRGB | Paired cue (never colour alone) |
|---|---|---|---|
| `--ps2-carbon` | core body | #15191C | form |
| `--ps2-metal` | jaw faces, machined edges | #3A4046 | form |
| `--ps2-bone` | evidence plates, type | #F1F0EA (brand Bone) | — |
| `--ps2-proof` | proof point, verified claims | #4CC9D6 (cyan) | ring shape + "verified" text |
| `--ps2-continuity` | business path | #D8A73B (gold) | unbroken thick line + label |
| `--ps2-threat` | attack thread | #D4572F (brand Ember) | solid line + stage labels |
| `--ps2-forecast` | forecast branches | #9B87F5 (violet) | dashed + "simulated" label |
| `--ps2-inferred` | inferred (statistical) links | Bone at 60% | dashed + confidence number |

## 3. Materials

| Material | Type | Parameters (start) | Notes |
|---|---|---|---|
| Matte carbon | Physical | color carbon, roughness 0.78, metalness 0.15, clearcoat 0.05 | optional 256² generated noise in roughness only (first-party) |
| Machined dark metal | Physical | color metal, roughness 0.32, metalness 0.9, anisotropy 0.2 (if supported) | bevel edges catch the rim light |
| Bone evidence surface | Standard | color bone, roughness 0.6, metalness 0 | text stays in DOM, never on these plates |
| Proof-cyan emission | Standard | emissive proof, emissiveIntensity 1.6 (core) / 0.4 (ring) | only the proof point is bloom-eligible |
| Continuity-gold emission | Standard | emissive continuity, intensity 0.6 | thick tube, always continuous through the aperture |
| Threat ember | Standard | color threat, emissive threat, intensity 0.35; severed caps intensity 0.9 for 900 ms then 0.35 | no pulsing loop |
| Forecast violet | Line/tube, dashed | color forecast, opacity 1 (opaque dashes, no sorting issues) | label "simulated" in DOM |
| Observed path | tube radius r | solid | |
| Inferred path | tube radius 0.7 r | dashed, confidence label | |

## 4. Lighting

| Light | Spec |
|---|---|
| Environment | `RoomEnvironment` → PMREM, intensity 0.35 (reflections on metal only); no HDRI file |
| Key | directional, upper-left-front, intensity 2.2, warm-neutral 5200 K equivalent |
| Fill | hemisphere, sky bone / ground carbon, intensity 0.25 |
| Rim | directional from behind right, intensity 1.4, cool, to separate the core from the background |
| Fog | exponential, colour = page background, density 0.035 (S1) → 0.02 (S6) |
| Exposure / tone mapping | ACES Filmic, exposure 1.0; sRGB output |
| Bloom | `@react-three/postprocessing` **only if justified** by the poster comparison: selective (emissive layer), luminance threshold ≥ 1.0, intensity ≤ 0.6, radius ≤ 0.4; disabled on mobile, reduced-motion and low tier. Bloom must never touch text (text is DOM) |
| Shadows | none realtime. One baked contact shadow (blurred plane texture generated at build) under the core |
| Reflections | environment only; no SSR |

## 5. Quality tiers

| Tier | When | Changes |
|---|---|---|
| High | desktop GPU, DPR ≤ 2 | all of the above, DPR cap 1.75 |
| Medium | `PerformanceMonitor` decline | no bloom, DPR 1.25, bevel segments 2 |
| Low | weak GPU / fallback | no environment, DPR 1, fragments halved |
| Poster | mobile < 768, reduced data, WebGL unavailable | pre-rendered AVIF/PNG of each scene's final pose |

**Reduced motion:** identical materials; no emission ramps; final states only.
**WebGL fallback:** posters plus the DOM content of each scene; SVG diagrams for scenes 4 and 6.
