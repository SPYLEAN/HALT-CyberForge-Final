# HALT — Implementation Plan

**Status:** awaiting approval. No application code written, no dependencies installed.
Companion docs: `docs/PRODUCT_RFC.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACTS.md`, `docs/DEMO_SCENARIO.md`, `docs/DESIGN_SYSTEM.md`, `docs/ACCEPTANCE_TESTS.md`, `docs/THIRD_PARTY_LEDGER.md`.

## 1. Audit (2026-10-27)

### 1.1 Repository

The repository root (a folder synced by OneDrive on the development machine).

| Finding | Detail |
|---|---|
| Contents | One file: `SentinelRoute shield emblem.png` (685 KB, 2026-10-10). No code, no `package.json`, no `pyproject.toml`, no infra. |
| Version control | **Not a git repository.** |
| Location | Inside OneDrive, path contains spaces. |
| Legacy asset | The PNG uses the old "SentinelRoute" name and shield imagery, both of which the HALT rules forbid. Left untouched and unused. |

### 1.2 Supplied package (`Downloads\halt-full-package.zip`, 1.24 MB)

| Folder | Contents | Usable as | Issues |
|---|---|---|---|
| `01-brand-assets` | 10 SVG, 44 PNG, favicon.ico, `paths.json` | Directly | None |
| `02-design-system` | `tokens.json` (2 themes), 17 React components in a no-build `bundle.js` + `bundle.css` + `index.d.ts`, React 18.3.1 UMD, 22 previews, 5 rule docs | Tokens directly; components ported to TSX | Palette and fonts marked "provisional" in `tokens.json`. Generator scripts in `tools/` hardcode `/tmp/tokens.css` and `../site/vend/...` and won't run as they are. |
| `03-product-boards-source` | 18 `.dc.html` design boards + `canvas.json` | Visual reference | Each loads `./support.js`, which is **not in the package**, so they don't render on their own. |
| `04-marketing-site` | Self-contained scroll site, 8 sections, three.js r128 from cdnjs | Copy, section order, choreography | 19 hardcoded brand hex values. |
| `05-command-center` | 145 KB single-file prototype + 15 source parts | Views, copy, state list (11 states), policy set | **The winning plan is hardcoded** (paths carry `a:'A1'`, actions carry `blocks`). The figures are hardcoded too (4,912 of 6,000, etc.). 51 hardcoded hex values. Incident ID `HLT-2047` conflicts with `INC-2417`. `index.html` duplicates `source-parts/` (built output and its sources). |
| `06-3d-motion-system` | Procedural three.js r128 scene (spec + scene a/b), React preview, exports (7 PNG, 7 SVG, 2 GLB) | Landing hero 3D island + posters | Pinned to r128, which is incompatible with React Three Fiber. `halt-scene.js` appears to be a + b concatenated (duplicate). `test.js` references a missing `../site/vend`. |

### 1.3 Scenario-integrity issues found in the prototype

These are fixed in `docs/DEMO_SCENARIO.md` §6:
- The action→path attribution is hand-written, and A3 is credited with P6 even though A1 already cuts it.
- Ordinary step-up is satisfiable by the authenticator the attacker added in EV-03, so C04 must require a phishing-resistant method.
- The reasons given for rejecting "disable account" and "block ASN" wouldn't hold in a real optimiser. They are replaced by constraint-based reasons: the releaser dependency for "disable account", and soft cuts for "block ASN".

### 1.4 Toolchain on this machine (read-only check)

| Tool | Found | Needed |
|---|---|---|
| git | 2.55.0 | ✓ |
| Node / npm | 24.19.0 / 11.17.0 | ✓ |
| pnpm | missing | Not needed (npm workspaces) |
| Python | 3.14.6 only | **3.12 recommended**: OR-Tools / scikit-learn wheel availability for 3.14 is unverified |
| Docker | **missing** | Required for Postgres + Compose (Docker Desktop needs WSL2 on Windows 11 Home) |

## 2. Blockers and assumptions

### Blockers (need your action or decision)

| # | Blocker | Proposed resolution |
|---|---|---|
| B1 | Not a git repo, so there's no history, no CI and no safe rollback | `git init` at Phase 0, then create a GitHub remote for Actions (the GitHub MCP connection is currently failing; `gh` CLI or the web UI works) |
| B2 | Project lives in OneDrive. `node_modules`, `.next` and `.venv` under sync cause file locks and slow builds | Move to e.g. `C:\dev\halt`, or keep it here and mark build folders "Free up space"/excluded. **Recommend moving.** |
| B3 | Docker not installed | Install Docker Desktop + WSL2, or approve the SQLite fallback (audit then app-enforced, labelled) |
| B4 | Python 3.12 not installed | Install 3.12 (`py install 3.12` / python.org), or run the API only in Docker |
| B5 | Incident ID conflict | Confirm **INC-2417** |
| B6 | "Provisional" palette/fonts in package vs "canonical" in brief | Confirm canonical as supplied |
| B7 | C04 semantics (phishing-resistant step-up) | Confirm |

