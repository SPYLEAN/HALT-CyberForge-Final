# HALT — Proof-Carrying Cyber Response

> Stop the attack. Not the business.

HALT calculates and proves the smallest reversible response that blocks every high-risk attack path while preserving critical business operations.

**All data in this repository is synthetic and labelled SIMULATED.** HALT does not connect to any real organisational system: every response action runs against a simulated copy of the graph.

## What it does

One synthetic incident, **INC-2417** (OAuth consent phishing against Finance Ops), end to end:

| System | Role | Where |
|---|---|---|
| HALT-R1 | Correlates 6 incident events out of 405 benign ones; findings cite `EV-` ids and ATT&CK | `services/api/halt/r1` |
| ThreadGraph | Users, sessions, tokens, apps, APIs, processes, the ledger; enumerates attack paths | `services/api/halt/threadgraph` |
| EchoLab | Seeded simulation (seed 2417, 6,000 rollouts) ranks paths and compares three futures | `services/api/halt/echolab` |
| SafeCut | OR-Tools CP-SAT derives the minimum safe containment envelope | `services/api/halt/safecut` |
| ProofSeal | Independently re-checks the plan (all 4,096 subsets), seals it with a certificate | `services/api/halt/proofseal` |
| Action Gate | Two human approvals, simulated execution, exact rollback, hash-chained audit | `services/api/halt/gate`, `halt/audit` |

The plan is derived, not scripted: SafeCut picks revoke the OAuth grant + revoke sessions S-1 and S-2 + phishing-resistant step-up, and changing one input (`verma_not_releaser`) changes the answer. See [docs/DEMO_SCENARIO.md](docs/DEMO_SCENARIO.md).

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js + TypeScript + Tailwind: landing story and Command Center |
| `services/api` | Python 3.12, FastAPI: every engine above, REST + WebSocket replay |
| `assets/halt-package` | The supplied brand and design package, vendored unmodified (`scripts/verify_repo.py` checks it) |
| `docs` | RFC, architecture, data contracts, scenario, design system, acceptance tests, ledger, [demo script](docs/DEMO_SCRIPT.md) |

## Run it locally (no Docker)

Prerequisites: Python 3.12 and Node 22+. Every command runs from the repository root, on Windows, macOS or Linux.

| Task | Command | What it does |
|---|---|---|
| Install | `npm run setup` | Creates `services/api/.venv` (Python 3.12), installs the API with its dev tools, then `npm install` |
| Develop | `npm run dev` | API (hot reload) + Next dev server. State lives in `.halt/halt-dev.db`, so an API restart restores the incident |
| Deterministic demo | `npm run demo` | Production build + API on `.halt/halt-demo.db`, waits for `/api/v1/ready`, resets INC-2417 to its seed, prints the URL. `npm run demo -- --keep` restores the last state instead of resetting |
| Reset | `npm run demo:reset` | Resets the running API's incident to its seed (same plan, proof and certificate every time) |
| Tests | `npm run check` | Repository checksums, ruff, ruff format, mypy, pytest, web lint, typecheck, vitest, token drift, and the contract-drift regeneration from [docs/HANDOFF.md](docs/HANDOFF.md) |
| End-to-end | `npm run test:e2e` | Playwright + axe against a production build and a real API |
| Production build | `npm run build` | Next.js production build of the web app |

Open http://localhost:3000. The API docs are at http://localhost:8000/api/v1/docs; liveness is `/api/v1/health` and readiness `/api/v1/ready`. With SQLite the audit log is append-only by application code, and `/health` reports `audit_enforcement: "app"`.

The PostgreSQL tests run when `HALT_TEST_PG_URL` names a disposable server where the user may create roles and databases. Without Docker, one way is the pip package `pgserver` (embedded PostgreSQL 16) in a separate virtualenv.

## Run it with Docker

Requires Docker Desktop (WSL2 on Windows). PostgreSQL enforces the append-only audit log and operation journal with triggers, and the API connects as `halt_app`, a role that may only read and append to them (demo credentials, created by `services/api/db-init/`). **Not yet run:** Docker is not installed on the development machine.

```bash
docker compose up --build -d --wait
```

- Web: http://localhost:3000 · API docs: http://localhost:8000/api/v1/docs · health: http://localhost:8000/api/v1/health
- `NEXT_PUBLIC_*` values are build arguments (inlined into the browser bundle); change them under `web.build.args`.

## Checks

| Command | What |
|---|---|
| `npm run check` | Everything below except E2E, plus contract drift |
| `npm run verify:repo` | Vendored package and the legacy file are unchanged |
| `cd services/api && .venv/Scripts/python -m pytest` | API tests: AT-1 to AT-6, restart safety and dependency failures. The PostgreSQL tests (AT-6.7, app role, restore) run when `HALT_TEST_PG_URL` is set |
| `npm run lint`, `npm run typecheck`, `npm test` | Web lint, types, unit tests |
| `npm run test:e2e` | Playwright: full demo, reload, replay, landing hand-off, axe on every view (starts its own API and a production build) |

## Verification status

What has actually been run, and what has not (2026-10-29, branch `stabilization/god-mode`; see [docs/FINALIZATION_AUDIT.md](docs/FINALIZATION_AUDIT.md)):

| Check | Status |
|---|---|
| API tests | 148 passed locally with PostgreSQL 16 (pgserver); 145 passed and 3 skipped without it |
| Web unit tests | 88 passed locally |
| E2E + accessibility | 27 passed locally against a production build (Chromium) |
| `npm run check` | Passed (exit 0): checksums, ruff, format, mypy, pytest, lint, typecheck, vitest, tokens, contract drift |
| Restart safety | Tested (AT-S.1–7), and checked live: the API restarted under an open Command Center restored INC-2417; the page reconnected and refetched without a reload |
| Dependency failure | Tested, and checked live with PostgreSQL unreachable: `/health` degraded in 0.2 s, `/ready` 503, routes 503 `dependency_unavailable`, the UI shows the reason and no figures |
| CI workflow and compose file | Validated against the GitHub workflow and Compose specification schemas (`check-jsonschema`); never executed |
| Determinism | Plan, simulation, proof certificate and audit hashes identical across runs (tested) |
| Measured | SafeCut solve p95 ≈ 22 ms; 3 futures × 6,000 rollouts ≈ 15 ms; landing LCP 152–560 ms |
| Docker Compose stack (AT-0.4, AT-10.3) | **Not run**: Docker is not installed on the development machine. The web image's runtime layout was checked by running the standalone server with the same copy steps |
| PostgreSQL append-only triggers and app role (AT-6.7, AT-S.8–9) | **Passed locally** on 2026-10-29 against PostgreSQL 16 (pgserver). The audit log is described as append-only on PostgreSQL on the strength of these tests; on SQLite it is application-enforced only |
| GitHub Actions CI | **Not run**: no remote repository yet |

## Attribution

MITRE ATT&CK® technique identifiers and names are used under the [ATT&CK Terms of Use](https://attack.mitre.org/resources/legal-and-branding/terms-of-use/). © The MITRE Corporation.
