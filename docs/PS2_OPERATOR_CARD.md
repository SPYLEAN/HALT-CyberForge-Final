# PS2 operator card

> One page for the person driving the screen. **All data is synthetic**; say so at the start. Full detail:
> `PS2_DEMO_RUNBOOK.md`. Expected values below come from the engine (`halt.ps2.engine/1.0.1`); none is a
> real-world accuracy figure.

**Before you start:** `npm run demo` is running. `http://localhost:8000/api/v1/ready` returns 200. Open
`http://localhost:3000/reconstruct` at 100% zoom, with the window at least 1280 px wide.

## Scenario A: the full reconstruction (about 2 minutes)

1. `/reconstruct`, then choose **OAuth consent phishing against Finance Operations**, then **Ingest dataset**.
   - Expect **213 accepted / 2 rejected**. Open the rejected rows: the reasons and the redacted previews.
2. **Reconstruct attack path.** The URL becomes `/reconstructions/run-d84008bb2c753cac`.
3. Graph: **10 of 624 edges** are selected and the path has 7 events. Point out the one dashed hop, mail →
   sign-in. It is the only *inferred* link; every other hop is *observed*.
4. Click a node, then an edge. The evidence inspector shows the raw-record hash and the confidence components.
5. Tabs:
   - **Attack story:** "10 checked, 0 unsupported".
   - **ATT&CK:** technique and basis for each step.
   - **Hypotheses:** leads by 0.024.
   - **Proof:** not signed; content hashes only.
   - **Evaluation:** read the synthetic disclosure aloud.

## Scenario B: an honest ambiguity (about 1 minute)

1. **Start over**, choose **Service-account abuse in a cloud data platform**, ingest (113 accepted, 0
   rejected), then reconstruct. The URL becomes `/reconstructions/run-250332fcca3e3286`.
2. **Hypotheses** tab: "Ambiguous: the selected path leads the next alternate by 0.0036". The engine does not
   pick a winner with confidence. It lists the evidence that differs, for an analyst.

## Manual JSONL upload (about 1 minute)

1. `/reconstruct`, then **Upload files**, then choose `demo-inputs/ps2-small-demo.jsonl`.
2. **Log source:** choose `Cloud app / API activity (M365-like) (api_activity@1.0)`. Leave the context empty.
   Tick the synthetic-data confirmation, then **Upload 1 file**.
3. Expect **19 accepted / 1 rejected** (`demo-019`, unsupported operation). Reconstruct; the URL becomes
   `/reconstructions/run-07fc183c9b2f9ddb`.
   - The path is 3 observed steps (two listing bursts, then a read).
   - The Hypotheses tab shows "Ambiguous … 0.0099".
   - There is no service impact (no context) and no evaluation (no ground truth).

## Restart recovery

- Note the receipt id on **Proof**. Press Ctrl+C on `npm run demo`, then run `npm run demo -- --keep` (it rebuilds
  the web app first, about a minute). Reload the same URL: the same receipt id and graph hash return.
- Bundled runs regenerate identically. **Uploaded runs do not**: they show "This demo-session reconstruction has
  expired". Re-upload the file.

## Demo reset

- Run `npm run demo:reset` in a second terminal. It drops only the bundled-dataset runs and batches; uploads are
  kept, and the output counts them.
- It works only while `HALT_DEMO_MODE` is on. `npm run demo` sets it for its own API. Any other API answers 404
  "demo reset is not enabled".

## Emergency fallback

| Symptom | Do this |
|---|---|
| "Reconstruction service unavailable" | Restart (`npm run demo -- --keep`), then **Try again**. Bundled runs return identical |
| Uploaded run "expired" | Expected after a restart: re-upload, or switch to Scenario A |
| `demo:reset` fails with 404 | The API was started without `HALT_DEMO_MODE=true`. Restart it with `npm run demo -- --keep` |
| Graph unreadable on the projector | **Focus selected path** and **Fit to view**, or narrow the window to the phone layout (ordered list) |
| Nothing works | Open `artifacts/ps2-final/`: real production-build screenshots, labelled synthetic |
