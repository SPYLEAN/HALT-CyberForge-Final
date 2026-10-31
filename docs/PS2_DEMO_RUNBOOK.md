# PS2 demo runbook

> **All data is synthetic.** Every value below was produced by the PS2 engine (`halt.ps2.engine/1.0.1`) on the
> bundled synthetic datasets. It shows pipeline behaviour, not real-world detection accuracy. Do not present
> any figure as a measurement on real data.

## Required software

- Python 3.12, with `services/api/.venv` created by `npm run setup`.
- Node 22+ and npm, with `npm install` run at the repository root.
- A Chromium-based browser.
- No internet access is needed at run time. The datasets, fonts and model ship in the repository and the build
  (see "Offline operation").

## Environment (no secrets needed)

| Variable | Default | Purpose |
|---|---|---|
| `HALT_DB_URL` | set by `npm run demo` to a SQLite file under `.halt/` | incident store (PS2 does not use it) |
| `HALT_SIGNING_KEY_PATH` | `.halt/demo-signing-key.pem` (generated) | incident ProofSeal demo key (PS2 does not sign) |
| `HALT_CORS_ORIGINS` | `["http://localhost:3000"]` | the web origin |
| `NEXT_PUBLIC_API_ORIGIN` | `http://localhost:8000` | where the browser calls the API |
| `HALT_API_ORIGIN` | `http://localhost:8000` | where `npm run demo:reset` sends its requests |
| `HALT_DEMO_MODE` | `false` in the API; `npm run dev` and `npm run demo` set `true` for their own API | enables the demo-only `POST /api/v1/ps2/demo/reset`; when off it answers 404. Not a secret. Never set it on a shared or production API |

## Start

From the repository root:

```bash
npm run demo
```

This builds production, then starts the API on :8000 and the web app on :3000. Once the API is ready it resets
the incident demo and the PS2 bundled demo.

### Health checks

| Check | Expect |
|---|---|
| `curl http://localhost:8000/api/v1/ready` | 200 |
| `curl http://localhost:8000/api/v1/ps2/datasets` | `scenario-a` and `scenario-b`, both `"synthetic": true` |
| `curl http://localhost:3000/healthz` | `{"status":"ok"}` |
| Open http://localhost:3000/reconstruct | two bundled datasets listed, stages all "Waiting" |

## Scenario A: OAuth consent phishing (about 2 minutes)

1. Open `/reconstruct`. Choose **OAuth consent phishing against Finance Operations**, then **Ingest dataset**.
2. Stages 1–4 turn done. Expected synthetic ingestion values:
   - 215 records: 213 accepted, 2 rejected on purpose (one malformed JSON line, one short CSV row);
   - 0 warnings;
   - 213 canonical events.
   - Open the rejected rows to show the reasons and the redacted previews.
3. **Reconstruct attack path.** The URL becomes `/reconstructions/run-d84008bb2c753cac`.
4. Expected:
   - **Header:** 88 entities, 8 seeds, 10 of 624 edges selected. The story reads "10 checked, 0 unsupported".
   - **Selected path:** 7 events from mail to the denied ledger access.
   - **The one dashed hop:** mail → sign-in, the only inferred link.
   - **Services:** Finance ledger (critical) and Month-end close (high), in gold.
   - **Missing evidence:** two markers.
5. Click a node, then an edge, on the graph (the evidence inspector fills in). Then:
   - **Attack story:** every claim cites its events and edges.
   - **Hypotheses:** the selected path leads the next alternate by 0.024.
   - **Proof:** not signed; content hashes only.
   - **Evaluation:** read the synthetic disclosure aloud.

## Manual upload

Use `demo-inputs/ps2-small-demo.jsonl` with log source `api_activity`. Expected values (19 accepted / 1 rejected,
run `run-07fc183c9b2f9ddb`, ambiguous at 0.0099) are in `demo-inputs/README.md`. The operator card,
`PS2_OPERATOR_CARD.md`, and the script, `PS2_FIVE_MINUTE_DEMO.md`, are the one-page versions of this runbook.

## Scenario B: service-account abuse, an ambiguous result (about 1 minute)

1. Choose **Service-account abuse in a cloud data platform**, ingest, then reconstruct. The URL becomes
   `/reconstructions/run-250332fcca3e3286`.
2. Expected:
   - 113 records accepted, 0 rejected;
   - 156 entities, 6 seeds, 19 of 221 edges selected;
   - story: 9 checked, 0 unsupported;
   - Payroll (critical), with a forecast toward Payments (critical).
