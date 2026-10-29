# HALT Finalization Audit

**Audit date:** 2026-10-29
**Branch:** `stabilization/god-mode`
**Baseline:** tag `phase10-complete` → commit `4c0ccd8`

This is an audit only. It changes no application code. Each item below cites the file it comes from, and anything not run during this audit is marked as not run.

---

## 1. Verified current state

### Repository

| Check | Result |
|---|---|
| Commit `4c0ccd8` exists | ✅ It is `main`'s HEAD ("Add project handoff document") |
| Baseline tag | ✅ Created `phase10-complete` as an annotated tag on `4c0ccd8`. **The tag is local only:** there is no remote, so nothing protects it server-side yet (see B-3) |
| Working branch | ✅ Created `stabilization/god-mode` from `4c0ccd8`. `main` is untouched and nothing was stashed or discarded |
| Remote | None. `git remote -v` is empty |
| `CLAUDE.md` | Does not exist, at the root or anywhere else |
| `AGENTS.md` files | Only `apps/web/AGENTS.md`, which is untracked (see §1.2) |
| Docker | Not installed (`docker: command not found`) |
| `gh` CLI | Installed (2.101.0); no repository linked |
| Node and Python | Node v24.19.0; Python 3.12.10 |

### 1.1 Checks run during this audit

All checks below ran during this audit on the baseline (`4c0ccd8`). No code had been changed.

| Check | Command | Result |
|---|---|---|
| Vendored package and legacy file | `python scripts/verify_repo.py` | ✅ Legacy file intact; 193 vendored files match |
| API tests | `pytest` | ✅ **120 passed, 1 skipped** (PostgreSQL, AT-6.7). 121 collected |
| API lint | `ruff check .` | ✅ Clean |
| API types | `mypy` (strict, 71 files) | ✅ Clean |
| OpenAPI drift | `export_openapi.py --check` | ✅ Up to date |
| Web lint | `npm run lint` | ✅ Clean |
| Web types | `npm run typecheck` | ✅ Clean |
| Web unit tests | `npm test` | ✅ 67 passed (9 files) |
| Token drift | `check:tokens` | ✅ Clean |
| E2E + axe | `npm run e2e -w @halt/web` | **Not re-run in this audit.** Last run was at Phase 10 (25 passed). It needs a production build of about 5 minutes on OneDrive |
| Docker, CI, PostgreSQL | — | Not runnable (§2) |

**Correction:** HANDOFF.md and README say "121 API tests passing, 1 skipped". The accurate figure is **120 passed + 1 skipped = 121 collected**. Row 11 of §6 fixes the docs.

### 1.2 The two uncommitted files

**`.claude/launch.json`** is the preview configuration for the desktop app's dev servers.
- **Secrets:** none. It contains `HALT_SIGNING_KEY_PATH=services/api/secrets/demo-signing-key.pem`, which is a path, not a key. `secrets/` is gitignored, and that key is a per-deployment demo key.
- **Machine-specific:** `runtimeExecutable: services/api/.venv/Scripts/python.exe` only works on Windows. The other paths are relative.
- **Conflicts with the docs:** none. It mirrors the README's local-run commands.
- **Recommendation:** do not commit it. Keep it local by adding `.claude/` to `.git/info/exclude`, which keeps it out of `git status` without changing the repository.

**`apps/web/AGENTS.md`** is a block written by `next dev`.
- I confirmed the generator exists at `node_modules/next/dist/server/lib/generate-agent-files.js`, and that the docs it points to exist at `node_modules/next/dist/docs/`.
- **Secrets:** none.
- **Machine-specific:** no.
- **Conflicting instructions:** the file is addressed to coding agents. It tells them to read the bundled Next docs, and says that "committing it with your work keeps the tree clean". That second line is the generator's own preference, not a project decision, and this audit does not act on it. It doesn't conflict with any project rule.
- **Recommendation:** add `apps/web/AGENTS.md` to `.gitignore`. `next dev` rewrites the file on every start, so committing it only invites churn.

### 1.3 Frontend value → API source map

