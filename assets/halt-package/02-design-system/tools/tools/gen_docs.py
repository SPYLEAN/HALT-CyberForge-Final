import json, textwrap, os
def w(path, s):
    p = os.path.join('project', path); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(textwrap.dedent(s).strip() + '\n')

tok = json.load(open('project/tokens.json'))
def v(name):
    for t in tok['color']['tokens']:
        if t['name'] == name:
            x = t['value']; return x['dark'], x['light']
rows = [('Page background', 'bg', 'Ink', 'The business thread is the loudest thing on a quiet ground.'),
 ('Elevated surface', 'surface-raised', 'Ink, one step up', 'Drawers and dialogs separate by a ring, not a shadow, so nothing hides the graph.'),
 ('Primary text', 'text', 'Bone', 'Evidence is readable first.'),
 ('Secondary text', 'text-secondary', 'Neutral', 'Derivations are always legible: 6:1 or more.'),
 ('Observed threat', 'threat-observed', 'Ember', 'Solid, 3px: the attack where evidence exists.'),
 ('Forecast threat', 'threat-forecast', 'Ember (alias)', 'Same hue, dotted 2 6: a future is never drawn as a fact.'),
 ('Business continuity', 'business', 'Verdigris', 'The thing HALT promises not to stop.'),
 ('Verified proof', 'proof-ring', 'Bone ring, Verdigris core', 'A verified claim is a claim about preserved operation.'),
 ('Warning', 'warning', 'Text colour', 'No hue: triangle, CAUTION, dashed border.'),
 ('Success', 'success', 'Verdigris text', 'Check and a word: success means the business kept running.'),
 ('Neutral evidence', 'neutral-evidence', 'Neutral', 'Inferred is not observed: dashed 6 4.'),
 ('Disabled state', 'text-disabled', 'Neutral, lowest', 'Disabled always states why.')]
table = '| Role | Token | Brand source | Dark | Light | Why it serves the promise |\n|---|---|---|---|---|---|\n' + '\n'.join(
    f'| {r} | `{t}` | {s} | `{v(t)[0] if not v(t)[0].startswith("{") else v(t)[0]}` | `{v(t)[1]}` | {why} |' for r, t, s, why in rows)

w('README.md', f'''
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

{table}

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
''')

# ------------------------------------------------------------------ layout
w('2-layout.md', '''
# Layout system

Marketing pages use a 12-column grid and product screens use a rail, a top bar, a 12-column main region and an inspector, all built from the spacing tokens, so the graph can dominate and everything else supports it.

## Grids

| Grid | Tokens | Rule |
|---|---|---|
| Marketing, 12 columns | `marketing-columns` 12, `marketing-gutter` 24px, `marketing-margin` 64px, `max-marketing` 1200px | Hero spans 8 columns; evidence and proof sections span 6 or 12. Margin drops to 32px below `bp-md`. |
| Product application | `app-rail-width` 232px, `app-topbar-height` 64px, `app-inspector-width` 360px, `app-columns` 12, `app-gutter` 24px, `app-margin` 32px | Rail fixed left, top bar fixed, inspector right and optional, main 12 fluid columns. Design width `max-app` 1440px; beyond it the graph canvas grows and panels do not. |

The ThreadGraph canvas takes at least 8 of the 12 main columns on every system screen. Tables and evidence sit below or in the inspector; a screen of cards is a failed layout.

## Scales

- **Spacing**: `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-5` 24, `space-6` 32, `space-7` 48, `space-8` 64, `space-9` 96. Use `space-4` inside panels, `space-5` between grid cells, `space-6` between panels, `space-7` between sections.
- **Border**: `border-hairline` 1px with `line` for dividers and `border-strong` for controls. Dashed borders mean forecast, inferred, caution or simulated; solid Verdigris means preserved or approved; solid Ember means hostile or declined.
- **Radius**: `radius-none` for tables, `radius-sm` 2px for chips, `radius-md` 4px for everything else, `radius-node` for circular graph nodes.
- **Elevation**: `elevation-0` page, `elevation-1` cards and toasts, `elevation-2` drawers and dialogs, all a 1px ring plus a surface step. `z-rail` 10, `z-topbar` 20, `z-drawer` 30, `z-dialog` 40, `z-tooltip` 50, `z-toast` 60.

## Responsive behaviour

| Breakpoint | Token | Layout |
|---|---|---|
| Phone | `bp-sm` 640px | One column, rail becomes a bottom bar, inspector is a full-screen sheet, derivations inline instead of in tooltips |
| Tablet | `bp-md` 960px | Rail shows index numbers only, inspector is a drawer over the graph |
| Laptop | `bp-lg` 1280px | Full rail, graph plus inspector |
| Wide | `bp-xl` 1600px | Graph canvas grows, panels hold their width |

## Maximum content widths

`max-marketing` 1200px, `max-prose` 640px for reading text, `max-app` 1440px, `max-drawer` 480px, `max-dialog` 560px, `max-toast` 400px.

## Rules that trace to the promise

- Put the graph where the eye lands first and keep the Verdigris business thread visible on every system screen, including while a dialog is open (`scrim` dims it, never hides it).
- Never place a panel over the cut point or the business thread.
- Persistent `simulated` chip in the top bar while demonstration data is on.
''')