3. Open **Hypotheses**. The notice reads **Ambiguous: the selected path leads the next alternate by 0.0036**.
   Say it plainly: the engine does not claim certainty here, and the differing evidence is listed for an analyst.

## API restart recovery

Bundled datasets are deterministic: the same files, context, config and engine version always give the same
batch id, run id, graph hash and receipt hashes. After an API restart, opening a bundled run's URL makes the API
regenerate it from the bundled files. The header says "Bundled synthetic demo run — regenerated identically from
the bundled files after an API restart".

To show it:
1. Note the receipt id on the Proof tab.
2. Stop the API. Ctrl+C on `npm run demo` stops both servers; restart with `npm run demo -- --keep`, which
   rebuilds the web app first (about a minute).
3. Reload the page. The same receipt id and graph hash are shown.

**Uploaded runs are never regenerated.** After a restart they show "This demo-session reconstruction has
expired", and the header of an uploaded run always says "Demo-session reconstruction — restart clears this run".

Verified in this pass with a real API process restart on scenario B: the receipt `rcpt-fc074914a6b6250b`, the
graph hash `06ca64de…164f`, the selected path `path-2d719c2816a3` and the full receipt (minus processing time)
were identical, and an uploaded run returned 404.

## Demo reset (demo-only)

```bash
npm run demo:reset
```

This resets the incident demo to its seed and calls `POST /api/v1/ps2/demo/reset`. That endpoint exists only
while `HALT_DEMO_MODE` is on (`npm run demo` turns it on locally); otherwise it answers 404 "demo reset is not
enabled on this API" and changes nothing. The PS2 reset only drops
bundled-dataset batches and runs from the API's memory. Uploaded batches and runs are never touched, and the
response counts what it kept. Bundled runs come back identical the next time they are opened. To start the
browser flow from step 1, open `/reconstruct` and press **Start over** if an earlier ingestion is shown.

## Offline operation

Nothing at run time calls the internet:
- the API reads bundled files only, and PS2 never fetches URLs;
- fonts are bundled by `next/font` at build time;
- the R1 model is a JSON file in the repository.

Build once while online (`npm run demo` installs nothing, but `npm run setup` does). After that the demo runs
with the network disconnected.

## Emergency fallback

| Symptom | Action |
|---|---|
| "Reconstruction service unavailable" | The API is down. Restart with `npm run demo -- --keep`, then press **Try again**: bundled runs return identical |
| "This demo-session reconstruction has expired" on an uploaded run | Expected after a restart. Re-upload, or switch to a bundled dataset |
| Web app not answering | `npm run build` then `npm run start -w @halt/web -- -p 3000` (API still on :8000) |
| Graph hard to read on the projector | Use **Focus selected path** and **Fit to view**, or narrow the window to the phone layout, which shows the path as an ordered list |
| `npm run demo:reset` fails with 404 | The API was started without `HALT_DEMO_MODE=true`. Restart it through `npm run demo -- --keep` |
| Everything fails | Show the committed screenshots in `artifacts/ps2-final/` (real production-build output, labelled synthetic) |

## Known limitations

- PS2 runs live in the API's memory. Only bundled datasets are regenerated; uploads are not persisted.
- The store keeps the last 32 batches and 32 runs per API process. It is not shared across workers.
- No SafeCut handoff yet: a reconstruction carries no response-action catalogue (see
  `PS2_FRONTEND_INTEGRATION_MAP.md`).
- The evaluation tab recomputes three runs, so it appears about a second after the rest.
- The PS2 workspace is dark-theme only, and the cyan, violet and gold PS2 palette awaits brand sign-off.

## 5-minute operator checklist

- [ ] `npm run demo` running. `/api/v1/ready` returns 200 and `/healthz` returns ok.
- [ ] `/reconstruct` lists two synthetic datasets.
- [ ] `npm run demo:reset` run since the last rehearsal.
- [ ] Browser zoom at 100%, window at least 1280 px wide (inspector rail visible).
- [ ] Scenario A ingested once in rehearsal (expect 213 accepted / 2 rejected) and its run URL bookmarked.
- [ ] Scenario B run URL bookmarked (`/reconstructions/run-250332fcca3e3286`). It reopens even after a restart.
- [ ] Wi-Fi off, or confirmed not needed.
- [ ] Say "synthetic" at the start and point to the evaluation disclosure.
- [ ] Fallback: the screenshots folder is open in a second window.
