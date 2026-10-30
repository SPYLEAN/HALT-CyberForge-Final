# Design Implementation Map (UI v2)

Every screen and interaction in UI v2, mapped to the backend data that feeds it. No v2 screen introduces data the API does not return. **The single exception is "Severity".**

- The brief asks for it in the command bar, and no contract carries one.
- It is added as a scenario fixture field (`incident.json` → `IncidentSpec.severity` → `Incident.severity`), labelled synthetic like the incident title.
- It is regenerated through the documented commands.

**Sources.**
- `ops.*` is `apps/web/src/lib/api/ops.tsx` (REST, rehydrated on reload and reconnect).
- `replay.*` is `apps/web/src/lib/state/incident-store.tsx` (WebSocket `/ws/incidents/{id}`).

All endpoints are under `/api/v1`.

## Routes

| Route | Screen character | Mode | Data |
|---|---|---|---|
| `/` | Landing: one incident told as a camera move | Theatre (scroll) | `GET /incidents/{id}`, `/events`, `/paths`, `/policies`, `/policy-comparison`, `POST` correlate/plans/simulations/proof (read-only analysis, existing `useLandingAnalysis`), WebSocket replay |
| `/mission` | **Mission Control**: operational landscape (Resilience Map) | Command | `GET /health`, `/ready`, `/incidents`, `/incidents/{id}`, `/paths`, `/policies`, the latest plan and proof (`Incident.latest`), `/audit/verify`, graph nodes (critical processes) from the replay |
| `/incidents` | **Incident Rooms** | Command | `GET /incidents`, `/incidents/{id}/variants` (controlled scenario variants), `Incident.state`, `severity`, `latest`; affected operations from graph `criticality` |
| `/incidents/{id}?view=…&mode=command\|forensic` | Command Center | Command / Forensic | Below |
| `/incidents/{id}/theatre` | Presentation | Theatre | The same providers and APIs; nine steps (below) |
| `/architecture` | **System Architecture**: implemented / architecture-ready / planned | Command | Static, truthful content: every "implemented" box links to code that exists in this repository, and nothing is shown as live that is not |

There is no Reports route of its own: **Reports** is a Command Center view (`view=report`), printable. A separate route would duplicate it.

## Command Center views

| View (nav label) | Dominant visual | Decision / purpose | Data | Loading / error | Theatre step |
|---|---|---|---|---|---|
| Overview | Incident landscape: the graph at the replay cursor, with the decision banner across it | "What is happening, and what should I do next?" | `Incident` (state, confidence, severity), `paths`, `plan.residual`, `proof.claims`, `NextStep` | Skeleton until `Incident`; `ApiFailure` toast with the API's message | 1 |
| ThreadGraph | Living lattice (Cytoscape + SVG overlay) at ≥ 65 % of the workspace | "Who can reach the ledger, and what does the business need?" | replay nodes and edges, `paths`, `plan`, `execution`, `GET /graph?at=` | "Waiting for the replay" skeleton | 2–3 |
| EchoLab | **Decision Horizon**: three futures diverging from one origin | "Which future do we choose?" | `SimulationRun.futures` (A/B/C: paths blocked of 7, ledger reached, users, downtime, availability, reversible, evidence) + `plan.residual` + `comparison.outcomes` | "Run EchoLab" step until a simulation exists; disabled with a reason before correlation | 4 |
| SafeCut | **Containment chamber**: threat sources → aperture with the selected actions → protected services | "HALT has calculated a safer response." | `plan` (display actions, constraints, residual, rejected, infeasibility), `actions` (impact, reversibility, authorisation), `comparison` | No plan: "Derive the envelope"; infeasible: the **no-safe-plan** chamber (aperture closed, reasons, closest options) | 5–7 |
| ProofSeal | **Proof chain**: claims as linked signals, each with its basis (observed / calculated / simulated) | "Can I trust this before I approve it?" | `proof.claims` (CHK-01..10), `enumeration`, `not_covered`, `certificate`, `POST /proofs/{id}/verify` | "Seal" step; failed claims are never green | 8 |
| Timeline | The incident's ten stages as one track, with audit entries | "How did we get here?" | replay events, `audit` entries, `Incident.state` | — | — |
| Policies (Policy Lab) | Constraint board: each constraint as a dial against the active profile | "Which rules bind this response?" | `policySet.constraints` + `profiles`, `policies`, `approvers`, `variants`, `plan.constraints` | — | — |
| Reports | Executive evidence document | "What did we decide, on what evidence?" | Everything above, read-only; `print` stylesheet | Sections without data say so, never fill in | — |

