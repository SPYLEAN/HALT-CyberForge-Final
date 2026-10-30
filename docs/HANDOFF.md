# HALT — Project Handoff (state after Phase 10, the finalization rows and technical stabilization)

> **Update, 2026-10-29:** `main` holds Phase 10 plus finalization rows 1–11 ([FINALIZATION_AUDIT.md](FINALIZATION_AUDIT.md)). Technical stabilization (restart safety, audit integrity, dependency failures, one-command operation) is committed on `stabilization/god-mode` and **not yet merged to `main`**. This document describes that branch. The baseline tag `phase10-complete` marks the Phase 10 demo.

Use this document to continue the build. It describes what HALT is, what has been built, how it works, how to run and test it, the decisions already made, and everything still pending. The repository is the source of truth; the other docs in `docs/` go deeper.

---

## 1. Product in one paragraph

**HALT — Proof-Carrying Cyber Response.** Tagline: *Stop the attack. Not the business.* HALT calculates and proves the smallest reversible response that blocks every high-risk attack path while preserving critical business operations. The core invention is the **Minimum Safe Containment Envelope**: the smallest set of authorised, reversible response actions that interrupts every high-risk attack path while satisfying business-availability, downtime, user-impact, reversibility, evidence-preservation and approval constraints. It is a hackathon MVP with **one synthetic incident (INC-2417)**. All data is synthetic and labelled SIMULATED, and no real systems are touched: execution is simulated against a copy of the graph.

## 2. The six systems (all built)

| System | What it does | Code |
|---|---|---|
| **HALT-R1** | Detection and correlation. Per-event features plus deterministic rules link the 6 incident events out of 405 benign background events, produce 4 stage findings with evidence IDs and ATT&CK techniques, and add a logistic-regression score next to each rule score. | `services/api/halt/r1/` |
| **ThreadGraph** | Typed graph of users, devices, sessions, tokens, apps, APIs, processes and the database. Enumerates attack paths over live hostile edges from attacker footholds, keeping maximal paths only. | `services/api/halt/threadgraph/` |
| **EchoLab** | Deterministic Monte Carlo (seed 2417, 6,000 rollouts, 600 s horizon) using the same random draws for every future. Ranks paths by risk (P1–P6 high-risk, U1 below the threshold) and compares futures A (aggressive isolation), B (passive) and C (SafeCut plan). | `services/api/halt/echolab/` |
| **SafeCut** | OR-Tools CP-SAT optimiser. Coverage, breakage and impact are derived from the graph, never hand-listed. Hard constraints plus an integer objective. If no plan is feasible, it reports the closest options. | `services/api/halt/safecut/` |
| **ProofSeal** | Independent verifier that never imports SafeCut. 10 claims, judged against the plan's own policy profile (CHK-10: residual risk), enumeration of all 4,096 subsets, a "not covered" list, a SHA-256 certificate and an Ed25519 demo-key signature. | `services/api/halt/proofseal/` |
| **Action Gate** | Per-role human approvals, including a change-freeze exception; execution refused unless the plan is sealed, verified, fresh and approved; simulated connectors; exact rollback inside a 40-minute window; a hash-chained append-only audit log. | `services/api/halt/gate/`, `halt/audit/` |

## 3. Tech stack (resolved versions)

- **Frontend:** Next.js 16.4.3 (App Router), React 19.3.1, TypeScript 5.9.3, Tailwind 4.3.3 (CSS-first `@theme`, default palette removed), Cytoscape 3.34.4, three.js 0.128.0 (r128, for the supplied 3D scene), zod 4.6.7, openapi-fetch 0.17.0 with types from openapi-typescript 7.13.0.
  - Tests: Vitest 5.0.5 with Testing Library and jsdom; Playwright 1.64.1 with @axe-core/playwright 4.14.0.
