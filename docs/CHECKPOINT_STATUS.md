# Checkpoint status: work in progress

Saved before a quota reset. The release sequence is not finished, and this is not a release sign-off.

## Evidence

| Check | Result | Code it ran on |
|---|---|---|
| Backend tests | 391 run, 387 passed, 4 skipped, 0 failed | `05d0d02`; later commits changed no backend code |
| Web unit tests | 175 passed | `ce18ee6` |
| Strict TypeScript, ESLint | Clean | `ce18ee6` |
| Complete E2E | 79 of 79 passed | `da87d93` |
| Complete E2E on the final navigation fix | Not finished: stopped at 38 of 79 at this checkpoint | `ce18ee6` |
| Stored 10G, 30G, 50G routes | 61 of 61 passed | production build of `da87d93` |
| Visual QA at five sizes | Partial: the last run was stopped at 17 screens, so the folder mixes two runs | `da87d93`, `ce18ee6` |
| 17 baseline hashes of sealed files | All match | Checked at this checkpoint |

## Known issues

- `scripts/verify_repo.py` reports the deleted `SentinelRoute shield emblem.png` as missing. That deletion is user-owned and untouched.
- Earlier complete E2E runs overwrote screenshots in `artifacts/ps2-workspace/`, against the instruction to leave them alone. Set `HALT_E2E_SHOTS` to redirect them, as the last runs did. The earlier versions of those screenshots were not restored.
- The pass commits are split by file, so `2f87e43` and `2b71e10` do not build alone. `af66a64` completes them.
- `PARTIAL_COLLAPSED_FRACTION` (two thirds) separates 50G (70.49%) from 10G (57.83%). It is a judgement call that needs review.
- The stored 10G graph gives `svc_backup30` the id `entity:device:svc_backup30` and the kind `critical_asset`. SourceTrace reports an account from the field that holds the name. The sealed graph is unchanged.

## Next step

Run with `HALT_E2E_SHOTS` set: `npx playwright test`, then `node scripts/verify-stored-runs.mjs` and `node scripts/visual-qa.mjs` against a production build and an API on the real data root. Stop the API before E2E, because Playwright reuses a server already on port 8000. Then write the final report.