### Assumptions

- A1. MVP is single-tenant and local. Demo personas instead of auth.
- A2. Execution is simulated against graph snapshots. No outbound calls.
- A3. Next.js: current stable major at install time, with its matching React. The supplied components are ported, so the bundled React 18 UMD isn't used.
- A4. The 3D scene is used unmodified with `three@0.128.0` in a client-only island. No R3F.
- A5. The LLM explainer is off by default. Template explanations are used for the demo so it stays deterministic.
- A6. Scenario transition probabilities are inputs we may tune. Path risks, plans and proofs are outputs we may not.
- A7. "Minimal" means minimum-cost under the stated objective, and also irredundant. Both are verified by enumerating all 2^12 subsets.

## 3. Phases

Each phase ends when its acceptance tests (`docs/ACCEPTANCE_TESTS.md`) pass in CI.

| Phase | Goal | Exit tests | Est. |
|---|---|---|---|
| 0 | Bootstrap repo, vendor assets, tooling, CI, compose | AT-0.* | 0.5 d |
| 1 | Contracts + INC-2417 fixture + OpenAPI→TS | AT-1.* | 0.5 d |
| 2 | ThreadGraph + HALT-R1 | AT-2.* | 1 d |
| 3 | EchoLab | AT-3.* | 0.5 d |
| 4 | SafeCut | AT-4.* | 0.75 d |
| 5 | ProofSeal + Action Gate + audit | AT-5.* | 0.75 d |
| 6 | API routes, persistence, WebSocket replay | AT-6.* | 0.75 d |
| 7 | Frontend foundations (tokens, components, shell) | AT-7.* | 0.75 d |
| 8 | Command Center views | AT-8.* | 1.5 d |
| 9 | Landing + transition + 3D | AT-9.* | 1 d |
| 10 | E2E demo, hardening, README, demo script | AT-10.* | 0.5 d |

Critical path: 1 → 2 → 3 → 4 → 5 → 6 → 8 → 10. Phase 7 can run in parallel with 2–6 against the recorded fixtures. Phase 9 can run in parallel with 8.

## 4. File-by-file plan

`[new]` = created, `[copy]` = verbatim from the package, `[gen]` = generated and committed. No existing file is modified or deleted.

### Phase 0 — bootstrap

```
.gitignore                                [new] node_modules, .next, .venv, __pycache__, *.db, .env, playwright-report
.gitattributes                            [new] LF for source, binary for png/glb/ico
.editorconfig                             [new]
.env.example                              [new] HALT_DB_URL, HALT_SEED=2417, HALT_SIGNING_KEY_PATH, HALT_LLM_ENABLED=false,
                                                HALT_CORS_ORIGINS, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL, NEXT_PUBLIC_DEMO_MODE
README.md                                 [new] quick start, SIMULATED notice, ATT&CK attribution
package.json                              [new] npm workspaces ["apps/*"], scripts: dev, build, test, e2e, gen:api, gen:tokens
docker-compose.yml                        [new] db (postgres:16, healthcheck), api, web
assets/halt-package/**                    [copy] full zip contents, unmodified
assets/halt-package/CHECKSUMS.sha256      [gen]  manifest for AT-0.2
.github/workflows/ci.yml                  [new] jobs: api (ruff, mypy, pytest w/ postgres service), web (lint, typecheck,
                                                vitest), contracts (openapi drift, tokens drift), e2e (compose + playwright)
```

### Phase 1 — contracts and scenario (`services/api/`)

