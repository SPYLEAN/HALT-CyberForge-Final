# PS2 five-minute demo script

> Speakers: **Tanvir** (drives the screen) and **Farhana** (narrates the framing). Swap freely. Every number
> spoken below is produced by the live API on the bundled **synthetic** datasets (`halt.ps2.engine/1.0.1`). No
> number in this script is a real-world accuracy figure, and none may be presented as one. Click path:
> `PS2_OPERATOR_CARD.md`.

| Time | Speaker | Screen | Segment |
|---|---|---|---|
| 0:00–0:30 | Farhana | `/reconstruct` | Problem |
| 0:30–1:45 | Tanvir | Scenario A: ingest, reconstruct, graph | Reconstruction |
| 1:45–2:30 | Farhana | Inspector, Attack story, ATT&CK | Observed versus inferred |
| 2:30–3:15 | Tanvir | Scenario B, Hypotheses | Ambiguity |
| 3:15–4:30 | Tanvir, then Farhana | Proof, restart, Evaluation | Proof and recovery |
| 4:30–5:00 | Farhana | Workspace | Close |

## 0:00–0:30 · Problem (Farhana)

> "An incident never arrives as a story. It arrives as thousands of lines spread across identity, mail, cloud
> and endpoint logs. An analyst has to connect them by hand, under pressure, and then defend every link.
> HALT turns raw logs into an attack story in which every link names its evidence and its confidence.
> Everything you will see today runs on synthetic data, and we will say where the engine is unsure."

## 0:30–1:45 · Scenario A reconstruction (Tanvir)

*Choose OAuth consent phishing, then Ingest dataset.*

> "215 raw records from four sources. 213 are accepted. Two are rejected on purpose, a malformed JSON line and a
> short CSV row, and HALT tells you why instead of guessing."

*Reconstruct attack path.*

> "88 entities resolved and 624 candidate links scored. Ten links survive. This is the path: seven events,
> from the phishing mail to a denied attempt on the finance ledger. In gold are the business services in its
> way: the Finance ledger, which is critical, and Month-end close."

## 1:45–2:30 · Observed versus inferred evidence (Farhana)

*Tanvir clicks a solid edge, then the dashed one.*

> "A solid line is **observed**: both events share a session, a token or an address that the logs themselves
> record. The dashed line, mail to sign-in, is the only **inferred** hop. No log says 'this click caused this
> sign-in', so HALT marks it, shows the components of its confidence, and keeps it separate.
> The attack story says the same thing in words: ten statements checked, none unsupported, and every sentence
> cites its events. The ATT&CK tab gives each technique a basis: observed, rule-inferred or uncertain."

## 2:30–3:15 · Scenario B ambiguity (Tanvir)

*Start over, then Service-account abuse: ingest, reconstruct, Hypotheses.*

> "A different attack: a service account abused in a cloud data platform. Here the top two explanations are
> nearly tied. The selected path leads by 0.0036, so HALT says **ambiguous** instead of pretending. It lists
> the evidence that differs between the two, which is exactly what an analyst should check next."

## 3:15–4:30 · Proof and recovery (Tanvir, then Farhana)

*Tanvir opens Proof.*

> **Tanvir:** "Every run has a receipt: content hashes of the inputs, the configuration, the graph and the story.
> The same files always give the same run id and graph hash. That is why, if the API restarts mid-demo, this
> URL comes back identical. It is regenerated from the files, not from a saved screenshot. Uploaded data is
> different: we never regenerate it, and it says so when it has expired."

*Tanvir opens Evaluation.*

> **Farhana:** "We measure the pipeline against the generator's ground truth for these two synthetic
> scenarios: precision, recall, false links and root cause. The banner says it plainly: this demonstrates
> pipeline behaviour, not real-world accuracy. On real data, we would measure against your ground truth."

## 4:30–5:00 · Close (Farhana)

> "HALT gives an analyst the attack path, the evidence for every link, a clear statement of what is inferred
> or ambiguous, and a receipt that reproduces it. Less time stitching logs, and conclusions you can defend."

## Judge-answer bank

| Question | Answer (keep it short) |
|---|---|
| Is this real data? | No. Every dataset is synthetic and labelled. Results show pipeline behaviour, not detection accuracy in the wild |
| How accurate is it? | On our two synthetic scenarios it is measured against the generator's ground truth (Evaluation tab). That is not a real-world figure; we would need your labelled data to give one |
| Is an LLM deciding the path? | No. Reconstruction is deterministic code: rules, scored edges and ranked paths. HALT-R1, a small bundled anomaly model, is one weighted score component and is shown as such. No language model runs during reconstruction |
| What if it is wrong? | It says where it is unsure: inferred hops are dashed, near-ties are flagged ambiguous, missing evidence is listed, and alternates stay visible with their scores |
| Which logs do you support? | Seven adapters: identity sign-ins and audit, mail trace, cloud-app activity, cloud control-plane audit, Sysmon process creation, database audit. Unmapped records are rejected with a reason |
| ATT&CK or the Kill Chain? | ATT&CK techniques and tactics today. A phase mapping to the Lockheed Martin Kill Chain would be a documented table, not a guess |
| Is it real-time? | No, it reconstructs batches. Same input, same output, which is what makes the receipt reproducible |
| How fast is it? | Ingest plus reconstruct took a few hundred milliseconds on our development machine for these datasets (`services/api/reports/ps2_eval.json`, median of 3 runs). We would re-measure on your hardware and data size |
| Is the receipt signed? | No. It holds content hashes only, and the Proof tab says so |
| What does it not do yet? | Persistence of uploads across restarts, streaming input, and a response handoff (SafeCut) are not built |
| Did you use AI tools? | Yes: Claude Code as a pair-programmer, disclosed in every commit trailer (`PS2_ORIGINALITY_AND_DISCLOSURE_PLAN.md`) |
