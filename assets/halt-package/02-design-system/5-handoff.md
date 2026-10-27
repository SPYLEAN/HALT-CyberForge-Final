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