# ------------------------------------------------------------------ graph
w('3-graph.md', '''
# Graph language

A node's shape says what it is and an edge's stroke form says what is known about it, so the graph can be read without colour and without labels.

## Nodes

Ten silhouettes, one per kind, all drawn by `NodeGlyph` on a 32 grid with a 2.5px outline. A node is Bone on `bg`; only two kinds carry colour.

| Kind | Shape | Why |
|---|---|---|
| User | Circle | The human, softest form |
| Device | Square, 2px corners | A fixed box |
| Session | Capsule | A bounded span of time |
| Token | Diamond | A portable credential, a key-cut |
| Application | Hexagon | A packaged unit |
| API | Right-pointing pentagon | A directed gateway |
| Service | Cross | A joining of capabilities |
| Database | Cylinder | The conventional store; the target |
| Business process | Rectangle with a Verdigris base bar | The only node carrying business colour |
| Attacker-controlled entity | Sharp triangle, solid Ember | The only filled node and the only one without rounding |

States: observed (solid outline), forecast (dashed outline), inferred (long-dashed neutral outline), held (Ember at 30%), verified (a proof ring at the lower right). At 16px keep the silhouette and drop the label.

## Edges

Six treatments, drawn by `EdgeStroke`.

| Edge | Stroke | Meaning |
|---|---|---|
| Observed relationship | Solid `threat-observed` 3px, Bone evidence square | A hostile hop with an event behind it. Every solid hostile segment links to an `EV-` ID |
| Inferred relationship | `neutral-evidence` dashed 6 4, 1.5px | Structure HALT inferred, not observed |
| Forecast path | `threat-forecast` dotted 2 6, 2px, slow march, dashed-ring end | A simulated future with a rollout count, never an evidence ID |
| Business dependency | `business` solid 2px, open circle ends | A structural link a process needs |
| Blocked path | `threat-observed` to the cut, proof ring in a gap of 0.22x, then `threat-held` | Where HALT cut and what is now unreachable. The downstream stays visible so the cut can be audited |
| Preserved path | `business` 8px with a 3s pulse | The confirmed live business thread. The thickest line in the product |

## Composition rules

- The preserved path is always continuous; hostile edges are never thicker than 3px; a business edge is never dashed or dotted.
- A proof ring appears only where ProofSeal checked a claim, at the containment point.
- Dim non-focused paths to 14% when one path is focused; never hide them.
- Provide a text equivalent for every graph (the six-path table and the evidence chain) and an aria summary per state, for example "after containment: hostile paths cut, business thread continuing".
- Mini graphs (scale under 0.5) hide labels and keep silhouettes and strokes.

The ThreadGraph screen component (canvas `ThreadGraph`) implements these rules with five modes: observed, forecast, response, cut, isolate.
''')

