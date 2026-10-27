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