Every displayed figure was traced from component to API. ✅ means it comes from a backend contract field. ⚠️ means it is literal, derived in the client, or a fallback; those are the findings in §3.

| Surface | Value | Source | |
|---|---|---|---|
| Overview | Incident confidence "16 of 16" | `GET /incidents/{id}` → `confidence.numerator/denominator/method` | ✅ |
| Overview | High-risk path count | `GET /paths` → `items[].high_risk` (filtered client-side) | ✅ |
| Overview | "Risk ≥ 0.20 over N rollouts" | **literal `0.20`**; N is taken by splitting the `count()` output string | ⚠️ F-05 |
| Overview | Users affected by the plan | `Plan.constraints[C-USERS].value/limit/derivation` | ✅ |
| Overview | Paths reachable after the plan | `Proof.claims[CHK-01].result` | ✅ |
| Overview | Findings list | `GET /findings` (or replay `finding` frames) | ✅ |
| EchoLab | Rollouts, seed, horizon caption | `SimulationRun.request` | ✅ |
| EchoLab | Simulation request body | **literal `rollouts: 6000, horizon_s: 600, seed: 2417`** and preset IDs in `ops.tsx:190` | ⚠️ F-05 |
| EchoLab | Paths blocked, ledger reached | `futures[].paths_blocked/target_reached` | ✅ |
| EchoLab | Users affected | `futures[].users_affected.numerator` **`?? 0`** | ⚠️ F-06 |
| EchoLab | "REVERSIBLE ≤ 5 MIN" | `futures[].reversible` (bool); **label `5 MIN` is literal** | ⚠️ F-05 |
| EchoLab | Availability strip, "DOWN N MIN" | `futures[].availability`, `incident.params.containment_window_min` | ✅ |
| SafeCut | Plan ID, solver, wall time, objective terms | `Plan.*` | ✅ |
| SafeCut | Display actions, cuts, impact, reversibility, authorisation | `Plan.display_actions` + `GET /actions` | ✅ |
| SafeCut | Constraint rows | `Plan.constraints`; **names come from a client map `CONSTRAINT_NAMES`** | ⚠️ F-12 |
| SafeCut | Infeasibility and closest options | `Plan.infeasibility` | ✅ |
| SafeCut | Rejected candidates | `Plan.rejected` | ✅ |
| ProofSeal | Subsets, feasible, optimal, unique | `Proof.enumeration` | ✅ |
| ProofSeal | Claims, certificate, signature key, not covered | `Proof.*` | ✅ |
| ProofSeal | Verify result | `POST /proofs/{id}/verify` | ✅ |
| Action Gate | Roles, approvers, policies | `GET /policies` (`policies`, `approvers`) joined to the plan's actions | ✅ |
| Action Gate | Outstanding roles | `GET/POST /plans/{id}/approvals` → `outstanding_roles` | ✅ |
| Action Gate | Disabled reason "(IR-DATA-07)" | **literal policy ID** | ⚠️ F-08 |
| Action Gate | Execution steps, snapshot hashes, rollback window | `Execution.*` | ✅ |
| Action Gate | Operator acting on execute and rollback | **literal `OPERATOR_ID = "a_rahman"`**; never displayed | ⚠️ F-10 |
| Policies | Policies, approvers, constraints | `GET /policies` | ✅ |
| Policies | "Every action" in *Applies to* | **heuristic `applies_to_action_types.length > 3`** | ⚠️ F-07 |
| Policies | Variant list | **literal `VARIANTS` array**; no API lists variants | ⚠️ F-04 |
| Policies | Selected variant | **local `useState("baseline")`**; the API does not report the active variant | ⚠️ F-04 |
| Timeline | Events and audit rows | Replay frames + `GET /audit` | ✅ |
| Top bar | Stage chip | Replay stage, then `Incident.state` | ✅ |
| Top bar | Operator | The `actor` prop exists but is **never passed** | ⚠️ F-10 |
| Evidence rail | Events, findings, confidence, sources, policies | Replay state + API | ✅ |
| Evidence rail | "Explanation" section | `POST /explain`; **reuses section id `policy`** | ⚠️ F-01 |
| Landing · Hero | ID, title, t0 | `Incident` | ✅ |
| Landing · Paradox | Requests enumerated | `EV-06.attributes.request_count` | ✅ |
| Landing · Paradox | Paths, forecast count | `GET /paths` | ✅ |
| Landing · Paradox | Critical processes down, users locked out | Future A + graph criticality; users **`?? 0`** | ⚠️ F-06 |
| Landing · Paradox | "Finance close delayed" | **max** of future A's `downtime_min`, labelled as the finance-close process | ⚠️ F-09 |
| Landing · Paradox | Replay stop `t={84}` | **literal** scroll stop | ⚠️ F-11 |
| Landing · Incident | "Six events." heading | **literal** | ⚠️ F-03 |
| Landing · Context | Users per process | `node.business.users` **`?? 0`** | ⚠️ F-06 |
| Landing · EchoLab | Futures metrics | `SimulationRun`; users **`?? 0`**; "Paths blocked" derivation is a literal string instead of `paths_blocked.method` | ⚠️ F-06 |
| Landing · SafeCut | "SafeCut checked N combinations" | N is **`Proof.enumeration.subsets_checked`**, which ProofSeal computed, not SafeCut | ⚠️ F-02 |
| Landing · Hand-off | "two named humans still have to approve" | **literal** | ⚠️ F-03 |

