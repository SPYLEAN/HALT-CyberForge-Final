HALT stops the attack and keeps the business running, and every token, component and rule here exists to make that visible: dangerous paths break, essential operations keep moving, and every claim shows its evidence.

## The four colours and what they mean

- Ink (`bg`) is ground. Bone (`text`, `proof-ring`, `action-fill`) is nodes, proof, text and the one primary action.
- Ember is hostile and nothing else: use `threat-observed`, `threat-forecast`, `threat-text`, `threat-soft`, `threat-held`. Never an Ember button, Ember brand accent, Ember decoration or Ember "danger" for a business problem.
- Verdigris is business and nothing else: use `business`, `business-text`, `business-soft`, `proof-core`, `success`. Never Verdigris as a generic accent or button.
- Do not introduce another hue. Warning and Success add none.
- The brand hex values (Ink `#0E1214`, Bone `#F1F0EA`, Ember `#D4572F`, Verdigris `#3E9C86`) and the typefaces are placeholders until the approved assets are applied; change them in `tokens.json` only, never in a component.

## Brand application rules

- Place the primary horizontal logo (`assets/Logo/halt-horizontal-bone.svg` on `bg`, `halt-horizontal-ink.svg` on Bone) top-left of the top bar or page header. Use the icon (`halt-icon-*.svg`, or the `HaltMark` component) in the rail and wherever the lockup would fall under 100px wide. Use the stacked lockup (`halt-stacked-*.svg`) for covers and square slots.
- Keep 1.5x clear space on every side, where x is the stem width of the H (19% of the mark's height).
- Never set the mark under 24px (8mm in print), the horizontal under 100px wide, the stacked under 80px wide, or the favicon cut under 16px.
- Use Bone on Ink and Ink on Bone. On any other ground pick whichever has 4.5:1 or more; never on Ember or Verdigris fields.
- Use `halt-favicon-*.svg` for 16 to 48px (stem 18, solid node, gap 4) and the 180px Ink tile for touch icons. The application icon is the Bone mark centred on an Ink tile at 56% of its width; the platform applies its own corner mask.
- Never stretch, rotate, outline, recolour, glow, shadow, badge, enclose in a shield, lock or circle, retype the wordmark, or crowd the clear space. The mark is single colour; Ember and Verdigris are never added to it.
- Animate the mark only in the containment loop (see Motion); everywhere else it is still.

## Semantic colour mapping

Pick the role token, never the brand hex. Every pair in the table below, and every text token on `bg`, `surface` and `surface-raised`, meets 4.5:1 in both themes; marks and borders meet 3:1. `text-disabled` and `threat-held` are intentionally exempt and are always labelled in words.

| Role | Token | Brand source | Dark | Light | Why it serves the promise |
|---|---|---|---|---|---|
| Page background | `bg` | Ink | `#0E1214` | `#F1F0EA` | The business thread is the loudest thing on a quiet ground. |
| Elevated surface | `surface-raised` | Ink, one step up | `#1C2428` | `#FFFFFF` | Drawers and dialogs separate by a ring, not a shadow, so nothing hides the graph. |
| Primary text | `text` | Bone | `#F1F0EA` | `#0E1214` | Evidence is readable first. |
| Secondary text | `text-secondary` | Neutral | `#9AA3A8` | `#4A565C` | Derivations are always legible: 6:1 or more. |
| Observed threat | `threat-observed` | Ember | `#D4572F` | `#C94A22` | Solid, 3px: the attack where evidence exists. |
| Forecast threat | `threat-forecast` | Ember (alias) | `{threat-observed}` | `{threat-observed}` | Same hue, dotted 2 6: a future is never drawn as a fact. |
| Business continuity | `business` | Verdigris | `#3E9C86` | `#2A7C69` | The thing HALT promises not to stop. |
| Verified proof | `proof-ring` | Bone ring, Verdigris core | `#F1F0EA` | `#0E1214` | A verified claim is a claim about preserved operation. |
| Warning | `warning` | Text colour | `{text}` | `{text}` | No hue: triangle, CAUTION, dashed border. |
| Success | `success` | Verdigris text | `{business-text}` | `{business-text}` | Check and a word: success means the business kept running. |
| Neutral evidence | `neutral-evidence` | Neutral | `#707D84` | `#5E6A70` | Inferred is not observed: dashed 6 4. |
| Disabled state | `text-disabled` | Neutral, lowest | `#59656B` | `#8A9398` | Disabled always states why. |

Form carries meaning before colour. Observed is solid, forecast is dotted with a dashed-ring node, held is Ember at 30%, the business thread is 8px. A hostile line is never thicker than 3px and a business line is never broken: a broken business line is the harm being measured.

## Typography

Archivo carries headlines, body and evidence prose; IBM Plex Mono carries labels, data and telemetry. Set display, product and section headlines with `font-stretch` 108 to 112% (class names `display-headline`, `product-title`, `section-headline` do this in `bundle.css`).

| Role | Style | Use |
|---|---|---|
| Display headline | `display-headline` 40/44 | One per marketing page or canvas title |
| Section headline | `section-headline` 20/26 | Panel and section headings |
| Product title | `product-title` 30/33 | The H1 of each system screen |
| Body | `body` 14/21 | Running text on surfaces |
| Label | `label` 10.5/16, mono, uppercase, tracked .09em | Section labels, chip words, column heads |
| Data value | `data-value` 28/32, mono 500 | Counts and ratios, always with a derivation |
| Evidence text | `evidence-text` 12.5/19 | Quoted evidence and claim methods |
| Code and telemetry | `telemetry` 11.5/18, mono | IDs, hashes, timestamps, certificates |

## Content fundamentals

- Lead with evidence, then the decision: "Token replay for S-1 from a new ASN, four minutes after the real sign-in." Name the thing, give the ID (`EV-03`), give the time in UTC.
- Show counts, never bare scores: "0 of 6 paths reachable", "4,912 of 6,000 rollouts". Every figure carries its derivation line. Mark demonstration numbers SIMULATED.
- Write in sentence case for prose and UPPERCASE for mono labels and buttons. Verb first on buttons: "EXECUTE 3 ACTIONS", "ROLL BACK ALL · ~2 MIN". No exclamation marks, no "AI-powered", no "seamless", no urgency theatre.
- Say what is not claimed: ProofSeal states what the proof does not cover. Disabled controls state why: "Disabled until both approvals are recorded."
- Every action shows three things: impact (counted), reversibility (rollback plan and time) and authorisation (policy and approvers). A critical action always names a human approver.

## Visual foundations

- No shadows and no blur. Separate with a surface step (`bg`, `surface`, `surface-raised`) and a 1px ring (`elevation-1`, `elevation-2`) or `line` hairline.
- Radius is `radius-md` 4px for every container and control, `radius-sm` 2px for chips, `radius-node` only for circular graph nodes.
- Every control is 44px (`hit-target`). Focus is the `focus-ring` token: 2px of page colour then a solid 2px ring in `text`, never removed.
- Space is `space-1` to `space-9` on a 4px base and 8px rhythm. Graphs and flows dominate the screen; panels support them.
- Avoid: shields, hacker figures, matrix rain, brains, globes, particles, glass panels, fake terminals, decorative charts, unexplained scores, auto-executing critical actions.

## Iconography

HALT has no icon font. Glyphs are the geometric shapes of the graph language (square, dashed ring, thick line, proof ring) drawn inside StatusChip and ConstraintIndicator, plus the characters `→` advance, `↺` rollback, `×` close, `✓` applied and `▲` caution, always paired with a word. No emoji, no illustrative icons, no third-party sets.

## Components, graph and motion

Components live in `components/bundle.js` as `window.HALT` and expect React 18: HaltMark, Button, Nav, Tabs, StatusChip, MetricBlock, EvidenceRow, ConstraintIndicator, TimelineEvent, ApprovalControl, Tooltip, Drawer, Dialog, Toast, Skeleton, NodeGlyph, EdgeStroke. Use the `Cover`, `LogoUse`, `SemanticMap`, `GridSystem` and `MotionSpec` cards for the brand, colour, layout and motion rules. Read the sections Layout system, Graph language, Motion language and Developer handoff for the rest.
