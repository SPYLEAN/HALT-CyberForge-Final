# Final demo runbook

**Only quote figures from a run's own benchmark receipt.** Do not quote the profiler's figures as HALT results, and
do not call any incident a confirmed attack.

## Start

Two terminals, from the repo root, after `npx next build` in `apps\web`:

```powershell
$env:HALT_DB_URL = "sqlite+pysqlite:///:memory:"; $env:HALT_SIGNING_KEY_PATH = ".halt/demo-signing-key.pem"; $env:HALT_FIREX_DATA_ROOT = "C:\HALT-DATA"; .\services\api\.venv\Scripts\python.exe -m uvicorn halt.main:create_app --factory --app-dir services/api --port 8000
```

```powershell
npm run start -w "@halt/web" -- -p 3000
```

Add `$env:HALT_ADAPTIVE_INTAKE = "1"` to the API terminal to show the optional structural profile.

## Judge flow, about five minutes

1. **`/`:** the landing. Its figures come from the stored results.
2. **`/firex`:** three sources, three answers: 10G reconstructed, 30G withheld, 50G partial.
3. **The 30G result:** open the Quality Case. Say: zero incidents does not mean zero threats.
4. **The 50G result, then its Trust Centre page:** 29.51% of records keep usable time order, and every incident rests on that part.
5. **`/firex/incidents`:** open "Possible short-lived administrator-account activity" from 10G.
6. **Attack World:** press Next through the steps, and read the plain sentence for each.
7. **Search evidence:** search `svc_backup30`. It is an account, not a file. Open "Why is this here?" on line 3,226,313.
8. **Verification, then Response Handoff:** the seal shows that the receipt has not changed, and the handoff states `NOT EXECUTED`.
9. **Theatre:** present the incident, using the arrow keys.
10. **Optional:** place a small FortiGate log in the incoming folder and press `START ANALYSIS`. Use a copied slice, and expect its run to be added to the results folder.

The response lab at `/incidents` is a separate synthetic demonstration, labelled wherever it opens. Do not present it as derived from these logs.

## What to say about uncertainty

- Incidents are candidates from rules. Validation is a separate tool.
- The logs have no payloads, so a blocked or attempted action is not proof of success.
- Reachable-next is a network path seen in the log, not attacker activity.
- If asked about accuracy: no organiser ground truth has been provided, so it has not been measured.

## If something fails

| Problem | Do this |
|---|---|
| API down | The UI shows an explicit error. Restart the API; runs are read back from disk. |
| Run interrupted | Open its page and press RESUME. Finished chunks are kept. |
| WebGL unavailable | The 2D view appears automatically with the same content. |
| LLM unavailable | The deterministic story appears automatically. |
| Nothing has completed | Start a controlled sample from `/firex`, and say it is a sample. |
