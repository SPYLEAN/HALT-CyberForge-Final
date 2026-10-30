# PS2 demo and pitch plan (five minutes)

> **Status: PROVISIONAL.** Narrator lines contain no numbers that are not produced by the evaluation harness or the
> live API; bracketed values are filled from them at demo time. Roles follow the default in the implementation
> sequence (**B** Tanvir, **F** Farhana); swap if the team prefers.

## 1. Live sequence

| # | Time | Screen | Narrator (who) | Line |
|---|---|---|---|---|
| 0 | 0:00–0:20 | Landing scene 1 | F | "Security teams don't lack alerts. They lack the story connecting them. HALT reconstructs the attack from raw logs and proves every link." |
| 1 | 0:20–0:45 | Raw Log Explorer | B | "These are [N] raw log lines from [k] sources: sign-ins, OAuth audit, mail, endpoint, cloud. Synthetic, labelled as such. Nothing here is connected yet." |
| 2 | 0:45–1:00 | Start reconstruction | B | "One button. Parsing, normalising, resolving entities, correlating in time. Deterministic code; no language model decides any of this." |
| 3 | 1:00–1:20 | Entities | B | "Users, sessions, tokens and devices resolved across sources. Each match names its rule and its events." |
| 4 | 1:20–1:50 | ThreadGraph + Attack Story | F | "The kill chain: phishing, suspicious sign-in, MFA change, malicious consent, token replay, discovery. Every sentence cites the log lines behind it." |
| 5 | 1:50–2:15 | Evidence Inspector | F | "Click any link. Consent to token: same app, same grant, token lineage. Here are the raw lines." |
| 6 | 2:15–2:35 | Inferred / rejected | B | "This link is inferred, not observed: confidence [x], and we show why. These correlations we rejected, with reasons: a VPN egress, a legitimate MFA change." |
| 7 | 2:35–3:00 | Forecast Horizon | F | "What can the attacker reach next? Simulated rollouts, not facts: [n] of [N] reach the finance ledger." |
| 8 | 3:00–3:30 | SafeCut options | B | "Isolate everything and payroll stops. Do nothing and the ledger falls. SafeCut finds the smallest reversible response under policy." |
| 9 | 3:30–3:45 | SafeCut plan | B | "[k] actions. The dangerous paths are cut. [Residual risk statement exactly as the API words it.]" |
| 10 | 3:45–4:10 | ProofSeal | F | "ProofSeal re-checks everything independently: every link cited, every sentence supported, every constraint met. [m] of [m] claims verified." |
| 11 | 4:10–4:30 | Overview: business still running | F | "And the critical services are still running. Execution here is simulated; approval stays with named humans." |
| — | 4:30–5:00 | Close | B+F | closing statement (§5) |

**Generalisation beat (if time allows, or in Q&A):** load scenario B (credential stuffing → account takeover) and
reconstruct it live: "No line of code knows this scenario."

## 2. Backup and failure handling

| Failure | Recovery |
|---|---|
| Live API down | `npm run demo` restarts the deterministic local stack (≈ 30 s); meanwhile switch to the backup video at the same step |
| Browser/WebGL issue | the landing and Command Center work without WebGL (posters + DOM); continue |
| Projector resolution | tested at 1280×720 and 1920×1080; Forensic mode avoided on small screens |
| No network | everything is local; no external calls |
| Backup video | full 5-minute recording of the same script at 1920×1080, plus per-step clips |

## 3. Likely judge questions and honest answers

| Question | Answer |
|---|---|
| "Is this an LLM summarising logs?" | "No. Parsing, entity resolution, correlation, mapping and response are deterministic code. An optional LLM can only reword a cited template, and it is off." |
| "Is the data real?" | "No, synthetic and labelled. Results measure pipeline correctness, not real-world detection rates." |
| "How do you know it's not hardcoded?" | "Scenario B uses different sources and techniques, was written before tuning, and a test fails if pipeline code mentions a scenario identifier." |
| "What are your accuracy numbers?" | read the harness report; say which targets were missed |
| "Did you build all this in the hackathon?" | the disclosure statement (`PS2_ORIGINALITY_AND_DISCLOSURE_PLAN.md`) |
| "What about scale / production?" | "Designed, not built: no auth, single tenant. See our readiness table." |
| "Why Monte Carlo and not ML forecasting?" | "Counts over seeded rollouts are explainable and reproducible; we'd learn transition rates from real data when available." |

**Technical deep-dive route:** Raw Log Explorer → Evidence Inspector → Forensic mode tables → ProofSeal recompute
→ Architecture view (implemented / architecture-ready / planned).

## 4. Rehearsal checklist

Two full timed runs; one run with the API killed at step 7; one run without WebGL; verify every bracketed value is
read from the live screen, not memorised.

## 5. Closing statement (hiring-oriented)

> "We didn't build a dashboard that makes alerts prettier. We built an engine that reconstructs the attack from
> raw logs, proves every connection, labels every guess, and finds the smallest response that keeps the business
> running, and we measured where it works and where it doesn't. That's how we'd want to build security tools on
> your team."
