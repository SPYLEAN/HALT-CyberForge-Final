# PS2 product RFC: HALT, proof-carrying kill-chain intelligence

> **Status: PROVISIONAL** until the detailed PS2 statement is supplied. Official scope is only: *"Kill Chain
> Attack Path Reconstruction. Turn raw logs into attack stories."* (see `PS2_REQUIREMENT_MATRIX.md`).

## 1. Positioning

**HALT: proof-carrying kill-chain intelligence.** *Reconstruct the attack. Reveal what comes next.*

HALT turns fragmented security logs into an evidence-linked attack story: it resolves the users, devices, sessions,
tokens and applications across sources, reconstructs how the attacker moved, cites the log lines behind every link,
forecasts the reachable next targets, and calculates the smallest response that stops them without stopping the
business.

**Differentiator (stated plainly):** not "AI summarises logs". HALT *reconstructs* with deterministic, cited
evidence; every connection can be traced to source events; forecasts are labelled as forecasts; the response is the
provably smallest one that satisfies policy.

## 2. Users and the question each asks

| User | Question | HALT answer |
|---|---|---|
| SOC analyst (tier 2) | "Which of these thousands of events are one attack, and in what order?" | Attack Story + ThreadGraph, each link cited |
| Incident lead | "What can the attacker reach next, and how sure are we?" | Forecast Horizon (counts over simulated rollouts, not probabilities) |
| Service owner | "If we contain this, what breaks?" | SafeCut: minimum-disruption plan, business services kept running |
| Auditor | "Prove it." | ProofSeal: hashes, provenance, rejected hypotheses |

## 3. Scope

**In scope (hackathon):** batch upload and replay of raw logs for two synthetic scenarios; parsing and normalising
identity, OAuth/app audit, endpoint, cloud and network logs (formats chosen in the data plan); entity resolution;
evidence-scored temporal correlation; ThreadGraph built from that evidence; ATT&CK stage mapping with confidence; a
cited Attack Story; EchoLab forecast; SafeCut; ProofSeal; Action Gate (simulated); evaluation against ground truth.

**Out of scope:** live connectors to real tenants; streaming at scale; learned graph models; automatic real-world
containment; multi-tenant SaaS operations (designed, not built; see enterprise plan).

## 4. Principles (non-negotiable)

1. **No LLM decides the graph, the risk or the response.** Reconstruction is deterministic code with stated
   methods and confidences. An LLM may only reword a cited template and is rejected if it adds facts or IDs
   (existing rule in `halt/explain/llm.py`).
2. **Every sentence of the story cites event IDs**, and HALT refuses to state what its evidence does not support.
3. **Observed, inferred, forecast and rejected are always visually and textually distinct.**
4. **Every displayed number comes from the API and is measured**; targets are labelled as targets.
5. **Synthetic data is labelled synthetic** everywhere it appears.
6. **Execution is simulated** and says so.

## 5. Success criteria

The demo proves, on data HALT has not been specially coded for (scenario B): raw logs in → cited attack story out,
with measured reconstruction quality against ground truth, and a response that keeps the critical service running.
Development targets (not claims) are in `PS2_EVALUATION_AND_ACCEPTANCE.md`.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Detailed statement changes scope | Phase 0 lock before code; matrix updated first |
| Reconstruction overfits scenario A | scenario B built by a different generator configuration; evaluated separately |
| Overclaiming metrics | evaluation harness is the only source of numbers; deck pulls from its JSON |
| Visual work eats engineering time | landing scheduled after reconstruction is measured (Phase 9) |
| Pre-existing work questioned | disclosure plan and branch history |
