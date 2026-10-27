# HALT — Proof-Carrying Cyber Response

> Stop the attack. Not the business.

HALT calculates and proves the smallest reversible response that blocks every high-risk attack path while preserving critical business operations.

**All data in this repository is synthetic and labelled SIMULATED.** HALT doesn't connect to any real organisational system.

## Status

Phase 0 (bootstrap) of [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Design and contracts are in [docs/](docs/).

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js + TypeScript + Tailwind: landing and Command Center |
| `services/api` | Python 3.12, FastAPI: HALT-R1, ThreadGraph, EchoLab, SafeCut, ProofSeal, Action Gate |
| `assets/halt-package` | The supplied brand and design package, vendored unmodified (checked by `scripts/verify_repo.py`) |
| `docs` | RFC, architecture, data contracts, demo scenario, design system, acceptance tests, third-party ledger |

## Quick start (Docker)

Requires Docker Desktop (WSL2 on Windows).

```bash
cp .env.example .env
docker compose up --build -d --wait
```

- API health: http://localhost:8000/api/v1/health
- API docs: http://localhost:8000/api/v1/docs
- Web: http://localhost:3000

## Local development

API (Python 3.12):

```bash
cd services/api
py -3.12 -m venv .venv                 # Windows; python3.12 -m venv .venv elsewhere
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m pytest
```

Without Docker, set `HALT_DB_URL=sqlite+pysqlite:///./halt.db`. The audit log is then append-only by application code only, and `/health` reports `audit_enforcement: "app"`.

Web (Node 22+):

```bash
npm install
npm run dev
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run verify:repo`.

## Attribution

MITRE ATT&CK® technique identifiers and names are used under the [ATT&CK Terms of Use](https://attack.mitre.org/resources/legal-and-branding/terms-of-use/). © The MITRE Corporation.
