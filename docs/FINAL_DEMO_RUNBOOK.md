# Final demo runbook

Before presenting, run the operator commands so a full-tier run exists: see `POWERSHELL_OPERATOR_COMMANDS.md`.
**Only quote figures from that run's own benchmark receipt.** Do not quote the profiler's figures as HALT results, and
do not call any incident a confirmed attack.

## Start

```powershell
$env:HALT_FIREX_DATA_ROOT = "C:\HALT-DATA"
npm run dev
```

## Flow

1. **`/firex/story`:** ten measured beats from the latest completed run.
2. **`/firex`:** datasets. A controlled sample starts in minutes if a live start is needed.
3. **A run page:** the four stages, measurements and the incident list. Refreshing reconnects to the same run.
4. **OPEN INCIDENT** on the highest-risk row: the plain-language summary.
5. **3D Attack Path:** camera preset Full Incident, then Replay. Toggle Reachable to show what is hypothetical.
6. **Reachable Next:** replay, hypothetical reachability and simulation are separate. Simulation is disabled, and it says
   what context is missing.
7. **Analyst mode:** ATT&CK, Hypotheses, Confidence, then Proof with its seal.
8. **Explain** (optional): with the LLM off, the deterministic story appears and says so.

Theatre mode is at `/firex/runs/<run_id>/theatre`: arrow keys or the buttons, then OPEN INCIDENT.

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