```
pyproject.toml                            [new] deps per ledger; ruff, mypy, pytest config
Dockerfile                                [new] python:3.12-slim, non-root, uvicorn
halt/__init__.py                          [new] __version__
halt/config.py                            [new] pydantic-settings Settings; fail-fast validation
halt/logging.py                           [new] structlog JSON config, request_id contextvar
halt/contracts/__init__.py                [new] re-exports
halt/contracts/common.py                  [new] Meta, Derivation, ApiError, Provenance, Strength
halt/contracts/events.py                  [new] SecurityEvent
halt/contracts/graph.py                   [new] GraphNode, GraphEdge, GraphSnapshot (+ validators AT-1.2)
halt/contracts/findings.py                [new] Finding, AttackPath
halt/contracts/actions.py                 [new] ResponseAction, DisplayAction (+ required-field validators AT-1.3)
halt/contracts/constraints.py             [new] Constraint, ConstraintResult, Policy, Approver
halt/contracts/simulation.py              [new] SimulationRequest, FutureResult, SimulationRun
halt/contracts/plan.py                    [new] Plan
halt/contracts/proof.py                   [new] ProofClaim, Proof
halt/contracts/gate.py                    [new] GateState, Approval, Execution
halt/contracts/audit.py                   [new] AuditEntry
halt/contracts/ws.py                      [new] discriminated union of WS messages
halt/contracts/incident.py                [new] Incident, IncidentSummary, IncidentState
halt/canonical.py                         [new] JCS-style canonical JSON + sha256 helper
halt/scenario/loader.py                   [new] load + validate fixture dir, apply variant overlays
halt/scenario/background.py               [new] seeded benign-event generator
halt/scenario/inc_2417/incident.json      [new]
halt/scenario/inc_2417/events.json        [new] EV-01..EV-06
halt/scenario/inc_2417/background_events.json [gen] by background.py, seed 2417
halt/scenario/inc_2417/topology.json      [new] nodes, edges, layout coords (from prototype NODES/EDGES, remapped)
halt/scenario/inc_2417/actions.json       [new] C01..C12
halt/scenario/inc_2417/policies.json      [new] IR-* policies incl. IR-CHG-03 freeze window
halt/scenario/inc_2417/approvers.json     [new] A. Rahman, S. Iyer, J. Okafor, SOC lead
halt/scenario/inc_2417/constraints.json   [new] C-COVER..C-EVIDENCE
halt/scenario/inc_2417/variants.json      [new] baseline, verma_not_releaser, approver_unavailable,
                                                no_phish_resistant_mfa, relaxed_users_250
scripts/export_openapi.py                 [new] writes openapi.json for type generation
tests/conftest.py                         [new]
tests/test_config.py                      [new] AT-0.5
tests/test_scenario_load.py               [new] AT-1.1..1.3, 1.5
```

Web side for AT-1.4:
```
apps/web/src/lib/api/schema.d.ts          [gen] openapi-typescript
```

### Phase 2 — ThreadGraph + HALT-R1

```
halt/threadgraph/build.py                 [new] fixture → nx.MultiDiGraph; snapshot(at)
halt/threadgraph/snapshot.py              [new] GraphSnapshot (de)serialise + hash
halt/threadgraph/paths.py                 [new] entry→target simple paths over hostile edges, deterministic order
halt/threadgraph/cuts.py                  [new] apply cut sets; post-action reachability; business closure
halt/r1/features.py                       [new] per-event features (new ASN, new UA, MFA-after-signin Δt, unverified publisher...)
halt/r1/rules.py                          [new] deterministic correlation rules → entity linking
halt/r1/correlate.py                      [new] events → incident clusters → Findings
halt/r1/model.py                          [new] runtime scorer from r1_model.json (plain coefficients, no pickle)
halt/r1/r1_model.json                     [gen] configured model artefact
halt/r1/train_eval.py                     [new] synthetic labelled set (seeded), rule vs LR vs GBM PR-AUC
reports/r1_eval.json                      [gen] AT-2.6 report
halt/r1/attack_map.py                     [new] event kind → ATT&CK technique + stage
tests/test_threadgraph.py                 [new] AT-2.1..2.3
tests/test_r1.py                          [new] AT-2.4..2.6
```

### Phase 3 — EchoLab

```
halt/echolab/attacker.py                  [new] seeded walk; delays; soft-cut evasion (egress switch p=0.6)
halt/echolab/business.py                  [new] availability timeline per process given removed refs
halt/scenario/inc_2417/presets.json       [new] future A (aggressive), B (passive) action lists (data, not code)
halt/echolab/simulate.py                  [new] run futures → SimulationRun with integer counts
halt/echolab/risk.py                      [new] per-path reach → risk → high_risk flag
tests/test_echolab.py                     [new] AT-3.1..3.6
```

### Phase 4 — SafeCut