- **Backend:** Python 3.12, FastAPI 0.162, Pydantic 2.14, SQLAlchemy 2.1, psycopg 3, NetworkX 3.7, NumPy 2.5, scikit-learn 1.9, OR-Tools 9.15, cryptography 50, structlog.
  - Tests and tooling: pytest, hypothesis, ruff, mypy (strict).
- **Infrastructure:** Docker Compose (Postgres 16, api, web) and GitHub Actions. **Neither has been run yet** (see §11).
- **Not used, with the reason:**
  - **React Three Fiber:** the supplied scene requires three r128.
  - **LightGBM/XGBoost:** gradient boosting beat logistic regression by only 0.0064 PR-AUC, short of the required 0.02.
  - **PyTorch:** not needed.
  - **MSW:** recorded real-API fixtures replace it.
  - **Alembic:** deferred because there is only one schema version.

## 4. Repository layout

```
/
├─ apps/web/                Next.js app: landing story + Command Center
│  ├─ src/app/              layout (shared providers), / (landing), /incidents/[id] (Command Center), /healthz
│  ├─ src/components/halt/  17 design-system components ported from the supplied bundle (typed TSX)
│  ├─ src/components/graph/ model.ts (pure), cy-style.ts, glyphs.ts, ThreadGraphCanvas.tsx (+ SVG overlay), GraphA11y.tsx
│  ├─ src/components/views/ Overview, ThreadGraph, EchoLab, SafeCut, ProofSeal, Timeline, Policies, CommandCenter, evidence, NextStep
│  ├─ src/components/gate/  ActionGateDrawer
│  ├─ src/components/landing/ Landing, sections, hooks (analysis + scroll cursor), HaltScene3D
│  ├─ src/components/shell/ AppRail, TopBar, EvidenceRail, ReplayTimeline, CommandCenterShell
│  ├─ src/lib/api/          client.ts, ops.tsx (operator data layer), ws.ts (zod-validated), schema.d.ts (generated), types.ts
│  ├─ src/lib/state/        incident-store.tsx (replay store, shared)
│  ├─ src/styles/           tokens.css / tailwind-theme.css / tokens.ts (generated), halt-components.css (copied)
│  ├─ public/brand, public/3d, public/vendor   copied supplied assets, three r128, 3D scene scripts (unmodified)
│  ├─ scripts/              build-tokens.mjs, copy-brand.mjs
│  ├─ tests/unit/           Vitest (91 tests) + fixtures/api/stages.json (recorded from the real API)
│  └─ e2e/                  Playwright (41 tests)
├─ services/api/            FastAPI service
│  ├─ halt/contracts/       Pydantic models = single schema source (→ OpenAPI → TS)
│  ├─ halt/scenario/        loader + inc_2417 fixture (incident, events, background, topology, actions, policies, approvers, constraints, variants, presets)
│  ├─ halt/{r1,threadgraph,echolab,safecut,proofseal,gate,audit,replay,explain}/
│  ├─ halt/service.py       incident runtime orchestrating every engine; operation journal and restore
│  ├─ halt/api/             routes.py, ws.py, errors.py, health.py (/health, /ready), state.py (lazy start)
│  ├─ halt/db/              engine, tables, append-only triggers, app-role grants, repository (unit of work)
│  ├─ db-init/              Compose only: creates the halt_app role (demo credentials)
│  ├─ scripts/              export_openapi.py, record_fixtures.py
│  ├─ reports/r1_eval.json  model selection report
│  └─ tests/                pytest (148 with PostgreSQL; without it 3 PostgreSQL tests skip)
├─ assets/halt-package/     supplied package, vendored unmodified (checksummed)
├─ docs/                    PRODUCT_RFC, ARCHITECTURE, DATA_CONTRACTS, DEMO_SCENARIO, DESIGN_SYSTEM, ACCEPTANCE_TESTS, THIRD_PARTY_LEDGER, DEMO_SCRIPT, HANDOFF (this)
├─ IMPLEMENTATION_PLAN.md   phase plan + file-by-file list (kept in sync)
├─ scripts/halt.mjs        setup, dev, demo, reset, check (wired to npm run …; no extra task runner)
├─ docker-compose.yml, .github/workflows/ci.yml, .dockerignore, .env.example
└─ SentinelRoute shield emblem.png   pre-existing legacy file (off-brand); untouched, unused
```

