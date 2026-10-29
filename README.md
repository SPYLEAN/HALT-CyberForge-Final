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

Prerequisites: Python 3.12, Node 22+.

```bash
cd services/api
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
```

```bash
npm install
```

Start the API (in-memory SQLite; the audit log is then append-only by application code, and `/health` says so):

```bash
cd services/api && HALT_DB_URL="sqlite+pysqlite:///:memory:" .venv/Scripts/python -m uvicorn halt.main:create_app --factory --port 8000
```

Start the web app in a second terminal, then open http://localhost:3000:

```bash
npm run dev
```

On macOS or Linux use `python3.12 -m venv .venv` and `.venv/bin/python`.

## Run it with Docker

Requires Docker Desktop (WSL2 on Windows). PostgreSQL enforces the append-only audit log with triggers.

```bash
docker compose up --build -d --wait
```

- Web: http://localhost:3000 · API docs: http://localhost:8000/api/v1/docs · health: http://localhost:8000/api/v1/health
- `NEXT_PUBLIC_*` values are build arguments (inlined into the browser bundle); change them under `web.build.args`.

## Checks

| Command | What |
|---|---|
| `npm run verify:repo` | Vendored package and the legacy file are unchanged |
| `cd services/api && .venv/Scripts/python -m pytest` | API tests (AT-1 to AT-6; the PostgreSQL trigger test runs when `HALT_TEST_PG_URL` is set) |
| `npm run lint`, `npm run typecheck`, `npm test` | Web lint, types, unit tests |
| `npm run e2e -w @halt/web` | Playwright: full demo, reload, replay, landing hand-off, axe on every view (starts its own API and a production build) |

## Verification status

What has actually been run, and what has not (as of Phase 10):

| Check | Status |
|---|---|
| API tests | 121 passing locally; 1 skipped (PostgreSQL trigger, AT-6.7) |
| Web unit tests | 67 passing locally |
| E2E + accessibility | 25 passing locally against a production build (Chromium) |
| Determinism | Plan, simulation, proof certificate and audit hashes identical across runs (tested) |
| Measured | SafeCut solve p95 ≈ 22 ms; 3 futures × 6,000 rollouts ≈ 15 ms; landing LCP 152–560 ms |
| Docker Compose stack (AT-0.4, AT-10.3) | **Not run**: Docker is not installed on the development machine. The web image's runtime layout was checked by running the standalone server with the same copy steps |
| PostgreSQL append-only triggers (AT-6.7) | **Not run locally**; runs in the CI `api` job |
| GitHub Actions CI | **Not run**: no remote repository yet |

## Attribution

MITRE ATT&CK® technique identifiers and names are used under the [ATT&CK Terms of Use](https://attack.mitre.org/resources/legal-and-branding/terms-of-use/). © The MITRE Corporation.