What the hunt found overall:
- **No hardcoded plan.** No candidate IDs appear in application code, and `test_no_hardcoded_plan` enforces this.
- **No mock-only behaviour in the production path.** Fixtures are used only in unit tests.
- **The ⚠️ rows above are all the hardcoded or derived values.**
- **Dead interfaces:**
  - `TopBar.actor` is never passed.
  - The stage labels `simulating` and `rollback_available` are never emitted. They are in the contract's `IncidentState`, but `service.py:140-160` never returns them.
  - `LlmClient` has no provider. That is intentional.

---

## 2. Unverified claims

These are claimed in the repository but have **not** been run on this machine:

| Claim | Where it is made | Status |
|---|---|---|
| `docker compose up` brings `db`, `api` and `web` up healthy (AT-0.4) | ACCEPTANCE_TESTS, README | **Not run.** Docker is not installed |
| Clean clone to working demo in ≤ 10 min (AT-10.3) | ACCEPTANCE_TESTS | **Not run** |
| The PostgreSQL trigger rejects UPDATE and DELETE on `audit_log` (AT-6.7) | README, ARCHITECTURE | **Not run.** The test skips without `HALT_TEST_PG_URL` |
| The CI workflow passes (all 6 jobs) | README, HANDOFF | **Never run.** No remote |
| `/health` reports `audit_enforcement: "db"` under Compose | `ci.yml` compose job | **Not run** |
| E2E suite (25 tests) | README, HANDOFF | Passed at Phase 10. **Not re-run in this audit** (see §1.1) |
| Landing LCP 140–560 ms | HANDOFF | Measured on a local production build; not on the demo machine or network |
| `motion` library "Required" | `THIRD_PARTY_LEDGER.md:60` | **False.** It is not in `apps/web/package.json`; animation is CSS and Cytoscape (F-13) |

## 3. Findings and classification

**P0** = demo correctness or reliability. **P1** = judging impact. **P2** = commercial roadmap. **Reject** = unnecessary before the hackathon.