# ------------------------------------------------------------------ motion
w('4-motion.md', '''
# Motion language

Motion exists to show danger breaking while the business keeps moving, so hostile layers and proofs move, and the business thread only pulses.

| Motion | Purpose | Duration token | Easing token | Behaviour |
|---|---|---|---|---|
| Threat propagation | Show the attack accelerating toward its target | `duration-approach` 2200ms | `ease-approach` (.55,0,1,.45) | Hostile line draws toward the target, one pass; ease-in makes the cut feel decisive |
| Evidence appearance | Evidence arrives, it does not perform | `duration-evidence` 240ms | `ease-out` (.2,.8,.2,1) | Square marker scales from 50% and fades in |
| Graph expansion | Reveal the next hop in reading order | `duration-expand` 480ms, 60ms stagger per hop | `ease-out` | Nodes slide 14px and fade in |
| Path interruption | Show the cut | `duration-cut` 900ms, proof `duration-proof` 600ms | `ease-cut` (.16,.84,.3,1) | A gap opens in the hostile line, a proof ring lands in it, the downstream drops to 30%. The Verdigris thread does not pause |
| Simulation switching | Move between futures A, B, C | `duration-switch` 360ms | `ease-standard` (.4,0,.2,1) | Hostile layer and labels cross-fade; the business thread never restarts |
| Proof verification | A claim is checked then confirmed | `duration-proof` 600ms | `ease-out` | Bone ring draws clockwise, Verdigris centre scales in at 420ms |
| Human approval | A decision should feel deliberate | `duration-approval` 240ms | `ease-out` | Border turns Verdigris, a tint fills left to right. No confetti, no sound |
| Rollback | Reverse truthfully | `duration-cut` 900ms | `ease-standard` | The gap closes, the hostile line is whole again, the seal ring is revoked |

Ambient loops: forecast march `duration-march` 1800ms linear, business pulse `duration-pulse` 3000ms linear. The containment loop on brand surfaces is `duration-loop` 8000ms: approach, hold, cut, proof, held, reset.

## Rules

- Author every animation as a from-state onto the end state, so `prefers-reduced-motion: reduce` and a `motion` prop of false show the finished state.
- Never animate the preserved path stopping. If it ever pauses, that is the harm being measured, and it is shown as a break, not an animation.
- Never add bounce, shake, glow, screen flash, sound or celebratory effects to alerts, approvals or proofs.
- Respect cause and effect: nothing animates the cut before the action has been applied; the graph shows `response` (proposed) until the Gate reports `applied`.

The `MotionSpec` card replays all eight.
''')

