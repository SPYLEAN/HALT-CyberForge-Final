# HALT Demo Script — INC-2417 (SIMULATED)

About 6 minutes. Every number on screen comes from the API; nothing below needs to be memorised, only pointed at. All data is synthetic.

## Before you start

1. Start the API and the web app (README → *Run it locally*), or `docker compose up --build -d --wait`.
2. Open http://localhost:3000 once and scroll to the bottom, then reload: this warms the build so the live run is instant.
3. Reset the incident so the audience sees it from the start: Command Center → **Policies** → *Demo variant* `Baseline` → **RESET INCIDENT**, then go back to http://localhost:3000.
4. Browser at 1440 × 900 or larger. Turn off OS "reduce motion" if you want the live 3D scene (with it on, HALT shows the static poster, which is fine).

## The story (landing page)

| Beat | Do | Say |
|---|---|---|
| 1 · Hero | Let the 3D core settle | "HALT stops the attack without stopping the business, and it proves the response is the smallest one that works." Point at the SIMULATED chip. |
| 2 · Paradox | Scroll once | "The obvious answer, isolating finance, takes 3 of 3 critical processes offline for 4 hours and locks out 413 people. That's damage we'd do to ourselves." The chip shows the replay time moving. |
| 3 · Incident | Scroll through the six events | "Six events, every one with a source record. Each row you pass replays that moment." The rail turns solid as each event arrives. |
| 4 · Business context | Scroll | "Every node says what stops if it stops." |
| 5 · EchoLab | Scroll | "Three futures, 6,000 rollouts each, same random draws. Doing nothing: the attacker reaches the ledger in 5,782 of 6,000. HALT's plan: 6 of 6 paths blocked, 3 users affected." |
| 6 · SafeCut | Scroll | "Not the strongest response, the smallest one that works: three actions. SafeCut derived them; nothing is hardcoded." |
| 7 · ProofSeal | Scroll | "Nine claims, re-checked independently of the optimiser, including all 4,096 combinations. And what it does not cover: the low-risk U1 route stays open." |
| 8 · Hand-off | **ENTER LIVE COMMAND CENTER** | "Same incident, same cursor, same seal. Nothing has run yet." |

## The operation (Command Center)

| Beat | Do | Say |
|---|---|---|
| 9 · Overview | Point at the four metrics | Confidence 16 of 16 rule conditions, 6 high-risk paths, 3 users, 0 of 6 reachable after the plan. |
| 10 · ThreadGraph | Rail → **ThreadGraph**, click a path in the table | "Solid is observed, dashed is inferred, dotted is forecast. The thick Verdigris line is the business, and it is never broken." The evidence rail shows events, policies and an **EXPLAIN** button. |
| 11 · Action Gate | Overview → **OPEN ACTION GATE** | "Execute is disabled, and it says why: two humans must approve." Approve as **tier2 analyst**, then **Finance Ops owner** (the change freeze needs her). |
| 12 · Execute | **EXECUTE 3 ACTIONS** | Top bar turns CONTAINED. Close the drawer → **ThreadGraph**: six proof rings sit in the cut gaps; the business thread keeps pulsing. |
| 13 · Rollback | Overview → **REVIEW ROLLBACK** → **ROLL BACK ALL** | "Every action is reversible inside the window; the snapshot is restored exactly." |
| 14 · Not scripted (optional) | **Policies** → variant `Finance Ops owner unavailable` → **RESET INCIDENT** → Overview → correlate → derive | "Take one approver away and HALT refuses: BLOCKED BY POLICY, with the closest options and what each would break. No execute button exists." |

## If something goes wrong

| Symptom | Fix |
|---|---|
| Red "Request failed" toast or "Connecting to the HALT API" | The API is down: restart it (in-memory data resets; reset the incident from Policies). |
| Top bar stays CONNECTING | The WebSocket can't reach `ws://localhost:8000`: check the API is on port 8000. |
| Landing figures show loading bars | The analysis is still running or failed: open the Command Center and use the next-step button instead. |
| Plan or approvals look stale after switching variant | Use **RESET INCIDENT** again, then reload the page. |
| Need to restart mid-demo | Policies → `Baseline` → **RESET INCIDENT**, then reopen http://localhost:3000. |