### P0 — demo correctness and reliability

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| F-01 | The Explanation section reuses evidence-section id `policy`. That gives duplicate React keys and a duplicate DOM id `ev-policy` whenever something is selected. axe only ran without a selection, so it never saw this. | `CommandCenter.tsx:63-66`, `EvidenceRail.tsx:4,25` | Add an `explain` id to `EvidenceSection` and `EMPTY_TEXT`, and use it |
| F-02 | The landing page credits SafeCut with ProofSeal's 4,096-subset enumeration ("SafeCut checked … combinations"). The number is real but attributed to the wrong system. | `sections.tsx:225-228` | Reword so SafeCut derived the plan and ProofSeal checked all N combinations |
| F-03 | Literal counts in the copy: "Six events." and "two named humans still have to approve". These are wrong for any variant where the approver set changes (e.g. `verma_not_releaser`, `approver_unavailable`). | `sections.tsx:130,291` | Use `allEvents.length`, and get the approver count from `outstandingRoles` or `roleRequirements`. Give the infeasible case its own sentence |
| F-04 | The variant switcher lists variants from a client array and keeps the selection in local state. After a reload it shows "Baseline" while the API may be running another variant. Beat 14 of the demo depends on this control. | `PoliciesView.tsx:11-17,22` | Backend: add `variant` to `Incident` and `GET /incidents/{id}/variants` (id, label, description from `variants.json`). Frontend: drive the switcher from both. **This is a contract change, so run the regeneration** (§5) |
| F-05 | Engine parameters are duplicated as client literals: the simulation request (`6000/600/2417`, preset IDs), the "Risk ≥ 0.20" caption, and the "≤ 5 MIN" chip. A change to a parameter would put the UI out of step with the engine. | `ops.tsx:182-190`, `OverviewView.tsx:41`, `EchoLabView.tsx:83` | Use `incident.params.{rollouts,horizon_s,seed,high_risk_threshold}`. Take the reversibility label from the `C-REVERSIBLE` limit in `policySet.constraints`. Take preset IDs from a new `presets` field in the variants and presets response, or from `params` |
| F-06 | `?? 0` fallbacks turn a missing value into a displayed **0** (users affected; users per process). That is an invented number. | `EchoLabView.tsx:80`, `sections.tsx:93,175,199` | Show "—" with the derivation "not computed" |
| F-07 | Policies shows "Every action" whenever a policy lists more than 3 action types. That is a heuristic, not a fact. | `PoliciesView.tsx:89` | Compare against the action catalogue (`ops.actions` types) and say "Every action" only when it is literally true |
| F-08 | The Execute-disabled reason hardcodes `IR-DATA-07`. | `ActionGateDrawer.tsx:48` | Use the `C-EVIDENCE` constraint's `limit` text from the plan, or name the policy by looking it up in `policySet` |
| F-09 | "Finance close delayed" shows the maximum downtime across all processes, not the finance-close process. | `sections.tsx:94` | Label it "Longest critical-process outage", or read the finance-close process's own `downtime_min` entry by node criticality and label |
| R-01 | The repository lives in OneDrive. That caused dev-server reload loops and 6-minute installs during the build, which is a live-demo risk. | Phase 10 notes | **User action:** move it to `C:\dev\halt` and reinstall. No code change |
| R-02 | The Compose path has never run, and there is no fallback runbook for the demo machine. | §2 | Install Docker and run AT-0.4/AT-10.3. Until then, the demo runs on the local production build (`next build && next start` plus uvicorn), which is what the E2E suite exercises. Document that as the primary demo path |

### P1 — judging impact