# ------------------------------------------------------------------ handoff
w('5-handoff.md', '''
# Developer handoff

This is the whole contract for building HALT's product UI from this system: tokens, the `window.HALT` bundle, the mock-data types and the rules that must hold.

## 1. Load order

1. `tokens.css` (generated from `tokens.json`), then `components/bundle.css`.
2. `components/lib/react.production.min.js`, `react-dom.production.min.js` (React 18.3.1).
3. `components/bundle.js`, which defines `window.HALT`.
4. Fonts: Archivo (wdth 100 to 125, wght 400 to 800) and IBM Plex Mono (400, 500) from Google Fonts; `bundle.css` imports them.
5. Theme: `<html data-theme="dark">` (default, Ink) or `light` (Bone).

Use `var(--token)` for every value; never a brand hex in a component. Components are plain React.createElement, no build step; the types are in `components/index.d.ts`.

## 2. Components

| Component | Key props | Notes |
|---|---|---|
| `HaltMark` | `size`, `decorative` | currentColor |
| `Button` | `variant` primary, secondary, quiet, ghost, done; `trailing`, `disabled`, `reason` | One primary per view; disabled needs `reason` |
| `Nav` | `items`, `active`, `onSelect`, `footer` | Six systems in pipeline order |
| `Tabs` | `items`, `value`, `onChange`, `label` | Arrow keys |
| `StatusChip` | `kind` observed, forecast, blocked, preserved, verified, success, caution, pending, simulated, neutral | Glyph and word |
| `MetricBlock` | `label`, `value`, `derivation` (required), `simulated`, `tone` | No bare scores |
| `EvidenceRow` | `id`, `source`, `text`, `time`, `supports`, `inferred` | ID links to source |
| `ConstraintIndicator` | `name`, `rule`, `value`, `state` met, binding, violated, `fill`, `limit` | |
| `TimelineEvent` | `time`, `kind` observed, forecast, action, `title`, `meta`, `last` | |
| `ApprovalControl` | `name`, `role`, `authorises`, `impact`, `reversibility`, `authorisation`, `state`, `onApprove` | Aria-pressed |
| `Tooltip` | `content`, `title`, one child | Never essential text |
| `Drawer` | `title`, `kicker`, `footer`, `inline`, `onClose` | Non-modal |
| `Dialog` | `title`, `kicker`, `footer`, `inline`, `onClose` | Modal; trap focus in the app |
| `Toast` | `kind`, `title`, `onDismiss` | Threat toasts alert |
| `Skeleton` | `variant` line, block, graph | Forecast language, no shimmer |
| `NodeGlyph` | `kind` (10), `state`, `size`, `caption` | |
| `EdgeStroke` | `kind` (6), `width`, `animate` | |

## 3. The mock-data contract

All data is local, labelled SIMULATED, and keyed to incident INC-2417 (OAuth consent phishing, six paths to `fin-ledger-db`). No backend is specified.

```ts
type Evidence = { id: 'EV-01'..'EV-07'; source: string; ts: string; summary: string }
type Hop = { node: string; status: 'observed' | 'forecast'; evidence?: string[]; likelihood?: number }
type AttackPath = { id: 'P1'..'P6'; hops: Hop[]; target: 'fin-ledger-db'; likelihood: number; rollouts: 6000 }
type Action = { id: 'A1'|'A2'|'A3'; kind: 'revoke_grant'|'kill_sessions'|'step_up'; targets: string[]; blocks: string[];
  impact: { users: number; processes: number }; rollback: { id: string; seconds: number; method: string };
  authorisation: { policy: string; approvers: string[] } }
type Envelope = { actions: string[]; blocks: 6; minimal: true; subsetsChecked: 4096; certificate: string }
type Claim = { id: string; text: string; method: string; evidence: string[]; status: 'verified'|'failed'|'stale' }
type Proof = { seal: string; snapshot: string; claims: Claim[]; validUntil: string }
type GateState = 'review' | 'executing' | 'applied' | 'rolled'
```

Gate transitions: review to executing when both approvals are recorded and Execute is pressed; executing to applied after A1, A2, A3 in order; applied to rolled on Roll back all; any to review when new telemetry arrives after sealing. Execute is disabled until every required approver has approved; no code path executes a critical action without a recorded human approval.

## 4. Non-negotiable behaviours

- Ember means hostile, Verdigris means business, nowhere else. No third hue.
- Observed, forecast and inferred are told apart by stroke and outline, not colour alone.
- Every figure has a derivation line; every forecast figure and the top bar show SIMULATED.
- Every action shows impact (counts), reversibility (rollback plan and time) and authorisation (policy and approvers).
- 44px targets, `focus-ring` on every interactive element, text 4.5:1 and marks 3:1 in both themes.
- Reduced motion and `motion` false show the end state; the business thread never stops animating its pulse as a way of showing anything.
- Graphs have a text equivalent and an aria summary per state.

## 5. Open items

- The approved palette and typefaces were not supplied: brand hex values and Archivo / IBM Plex Mono are placeholders. Replace values in `tokens.json` (colour) and `type.families` plus `fonts/` (type); nothing else changes.
- Light-theme Ember, Verdigris and Ember text are deepened for contrast on Bone; confirm against the approved palette.
- A React preview of the screens is not built; the boards in the HALT Identity canvas are the screen source, and this system is the foundation.
''')

