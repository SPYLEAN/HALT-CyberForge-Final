# Immersive information architecture

## Journey

Choose dataset → process or open stored run → understand dataset health → review incidents or quality findings → open a case →
explore the attack or integrity failure → verify the evidence → present the result.

## Destinations

| Destination | Route | Purpose |
|---|---|---|
| Landing | `/` | Eight-scene PS2 story, handing off to Log Analysis |
| Mission Control | `/mission` | Dataset verdicts first, then the preserved response demo |
| Log Analysis | `/firex` | Datasets, health verdicts, runs |
| Run | `/firex/runs/[runId]` | Verdict, incidents or quality finding, case builder |
| Quality Case | `/firex/runs/[runId]/quality` | Why reconstruction was withheld |
| Incident | `/firex/incidents/[id]?run=` | Overview, Attack World, Timeline, Evidence, Reachable Next, Verification, Theatre |
| Incident Rooms | `/incidents` | Preserved response demo |
| Trust Centre | `/trust`, `/trust/[runId]` | Verdict first, then four dimensions and proof |
| Theatre | `/theatre/[caseId]` | Full-screen presentation from a case manifest |
| System Architecture | `/architecture` | Preserved |
| Response demo landing | `/response-demo` | Preserved previous landing |

Preserved but out of the bar: `/reconstruct` (bundled scenarios and uploads), linked from Log Analysis.

Phones get a menu button in place of the desktop bar.

## Modes

- **Investigator** (default): the seven questions, Play/Pause, Previous/Next, Focus path, Inspect evidence, Present.
- **Analyst** (a toggle): raw evidence, canonical fields, ATT&CK and kill-chain mapping, confidence components, hypotheses,
  observed versus inferred, missing evidence, hashes, layers, camera presets, filters, speed, legend.
- **Theatre:** full screen, driven by a case manifest and the same scene.

## Language

Conclusions first, in plain language. Technical terms follow, and identifiers only appear in Analyst mode or Verification.

## Who decides what

The backend derives every verdict and metric. The frontend only displays them. No component computes a security decision.