| ID | Finding | Fix |
|---|---|---|
| F-10 | The operator persona is invisible. Execute and rollback run as `a_rahman`, but the top bar never shows it (the `actor` prop is never passed). | Pass `actor` and label it a demo identity (HANDOFF #8 stays P2) |
| F-11 | The Paradox section's replay stop is a literal `t={84}`. | Use the EV-02 offset from the events list, i.e. the first suspicious sign-in |
| F-12 | SafeCut constraint names come from a client-side map. | Use `constraints[].label` from `GET /policies` (it already exists) |
| F-13 | The ledger says `motion` is required, but it isn't installed (HANDOFF #10). | **Recommendation:** don't add the dependency. Implement the three motions with CSS and the Web Animations API, and update the ledger to match |
| F-14 | The motion spec is incomplete (HANDOFF #11): the animated cut (900 ms), the proof ring drawing clockwise (600 ms), and the cross-fade between futures. | `ThreadGraphCanvas.tsx` overlay: animate the ring with `stroke-dashoffset`, open the cut gap with a CSS transition. Every animation honours `prefers-reduced-motion` |
| F-15 | Visual polish (HANDOFF #12): node labels are small; the proposed-cut underlay is subtle; on the landing page the 3D business path crosses the hero text. | `cy-style.ts` label size and weight; a dashed Ember marker for a proposed cut (the Ember colour stays reserved for hostile items); a landing CSS safe area for the hero copy (the scene itself stays unmodified) |
| F-16 | No overlay toggle for business dependencies (HANDOFF #13). | Add a toggle to `GraphPanel` that filters dependency edges in `buildModel` |
| F-17 | U1 residual risk (HANDOFF #14) is a **product decision.** | **Recommendation:** keep it as is and make it a feature: the proof says what it does *not* cover. Make it more visible on Overview with a fifth metric, "Residual reach 502 of 6,000 via U1", from `SimulationRun` future C and `proof.not_covered` |
| B-3 | CI has never run (HANDOFF #3); this also covers AT-6.7. | **Needs your approval:** create a private GitHub remote, push the branch, and protect `main` and the tag. That is outward-facing, so it waits for you |

### P2 — commercial roadmap (after the hackathon)

| HANDOFF # | Item |
|---|---|
| 4 | Light-theme toggle. The tokens exist; judges see dark only |
| 5 | Phone layout of the Command Center |
| 6 | Rehydrating runtime state from the database after an API restart. The demo script already covers restarts by resetting |
| 7 | Multiple incidents |
| 8 | Real authentication and RBAC in place of `X-Halt-Actor` |
| 9 | A language-model provider adapter. The citation validator must be kept, and the model must never decide anything |
| 15 | Alembic migrations |
| — | Engine code references the scenario's policy ID `IR-DATA-07` directly (`gate.py:117`, `solve.py:125`, `checks.py:178`). Make it data-driven once there is more than one policy set |
| — | The unreachable states `simulating` and `rollback_available`: either emit them or drop them from the contract |

### Reject — not before the hackathon

| HANDOFF # | Item | Why |
|---|---|---|
| 16 | Dev-only noise (double WebSocket under StrictMode, uvicorn `ConnectionResetError`) | Harmless; not visible in the production build |
| 20 | Upgrade to npm 12 | No benefit, and a risk |
| — | Real connectors and organisational integrations | Forbidden by the brief for the MVP |
| — | Rewriting any engine (R1, EchoLab, SafeCut, ProofSeal, Gate) | All are tested and deterministic, and no finding requires it |

### Housekeeping (HANDOFF #17–19)

| # | Item | Decision |
|---|---|---|
| 17 | `apps/web/AGENTS.md` | Add it to `.gitignore` (§1.2) |
| 18 | `.claude/launch.json` | Keep it local through `.git/info/exclude` (§1.2) |
| 19 | The repository is in OneDrive | R-01 |

## 4. Blockers

| ID | Blocker | Owner |
|---|---|---|
| B-1 | Docker is not installed, so AT-0.4, AT-10.3 and the Compose health check cannot run | You: install Docker Desktop with WSL2 |
| B-2 | The project lives in OneDrive (R-01) | You: move it to a local path |
| B-3 | There is no remote, so CI, AT-6.7, branch protection and server-side tag protection are all unavailable | You: approve creating a private GitHub repository |
| B-4 | U1 policy (F-17) | You: keep it as residual risk (recommended), or change the threshold |

None of these blocks the P0 code fixes, which can all proceed on this branch.

## 5. Regression risks

| Risk | Triggered by | Guard |
|---|---|---|
| Contract drift breaks CI or the types | F-04 (adds `Incident.variant` and a variants endpoint) | Run the regeneration commands from HANDOFF §9 in this order: `export_openapi.py` → `npm run gen:api` → `record_fixtures.py`. Then confirm `export_openapi.py --check` and `git diff --exit-code` are clean |
| Recorded fixtures change bytes | F-04 adds a field to `Incident` | Re-record with `record_fixtures.py` and review the diff. Only the new field should appear |
| Determinism hashes change | Any change to plan, proof or audit payloads | Run `test_proofseal` and `test_api_contract`. The plan ID `PLAN-10e634719283` and proof `PS-2417-d7c66ecf` must not change. F-04 must not add the variant to hashed bodies |
| A hardcoded plan creeps in | Copy edits (F-02, F-03) | Keep `test_no_hardcoded_plan` |
| Accessibility regressions | F-01, F-14, F-15, F-16 | Extend the axe E2E to run with a selection active, and with the motion paths under reduced motion |
| The 3D scene is modified | F-15 hero overlap | Fix it only with landing CSS. The `verify_repo.py` and brand checksum tests guard the vendored files |
| The landing flow changes | F-02, F-03, F-09, F-11 | Rerun landing-transition and demo-flow E2E (AT-9.x, AT-10.x) |
| The palette is misused | F-15 proposed-cut marker | Use only existing tokens. The no-hex lint rule and the token contrast test guard this |

## 6. File-level change plan (in order; one commit per row)

| # | Item | Files |
|---|---|---|
| 1 | Housekeeping | `.gitignore` (+ `apps/web/AGENTS.md`); `.git/info/exclude` (+ `.claude/`, local only) |
| 2 | F-01 | `apps/web/src/components/shell/EvidenceRail.tsx`, `apps/web/src/components/views/CommandCenter.tsx`, `apps/web/tests/unit/shell.test.tsx` |
| 3 | F-05, F-06, F-08, F-12 | `apps/web/src/lib/api/ops.tsx`, `apps/web/src/components/views/{OverviewView,EchoLabView,SafeCutView}.tsx`, `apps/web/src/components/gate/ActionGateDrawer.tsx`, `apps/web/tests/unit/views.test.tsx` |
| 4 | F-02, F-03, F-06, F-09, F-11 | `apps/web/src/components/landing/sections.tsx`, `apps/web/e2e/landing-transition.spec.ts` |
| 5 | F-07 | `apps/web/src/components/views/PoliciesView.tsx`, `apps/web/tests/unit/views.test.tsx` |
| 6 | F-04 (contract) | `services/api/halt/contracts/{incident,api}.py`, `services/api/halt/service.py`, `services/api/halt/api/routes.py`, `services/api/tests/test_api_contract.py`; regenerate `services/api/openapi.json`, `apps/web/src/lib/api/schema.d.ts`, `apps/web/tests/fixtures/api/stages.json`; then `apps/web/src/lib/api/{ops.tsx,types.ts}`, `apps/web/src/components/views/PoliciesView.tsx`, `apps/web/e2e/demo-flow.spec.ts` |
| 7 | F-10 | `apps/web/src/components/shell/CommandCenterShell.tsx`, `apps/web/src/components/views/CommandCenter.tsx`, `apps/web/src/components/gate/ActionGateDrawer.tsx` (export the persona) |
| 8 | F-17 | `apps/web/src/components/views/OverviewView.tsx` (residual-reach metric from future C and `proof.not_covered`) |
| 9 | F-14, F-13 | `apps/web/src/components/graph/ThreadGraphCanvas.tsx`, `apps/web/src/app/globals.css`, `docs/THIRD_PARTY_LEDGER.md`, `docs/DESIGN_SYSTEM.md` |
| 10 | F-15, F-16 | `apps/web/src/components/graph/{cy-style,model}.ts`, `apps/web/src/components/views/GraphPanel.tsx`, `apps/web/src/app/globals.css` (landing hero safe area) |
| 11 | Docs | `README.md` (verification table), `docs/HANDOFF.md` (pending list), `docs/DEMO_SCRIPT.md` (primary demo path R-02), `docs/ACCEPTANCE_TESTS.md` (new tests) |

Rows 1–6 are P0; rows 7–10 are P1. HANDOFF #4–9 and #15 (P2) are not in this plan.

## 7. Test plan

**After each commit:**
```
npm run lint && npm run typecheck && npm test
cd services/api && .venv/Scripts/python -m pytest && .venv/Scripts/python -m ruff check . && .venv/Scripts/python -m mypy
```

**After row 6 (contract change):**
- `scripts/export_openapi.py --check`
- `npm run gen:api`
- `scripts/record_fixtures.py`
- `git diff --stat`. Only the expected files may change.

**New tests:**

| For | Test |
|---|---|
| F-01 | Unit test: evidence-section ids are unique with a selection active. E2E: axe runs with a node selected |
| F-03, F-06 | Unit test: rendering the landing sections against `stages.json`. No literal "Six" or "two named"; a missing users value renders "—" |
| F-04 | API test: `Incident.variant` follows a reset, and `GET /variants` matches `variants.json`. E2E: switch to `approver_unavailable`, reload, and the selector still shows it |
| F-05 | Unit test: the simulation request body equals `incident.params` (assert through the fetch stub) |
| F-07 | Unit test: a policy with 4 of 12 action types does not show "Every action" |
| F-14 | E2E: under reduced motion, the cut renders in its final state with no animation |

**Before merge:** run the full E2E (`npm run e2e -w @halt/web`, 25 or more tests) and `npm run verify:repo`.

**When unblocked:** run AT-0.4 and AT-10.3 (Docker), and AT-6.7 plus all CI jobs (remote).

**What counts as done:** every check above actually ran and passed. The README verification table lists only results that were run.

## 8. Rollback strategy

- `main` is never modified directly. All work lands on `stabilization/god-mode`, and is merged to `main` only after the full test plan passes and you approve.
- The tag `phase10-complete` marks the known-good demo. To demo from it at any time:
  ```
  git switch --detach phase10-complete
  ```
- Each row in §6 is one commit. To undo one item, revert its commit with `git revert <sha>`. Row 6 contains the contract change together with its regenerated files, so reverting it restores the API, types and fixtures in one step.
- If the branch is abandoned, delete it with `git branch -D stabilization/god-mode`. `main` and the tag stay untouched.
- Once a remote exists, push the tag and protect `main` and `phase10-complete` with branch and tag protection rules (B-3).

---

## 9. Progress (2026-10-29)

Rows 1–11 are done on `stabilization/god-mode`, one commit per row (row 9 includes its ledger and design-doc corrections). `main` and the tag `phase10-complete` are unchanged.

| Row | Findings | Commit |
|---|---|---|
| 1 | Housekeeping | `1eaf52f` |
| 2 | F-01 | `b310e61`, plus E2E `c7754d8` |
| 3 | F-05, F-06, F-08, F-12 | `7134d80` |
| 4 | F-02, F-03, F-06, F-09, F-11 | `6b9814a` |
| 5 | F-07 | `1435ac9` |
| 6 | F-04 (contract change, regenerated files) | `02e8353` |
| 7 | F-10 | `992b60b` |
| 8 | F-17 (U1 kept as stated residual risk) | `36a1a6f` |
| 9 | F-13, F-14 | `36f3de1` |
| 10 | F-15, F-16 | `5190253` |
| 11 | Docs | this commit |

**Checks run after row 10, all passing:**

| Check | Result |
|---|---|
| `verify_repo.py` | ✅ |
| API tests | ✅ 121 passed, 1 skipped (PostgreSQL) |
| ruff, mypy (strict), OpenAPI drift | ✅ |
| Web lint, typecheck | ✅ |
| Web unit tests | ✅ 80 passed |
| Token drift | ✅ |
| E2E + axe, production build | ✅ 27 passed |

**Found while doing the work:**
- Cytoscape steps its animations on animation frames, and a hidden tab gets none. Without a guard, a stalled cross-fade left hostile edges at opacity 0. Every canvas animation now also settles on a timer.
- The first version of the landing hero panel covered half of the containment ring. It was narrowed to 520 px.

**Still open:**
- B-1 to B-3: Docker, the PostgreSQL trigger test (AT-6.7) and CI.
- Rollback, threat-propagation and graph-expansion motion.
- No automated test that a missing users count renders "—".
- The EchoLab preset IDs (`preset_aggressive`, `preset_passive`) are still named in the client.
- All the P2 items.