```
halt/safecut/instance.py                  [new] per-candidate coverage, breakage, impact, eligibility; shared evaluate/feasible
halt/safecut/model.py                     [new] CP-SAT variables, constraints, objective
halt/safecut/solve.py                     [new] Plan report, constraint results, rejection reasons, per-family relaxation → closest options
tests/_brute.py                           [new] brute-force reference used by AT-4.7 and the 4,096-subset cross-check
halt/safecut/group.py                     [new] candidates → display actions (type + target user + policy)
tests/test_safecut.py                     [new] AT-4.1, 4.3..4.6, 4.8
tests/test_safecut_property.py            [new] AT-4.7 (hypothesis vs brute force)
tests/test_no_hardcoded_plan.py           [new] AT-4.2
```

### Phase 5 — ProofSeal, Gate, audit

```
halt/proofseal/checks.py                  [new] independent claims CHK-01..CHK-09
halt/proofseal/enumerate.py               [new] 2^n subset enumeration (own feasibility predicate)
halt/proofseal/seal.py                    [new] certificate, Ed25519 sign/verify, demo key management
halt/gate/gate.py                         [new] state machine, guards, ordered execution, rollback window, audit
halt/gate/authorise.py                    [new] role/policy/freeze-window checks
halt/gate/connectors.py                   [new] simulated environment: apply / roll back hard cuts on the snapshot
halt/audit/log.py                         [new] hash-chained append; verify
tests/test_proofseal.py                   [new] AT-5.1..5.4
tests/test_gate.py                        [new] AT-5.5..5.8, 5.10
tests/test_audit.py                       [new] AT-5.9
```

### Phase 6 — API, persistence, replay

```
halt/db/__init__.py, models.py            [new] engine, tables, create_schema; PostgreSQL append-only triggers via DDL event
halt/db/repo.py                           [new] repositories (no domain logic); DbAuditStore
halt/service.py                           [new] incident runtime orchestrating every engine; logical operator clock
halt/contracts/api.py                     [new] request bodies and Meta-carrying response envelopes
halt/replay/clock.py                      [new] deterministic replay clock (play/pause/seek/speed)
halt/replay/stream.py                     [new] message builder for t-ranges
halt/explain/templates.py                 [new] evidence-citing templates
halt/explain/llm.py                       [new] optional adapter (off); citation validator
halt/api/errors.py                        [new] error mapping to ApiError
halt/api/routes.py                        [new] every REST route in DATA_CONTRACTS §10
halt/api/ws.py                            [new] /ws/incidents/{id}
halt/main.py                              [new] app factory, CORS, logging middleware, /health
tests/test_api_contract.py                [new] AT-6.1, 6.4
tests/test_ws_replay.py                   [new] AT-6.2, 6.3
tests/test_logging.py                     [new] AT-6.5
tests/test_explain.py                     [new] AT-6.6
tests/test_pg_audit.py                    [new] AT-6.7 (runs when HALT_TEST_PG_URL is set; CI postgres service)
```

### Phase 7 — frontend foundations (`apps/web/`)

```
package.json, tsconfig.json, next.config.ts, postcss.config.mjs   [new]
eslint.config.mjs                         [new] incl. no-hex-literal rule
vitest.config.mts                         [new] jsdom, React plugin, @ alias
Dockerfile                                [new]
scripts/build-tokens.mjs                  [new] tokens.json → tokens.css + tailwind-theme.css (default palette off) + tokens.ts
scripts/copy-brand.mjs                    [new] copy + checksum brand assets and 3D exports
src/env.ts                                [new] zod-validated public env
src/styles/tokens.css, tailwind-theme.css, tokens.ts   [gen]
src/components/halt/mark-paths.json       [copy] 01-brand-assets/paths.json
src/styles/halt-components.css            [copy] from bundle.css minus font @import
src/styles/globals.css                    [new]
public/brand/**                           [copy] 01-brand-assets
public/3d/**                              [copy] 06-3d-motion-system/out
src/app/layout.tsx                        [new] fonts, theme attr, IncidentProvider, favicon/manifest
src/app/manifest.ts                       [new]
src/components/halt/{HaltMark,Button,Nav,Tabs,StatusChip,MetricBlock,EvidenceRow,ConstraintIndicator,
  TimelineEvent,ApprovalControl,Tooltip,Drawer,Dialog,Toast,Skeleton,NodeGlyph,EdgeStroke}.tsx   [new] ports
src/components/halt/index.ts              [new]
src/lib/api/client.ts                     [new] openapi-fetch client
src/lib/api/ws.ts                         [new] reconnecting WS + zod validation
src/lib/state/incident-store.tsx          [new] context + reducer (incident, cursor, view, selection, gate)
src/lib/format.ts                         [new] derivation/UTC/T+ formatting
src/components/shell/{AppRail,TopBar,SimulatedChip,EvidenceRail,ReplayTimeline,CommandCenterShell}.tsx   [new]
src/app/incidents/[incidentId]/page.tsx   [new] shell with a loading workspace until Phase 8
tests/unit/tokens.test.ts                 [new] AT-7.1 contrast + drift
tests/unit/components.test.tsx            [new] AT-7.3 (one describe per component, 17)
tests/unit/no-hex.test.ts                 [new] AT-7.2
tests/unit/store.test.ts                  [new] reducer, WS envelope, env
tests/unit/brand.test.ts                  [new] AT-7.4
tests/unit/shell.test.tsx                 [new] AT-7.5
tests/fixtures/api/*.json                 [gen] recorded API responses for MSW
```

