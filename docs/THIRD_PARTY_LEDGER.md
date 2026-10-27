# Third-Party Ledger

Nothing below is installed yet. Exact versions are pinned at install time (Phase 0) from the then-current stable releases, recorded in lockfiles (`package-lock.json`, `uv.lock` or `requirements*.txt`), and this table is updated with the resolved versions. Licences listed are those published by each project; re-verify on install.

## Resolved versions

Phase 0 (2026-10-27). Lockfile: `package-lock.json`. Python is not lock-filed yet; versions below are from `pip list`.

| Package | Version |
|---|---|
| next / eslint-config-next | 16.4.3 |
| react, react-dom | 19.3.1 |
| typescript | 5.9.3 (7.x skipped: Next tooling compatibility unverified) |
| tailwindcss, @tailwindcss/postcss | 4.3.3 |
| eslint | 9.x (10.x skipped: plugin compatibility) |
| vitest | 5.0.5 |
| Python | 3.12 |
| fastapi | 0.162.0 |
| uvicorn | 0.54.0 |
| pydantic / pydantic-settings | 2.14.1 / 2.16.1 |
| sqlalchemy | 2.1.6 |
| psycopg (binary) | 3.3.6 |
| structlog | 26.1.0 |
| pytest / ruff / mypy | 9.1.1 / 0.17.3 / 2.4.0 |

npm 11 blocked the `unrs-resolver` postinstall script (used by ESLint import resolution). Lint passes without it. Approve it with `npm approve-scripts unrs-resolver` only if import-resolution errors appear.

## Supplied (in-house) assets

| Item | Origin | Licence / rights | Notes |
|---|---|---|---|
| HALT logo, lockups, favicons, `paths.json` | `halt-full-package/01-brand-assets` | Project-owned | Canonical; never modified |
| Design tokens, component bundle, docs | `02-design-system` | Project-owned | Bundle ports to TSX |
| Product boards (`*.dc.html`) | `03-product-boards-source` | Project-owned | Reference only |
| Marketing site, Command Center prototype | `04`, `05` | Project-owned | Reference only |
| 3D scene, spec, exports | `06-3d-motion-system` | Project-owned | Requires three.js r128 |
| `SentinelRoute shield emblem.png` | Pre-existing in repo | Unknown | Not used |

## Frontend (npm)

| Package | Purpose | Licence | Status |
|---|---|---|---|
| next | App framework | MIT | Required |
| react, react-dom | UI | MIT | Required (version set by Next major) |
| typescript | Types | Apache-2.0 | Required |
| tailwindcss (+ postcss, autoprefixer) | Styling mapped to tokens | MIT | Required |
| motion | Animation | MIT | Required |
| cytoscape (+ @types/cytoscape) | Graph rendering | MIT | Required |
| three@0.128.0 | Supplied 3D scene (r128 API) | MIT | Required for landing hero only |
| openapi-typescript, openapi-fetch | Generated types + typed client | MIT | Required |
| zod | Env + WebSocket message validation | MIT | Required |
| vitest, @testing-library/react, @testing-library/jest-dom, jsdom | Unit/component tests | MIT | Dev |
| msw | API mocking in component tests | MIT | Dev |
| @playwright/test | E2E | Apache-2.0 | Dev |
| @axe-core/playwright | Accessibility checks | MPL-2.0 | Dev |
| eslint, eslint-config-next, prettier | Lint/format | MIT | Dev |
| @react-three/fiber | — | MIT | **Not used**: supplied scene targets r128; R3F needs newer three |

## Fonts

| Font | Source | Licence |
|---|---|---|
| Archivo (variable) | Google Fonts via `next/font` | SIL OFL 1.1 |
| IBM Plex Mono | Google Fonts via `next/font` | SIL OFL 1.1 |

## Backend (Python 3.12)

| Package | Purpose | Licence | Status |
|---|---|---|---|
| fastapi, starlette | API | MIT / BSD-3 | Required |
| uvicorn | ASGI server | BSD-3 | Required |
| pydantic, pydantic-settings | Contracts, env validation | MIT | Required |
| sqlalchemy, alembic | ORM, migrations | MIT | Required |
| psycopg (v3) | PostgreSQL driver | LGPL-3.0 | Required (dynamic linking only; no modification) |
| networkx | Graph algorithms | BSD-3 | Required |
| ortools | CP-SAT solver | Apache-2.0 | Required |
| numpy | Seeded simulation | BSD-3 | Required |
| scikit-learn | Baseline model (logistic regression) | BSD-3 | Required |
| lightgbm / xgboost | Gradient boosting | MIT / Apache-2.0 | **Conditional** on AT-2.6 |
| torch | — | BSD-3 | **Not planned**; only if a model beats GBM and LR |
| cryptography | Ed25519 signing | Apache-2.0 / BSD | Required |
| structlog | JSON logs | MIT / Apache-2.0 | Required |
| httpx | Test client | BSD-3 | Dev |
| pytest, pytest-asyncio, hypothesis | Tests | MIT / Apache-2.0 / MPL-2.0 | Dev |
| ruff, mypy | Lint/types | MIT | Dev |
| anthropic | Optional explanation adapter | MIT | **Optional, off by default** |

## Infrastructure

| Item | Licence | Notes |
|---|---|---|
| PostgreSQL 16 (Docker image `postgres:16`) | PostgreSQL Licence | |
| Docker Desktop | Docker subscription terms | Not installed on dev machine; free for personal/small use |
| GitHub Actions | GitHub terms | Needs a remote repository |

## Data and references

| Item | Terms | Use |
|---|---|---|
| MITRE ATT&CK technique IDs and names | ATT&CK Terms of Use (attribution required) | Labels on findings; attribution in README footer |
| AS64500 | RFC 5398 documentation range | Fictional ASN in scenario |
| All events, users, records | Synthetic, generated with seed 2417 | Labelled SIMULATED |