Git: local repository on `main` with 12 commits, Phase 0 to Phase 10. **No remote yet.**

## 5. The scenario and its results (all derived; tests assert them)

**Incident INC-2417**, OAuth consent phishing against Finance Ops. The six events:

| Event | Time (UTC) | What happened |
|---|---|---|
| EV-01 | 09:41:12 | Consent-phishing mail |
| EV-02 | 09:42:36 | Sign-in from AS64500 |
| EV-03 | 09:43:21 | Attacker adds an authenticator (software TOTP) |
| EV-04 | 09:43:50 | DocuSync Pro OAuth grant |
| EV-05 | 09:47:03 | Sessions S-1 and S-2 replayed |
| EV-06 | 09:52:18 | 214 requests to the Finance-Close library |

**Paths (EchoLab, seed 2417, 6,000 rollouts):**

| Path | Route | Reach | Risk |
|---|---|---|---|
| P1 | S-1 → Finance API → ledger | 4,335 | 0.7225 |
| P2 | grant → Finance API → ledger | 4,050 | 0.675 |
| P3 | S-2 → Payment processing → ledger | 3,431 | 0.572 |
| P4 | M. Verma → new session S-3 → Payment processing → ledger | 2,068 | 0.345 |
| P5 | grant → Reconciliation → ledger | 1,884 | 0.314 |
| P6 | grant → Payroll → ledger | 1,480 | 0.247 |
| U1 | AS64500 ⇢ Customer support → Finance API → ledger (below threshold; forecast; rests on inferred edge `i.asn-support`) | 502 | 0.084 |

The high-risk threshold is 0.20, so P1–P6 are high-risk and U1 is not. U1 still reaches the ledger in 502 of 6,000 rollouts on its own (8.37 %). Whether it may stay open is the **containment policy's** decision (below), and it is always shown.

**Candidate actions (12):**

| ID | Action |
|---|---|
| C01 | Revoke the OAuth grant |
| C02, C03 | Revoke session S-1 / S-2 |
| C04 | Phishing-resistant step-up |
| C05–C07 | Isolate the API / the database / the subnet |
| C08 | Disable the account |
| C09 | Block the ASN (cuts are soft, so the attacker can evade them) |
| C10 | Revoke all third-party consents |
| C11 | Force a password reset |
| C12 | Quarantine the mailbox |

**SafeCut result (Continuity Balanced):** C01 + C02 + C03 + C04, displayed as three actions (A1 revoke grant; A2 revoke 2 sessions; A3 step-up). Objective 345 (3 users × 100 + 4 actions × 10 + 5 approvals). It is the unique optimum among the 4,096 subsets, and ProofSeal confirms that independently.

**Constraints:** every high-risk path cut; 0 minutes of critical downtime; ≤ 5 users affected; every action reversible within 300 s; every required role has an available approver; evidence preserved and sealed before execution.

**Approvals needed:** A. Rahman (tier-2 analyst) and S. Iyer (Finance Ops owner, needed because the IR-CHG-03 change freeze is active).