### Phase 8 — Command Center

```
src/app/incidents/[incidentId]/page.tsx   [new] view router (?view, ?t)
src/app/incidents/[incidentId]/loading.tsx, error.tsx   [new]
src/components/graph/ThreadGraphCanvas.tsx    [new] Cytoscape init, preset layout, modes observed|forecast|response|cut|isolate
src/components/graph/cy-style.ts          [new] stylesheet from tokens.ts
src/components/graph/glyphs.ts            [new] NodeGlyph → data-URI SVG for non-native shapes
src/components/graph/Overlay.tsx          [new] SVG overlay: business thread pulse, proof rings, march
src/components/graph/GraphA11y.tsx        [new] path table + aria-live summary
src/components/views/OverviewView.tsx     [new]
src/components/views/ThreadGraphView.tsx  [new]
src/components/views/EchoLabView.tsx      [new] futures A/B/C, availability strips from SimulationRun
src/components/views/SafeCutView.tsx      [new] selected/rejected candidates, constraints, objective terms
src/components/views/ProofSealView.tsx    [new] claims, enumeration, certificate verify button
src/components/views/TimelineView.tsx     [new]
src/components/views/PoliciesView.tsx     [new]
src/components/gate/ActionGateDrawer.tsx  [new] approvals, Execute (disabled + reason), progress, rollback
src/lib/api/ops.tsx                       [new] operator data layer: every value an API response; rehydrates from Incident.latest
src/components/views/{GraphPanel,NextStep,evidence,common,CommandCenter}.tsx   [new]
services/api/scripts/record_fixtures.py   [new] recorded API responses per stage → tests/fixtures/api/stages.json
tests/unit/views.test.tsx                 [new] AT-8.1, 8.2, 8.5 against recorded responses
tests/unit/graph-model.test.ts            [new] AT-8.3, 8.4 (model), 8.6
e2e/command-center.spec.ts                [new] AT-8.1, 8.4, 8.7
e2e/a11y.spec.ts                          [new] AT-8.8
```

### Phase 9 — landing + transition

```
src/app/page.tsx                          [new] landing composition
src/components/landing/Landing.tsx        [new] fixed 3D scene, replay chip, sections
src/components/landing/sections.tsx       [new] Hero, Paradox, Incident, Context, EchoLab, SafeCut, ProofSeal, hand-off (copy from 04-marketing-site, figures from the API)
src/components/landing/hooks.ts           [new] useLandingAnalysis (read-only analysis via the API), useScrollCursor (scroll → shared replay cursor + 3D state)
src/components/landing/HaltScene3D.tsx    [new] loads three r128 + the supplied scene as classic scripts; SVG poster for reduced motion / no WebGL
public/vendor/three/three.min.js          [copy] npm three@0.128.0
public/vendor/halt-3d/*.js                [copy] 06-3d-motion-system spec + scene a/b, unmodified
e2e/landing-transition.spec.ts            [new] AT-9.1..9.4
```

### Phase 10 — demo hardening

```
e2e/demo-flow.spec.ts                     [new] AT-10.1, 10.2, 10.4
docs/DEMO_SCRIPT.md                       [new] presenter beats + recovery steps
README.md                                 [update] final quick start, timings from AT-10.3
```

## 5. Rules carried through every phase

- No hex literal in components; no prototype numbers in the UI; every number from the API with a derivation.
- No action selection literal in code (AT-4.2). The variants must flip the answer.
- Every stage artefact stores the hashes of its inputs; seed 2417 everywhere.
- The legacy PNG and the vendored package are never modified.
- No real-system connectors; `connector: "simulated"` is the only accepted value.

## 6. Approval requested

Please confirm B1–B7, in particular: move out of OneDrive (B2), Docker vs the SQLite fallback (B3), and incident ID INC-2417 (B5). On approval, Phase 0 starts. It's the first step that installs anything or creates code.
