# Release status

The evidence behind the release decision. This table describes the Adaptive Intake and release-hardening changes on top of `a8d646a`.

| Check | Result |
|---|---|
| Backend tests | 406 run: 402 passed, 4 skipped, 0 failed |
| Web unit tests | 178 passed |
| Strict TypeScript, ESLint, Ruff, mypy, design tokens | Clean |
| OpenAPI and fixture drift | None |
| Complete E2E on a production build, with an isolated data root | 80 of 80 passed |
| Stored 10G, 30G, 50G routes on a production build | 61 of 61 passed |
| 17 baseline hashes of sealed files | All match |
| Repository check (`verify_repo.py`) | Passed |
| Visual QA at 1440 x 900 and 390 x 844 | 58 screens, no page errors or overflow |
| Visual QA at other sizes | Not rerun on this code |
| Docker image build | Not run |
| Python dependency audit | Not run: `pip-audit` is not installed |
| npm production dependency audit | 0 vulnerabilities |

## Known limitations

- Detection accuracy is not measured, because no organiser ground truth was provided.
- Every incident stays unconfirmed until an analyst reviews it.
- FireX 50G took about 70 minutes on the recorded machine, over the one-hour target.
- Only FortiGate key-value logs can be analysed. Adaptive Intake profiles other formats, but only as proposals.
- `PARTIAL_COLLAPSED_FRACTION` (two thirds) separates 50G (70.49%) from 10G (57.83%). It is a judgement call.
- The stored 10G graph gives `svc_backup30` the id `entity:device:svc_backup30` and the kind `critical_asset`. SourceTrace reports an account from the field that holds the name, and the sealed graph is unchanged.
- There is no sign-in, so keep the API on a trusted machine or network.
- Early pass commits are split by file: `2f87e43` and `2b71e10` do not build alone, and `af66a64` completes them.
