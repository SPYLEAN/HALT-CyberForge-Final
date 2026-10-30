# PS2 Command Center information architecture

> **Status: PROVISIONAL.** Builds on the UI v2 Command Center (`frontend-rebirth/god-mode`): shell, rail, evidence
> drawer, stage track, Command/Forensic modes. **EXISTS** = a view already on that branch; **NEW** = to build.

Common states for every view: **loading** (skeleton naming what is being fetched), **API unavailable** (the existing
`Unavailable` state: "no figures shown"), **empty** (says what input is missing and how to provide it), **failure**
(the API error message, nothing invented). Accessibility for every view: one `h1`, keyboard-reachable controls,
status never by colour alone, axe clean (existing E2E pattern).

| View | User question | Backend state | Primary evidence | Primary interaction | Empty state | Mobile | Demo moment | Status |
|---|---|---|---|---|---|---|---|---|
| Incident Overview | "What happened, how bad, what do I do?" | incident, story summary, forecast top target, plan status | the decision sentence with cited events | open Attack Story / SafeCut | "No incident reconstructed yet: upload logs" | decision first, then metrics | step 1/11 frame | EXISTS (adapt copy) |
| Raw Log Explorer | "What did we actually receive?" | intake batches, parsed/quarantined counts, raw records (redacted) | the original line + its parse | filter by source, entity, time; jump from any citation | "Upload logs or load the demo scenario" | list, one record per card | step 1: fragmented logs | **NEW** |
| ThreadGraph | "How did the attacker move?" | reconstructed graph; observed/inferred/forecast/rejected classes | edges with evidence | select node/edge; toggle rejected hypotheses | "No accepted links yet" | guided list (no shrunken graph) | step 4 | EXISTS (re-sourced) |
| Attack Story | "Tell me the story, and prove each sentence." | story sentences with citations and confidence | citation chips → Raw Log Explorer | click a citation | "Evidence insufficient for a story" + what is missing | full-width text | step 4–5 | **NEW** (extends explain) |
| Evidence Inspector | "Why is this link here?" | edge/entity evidence: UIDs, method, confidence, uncertainty | the cited raw lines | copy IDs, view raw | — | drawer becomes full screen | step 5 | EXISTS as drawer (extend) |
| Timeline Replay | "In what order?" | ordered events, stage boundaries | timestamped events | scrub; play | — | vertical timeline | step 2–4 | EXISTS |
| ATT&CK Mapping | "Which techniques, how confident?" | technique per event with confidence and evidence | event → technique rows | filter by tactic | "Unmapped events: N" listed | table → cards | step 4 | **NEW** (small) |
| Forecast Horizon | "What can they reach next?" | EchoLab futures on the reconstructed graph | reach counts over simulated rollouts | choose a target, see the path | "No forecast: graph has no live path" | ranked list | step 7 | EXISTS (EchoLab, relabel) |
| SafeCut | "What is the smallest safe response?" | plan, constraints, residual risk, policy comparison | chamber + action cards | compare options, re-solve under policy | infeasible state with closest options (exists) | stacked | steps 8–9 | EXISTS |
| ProofSeal | "Can I prove all of this?" | claims incl. new reconstruction claims, hashes | claim chain | recompute and verify | "Not sealed yet" | list | step 10 | EXISTS (+ claims) |
| Reports | "Give me the audit-ready report." | everything above | report sections with citations | print / export | "Nothing to report yet" | print view | closing | EXISTS (extend) |
| Architecture and Integrations | "What is real and what is planned?" | static, truthful tiers | implemented / architecture-ready / planned | — | — | stacked | Q&A | EXISTS (update for PS2; **no** PS3 connector messaging) |

**Theatre Mode:** kept only as a presentation route that drives real state (existing rule); its script is
rewritten for the 11-step PS2 demo. **Forensic Mode:** kept (dense tables for judges who ask for detail).