**Action Gate** is a drawer on every view. Its sources are `GET/POST /plans/{id}/approvals`, `POST /execute`, `POST /executions/{id}/rollback`, the plan's roles and impact, `proof` and `outstandingRoles`.

Its actions:
- **Approve simulated execution**: approval per role, with the approver's own identity.
- **Reject**: `decision: "declined"`, an existing API path.
- **Request alternate plan**: re-solve under the other policy profile, through the existing `POST /plans {profile_id}`.
- **Inspect evidence**: opens the evidence drawer.
- **Simulate rollback**.

## Shell

| Element | Data |
|---|---|
| Command bar: identity, incident id, title, severity | `Incident.id`, `title`, `severity` |
| Current attack stage | replay stage → API state (`displayStage`) |
| Critical service | graph nodes with `criticality = critical` (names), and whether any is down under the plan (`plan.constraints[C-DOWNTIME]`) |
| Elapsed time | replay cursor (T+mm:ss) from `t0` |
| Replay state | `replay.playing`, `speed`, `connection` |
| Policy | `plan.profile_id` → `policySet.profiles[].title` |
| Approval state | `outstandingRoles`, `approvals` |
| Demo identity | `OPERATOR_ID` → approver name ("demo identity") |
| Presentation control | link to `/incidents/{id}/theatre` |
| Reset | `POST /incidents/{id}/reset-to-seed` (confirmation dialog) |
| Nav status per view | Overview: incident state; ThreadGraph: paths count; EchoLab: simulation present; SafeCut: plan status; ProofSeal: claims verified n/m; Policies: active profile; Reports: proof sealed or not |
| Evidence drawer | `evidenceFor(selection)` (events, findings, confidence, sources, policies) + explanation (`POST /explain`). With nothing selected it shows the incident's own evidence summary, never an empty rail |

**Stage track** (10 stages):
- Stages 1–6 come from the six replay events (`EV-01..06`, arrived or not).
- Stage 7 is "EchoLab simulated" (`ops.simulation`).
- Stage 8 is "SafeCut ready" (`plan.status`).
- Stage 9 is "ProofSeal verified" (all claims verified).
- Stage 10 is "Response approved" (`outstandingRoles` empty).

## Theatre (nine steps)

Each step is an `ops`/`replay` state plus a camera framing. Arrow keys and space step forward, `Esc` exits to Command.

| Step | State it shows | Real calls it may make |
|---|---|---|
| 1. Incident begins | replay seek 0 → first event | `seek` |
| 2. Attack reconstructed | replay to EV-06 (666 s) | `seek` |
| 3. Business exposure revealed | graph with dependencies, critical services named | — |
| 4. Futures simulated | Decision Horizon | `POST /simulations` if absent |
| 5. SafeCut calculates | chamber assembling | `POST /plans` (Continuity Balanced) if absent |
| 6. Hostile paths break | `cut` mode on the plan's refs (proposed, labelled "simulated") | — |
| 7. Business continues | continuity pulse on the business thread | — |
| 8. ProofSeal verifies | proof chain | `POST /proof` if absent |
| 9. Action Gate approves | approval state from the API | Approvals only by explicit click (never automatic) |

Theatre **never** approves or executes on its own; step 9 shows the gate and waits for the presenter.

## Interactions to preserve (tests)

The E2E suite (`apps/web/e2e`) drives the operator flow, reload, replay seek, reduced motion, landing hand-off, variants and a11y on every view.

- UI v2 keeps the accessible names of the action controls: `CORRELATE WITH HALT-R1`, `DERIVE ENVELOPE WITH SAFECUT`, `COMPARE FUTURES IN ECHOLAB`, `SEAL WITH PROOFSEAL`, `OPEN ACTION GATE`, `APPROVE · <ROLE>`, `EXECUTE n ACTIONS`, `ROLL BACK ALL`, `RESET INCIDENT`, the banner `Incident`, `Replay position`, `enter-command-center`, `landing-cursor`.
- It keeps the data attributes (`data-proof-ring`, `data-thread-edge`, `graph-summary`).
- Tests change only where a label changes by design (for example the nav says "Overview" rather than "Incident Overview"). Every assertion keeps its strength.