# ------------------------------------------------------------------ d.ts
w('components/index.d.ts', '''
import type * as React from 'react';
export interface HaltMarkProps { size?: number; decorative?: boolean; color?: string }
export declare function HaltMark(props: HaltMarkProps): React.ReactElement;
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'quiet' | 'ghost' | 'done'; trailing?: React.ReactNode; block?: boolean; reason?: string }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface NavItem { id: string; label: string; index?: string; href?: string }
export interface NavProps { items: NavItem[]; active?: string; onSelect?: (id: string) => void; footer?: React.ReactNode; label?: string; height?: number | string }
export declare function Nav(props: NavProps): React.ReactElement;
export interface TabItem { id: string; label: string; count?: string | number }
export interface TabsProps { items: TabItem[]; value?: string; onChange?: (id: string) => void; label?: string }
export declare function Tabs(props: TabsProps): React.ReactElement;
export interface StatusChipProps { kind?: 'observed' | 'forecast' | 'blocked' | 'preserved' | 'verified' | 'success' | 'caution' | 'pending' | 'simulated' | 'neutral'; children?: React.ReactNode; className?: string }
export declare function StatusChip(props: StatusChipProps): React.ReactElement;
export interface MetricBlockProps { label: string; value: React.ReactNode; unit?: string; derivation: string; simulated?: boolean; tone?: 'threat' | 'business' }
export declare function MetricBlock(props: MetricBlockProps): React.ReactElement;
export interface EvidenceRowProps { id: string; source: string; text: string; time: string; supports?: string; href?: string; inferred?: boolean }
export declare function EvidenceRow(props: EvidenceRowProps): React.ReactElement;
export interface ConstraintIndicatorProps { name: string; rule: string; value: string; state?: 'met' | 'binding' | 'violated'; fill?: number; limit?: number }
export declare function ConstraintIndicator(props: ConstraintIndicatorProps): React.ReactElement;
export interface TimelineEventProps { time: string; kind?: 'observed' | 'forecast' | 'action'; title: string; description?: string; meta?: string; last?: boolean }
export declare function TimelineEvent(props: TimelineEventProps): React.ReactElement;
export interface ApprovalControlProps { name: string; role: string; short?: string; policy?: string; authorises?: string; impact?: string; reversibility?: string; authorisation?: string; state?: 'pending' | 'approved' | 'held'; at?: string; disabled?: boolean; onApprove?: () => void }
export declare function ApprovalControl(props: ApprovalControlProps): React.ReactElement;
export interface TooltipProps { content: React.ReactNode; title?: string; open?: boolean; children: React.ReactElement }
export declare function Tooltip(props: TooltipProps): React.ReactElement;
export interface DrawerProps { title: string; kicker?: string; open?: boolean; inline?: boolean; height?: number | string; onClose?: () => void; footer?: React.ReactNode; children?: React.ReactNode }
export declare function Drawer(props: DrawerProps): React.ReactElement | null;
export interface DialogProps { title: string; kicker?: string; open?: boolean; inline?: boolean; height?: number | string; onClose?: () => void; footer?: React.ReactNode; children?: React.ReactNode }
export declare function Dialog(props: DialogProps): React.ReactElement | null;
export interface ToastProps { kind?: 'neutral' | 'success' | 'caution' | 'threat'; title: string; onDismiss?: () => void; children?: React.ReactNode }
export declare function Toast(props: ToastProps): React.ReactElement;
export interface SkeletonProps { variant?: 'line' | 'block' | 'graph'; lines?: number; width?: number | string; height?: number | string; label?: string }
export declare function Skeleton(props: SkeletonProps): React.ReactElement;
export type NodeKind = 'user' | 'device' | 'session' | 'token' | 'application' | 'api' | 'service' | 'database' | 'process' | 'attacker';
export interface NodeGlyphProps { kind: NodeKind; state?: 'observed' | 'forecast' | 'inferred' | 'held' | 'verified'; size?: number; label?: string; caption?: boolean | string }
export declare function NodeGlyph(props: NodeGlyphProps): React.ReactElement;
export interface EdgeStrokeProps { kind: 'observed' | 'inferred' | 'forecast' | 'dependency' | 'blocked' | 'preserved'; width?: number; animate?: boolean }
export declare function EdgeStroke(props: EdgeStrokeProps): React.ReactElement;
declare global { interface Window { HALT: { HaltMark: typeof HaltMark; Button: typeof Button; Nav: typeof Nav; Tabs: typeof Tabs; StatusChip: typeof StatusChip; MetricBlock: typeof MetricBlock; EvidenceRow: typeof EvidenceRow; ConstraintIndicator: typeof ConstraintIndicator; TimelineEvent: typeof TimelineEvent; ApprovalControl: typeof ApprovalControl; Tooltip: typeof Tooltip; Drawer: typeof Drawer; Dialog: typeof Dialog; Toast: typeof Toast; Skeleton: typeof Skeleton; NodeGlyph: typeof NodeGlyph; EdgeStroke: typeof EdgeStroke } } }
''')

# ------------------------------------------------------------------ assets README
w('assets/Logo/README.md', '''
# Logo

The approved HALT mark in four lockups, each in a Bone version for dark grounds and an Ink version for light grounds; every file is single colour and is chosen, never recoloured (an `<img>` cannot take CSS colour).

- `halt-icon-bone.svg`, `halt-icon-ink.svg`: icon, minimum 24px. Bone `#F1F0EA` on `bg` in the dark theme; Ink `#0E1214` on Bone.
- `halt-horizontal-bone.svg`, `halt-horizontal-ink.svg`: icon plus outlined wordmark, minimum 100px wide. Primary lockup.
- `halt-stacked-bone.svg`, `halt-stacked-ink.svg`: icon above wordmark, minimum 80px wide.
- `halt-favicon-bone.svg`, `halt-favicon-ink.svg`: the favicon cut for 16 to 48px (stem 18, solid node, gap 4). Do not use above 48px.

Keep 1.5x clear space (x is the stem width). Inside React UI use the `HaltMark` component, which draws the icon in `currentColor`.
''')