**Variants (proving the answer isn't scripted):**

| Variant | Result |
|---|---|
| `verma_not_releaser` | The plan switches to C08 instead of C04 (objective 144) |
| `approver_unavailable` | Infeasible; shows BLOCKED BY POLICY with the closest options |
| `no_phish_resistant_mfa` | Infeasible |
| `relaxed_users_250` | Plan unchanged |

**Futures:**

| Future | Paths blocked | Rollouts reaching the ledger | Other effects |
|---|---|---|---|
| A · aggressive isolation | 7 of 7 | 0 | 4 processes down for 240 min; 413 users; not reversible within 5 min |
| B · passive monitoring | 0 of 7 | 5,782 | — |
| C · SafeCut plan (Continuity Balanced) | 6 of 7 (open: U1) | 502, all via U1 | 3 users |

Paths are counted over all seven enumerated paths, so a plan that leaves U1 open reads "6 of 7", never "6 of 6".

**Containment policies** (`profiles.json`; PRODUCT_RFC §3a; measured in `POLICY_EVALUATION.md`). A profile is just two constraint limits: C-COVER (cut every path with risk ≥ x) and C-RESIDUAL (open paths may reach the ledger in ≤ y rollouts).

| | Continuity Balanced (default) | Critical Asset Zero Tolerance |
|---|---|---|
| Limits | risk ≥ 0.20 must be cut; open paths ≤ 600 of 6,000 | every enumerated path must be cut; 0 left |
| Baseline | C01–C04 (objective 345); U1 open, 502 ≤ 600; proof 10/10 | **No feasible plan**: only C05/C06/C07 hard-cut U1, each breaks C-REVERSIBLE and C-DOWNTIME; closest option C01–C04 |
| `support_route_blockable` variant | C01–C04, unchanged | C01–C04 + **C09** (objective 356); U1 closed, 0 of 6,000; +0 users, +0 downtime |

**Proof (Continuity Balanced):** `PS-2417-33f20ba2` for plan `PLAN-9ae8f880ad90`. It is deterministic across runs and across signing keys. (Before policy profiles the ids were `PLAN-10e634719283` / `PS-2417-d7c66ecf`; the plan body now records its profile and residual.)

## 6. API (FastAPI, `/api/v1`, OpenAPI at `/api/v1/openapi.json`)

- **Incident and data:**
  - `GET /health`, `GET /incidents`, `GET /incidents/{id}`. The incident includes `state`, `confidence`, `replay_end_s`, `variant` (the active demo variant) and `latest` (`{plan_id, simulation_id, proof_id, execution_id}`) for rehydration.
  - `GET /incidents/{id}/events?until=`, `POST /correlate`, `GET /findings`, `GET /graph?at=&plan_id=`, `GET /paths` (409 before correlation), `GET /actions`, `GET /policies` (policies, approvers, constraints, **profiles**), `GET /variants` (key, title, description of each demo variant, plus the active one), `GET /policy-comparison` (SafeCut under every profile, EchoLab per plan, the exact trade-off and its reasons; read-only; 409 before correlation).
- **Analysis:** `POST /incidents/{id}/simulations`, `GET /simulations/{id}`, `POST /incidents/{id}/plans {profile_id?}` (each plan carries `profile_id` and `residual`), `GET /plans/{id}`, `POST /plans/{id}/proof` (409 if infeasible), `GET /proofs/{id}`, `POST /proofs/{id}/verify`.
- **Action Gate:** `GET` and `POST /plans/{id}/approvals`, `POST /plans/{id}/execute`, `GET /executions/{id}`, `POST /executions/{id}/rollback`. The POST calls on approvals, execute and rollback need the header `X-Halt-Actor` (demo identity, not authentication).
- **Audit and other:** `GET /incidents/{id}/audit`, `GET /audit/verify`, `POST /replay/reset {variant}`, `POST /reset-to-seed` (baseline, from the start; works after a failed restore), `POST /explain {subject_id}`.
- **Health:** `GET /health` is liveness (always 200; `status: degraded`, `db`, `service`). `GET /ready` is 200 only when the database answers and every incident is seeded or restored, else 503 with the reason.
- **Failures:** any incident route can answer 503 `dependency_unavailable` (database unreachable; nothing changed; the API retries its start every 2 s and recovers on its own) or 503 `restore_inconsistent` (after a restart the journal did not reproduce the record; reset to seed). Unexpected errors are 500 `internal_error`, still as `ApiError`.
- **WebSocket `/ws/incidents/{id}`:** commands are seek, play, pause and subscribe. It sends a deterministic replay timeline (stage `new` → `correlating` at EV-03 (129 s) → `forecast_ready` at EV-06 (666 s)) and pushes live stage, gate and stale messages.
- **Responses:** every response except `/health` and errors carries `meta.simulated = true` and `meta.seed = 2417`. Errors are `ApiError {code, message, request_id}`.
- **Operator clock:** logical. It starts at t0 + 15 min and advances 15 s per action, so plan IDs, simulation hashes, proof certificates and audit hashes are identical across runs.
- **Restart safety:** every state-changing call is journaled (table `operations`, append-only) with its outcome, and each call's audit entries, artefacts and journal entry commit in one transaction. On start, and after a call that failed part-way, `IncidentService.restore` re-runs the journal since the last reset and checks it against the record: identical audit hashes, the same operator clock, the same refusals, and identical artefacts. Any difference is refused (503 `restore_inconsistent`), never patched over. The last replay position is persisted too (`Incident.replay_cursor_s`). Details: ARCHITECTURE §9.

## 7. Frontend

- **Landing (`/`):**
  - Eight sections ported from the supplied marketing site: Hero, Paradox, Incident, Context, EchoLab, SafeCut, ProofSeal, Hand-off. Every figure comes from the API.
  - Scrolling drives the shared replay cursor and the 3D scene state (dormant → intrusion → reconstruction → business → futures → contained → verified).
  - It runs only the missing read-only analysis steps (correlate, plan, simulate, seal). It never approves or executes anything.
  - The 3D scene is the supplied procedural three.js r128 scene, loaded unmodified as classic scripts. With reduced motion or no WebGL it shows the supplied SVG poster.
- **Hand-off:** a client-side link to `/incidents/INC-2417?view=overview&t=<cursor>`. Both providers live in the root layout, so the incident, cursor, plan and proof carry over with no reload.
- **Command Center (`/incidents/INC-2417`):**
  - Layout: rail (7 views), top bar (stage chip, SIMULATED, operator persona labelled as a demo identity), workspace, evidence rail, replay timeline. `?view=` and `?t=` are synced to the URL.
  - Overview shows five metrics: "Required paths reachable after plan" (0 of 6 under Continuity Balanced) and the residual reach the plan leaves open (502 of 6,000 via U1, "accepted under Continuity Balanced, which allows 600. Not zero risk.").
  - SafeCut view: a **Containment policy** control (both profiles with their limits; choosing one re-solves), **Residual risk under this policy** (open paths, reach, uncertainty; never called zero-risk), and the **Policy comparison** table with the trade-off column and "Why the plans differ".
  - The path table classes each path ("Below the 0.2 threshold (risk 0.08) · rests on an inferred edge") and states it under the plan ("Open · accepted residual under Continuity Balanced").
  - Reloading rehydrates everything from the API.
  - The ThreadGraph runs on Cytoscape with preset coordinates and the supplied node glyphs, rendered as SVG data URIs. Line styles follow the graph spec.
  - An SVG overlay draws the continuous 8px business thread and the proof rings in the cut gaps. A text table of the paths sits alongside the graph.
  - Motion: the cut opens and held edges fade to 30 %, the proof ring draws clockwise, and graph-mode switches cross-fade the hostile layer. Reduced motion shows end states (DESIGN_SYSTEM §6 lists what is and is not animated).
  - The ThreadGraph view has a Business dependencies toggle; the business thread is always drawn.
  - The Action Gate drawer handles approvals per role, Execute (disabled with a stated reason until allowed), and rollback.
  - A demo variant switcher is in Policies. Its list and the running variant come from the API, so a reload shows what is really running.
- **Design system:**
  - Tokens are generated from `tokens.json` for dark and light themes. Only the brand roles exist as colours, and a lint rule plus a test forbid hex colours.
  - Archivo and IBM Plex Mono load through `next/font`. The 17 components are faithful ports.
  - Brand and asset copies are checksum-tested against the supplied package.

### UI v2 (branch `frontend-rebirth/god-mode`)

A presentation-layer rebuild over the same data layer (`ops.tsx`, the replay store) and API contracts. The only contract change is `severity` on the incident (a scenario fixture field). Specs: `docs/UI_V2_SPEC.md`, `docs/DESIGN_IMPLEMENTATION_MAP.md`, `docs/ASSET_PLACEMENT_MATRIX.md`; visual QA: `docs/VISUAL_QA_REPORT.md`.

- **Routes:** `/` (nine-section landing, including the signature HALT moment), `/mission` (Mission Control), `/incidents` (Incident Rooms, scenario variants), `/architecture` (implemented / architecture-ready / planned), `/incidents/INC-2417` (Command Center), `/incidents/INC-2417/theatre` (presentation mode: nine steps, ← → keys, Esc exits).
- **Modes:** Command (default, `components/v2/views/*V2.tsx`), Forensic (`?mode=forensic`, the v1 dense views unchanged), Theatre (the route above). Reports (`?view=report`) prints to PDF.
- **Shell:** `components/v2/shell/CommandShell.tsx`: command bar, navigation rail with live statuses, evidence drawer (never empty; docked at ≥1280 px, a closed tab below), ten-stage incident track.
- **Motifs:** `components/v2/motifs.tsx` (Containment Aperture, Proof Signal, Continuity Path, Threat Path, Safe Envelope, Thread Lattice). The aperture state comes from `apertureOf(ops)` in `components/v2/derive.ts`; every sentence there names the API field it rests on.
- **Action Gate additions:** decline (recorded as `decision: "declined"`), request an alternate plan under the other policy, inspect evidence, and a notice that execution touches only the simulated environment.
- **States:** an unreachable API shows a dedicated state with no figures and a retry; an infeasible plan shows the closest options and the alternate-policy request.
- **Styles:** `styles/v2.css` (semantic aliases of the generated tokens; no raw colours). Motion is keyed to state; the global reduced-motion rule leaves end states.
- **Screenshots:** `node apps/web/scripts/shoot.mjs <out> v2` (all routes, four sizes, records overflow) and `scripts/shoot-landing.mjs` (one image per landing section). Both need the API on :8000 and the web app on :3000.
- **Rollback:** the v1 Command Center views remain (Forensic mode). To return entirely to v1, check out `stabilization/god-mode`; nothing on `main` was changed.

## 8. How to run

From the repository root (Python 3.12 and Node 22+):

| Task | Command |
|---|---|
| Install | `npm run setup` |
| Develop (API hot reload + Next dev; state in `.halt/halt-dev.db`) | `npm run dev` |
| Deterministic demo (production build, API, reset to seed) | `npm run demo` (`-- --keep` restores instead of resetting) |
| Reset the running demo | `npm run demo:reset` |
| All checks except E2E, including contract drift | `npm run check` |
| End-to-end | `npm run test:e2e` |
| Production build | `npm run build` |
| Docker (not yet run) | `docker compose up --build -d --wait` |

`scripts/halt.mjs` implements these. `.claude/` is excluded through `.git/info/exclude` and holds this machine's preview configurations; nothing there is needed to run the project.

Presenter walkthrough: `docs/DEMO_SCRIPT.md`.

## 9. Tests and generated files

| Suite | Command | Status |
|---|---|---|
| API (AT-1 to AT-6, AT-S, AT-P) | `cd services/api && .venv/Scripts/python -m pytest` | 148 passed with `HALT_TEST_PG_URL` (PostgreSQL 16 via pgserver); 145 passed and 3 skipped without it |
| Web unit (AT-7, AT-8, AT-S.10–11, AT-P.11, UI v2) | `npm test` | 91 passed |
| E2E + axe (AT-8 to AT-10, UI v2 platform) | `npm run test:e2e` (starts the API and a production build) | 41 passed |
| Static | `npm run lint`, `npm run typecheck`, `ruff check`, `ruff format --check`, `mypy` | clean |
| Everything except E2E | `npm run check` | passed (exit 0) |

**Regenerate when contracts or data change** (CI fails on drift):

| What changed | Command |
|---|---|
| Contracts (OpenAPI) | `python scripts/export_openapi.py` |
| TypeScript types | `npm run gen:api` |
| Recorded API fixtures | `python scripts/record_fixtures.py` |
| Background events | `python -m halt.scenario.background` |
| Design tokens | `npm run gen:tokens` |
| Copied assets | `npm run copy:brand` |
| R1 model | `python -m halt.r1.train_eval` |

**Measured:**
- SafeCut solve p95 ≈ 22 ms.
- 3 futures × 6,000 rollouts ≈ 15 ms.
- Landing LCP 140–560 ms across runs.
- PR-AUC on held-out synthetic data: rules 0.916, logistic regression 0.9758, gradient boosting 0.9822. Logistic regression is selected.

## 10. Rules to keep when continuing

- **No fabricated numbers in the UI.** Every figure comes from an API response and shows its derivation. If the API is down, show an error, never placeholder numbers.
- **Never hardcode the winning plan.** A test forbids candidate IDs (`C01`…) in application code. The variants must keep flipping the answer.
- **Keep the language model out of decisions.** An optional LLM may only reword template explanations, and anything it returns with unknown IDs is rejected. Its adapter exists but is off, with no provider connected.
- **Every action carries impact, reversibility and authorisation.** Nothing executes without the recorded human approvals and a sealed, fresh proof.
- **Use deterministic seeds everywhere (2417).** Forecasts are labelled SIMULATED and expressed as counts, never bare probabilities.
- **Follow the brand rules:**
  - Ember means hostile only; Verdigris means business only; no third hue.
  - No shields, glass or shadows.
  - The business line is never broken, and attack lines are never thicker than 3px.
  - Text must meet 4.5:1 contrast. Mark state by form (solid, dashed or dotted), never by dimming text.
- **Never modify the vendored package or the legacy PNG.** `scripts/verify_repo.py` checks both.

## 11. Pending work

### A. Never run, but needed

1. **Docker Compose stack (AT-0.4, AT-10.3).** Docker isn't installed on the development machine. The compose file was validated against the Compose specification schema, nothing more.
   - The API now runs as `halt_app` with `HALT_DB_MIGRATE_URL` for the owner; `services/api/db-init/01-app-role.sql` creates the role on first start. This wiring has **not** run in Docker.
   - Still to do: install Docker, run `docker compose up --build -d --wait`, check `/api/v1/ready` is 200 and `/api/v1/health` reports `audit_enforcement: db`, and time a clean clone against the ≤ 10 min target.
2. ~~PostgreSQL append-only triggers (AT-6.7)~~ **Run locally on 2026-10-29** against PostgreSQL 16 (the pip package `pgserver`, outside the project), together with the app-role and restore tests: 3 passed. They need `HALT_TEST_PG_URL`; CI provides it.
3. **GitHub Actions CI.** There is no remote, so it has never run. The workflow validates against the GitHub workflow schema. Create a remote and push to run the jobs: repo, api (with Postgres), web, contracts drift, e2e and compose (which now also checks `/ready`, that `halt_app` cannot delete audit rows, and that a restart restores the incident).

### B. Known gaps and limitations

4. **No light-theme toggle.** The light tokens exist and pass axe, but the app is fixed to the dark theme.
5. **Phone layout of the Command Center not visually checked.** The CSS breakpoints exist; desktop and tablet were checked.
6. ~~Runtime lives in memory~~ **Resolved:** restart-safe restore from the operation journal (§6). Limits: there is no schema migration tool, so a database created by the Phase 10 build has no journal and restores as `failed` until it is reset to seed. Re-running the journal costs about as much as the original calls (well under a second for the demo).
7. **One incident only.** INC-2417 is hardcoded in the root layout and the page guard. Supporting more needs incident selection and per-incident providers.
8. **Demo identity only.** `X-Halt-Actor` is not authentication: there is no RBAC and no login.
9. **No language-model provider connected.** The adapter interface exists, so a Claude or other client could be added. The rule that output with unknown IDs is rejected must stay.
10. ~~`motion` library~~ **Resolved:** not used; the ledger now says so (F-13).
11. **Motion spec mostly implemented** (F-14): cut, proof ring and mode cross-fade are done. Still not animated: rollback (the gap closing), threat propagation, graph expansion, and the approval tint fill.
12. ~~Visual polish~~ **Resolved** (F-15): larger labels on bg chips, a visible proposed-cut halo, and a landing hero panel that keeps the scene's lines out of the copy without covering the containment ring. The scene's own HTML labels were not re-checked at every section.
13. ~~Dependency overlay toggle~~ **Resolved** (F-16).
14. ~~U1 decision~~ **Resolved by policy profiles:** Continuity Balanced accepts U1 as bounded, named residual risk; Critical Asset Zero Tolerance refuses it (no feasible plan in the baseline; C09 closes it in the `support_route_blockable` variant). See PRODUCT_RFC §3a and POLICY_EVALUATION.md.
24. **Policy profiles are a demo pair.** The 600-rollout allowance is a demo value, not a recommendation. There is no UI to edit a profile; change `profiles.json`. `support_route_blockable` is a labelled what-if, not a claim about real identity providers.
25. **Old journals restore as `failed`.** A database written before policy profiles holds plans without a profile and the old plan ids; restore will not reproduce them, so the incident needs `reset-to-seed`.
15. **Alembic migrations deferred.** The schema is created with `create_all`. Add Alembic before the first schema change.
16. **Dev-only noise:** React StrictMode opens the replay WebSocket twice in dev (one "closed before established" warning), and uvicorn logs `ConnectionResetError` / `WebSocketDisconnect` when sockets close during tests. Both are harmless. `next start` warns that it "does not work with output: standalone"; it does work, and the Docker image uses `server.js` as Next recommends.
21. **On Windows an unreachable PostgreSQL times out instead of refusing**, so while the database is down each start retry takes about 3 s (`connect_timeout`). `/health` stays fast (it does not ping while the service is down); requests queued behind a retry fail fast.
22. **OneDrive** briefly locked a regenerated fixture file once during `npm run check` (`OSError: [Errno 22]`); the rerun passed. Another reason to move the repository (item 19).
23. **`HALT_SEED` is read but unused**: the seed comes from the scenario fixture. `.env.example` now says so.

### C. Housekeeping

17. ~~`apps/web/AGENTS.md`~~ **Resolved:** gitignored (`next dev` regenerates it).
18. ~~`.claude/launch.json`~~ **Resolved:** kept local through `.git/info/exclude`.
19. **The project lives in OneDrive.** That makes npm installs (up to 6 minutes) and dev compiles slow; Next warns about a slow filesystem. Move the project to a local folder such as `C:\dev\halt`.
20. **npm 12 is available.** It isn't needed; npm 11 works.

### D. Natural next steps (suggested order)

1. Review and merge `stabilization/god-mode` into `main`.
2. Push to GitHub; get CI green, including the Postgres, E2E and compose jobs.
3. Install Docker; verify the compose stack, the `halt_app` role, and AT-10.3.
4. The rest of the motion spec (item 11) and the light-theme toggle (4).
5. Server-side rehydration (6), then multiple incidents (7) and real authentication (8), if the project goes beyond the demo.
